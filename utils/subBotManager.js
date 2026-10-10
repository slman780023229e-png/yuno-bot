import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";

import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    generateWAMessageFromContent,
    proto
} from "@whiskeysockets/baileys";

import { handleMessages } from "./handler.js";
import { loadPlugins } from "./loader.js";

// ═══════════════════════════════════════
// 📁 PATHS
// ═══════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const SESSIONS_DIR = path.join(ROOT, "ملفات_البوتات");
const DATA_DIR = path.join(ROOT, "data");
const DATABASE_FILE = path.join(DATA_DIR, "subbots.json");

// ═══════════════════════════════════════
// ⚙️ SETTINGS (TURBO CONFIG)
// ═══════════════════════════════════════

const RECONNECT_DELAY = 4000;
const PAIRING_DELAY = 2000;
const CONNECT_TIMEOUT = 60000;
const RESTORE_DELAY = 1000;
const MIN_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 45000;
const MAX_RECONNECT_ATTEMPTS = 50;
const SUBBOT_EVENT_YIELD = true;

// ═══════════════════════════════════════
// ⚡ TOOLKIT WITH SMART CACHING SYSTEM
// ═══════════════════════════════════════

class Toolkit {
    static #mediaCache = new Map();
    static #bufferCache = new Map();
    static #MAX_CACHE_SIZE = 100;

    static clearCache() {
        this.#mediaCache.clear();
        this.#bufferCache.clear();
    }

    static async fetchBuffer(url) {
        if (this.#bufferCache.has(url)) {
            return this.#bufferCache.get(url);
        }
        try {
            const res = await fetch(url);
            const buffer = Buffer.from(await res.arrayBuffer());
            
            if (this.#bufferCache.size >= this.#MAX_CACHE_SIZE) {
                const firstKey = this.#bufferCache.keys().next().value;
                this.#bufferCache.delete(firstKey);
            }
            this.#bufferCache.set(url, buffer);
            return buffer;
        } catch (error) {
            throw new Error(`Failed to fetch buffer: ${error.message}`);
        }
    }

    static async toUrl(client, pathOrBuffer) {
        try {
            const buffer = Buffer.isBuffer(pathOrBuffer) 
                ? pathOrBuffer 
                : await this.fetchBuffer(pathOrBuffer);

            const crypto = await import('crypto');
            const hash = crypto.createHash('md5').update(buffer).digest('hex');

            if (this.#mediaCache.has(hash)) {
                return this.#mediaCache.get(hash);
            }

            const uploadResult = await client.waUploadToServer(buffer, { ext: 'bin' });
            const url = uploadResult?.url || uploadResult;

            if (this.#mediaCache.size >= this.#MAX_CACHE_SIZE) {
                const firstKey = this.#mediaCache.keys().next().value;
                this.#mediaCache.delete(firstKey);
            }
            this.#mediaCache.set(hash, url);

            return url;
        } catch (error) {
            throw new Error(`Failed to upload media: ${error.message}`);
        }
    }
}

// ═══════════════════════════════════════
// 🧠 MEMORY
// ═══════════════════════════════════════

const runningBots = new Map();
const startingBots = new Set();
const startingPromises = new Map();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();
const pluginCache = new Map();
const botRegistry = new Map();

let mainSocket = null;
let cachedBaileysVersion = null;
let versionPromise = null;
let databaseQueue = Promise.resolve();

// ═══════════════════════════════════════
// 🧩 BOT REGISTRY
// ═══════════════════════════════════════

function registerBot(number, sock, type = "sub") {
    number = cleanNumber(number);
    if (!number) return;
    botRegistry.set(number, {
        number,
        sock,
        type,
        connected: !!sock?.user
    });
}

function unregisterBot(number) {
    number = cleanNumber(number);
    if (!number) return;
    botRegistry.delete(number);
}

export function getBotRegistry() {
    return new Map(botRegistry);
}

export function isBotNumber(number) {
    number = cleanNumber(number);
    return botRegistry.has(number);
}

export function getBotType(number) {
    number = cleanNumber(number);
    return botRegistry.get(number)?.type || null;
}

// ═══════════════════════════════════════
// 🚀 EVENT LOOP
// ═══════════════════════════════════════

function runSubBotTask(task) {
    if (typeof task !== "function") return;
    if (!SUBBOT_EVENT_YIELD) {
        Promise.resolve().then(task).catch(error => {
            console.log("❌ SubBot Task Error:", error?.message || error);
        });
        return;
    }
    setImmediate(() => {
        Promise.resolve().then(task).catch(error => {
            console.log("❌ SubBot Task Error:", error?.message || error);
        });
    });
}

// ═══════════════════════════════════════
// 📱 NUMBER
// ═══════════════════════════════════════

function cleanNumber(value) {
    try {
        if (value === undefined || value === null) return "";
        return String(value).split("@")[0].split(":")[0].replace(/\D/g, "");
    } catch {
        return "";
    }
}

// ═══════════════════════════════════════
// 📂 SESSION
// ═══════════════════════════════════════

function getSessionDir(number) {
    return path.join(SESSIONS_DIR, cleanNumber(number));
}

// ═══════════════════════════════════════
// 📁 DATABASE
// ═══════════════════════════════════════

async function ensureDatabase() {
    await fs.ensureDir(SESSIONS_DIR);
    await fs.ensureDir(DATA_DIR);
    if (!(await fs.pathExists(DATABASE_FILE))) {
        await fs.writeJson(DATABASE_FILE, { bots: [] }, { spaces: 2 });
    }
}

async function readDatabase() {
    await ensureDatabase();
    try {
        const data = await fs.readJson(DATABASE_FILE);
        if (!data || !Array.isArray(data.bots)) {
            return { bots: [] };
        }
        data.bots = [...new Set(data.bots.map(cleanNumber).filter(n => n.length >= 7))];
        return data;
    } catch {
        return { bots: [] };
    }
}

async function saveDatabase(data) {
    await ensureDatabase();
    const temp = `${DATABASE_FILE}.tmp`;
    await fs.writeJson(temp, data, { spaces: 2 });
    try {
        await fs.rename(temp, DATABASE_FILE);
    } catch {
        try {
            await fs.remove(DATABASE_FILE);
            await fs.rename(temp, DATABASE_FILE);
        } catch {}
    }
}

function queueDatabaseTask(task) {
    const run = databaseQueue.catch(() => {}).then(task);
    databaseQueue = run.catch(() => {});
    return run;
}

async function saveNumber(inputNumber) {
    const number = cleanNumber(inputNumber);
    if (!number) return;
    return queueDatabaseTask(async () => {
        const data = await readDatabase();
        if (!data.bots.includes(number)) {
            data.bots.push(number);
            await saveDatabase(data);
        }
    });
}

async function removeNumber(inputNumber) {
    const number = cleanNumber(inputNumber);
    if (!number) return;
    return queueDatabaseTask(async () => {
        const data = await readDatabase();
        data.bots = data.bots.filter(n => n !== number);
        await saveDatabase(data);
    });
}

export async function getSubBots() {
    const data = await readDatabase();
    return data.bots;
}

// ═══════════════════════════════════════
// 👑 MAIN SOCKET
// ═══════════════════════════════════════

export function setMainSocket(sock) {
    mainSocket = sock;
    const number = cleanNumber(sock?.user?.id);
    if (number) {
        registerBot(number, sock, "main");
    }
    console.log("👑 Main Socket Priority: ENABLED");
}

// ═══════════════════════════════════════
// 📦 BAILEYS VERSION
// ═══════════════════════════════════════

async function getBaileysVersion() {
    if (cachedBaileysVersion) return cachedBaileysVersion;
    if (versionPromise) return versionPromise;
    versionPromise = (async () => {
        try {
            const { version } = await fetchLatestBaileysVersion();
            cachedBaileysVersion = version;
            return version;
        } catch (error) {
            console.log("⚠️ فشل جلب إصدار Baileys:", error?.message || error);
            throw error;
        } finally {
            versionPromise = null;
        }
    })();
    return versionPromise;
}

// ═══════════════════════════════════════
// 🔘 REAL BUTTONS (MATCHED WITH MAIN BOT)
// ═══════════════════════════════════════

function installRealButtons(sock) {
    if (sock && typeof sock.sendRealButtons !== "function") {
        sock.sendRealButtons = async (jid, text, footerText, buttonsArray) => {
            if (!sock?.user?.id) throw new Error("Socket غير متصل");
            if (!Array.isArray(buttonsArray)) throw new Error("buttonsArray يجب أن يكون Array");

            const messageContent = generateWAMessageFromContent(jid, {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({ text: String(text || "") }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footerText || "Arthur Bot Framework") }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: buttonsArray.filter(Boolean).map(btn => ({
                            name: btn?.name || "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: btn?.displayText || btn?.text || "اختيار",
                                id: btn?.id || btn?.command || ""
                            })
                        }))
                    })
                })
            }, { userJid: sock.user.id });

            return await sock.relayMessage(jid, messageContent.message, {
                messageId: messageContent.key.id,
                additionalNodes: [{
                    tag: "biz",
                    attrs: {},
                    content: [{
                        tag: "interactive",
                        attrs: { type: "native_flow", v: "1" },
                        content: [{ tag: "native_flow", attrs: { name: "quick_reply" } }]
                    }]
                }]
            });
        };
    }
}

// ═══════════════════════════════════════
// 🔌 PLUGINS (WITH CACHE & FULL EVENTS SUPPORT)
// ═══════════════════════════════════════

async function getSubPlugins(sock) {
    const number = cleanNumber(sock?.user?.id);
    if (number && pluginCache.has(number)) {
        return pluginCache.get(number);
    }
    try {
        const plugins = await loadPlugins(sock);
        const safePlugins = Array.isArray(plugins) ? plugins.filter(Boolean) : [];
        if (number) pluginCache.set(number, safePlugins);
        return safePlugins;
    } catch (error) {
        console.log(`❌ SubBot Loader Error [${number}]:`, error?.message || error);
        return [];
    }
}

export function clearPluginCache(inputNumber) {
    const number = cleanNumber(inputNumber);
    if (!number) return;
    pluginCache.delete(number);
}

export function reloadSubBotPlugins(inputNumber) {
    const number = cleanNumber(inputNumber);
    clearPluginCache(number);
    return true;
}

// ═══════════════════════════════════════
// 🔑 PAIRING
// ═══════════════════════════════════════

async function getPairingCode(sock, number) {
    await new Promise(resolve => setTimeout(resolve, PAIRING_DELAY));
    if (!sock || !sock.requestPairingCode) {
        throw new Error("Socket غير جاهز لطلب كود الربط");
    }
    try {
        const code = await sock.requestPairingCode(number);
        if (!code) throw new Error("WhatsApp لم يرجع كود الربط");
        return String(code);
    } catch (error) {
        console.log(`❌ Pairing Error [${number}]:`, error?.message || error);
        throw error;
    }
}

// ═══════════════════════════════════════
// 🔢 RECONNECT BACKOFF
// ═══════════════════════════════════════

function getReconnectDelay(number) {
    const attempts = reconnectAttempts.get(number) || 0;
    const exponential = Math.min(MAX_RECONNECT_DELAY, RECONNECT_DELAY * Math.pow(2, Math.min(attempts, 5)));
    const random = Math.floor(Math.random() * 2000);
    return Math.max(MIN_RECONNECT_DELAY, exponential + random);
}

function scheduleReconnect(inputNumber) {
    const number = cleanNumber(inputNumber);
    if (!number) return;
    if (reconnectTimers.has(number)) return;

    const attempts = reconnectAttempts.get(number) || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`🛑 تم إيقاف إعادة الاتصال للفرعي ${number}`);
        return;
    }

    const nextAttempts = attempts + 1;
    reconnectAttempts.set(number, nextAttempts);
    const delay = getReconnectDelay(number);

    const timer = setTimeout(() => {
        reconnectTimers.delete(number);
        setImmediate(() => {
            startSubBot(number).then(() => {
                reconnectAttempts.delete(number);
            }).catch(error => {
                console.log(`❌ Reconnect Error [${number}]:`, error?.message || error);
                scheduleReconnect(number);
            });
        });
    }, delay);

    reconnectTimers.set(number, timer);
}

function cancelReconnect(inputNumber) {
    const number = cleanNumber(inputNumber);
    const timer = reconnectTimers.get(number);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(number);
    }
    reconnectAttempts.delete(number);
}

function createGeneration() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ═══════════════════════════════════════
// 🤖 START SUBBOT INTERNAL (WITH FULL MAIN BOT EVENTS)
// ═══════════════════════════════════════

async function startSubBotInternal(number) {
    const mainNumber = cleanNumber(mainSocket?.user?.id);
    if (mainNumber && mainNumber === number) {
        throw new Error("هذا الرقم هو البوت الرئيسي بالفعل");
    }

    const existing = runningBots.get(number);
    if (existing?.sock) {
        try { existing.sock.end(undefined); } catch {}
    }
    runningBots.delete(number);

    const sessionDir = getSessionDir(number);
    await ensureDatabase();
    await fs.ensureDir(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const version = await getBaileysVersion();
    const generation = createGeneration();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["MacOs", "Chrome", "1.0.0"],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        connectTimeoutMs: CONNECT_TIMEOUT,
        defaultQueryTimeoutMs: CONNECT_TIMEOUT,
        keepAliveIntervalMs: 25000
    });

    // حقن نظام Toolkit مع الكاش بداخل السوكت لتكون جاهزة للاستخدام في أي وقت
    sock.Toolkit = Toolkit;

    installRealButtons(sock);
    sock.ev.on("creds.update", saveCreds);

    const info = {
        sock,
        number,
        sessionDir,
        generation,
        connected: false,
        registered: state.creds.registered,
        startedAt: Date.now(),
        lastConnection: Date.now(),
        lastMessage: 0
    };

    runningBots.set(number, info);
    registerBot(number, sock, "sub");

    // 💬 MESSAGES HANDLER
    sock.ev.on("messages.upsert", m => {
        const current = runningBots.get(number);
        if (!current || current.generation !== generation) return;
        current.lastMessage = Date.now();
        runSubBotTask(async () => {
            const latest = runningBots.get(number);
            if (!latest || latest.generation !== generation) return;
            try {
                await handleMessages(sock, m);
            } catch (error) {
                console.log(`❌ SubBot Message Error [${number}]:`, error?.message || error);
            }
        });
    });

    // 👥 GROUP PARTICIPANTS UPDATE
    sock.ev.on("group-participants.update", update => {
        const current = runningBots.get(number);
        if (!current || current.generation !== generation) return;
        runSubBotTask(async () => {
            try {
                const plugins = await getSubPlugins(sock);
                for (const plugin of plugins) {
                    if (typeof plugin.onGroupParticipantsUpdate === "function") {
                        await plugin.onGroupParticipantsUpdate(sock, update);
                    }
                }
            } catch (e) {
                console.log(`❌ SubBot Group Participants Error [${number}]:`, e?.message || e);
            }
        });
    });

    // 🔗 GROUP JOIN REQUESTS
    sock.ev.on("group.join-request", update => {
        const current = runningBots.get(number);
        if (!current || current.generation !== generation) return;
        runSubBotTask(async () => {
            try {
                const plugins = await getSubPlugins(sock);
                for (const plugin of plugins) {
                    if (typeof plugin.onGroupJoinRequest === "function") {
                        await plugin.onGroupJoinRequest(sock, update);
                    }
                }
            } catch (e) {
                console.log(`❌ SubBot Group Join Request Error [${number}]:`, e?.message || e);
            }
        });
    });

    // 🔌 CONNECTION
    sock.ev.on("connection.update", update => {
        const { connection, lastDisconnect } = update;
        const current = runningBots.get(number);
        if (!current || current.generation !== generation) return;
        current.lastConnection = Date.now();

        if (connection === "connecting") {
            current.connected = false;
            const registry = botRegistry.get(number);
            if (registry) registry.connected = false;
        }

        if (connection === "open") {
            current.connected = true;
            current.registered = true;
            reconnectAttempts.delete(number);
            cancelReconnect(number);

            const registry = botRegistry.get(number);
            if (registry) {
                registry.connected = true;
                registry.sock = sock;
            }

            console.log(`🟢 SubBot ONLINE | ${number}`);
            saveNumber(number).catch(() => {});
            
            getSubPlugins(sock).catch(() => {});
        }

        if (connection === "close") {
            const status = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔴 SubBot CLOSED | ${number} | ${status || "unknown"}`);

            const latest = runningBots.get(number);
            if (!latest || latest.generation !== generation) return;

            runningBots.delete(number);
            unregisterBot(number);
            clearPluginCache(number);

            if (status === DisconnectReason.loggedOut) {
                console.log(`🚪 SubBot Logged Out | ${number}`);
                cancelReconnect(number);
                removeNumber(number).catch(() => {});
                fs.remove(sessionDir).catch(() => {});
                return;
            }

            if (status === DisconnectReason.badSession) {
                console.log(`🧹 جلسة تالفة | حذف جلسة ${number}`);
                cancelReconnect(number);
                removeNumber(number).catch(() => {});
                fs.remove(sessionDir).catch(() => {});
                return;
            }

            scheduleReconnect(number);
        }
    });

    // 🔑 PAIRING
    let pairingCode = null;
    if (!state.creds.registered) {
        console.log(`⌛ تجهيز كود الربط | ${number}`);
        pairingCode = await getPairingCode(sock, number);
        console.log(`
╔════════════════════════════════════╗
║       👑 ARTHUR SUB BOT 👑         ║
╠════════════════════════════════════╣
║ 📱 NUMBER : ${number}
║ 🔑 CODE   : ${pairingCode}
╠════════════════════════════════════╣
║ WhatsApp > الأجهزة المرتبطة        ║
║ اختر "ربط جهاز" وأدخل الكود        ║
╚════════════════════════════════════╝
`);
    } else {
        console.log(`♻️ جلسة موجودة وتم استئنافها بنجاح | ${number}`);
    }

    return {
        sock,
        pairingCode,
        alreadyRunning: false,
        number,
        sessionDir
    };
}

// ═══════════════════════════════════════
// 🤖 PUBLIC START (ANTI-DEADLOCK & CLEANUP)
// ═══════════════════════════════════════

export async function startSubBot(inputNumber) {
    const number = cleanNumber(inputNumber);
    if (!number || number.length < 7) {
        throw new Error("رقم الهاتف غير صالح");
    }

    const mainNumber = cleanNumber(mainSocket?.user?.id);
    if (mainNumber && mainNumber === number) {
        throw new Error("هذا الرقم هو البوت الرئيسي بالفعل");
    }

    const sessionDir = getSessionDir(number);
    const credsPath = path.join(sessionDir, "creds.json");
    if (await fs.pathExists(credsPath)) {
        try {
            const credsData = await fs.readJson(credsPath);
            if (!credsData.registered) {
                console.log(`🧹 تنظيف كود الربط السابق غير المستخدم للرقم ${number}...`);
                await stopSubBot(number, false);
                await fs.remove(sessionDir);
            }
        } catch {}
    }

    if (startingPromises.has(number)) {
        try {
            await startingPromises.get(number);
        } catch {}
    }

    startingBots.add(number);

    const promise = (async () => {
        try {
            cancelReconnect(number);
            return await startSubBotInternal(number);
        } finally {
            startingBots.delete(number);
            startingPromises.delete(number);
        }
    })();

    startingPromises.set(number, promise);
    return promise;
}

// ═══════════════════════════════════════
// 🔄 RESTORE ALL
// ═══════════════════════════════════════

export async function startAllSubBots(mainSock) {
    setMainSocket(mainSock);
    await new Promise(resolve => setImmediate(resolve));

    const numbers = await getSubBots();
    if (!numbers.length) {
        console.log("ℹ️ لا توجد جلسات SubBot محفوظة");
        return;
    }

    console.log(`♻️ استعادة ${numbers.length} جلسة فرعية...`);
    for (const number of numbers) {
        try {
            await new Promise(resolve => setImmediate(resolve));
            await startSubBot(number);
            await new Promise(resolve => setTimeout(resolve, RESTORE_DELAY));
        } catch (error) {
            console.log(`❌ Restore Failed [${number}]:`, error?.message || error);
        }
    }
}

// ═══════════════════════════════════════
// 🛑 STOP
// ═══════════════════════════════════════

export async function stopSubBot(inputNumber, deleteSession = false) {
    const number = cleanNumber(inputNumber);
    if (!number) return false;

    cancelReconnect(number);
    startingPromises.delete(number);
    startingBots.delete(number);

    const info = runningBots.get(number);
    if (info?.sock) {
        try { info.sock.end(undefined); } catch {}
    }

    runningBots.delete(number);
    unregisterBot(number);
    clearPluginCache(number);

    if (deleteSession) {
        await removeNumber(number);
        try {
            await fs.remove(getSessionDir(number));
            console.log(`🗑️ تم حذف جلسة SubBot بالكامل | ${number}`);
        } catch {}
    }

    return true;
}

export async function deleteSubBotSession(inputNumber) {
    return await stopSubBot(inputNumber, true);
}

export function getSubBotStatus(inputNumber) {
    const number = cleanNumber(inputNumber);
    const info = runningBots.get(number);
    const registry = botRegistry.get(number);

    return {
        number,
        running: !!info,
        connected: info?.connected === true,
        registered: info?.registered === true,
        exists: !!info,
        type: registry?.type || "sub",
        lastMessage: info?.lastMessage || 0,
        lastConnection: info?.lastConnection || 0,
        reconnectAttempts: reconnectAttempts.get(number) || 0
    };
}

export function getAllSubBotStatus() {
    const result = [];
    for (const [number, info] of runningBots) {
        result.push({
            number,
            running: true,
            connected: info.connected === true,
            registered: info.registered === true,
            type: "sub",
            lastMessage: info.lastMessage || 0,
            lastConnection: info.lastConnection || 0,
            reconnectAttempts: reconnectAttempts.get(number) || 0
        });
    }
    return result;
}

export function normalizeSubBotNumber(value) {
    return cleanNumber(value);
}
