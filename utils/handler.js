import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlugins, invalidatePluginCache } from "./loader.js";
import config from "../config.js";
import { arthurBox, isArthurDecorated } from "./arthurStyle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../data");
const modeFile = path.join(dataDir, "مود.json");
const eliteFile = path.join(dataDir, "النخبة.json");
const contactGuardFile = path.join(dataDir, "contactGuard.json");

const GROUP_CACHE_TIME = 30_000;
const FILE_CHECK_TIME = 2_000;
const MESSAGE_CACHE_TIME = 30_000;
const MAX_PROCESSED_MESSAGES = 6000;
const MAX_GROUP_CACHE = 500;
const TASK_TIMEOUT_MS = 25_000;

const CONTACT_WRAPPERS = [
    "ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2",
    "viewOnceMessageV2Extension", "documentWithCaptionMessage",
    "deviceSentMessage", "editedMessage"
];

const COLORS = {
    reset: "\x1b[0m", gold: "\x1b[38;5;220m", green: "\x1b[38;5;46m",
    red: "\x1b[38;5;196m", cyan: "\x1b[38;5;51m", blue: "\x1b[38;5;39m", magenta: "\x1b[38;5;201m"
};

function log(type, text) {
    try {
        const map = {
            ok: [COLORS.green, "✅"], cmd: [COLORS.cyan, "⚡"], err: [COLORS.red, "❌"],
            elite: [COLORS.gold, "👑"], admin: [COLORS.blue, "🛡️"], bot: [COLORS.magenta, "🤖"]
        };
        const [col, ico] = map[type] || [COLORS.cyan, "•"];
        console.log(`${col}[${ico}] ${text}${COLORS.reset}`);
    } catch {}
}

function withTimeout(promise, ms, label = "Task") {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        if (timer.unref) timer.unref();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function extractPureNumber(value) {
    if (value === undefined || value === null) return "";
    let v = String(value).trim();
    if (!v) return "";
    const colon = v.indexOf(":");
    if (colon !== -1) v = v.slice(0, colon);
    const at = v.indexOf("@");
    if (at !== -1) v = v.slice(0, at);
    return v.replace(/\D/g, "");
}

const cleanRawId = v => (v == null ? "" : String(v).trim().toLowerCase());
const normalizeNumber = v => extractPureNumber(v).replace(/^0+(?=\d)/, "");
const isSameNumber = (a, b) => {
    const x = normalizeNumber(a);
    const y = normalizeNumber(b);
    return Boolean(x && y && x === y);
};

// ═══════════════════════════════════════════════════════
// 🤖 BOT & PARTICIPANT IDENTITIES
// ═══════════════════════════════════════════════════════

const mainBotCache = new WeakMap();

function getBotIdentities(sock) {
    const out = [];
    const seen = new Set();
    const add = val => {
        if (val == null) return;
        const raw = String(val).trim();
        if (!raw) return;
        const k = raw.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(raw); }
        const num = extractPureNumber(raw);
        if (num && !seen.has(num)) { seen.add(num); out.push(num); }
    };
    [
        sock?.user?.id, sock?.user?.jid, sock?.user?.lid, sock?.user?.phone,
        sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.jid,
        sock?.authState?.creds?.me?.lid, sock?.authState?.creds?.me?.phone,
        sock?.botJid, sock?.botLid, sock?.botPhone,
        sock?.__botJid, sock?.__botLid, sock?.__botPhone
    ].forEach(add);
    return out;
}

function findParticipant(participants, identities) {
    if (!Array.isArray(participants) || !participants.length) return null;
    const ids = (Array.isArray(identities) ? identities : [identities]).filter(Boolean);
    const fields = ["id", "jid", "lid", "phone", "phoneNumber"];

    for (const id of ids) {
        const raw = cleanRawId(id);
        if (!raw) continue;
        const hit = participants.find(p => p && fields.some(f => cleanRawId(p[f]) === raw));
        if (hit) return hit;
    }
    for (const id of ids) {
        const num = normalizeNumber(id);
        if (!num) continue;
        const hit = participants.find(p => p && fields.some(f => isSameNumber(num, p[f])));
        if (hit) return hit;
    }
    return null;
}

const resolveBotParticipant = (sock, metadata) =>
    metadata?.participants ? findParticipant(metadata.participants, getBotIdentities(sock)) : null;

function getParticipantPhone(p) {
    if (!p) return "";
    for (const f of ["phoneNumber", "phone", "jid", "id", "lid"]) {
        const n = normalizeNumber(p[f]);
        if (n) return n;
    }
    return "";
}

function getBotNumber(sock, metadata = null) {
    const pools = [];
    if (metadata) {
        const bp = resolveBotParticipant(sock, metadata);
        pools.push(bp?.phoneNumber, bp?.phone, bp?.jid, bp?.id);
    }
    pools.push(
        sock?.user?.phone, sock?.authState?.creds?.me?.phone, sock?.botPhone, sock?.__botPhone,
        sock?.user?.jid, sock?.authState?.creds?.me?.jid, sock?.botJid, sock?.__botJid,
        sock?.user?.id, sock?.authState?.creds?.me?.id
    );
    for (const c of pools) {
        const raw = cleanRawId(c);
        if (!raw || raw.endsWith("@lid")) continue;
        const n = normalizeNumber(c);
        if (n) return n;
    }
    for (const id of getBotIdentities(sock)) {
        const n = normalizeNumber(id);
        if (n) return n;
    }
    return "";
}

function getMainBotNumber(sock) {
    if (!sock) return "";
    if (mainBotCache.has(sock)) return mainBotCache.get(sock);
    for (const c of [sock?.mainBotNumber, sock?.__mainBotNumber, process.env.MAIN_BOT_NUMBER, sock?.user?.mainBotNumber]) {
        const n = normalizeNumber(c);
        if (n) { mainBotCache.set(sock, n); return n; }
    }
    return "";
}

// ═══════════════════════════════════════════════════════
// ⚡ ZERO-LATENCY CONTACT GUARD (PRE-QUEUE EXPRESS LANE)
// ═══════════════════════════════════════════════════════

const guardGroups = new Set();
const guardSeen = new Set();
let guardMtime = -1;

function syncContactGuard() {
    try {
        if (!fs.existsSync(contactGuardFile)) {
            guardGroups.clear();
            guardMtime = -1;
            return;
        }
        const st = fs.statSync(contactGuardFile);
        if (st.mtimeMs === guardMtime) return;
        const parsed = JSON.parse(fs.readFileSync(contactGuardFile, "utf8") || "{}");
        guardGroups.clear();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [jid, on] of Object.entries(parsed)) {
                if (jid.endsWith("@g.us") && on === true) guardGroups.add(jid);
            }
        }
        guardMtime = st.mtimeMs;
    } catch {}
}

syncContactGuard();

function unwrapContact(message) {
    let cur = message;
    for (let i = 0; i < 15; i++) {
        if (!cur || typeof cur !== "object") return null;
        if (cur.contactMessage || cur.contactsArrayMessage) return cur;
        let next = null;
        for (const w of CONTACT_WRAPPERS) {
            if (cur[w]?.message && typeof cur[w].message === "object") { next = cur[w].message; break; }
        }
        if (!next) return cur;
        cur = next;
    }
    return null;
}

function detectContacts(message) {
    const c = unwrapContact(message);
    if (!c) return { hasContact: false, count: 0 };
    if (c.contactMessage) return { hasContact: true, count: 1 };
    if (c.contactsArrayMessage) {
        const arr = c.contactsArrayMessage.contacts;
        return { hasContact: true, count: Array.isArray(arr) ? Math.max(arr.length, 1) : 1 };
    }
    return { hasContact: false, count: 0 };
}

const isBotId = (sock, cands) => {
    const bots = getBotIdentities(sock);
    return cands.some(c => bots.some(b => cleanRawId(c) === cleanRawId(b) || isSameNumber(c, b)));
};

function triggerExpressContactGuard(sock, msg) {
    const jid = msg?.key?.remoteJid;
    if (!jid?.endsWith("@g.us") || !msg?.message || !msg?.key?.id || msg.key.fromMe) return false;

    syncContactGuard();
    if (!guardGroups.has(jid)) return false;

    const { hasContact, count } = detectContacts(msg.message);
    if (!hasContact) return false;

    const eventKey = `${jid}:${msg.key.id}`;
    if (guardSeen.has(eventKey)) return true;
    guardSeen.add(eventKey);
    if (guardSeen.size > 15000) guardSeen.delete(guardSeen.values().next().value);

    const cands = [msg?.key?.participant, msg?.participant, msg?.key?.participantAlt]
        .filter(v => typeof v === "string" && v.length > 0);
    if (!cands.length || isBotId(sock, cands)) return true;

    // تنفيذ فوري في الخلفية بدون انتظار طابور الرسائل
    void (async () => {
        const t0 = Date.now();
        const delTask = sock.sendMessage(jid, { delete: { ...msg.key, remoteJid: jid } })
            .then(() => true, err => { log("err", `ContactGuard Delete: ${err?.message || err}`); return false; });

        const remTask = (async () => {
            let target = null;
            try {
                const meta = await getGroupMetadata(sock, jid);
                const p = findParticipant(meta?.participants, cands);
                if (p) target = p.id || p.phoneNumber || p.lid || p.jid;
            } catch {}
            if (!target) target = cands.find(c => !isBotId(sock, [c]));
            if (!target || isBotId(sock, [target])) return false;

            try {
                const res = await sock.groupParticipantsUpdate(jid, [target], "remove");
                const ok = Array.isArray(res) && res.length > 0 && res.every(r => Number(r?.status) >= 200 && Number(r?.status) < 300);
                if (ok) clearGroupMetadataCache(jid);
                return ok;
            } catch (err) {
                log("err", `ContactGuard Remove: ${err?.message || err}`);
                return false;
            }
        })();

        const [del, rem] = await Promise.allSettled([delTask, remTask]);
        console.log([
            "╭━━━━━━━━━━━━━━━━━━━━━━╮",
            "┃ ⚡ CONTACT GUARD TURBO",
            "┣━━━━━━━━━━━━━━━━━━━━━━┫",
            `┃ 👤 المرسل: ${cands[0]}`,
            `┃ 📦 جهات الاتصال: ${count}`,
            `┃ 🗑️ حذف الرسالة: ${del.status === "fulfilled" && del.value ? "نجح" : "فشل"}`,
            `┃ 🚫 إخراج العضو: ${rem.status === "fulfilled" && rem.value ? "نجح" : "فشل"}`,
            `┃ ⏱️ السرعة: ${Date.now() - t0} ms`,
            "╰━━━━━━━━━━━━━━━━━━━━━━╯"
        ].join("\n"));
    })().catch(() => {});

    return true;
}

// ═══════════════════════════════════════════════════════
// ⚙️ MODE & ELITE STORE + LIVE WATCHER
// ═══════════════════════════════════════════════════════

let modeCache = { elite: false };
let eliteCache = [];
let eliteSet = new Set();
let modeReady = false, eliteReady = false;
let modeMtime = 0, eliteMtime = 0;
let modeLoading = null, eliteLoading = null;
let dataDirReady = false, dataDirPromise = null;
let lastFileCheck = 0;
let fsWatcher = null;

let strictModeValue = false, strictModeMtime = -1;
let strictEliteSig = "", strictEliteSet = new Set();

const ELITE_CANDIDATES = () => [
    eliteFile,
    path.join(dataDir, "النخبه.json"),
    path.join(dataDir, "النخبة"),
    path.join(dataDir, "النخبه")
];

async function ensureDataDir() {
    if (dataDirReady) return;
    if (!dataDirPromise) {
        dataDirPromise = fs.promises.mkdir(dataDir, { recursive: true })
            .then(() => { dataDirReady = true; })
            .catch(() => {})
            .finally(() => { dataDirPromise = null; });
    }
    await dataDirPromise;
}

function parseEliteList(raw) {
    const out = [];
    const set = new Set();
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw).flat() : []);
    for (const item of list) {
        const vals = item && typeof item === "object"
            ? [item.number, item.phone, item.phoneNumber, item.id, item.jid, item.lid]
            : [item];
        for (const v of vals) {
            const n = normalizeNumber(v);
            if (n && !set.has(n)) { set.add(n); out.push(n); }
        }
    }
    return { list: out, set };
}

function readModeSync() {
    try {
        if (!fs.existsSync(modeFile)) {
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(modeFile, JSON.stringify({ elite: false }, null, 2), "utf8");
            strictModeValue = false;
            strictModeMtime = fs.statSync(modeFile).mtimeMs;
            return false;
        }
        const st = fs.statSync(modeFile);
        if (st.mtimeMs === strictModeMtime) return strictModeValue;
        const parsed = JSON.parse(fs.readFileSync(modeFile, "utf8") || "{}");
        strictModeValue = parsed?.elite === true;
        strictModeMtime = st.mtimeMs;
        return strictModeValue;
    } catch {
        return strictModeValue;
    }
}

function readEliteSetSync() {
    const cands = ELITE_CANDIDATES();
    const sig = cands.map(c => {
        try { const s = fs.statSync(c); return `${c}:${s.mtimeMs}:${s.size}`; }
        catch { return `${c}:missing`; }
    }).join("|");
    if (sig === strictEliteSig) return strictEliteSet;

    let set = new Set();
    for (const c of cands) {
        try {
            if (!fs.existsSync(c)) continue;
            const parsed = JSON.parse(fs.readFileSync(c, "utf8") || "[]");
            const res = parseEliteList(parsed);
            if (res.set.size) { set = res.set; break; }
        } catch {}
    }
    strictEliteSig = sig;
    strictEliteSet = set;
    return strictEliteSet;
}

const checkOwner = val => {
    const n = normalizeNumber(val);
    if (!n) return false;
    const owners = Array.isArray(config?.owner) ? config.owner : [config?.owner];
    return owners.some(x => isSameNumber(n, x));
};

function isStrictEliteAllowed(msg, sock, metadata = null) {
    const eliteNums = readEliteSetSync();
    if (msg?.key?.fromMe === true) {
        const cands = [getBotNumber(sock, metadata), ...getBotIdentities(sock)];
        const bp = metadata ? resolveBotParticipant(sock, metadata) : null;
        if (bp) cands.push(bp.phoneNumber, bp.phone, bp.jid, bp.id, bp.lid);
        return cands.some(c => { const n = normalizeNumber(c); return n && eliteNums.has(n); });
    }
    const sender = normalizeNumber(msg?.key?.participant || msg?.key?.remoteJid || "");
    return Boolean(sender && (checkOwner(sender) || eliteNums.has(sender)));
}

async function refreshMode(force = false) {
    if (modeLoading && !force) return modeLoading;
    modeLoading = (async () => {
        try {
            await ensureDataDir();
            let st;
            try { st = await fs.promises.stat(modeFile); }
            catch {
                await fs.promises.writeFile(modeFile, JSON.stringify({ elite: false }, null, 2), "utf8");
                st = await fs.promises.stat(modeFile);
            }
            if (!force && modeReady && st.mtimeMs === modeMtime) return;
            const parsed = JSON.parse((await fs.promises.readFile(modeFile, "utf8")) || "{}");
            if (parsed && typeof parsed === "object") modeCache = { ...modeCache, ...parsed };
            modeMtime = st.mtimeMs;
            modeReady = true;
        } catch {}
    })();
    try { await modeLoading; } finally { modeLoading = null; }
}

async function refreshElite(force = false) {
    if (eliteLoading && !force) return eliteLoading;
    eliteLoading = (async () => {
        try {
            await ensureDataDir();
            let st;
            try { st = await fs.promises.stat(eliteFile); }
            catch {
                await fs.promises.writeFile(eliteFile, "[]", "utf8");
                st = await fs.promises.stat(eliteFile);
            }
            if (!force && eliteReady && st.mtimeMs === eliteMtime) return;

            let parsedData = [];
            for (const c of ELITE_CANDIDATES()) {
                try {
                    if (!fs.existsSync(c)) continue;
                    const txt = await fs.promises.readFile(c, "utf8");
                    const p = JSON.parse(txt || "[]");
                    if (Array.isArray(p) || (p && typeof p === "object")) { parsedData = p; break; }
                } catch {}
            }
            const res = parseEliteList(parsedData);
            eliteCache = res.list;
            eliteSet = res.set;
            eliteMtime = st.mtimeMs;
            eliteReady = true;
        } catch {}
    })();
    try { await eliteLoading; } finally { eliteLoading = null; }
}

function startDataWatcher() {
    if (fsWatcher) return;
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        fsWatcher = fs.watch(dataDir, { persistent: false }, (_, filename) => {
            if (!filename) return;
            if (filename.includes("contactGuard")) syncContactGuard();
            if (filename.includes("مود")) void refreshMode(true).catch(() => {});
            if (filename.includes("النخب")) void refreshElite(true).catch(() => {});
        });
        fsWatcher.on("error", () => {
            try { fsWatcher?.close(); } catch {}
            fsWatcher = null;
        });
    } catch {}
}

function scheduleFileRefresh() {
    const now = Date.now();
    if (now - lastFileCheck < FILE_CHECK_TIME) return;
    lastFileCheck = now;
    void refreshMode().catch(() => {});
    void refreshElite().catch(() => {});
}

const getModeFast = () => { scheduleFileRefresh(); return modeCache; };
const getEliteFast = () => { scheduleFileRefresh(); return eliteCache; };
const checkElite = val => { const n = normalizeNumber(val); return Boolean(n && eliteSet.has(n)); };
const checkEliteIdentities = vals => (Array.isArray(vals) ? vals : [vals]).some(checkElite);

// ═══════════════════════════════════════════════════════
// 🛡️ GROUP CACHE & PLUGINS
// ═══════════════════════════════════════════════════════

const groupCache = new Map();
const groupLoading = new Map();

async function getGroupMetadata(sock, jid, force = false) {
    if (!jid?.endsWith("@g.us")) return null;
    const now = Date.now();
    const cached = groupCache.get(jid);
    if (!force && cached && now - cached.time < GROUP_CACHE_TIME) return cached.data;
    if (groupLoading.has(jid)) return groupLoading.get(jid);

    const promise = (async () => {
        try {
            const meta = await sock.groupMetadata(jid);
            if (meta) {
                groupCache.set(jid, { data: meta, time: Date.now() });
                if (groupCache.size > MAX_GROUP_CACHE) {
                    const first = groupCache.keys().next().value;
                    if (first) groupCache.delete(first);
                }
            }
            return meta || cached?.data || null;
        } catch {
            return cached?.data || null;
        } finally {
            groupLoading.delete(jid);
        }
    })();

    groupLoading.set(jid, promise);
    return promise;
}

export function clearGroupMetadataCache(jid = null) {
    try {
        if (jid) { groupCache.delete(jid); groupLoading.delete(jid); return; }
        groupCache.clear();
        groupLoading.clear();
    } catch {}
}

export async function getLoadedPlugins(sock) {
    if (!sock) return [];
    try {
        const p = await loadPlugins(sock);
        return Array.isArray(p) ? p : [];
    } catch (err) {
        console.error("Plugin Loader Error:", err?.message || err);
        return [];
    }
}

export function clearPluginsCache() {
    try { invalidatePluginCache(); } catch {}
}

// ═══════════════════════════════════════════════════════
// 🛡️ DEDUPLICATION & NON-BLOCKING QUEUE
// ═══════════════════════════════════════════════════════

const processedMessages = new Map();
let cleanupRunning = false;

function wasProcessed(id, sock, scope = "") {
    if (!id) return false;
    const session = String(sock?.user?.id || sock?.user?.jid || sock?.user?.lid || "unknown");
    const key = `${session}:${scope}:${id}`;
    const now = Date.now();
    const prev = processedMessages.get(key);
    if (prev && now - prev < MESSAGE_CACHE_TIME) return true;

    processedMessages.set(key, now);
    if (processedMessages.size > MAX_PROCESSED_MESSAGES && !cleanupRunning) {
        cleanupRunning = true;
        queueMicrotask(() => {
            try {
                const cutoff = Date.now() - MESSAGE_CACHE_TIME;
                let count = 0;
                for (const [k, t] of processedMessages) {
                    if (t < cutoff) { processedMessages.delete(k); if (++count >= 1000) break; }
                }
                if (processedMessages.size > MAX_PROCESSED_MESSAGES * 1.25) {
                    const extra = processedMessages.size - MAX_PROCESSED_MESSAGES;
                    let rem = 0;
                    for (const k of processedMessages.keys()) { processedMessages.delete(k); if (++rem >= extra) break; }
                }
            } finally { cleanupRunning = false; }
        });
    }
    return false;
}

const chatMessageQueues = new Map();
let pendingMessageCount = 0;
let activeMessageWorkers = 0;
const parsedConcurrency = Number.parseInt(process.env.ARTHUR_CONCURRENCY || "8", 10);
const MAX_CONCURRENT_MESSAGE_WORKERS = Number.isFinite(parsedConcurrency)
    ? Math.max(2, Math.min(16, parsedConcurrency))
    : 8;
const workerWaiters = [];

async function acquireWorker() {
    if (activeMessageWorkers < MAX_CONCURRENT_MESSAGE_WORKERS) { activeMessageWorkers++; return; }
    await new Promise(resolve => workerWaiters.push(resolve));
}

function releaseWorker() {
    const next = workerWaiters.shift();
    if (next) next();
    else activeMessageWorkers = Math.max(0, activeMessageWorkers - 1);
}

function queueMessage(sock, msg) {
    const id = msg?.key?.id;
    const jid = String(msg?.key?.remoteJid || `unknown:${id || Date.now()}`);
    const participant = String(msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || "unknown");
    if (id && wasProcessed(id, sock, `${jid}:${participant}`)) return false;

    // المسار السريع الفوري لحماية جهات الاتصال قبل الطابور (0ms انتظار)
    if (triggerExpressContactGuard(sock, msg)) return true;

    const prev = chatMessageQueues.get(jid) || Promise.resolve();
    pendingMessageCount++;

    const task = prev.catch(() => {}).then(async () => {
        await acquireWorker();
        try {
            await withTimeout(executeHandlerLogic(sock, msg), TASK_TIMEOUT_MS, `Handler(${jid})`);
        } catch (err) {
            console.error("Message Worker Error:", err?.stack || err?.message || err);
        } finally {
            pendingMessageCount = Math.max(0, pendingMessageCount - 1);
            releaseWorker();
            if (chatMessageQueues.get(jid) === task) chatMessageQueues.delete(jid);
        }
    });

    chatMessageQueues.set(jid, task);
    return true;
}

export function getHandlerStats() {
    return {
        pendingMessages: pendingMessageCount,
        activeWorkers: activeMessageWorkers,
        queuedConversations: chatMessageQueues.size,
        processedMessageIds: processedMessages.size,
        maxConcurrentWorkers: MAX_CONCURRENT_MESSAGE_WORKERS
    };
}

// ═══════════════════════════════════════════════════════
// 📝 PARSERS, DECORATION & ROUTING
// ═══════════════════════════════════════════════════════

function unwrapContent(message) {
    let cur = message || {};
    for (let i = 0; i < 6; i++) {
        const next = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message
            || cur.viewOnceMessageV2?.message || cur.documentWithCaptionMessage?.message;
        if (!next) break;
        cur = next;
    }
    return cur;
}

function resolveSender(sock, msg, isGroup, metadata) {
    const rawSender = msg?.key?.fromMe
        ? (sock?.user?.id || sock?.user?.jid || sock?.user?.lid || "")
        : isGroup
            ? (msg?.key?.participant || msg?.participant || "")
            : (msg?.key?.remoteJid || "");

    let number = normalizeNumber(rawSender);
    if (isGroup && metadata?.participants && rawSender) {
        const p = findParticipant(metadata.participants, [rawSender]);
        const resolved = getParticipantPhone(p);
        if (resolved) number = resolved;
    }
    return { sender: rawSender, number };
}

function extractInteractiveId(msg) {
    const m = msg?.message;
    if (!m) return "";
    const direct = m.listResponseMessage?.singleSelectReply?.selectedRowId
        || m.buttonsResponseMessage?.selectedButtonId
        || m.templateButtonReplyMessage?.selectedId;
    if (direct) return String(direct).trim();

    const flow = m.interactiveResponseMessage?.nativeFlowResponseMessage || m.nativeFlowResponseMessage;
    if (!flow?.paramsJson) return "";
    try {
        const parsed = typeof flow.paramsJson === "string" ? JSON.parse(flow.paramsJson) : flow.paramsJson;
        return String(parsed?.id || parsed?.selectedRowId || parsed?.selectedId || parsed?.command || "").trim();
    } catch { return ""; }
}

function normalizeMenuCommand(id) {
    if (!id) return "";
    let v = String(id).trim();
    const low = v.toLowerCase();
    if (low.startsWith("cmd:")) v = v.slice(4).trim();
    else if (low.startsWith("command:")) v = v.slice(8).trim();
    return v.replace(/^[./\\#,!^&+=]+/, "").trim();
}

function isOwnPrivateChatCommand(sock, msg) {
    try {
        const jid = cleanRawId(msg?.key?.remoteJid);
        if (!jid || jid === "status@broadcast" || msg?.key?.fromMe !== true) return false;

        const c = unwrapContent(msg?.message);
        const text = String(
            c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption
            || c.videoMessage?.caption || c.documentMessage?.caption
            || c.buttonsResponseMessage?.selectedButtonId
            || c.listResponseMessage?.singleSelectReply?.selectedRowId
            || c.templateButtonReplyMessage?.selectedId
            || c.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
            || ""
        ).trim();

        const prefixes = Array.isArray(config?.prefix)
            ? config.prefix.map(String).filter(Boolean)
            : [String(config?.prefix ?? ".")].filter(Boolean);
        if (!text || !prefixes.some(p => text.startsWith(p))) return false;
        if (jid.endsWith("@g.us")) return true;
        if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return false;

        const ids = getBotIdentities(sock).map(cleanRawId).filter(Boolean);
        const aliases = new Set(ids);
        for (const id of ids) { const at = id.indexOf("@"); if (at > 0) aliases.add(id.slice(0, at)); }
        if (aliases.has(jid)) return true;

        if (!jid.endsWith("@lid")) {
            const chatNum = normalizeNumber(jid.slice(0, jid.indexOf("@") > 0 ? jid.indexOf("@") : jid.length));
            if (chatNum) {
                return ids.some(id => !id.endsWith("@lid") && normalizeNumber(id) === chatNum);
            }
        }
        return false;
    } catch {
        return false;
    }
}

export function handleMessages(sock, update) {
    try {
        const type = update?.type;
        if (type && type !== "notify" && type !== "append") return 0;
        const msgs = Array.isArray(update?.messages) ? update.messages : update?.message ? [update.message] : [];
        let queued = 0;
        for (const msg of msgs) {
            if (!msg?.message || !msg?.key?.remoteJid) continue;
            if (type === "append" && msg.key.fromMe !== true) continue;
            if (msg.key.fromMe && !isOwnPrivateChatCommand(sock, msg)) continue;
            if (msg.key.remoteJid === "status@broadcast") continue;
            if (queueMessage(sock, msg)) queued++;
        }
        return queued;
    } catch (err) {
        console.error("handleMessages Error:", err?.message || err);
        return 0;
    }
}

function cleanDecorationLines(text) {
    return String(text || "")
        .split("\n")
        .filter(line => {
            const plain = line.replace(/[\*`_~ ]/g, "").trim();
            if (!plain) return true;
            if (/ARTHUR.*BOT|BOT.*ARTHUR/i.test(plain)) return false;
            if (/^(╭|╰|┏|┗|◇❐|╔|╚|┌|└).*?(╮|╯|┓|┛|❐◇|╗|╝|┐|┘)$/.test(plain)) return false;
            if (/^[╭╮╰╯┣┫┃┏┓┗┛┌┐└┘╔╗╚╝━═─—◇❐╾🩸👑⚔️]+$/.test(plain)) return false;
            return true;
        })
        .join("\n")
        .trim();
}

function decoratePayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const out = { ...payload };
    for (const k of ["text", "caption"]) {
        if (typeof out[k] === "string" && out[k].trim() && !isArthurDecorated(out[k])) {
            out[k] = arthurBox(cleanDecorationLines(out[k]));
        }
    }
    return out;
}

function createArthurSocket(sock) {
    return new Proxy(sock, {
        get(target, prop, receiver) {
            if (prop === "sendMessage") {
                return (jid, content, opts) => target.sendMessage(jid, decoratePayload(content), opts);
            }
            if (prop === "relayMessage") {
                return (jid, message, opts) => {
                    const out = message && typeof message === "object" ? { ...message } : message;
                    for (const k of ["extendedTextMessage", "imageMessage", "videoMessage"]) {
                        const field = k === "extendedTextMessage" ? "text" : "caption";
                        if (out?.[k]?.[field] && !isArthurDecorated(out[k][field])) {
                            out[k] = { ...out[k], [field]: arthurBox(cleanDecorationLines(out[k][field])) };
                        }
                    }
                    const dec = m => {
                        if (!m || typeof m !== "object") return m;
                        const r = { ...m };
                        if (r.interactiveMessage?.body?.text && !isArthurDecorated(r.interactiveMessage.body.text)) {
                            r.interactiveMessage = {
                                ...r.interactiveMessage,
                                body: { ...r.interactiveMessage.body, text: arthurBox(cleanDecorationLines(r.interactiveMessage.body.text)) }
                            };
                        }
                        for (const w of ["viewOnceMessage", "ephemeralMessage"]) {
                            if (r[w]?.message) r[w] = { ...r[w], message: dec(r[w].message) };
                        }
                        return r;
                    };
                    return target.relayMessage(jid, dec(out), opts);
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

let pluginCache = { source: null, cmdMap: new Map(), onMsg: [], onReact: [] };

function indexPlugins(plugins) {
    if (pluginCache.source === plugins) return pluginCache;
    const cmdMap = new Map(), onMsg = [], onReact = [];
    for (const p of plugins) {
        if (typeof p?.onMessage === "function") onMsg.push(p);
        if (typeof p?.onReaction === "function") onReact.push(p);
        const keys = [
            ...(Array.isArray(p?.command) ? p.command : [p?.command]),
            ...(Array.isArray(p?.aliases) ? p.aliases : [p?.aliases])
        ];
        for (const k of keys) {
            const name = k == null ? "" : String(k).trim().toLowerCase();
            if (name && !cmdMap.has(name)) cmdMap.set(name, p);
        }
    }
    pluginCache = { source: plugins, cmdMap, onMsg, onReact };
    return pluginCache;
}

function hasPermission(plugin, { isOwner, isElite }) {
    if (plugin?.ownerOnly === true && !isOwner) return false;
    if (plugin?.eliteOnly === true && !isElite && !isOwner) return false;
    const cat = String(plugin?.category || "").toLowerCase();
    if ((cat.includes("مطور") || cat.includes("dev")) && !isOwner) return false;
    return true;
}

// ═══════════════════════════════════════════════════════
// ⚡ EXECUTION
// ═══════════════════════════════════════════════════════

async function executeHandlerLogic(sock, msg) {
    try {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        const isGroup = jid.endsWith("@g.us");
        const isPrivate = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
        const metadata = isGroup ? await getGroupMetadata(sock, jid) : null;

        if (readModeSync() && !isStrictEliteAllowed(msg, sock, metadata)) return;

        const plugins = await getLoadedPlugins(sock);
        if (!plugins.length) return;

        const pluginSock = createArthurSocket(sock);
        const mode = getModeFast();
        getEliteFast();

        const { cmdMap, onMsg, onReact } = indexPlugins(plugins);
        const botIdentities = getBotIdentities(sock);
        const botNumber = getBotNumber(sock, metadata);
        const botParticipant = isGroup ? resolveBotParticipant(sock, metadata) : null;
        const mainNumber = getMainBotNumber(sock);
        const isMainBot = Boolean(mainNumber && (
            isSameNumber(botNumber, mainNumber)
            || isSameNumber(getParticipantPhone(botParticipant), mainNumber)
            || botIdentities.some(id => isSameNumber(id, mainNumber))
        ));

        const { sender, number } = resolveSender(sock, msg, isGroup, metadata);
        const isOwnerUser = checkOwner(number) || checkOwner(sender);
        const isEliteUser = checkEliteIdentities([number, sender]) || isMainBot || isOwnerUser;
        const botIsSuperAdmin = Boolean(isGroup && botParticipant?.admin === "superadmin");
        const botIsAdmin = Boolean(isGroup && (botParticipant?.admin === "admin" || botIsSuperAdmin));
        const restrictedMode = mode?.elite === true;

        const interactiveId = extractInteractiveId(msg);
        const fromInteractive = Boolean(interactiveId);
        const normalText = msg.message.conversation || msg.message.extendedTextMessage?.text
            || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        const text = String(interactiveId || normalText || "").trim();

        const baseCtx = {
            jid, sender, number, isGroup, isPrivate, message: msg,
            isElite: isEliteUser, isOwner: isOwnerUser, botNumber,
            mainBotNumber: mainNumber, isMainBot,
            isInteractive: fromInteractive, interactiveId: interactiveId || null,
            isListResponse: fromInteractive, isAdmin: botIsAdmin,
            isSuperAdmin: botIsSuperAdmin, adminMode: botIsAdmin,
            botIsAdmin, botIsSuperAdmin, botParticipant: botParticipant || null,
            groupMetadata: metadata || null, restrictedMode
        };

        if (msg.message?.reactionMessage && onReact.length) {
            for (const p of onReact) {
                if (restrictedMode && p?.alwaysOn !== true && !isEliteUser) continue;
                try { await withTimeout(Promise.resolve(p.onReaction(pluginSock, msg, baseCtx)), 10_000, "onReaction"); }
                catch (err) { console.error(`❌ Reaction Hook Error: ${err?.message || err}`); }
            }
        }

        if (onMsg.length) {
            for (const p of onMsg) {
                if (restrictedMode && p?.alwaysOn !== true && !isEliteUser) continue;
                try {
                    const res = await withTimeout(Promise.resolve(p.onMessage(pluginSock, msg, baseCtx)), 12_000, "onMessage");
                    if (res?.handled === true) return;
                } catch (err) {
                    console.error(`❌ Listener Error: ${err?.message || err}`);
                }
            }
        }

        if ((restrictedMode && !isEliteUser) || !text) return;

        const prefixes = Array.isArray(config?.prefix)
            ? config.prefix.map(String).filter(Boolean)
            : [String(config?.prefix ?? ".")].filter(Boolean);
        const matchedPrefix = fromInteractive ? "" : prefixes.find(p => text.startsWith(p)) || "";
        if (!matchedPrefix && !fromInteractive) return;

        let noPrefixText = matchedPrefix ? text.slice(matchedPrefix.length).trim() : text;
        if (fromInteractive) noPrefixText = normalizeMenuCommand(noPrefixText);
        if (!noPrefixText) return;

        const space = noPrefixText.search(/\s/);
        const commandName = (space === -1 ? noPrefixText : noPrefixText.slice(0, space)).toLowerCase();
        const cmd = commandName ? cmdMap.get(commandName) : null;
        if (!cmd) return;

        if (!hasPermission(cmd, { isOwner: isOwnerUser, isElite: isEliteUser })) {
            return await sock.sendMessage(jid, { text: arthurBox("❌ ليس لديك صلاحية استخدام هذا الأمر") }, { quoted: msg });
        }

        log("cmd", `${commandName} ← ${number || sender || "UNKNOWN"} ← ${isEliteUser ? "ELITE" : botIsAdmin ? "BOT ADMIN" : "USER"}`);

        try {
            await withTimeout(
                Promise.resolve(cmd.execute(pluginSock, msg, { ...baseCtx, text, noPrefixText, commandName, hasPrefix: Boolean(matchedPrefix) })),
                TASK_TIMEOUT_MS,
                `Command(${commandName})`
            );
        } catch (err) {
            console.error(`❌ Command Execution Failed [${commandName}]:`, err?.message || err);
        }
    } catch (err) {
        console.error("Critical Execute Handler Error:", err?.message || err);
    }
}

export async function warmupHandler(sock) {
    try {
        startDataWatcher();
        await Promise.all([refreshMode(true), refreshElite(true), getLoadedPlugins(sock)]);
        syncContactGuard();
        log("ok", `Handler Ready | Bot: ${getBotNumber(sock) || "UNKNOWN"}`);
        log("bot", `Identities: ${getBotIdentities(sock).join(" | ") || "NONE"}`);
        log("elite", `Elite: ${eliteCache.length}`);
        log("ok", `Mode: ${modeCache.elite ? "ELITE" : "NORMAL"}`);
        return true;
    } catch (err) {
        console.error("Handler Warmup Error:", err?.message || err);
        return false;
    }
}

export function clearHandlerCaches() {
    try {
        try { fsWatcher?.close(); } catch {}
        fsWatcher = null;
        groupCache.clear();
        groupLoading.clear();
        processedMessages.clear();
        chatMessageQueues.clear();
        pendingMessageCount = 0;
        pluginCache = { source: null, cmdMap: new Map(), onMsg: [], onReact: [] };
        strictModeMtime = -1;
        strictEliteSig = "";
        strictEliteSet = new Set();
        guardSeen.clear();
        guardMtime = -1;
        modeReady = false;
        eliteReady = false;
        modeMtime = 0;
        eliteMtime = 0;
        modeCache = { elite: false };
        eliteCache = [];
        eliteSet = new Set();
        lastFileCheck = 0;
    } catch {}
}