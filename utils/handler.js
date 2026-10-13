import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlugins, invalidatePluginCache } from "./loader.js";
import config from "../config.js";
import { arthurBox, isArthurDecorated } from "./arthurStyle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════
// 📁 FILES
// ═══════════════════════════════════════════════════════

const dataDir = path.join(__dirname, "../data");
const modeFile = path.join(dataDir, "مود.json");
const eliteFile = path.join(dataDir, "النخبة.json");

// ═══════════════════════════════════════════════════════
// ⚡ PERFORMANCE CONFIG
// ═══════════════════════════════════════════════════════

const GROUP_CACHE_TIME = 30_000;
const FILE_CHECK_TIME = 2_000;

const MESSAGE_CACHE_TIME = 30_000;
const MAX_PROCESSED_MESSAGES = 5000;

const MAX_GROUP_CACHE = 500;

// ═══════════════════════════════════════════════════════
// 🎨 COLORS
// ═══════════════════════════════════════════════════════

const COLORS = {
    reset: "\x1b[0m",
    gold: "\x1b[38;5;220m",
    green: "\x1b[38;5;46m",
    red: "\x1b[38;5;196m",
    cyan: "\x1b[38;5;51m",
    blue: "\x1b[38;5;39m",
    magenta: "\x1b[38;5;201m"
};

// ═══════════════════════════════════════════════════════
// 📝 LOGGER
// ═══════════════════════════════════════════════════════

function log(type, text) {
    try {
        const colors = {
            ok: COLORS.green,
            cmd: COLORS.cyan,
            err: COLORS.red,
            elite: COLORS.gold,
            admin: COLORS.blue,
            bot: COLORS.magenta
        };

        const icons = {
            ok: "✅",
            cmd: "⚡",
            err: "❌",
            elite: "👑",
            admin: "🛡️",
            bot: "🤖"
        };

        console.log(
            `${colors[type] || COLORS.cyan}` +
            `[${icons[type] || "•"}] ${text}` +
            COLORS.reset
        );
    } catch {}
}

// ═══════════════════════════════════════════════════════
// 🔢 NUMBER
// ═══════════════════════════════════════════════════════

export function extractPureNumber(value) {
    try {
        if (value === undefined || value === null) {
            return "";
        }

        let v = String(value).trim();

        if (!v) return "";

        const colon = v.indexOf(":");

        if (colon !== -1) {
            v = v.slice(0, colon);
        }

        const at = v.indexOf("@");

        if (at !== -1) {
            v = v.slice(0, at);
        }

        return v.replace(/\D/g, "");
    } catch {
        return "";
    }
}

function normalizeStoredNumber(value) {
    const number = extractPureNumber(value);

    if (!number) return "";

    return number.replace(/^0+(?=\d)/, "");
}

function cleanRawId(value) {
    try {
        if (value === undefined || value === null) {
            return "";
        }

        return String(value).trim().toLowerCase();
    } catch {
        return "";
    }
}

function isSameNumber(a, b) {
    const x = normalizeStoredNumber(a);
    const y = normalizeStoredNumber(b);

    return !!x && !!y && x === y;
}

// ═══════════════════════════════════════════════════════
// 🤖 BOT IDENTITIES
// ═══════════════════════════════════════════════════════

function getBotIdentities(sock) {
    const result = [];
    const seen = new Set();

    const add = value => {
        if (
            value === undefined ||
            value === null
        ) {
            return;
        }

        const raw = String(value).trim();

        if (!raw) return;

        const key = raw.toLowerCase();

        if (seen.has(key)) return;

        seen.add(key);
        result.push(raw);
    };

    const candidates = [
        sock?.user?.id,
        sock?.user?.jid,
        sock?.user?.lid,
        sock?.user?.phone,

        sock?.authState?.creds?.me?.id,
        sock?.authState?.creds?.me?.jid,
        sock?.authState?.creds?.me?.lid,
        sock?.authState?.creds?.me?.phone,

        sock?.botJid,
        sock?.botLid,
        sock?.botPhone,

        sock?.__botJid,
        sock?.__botLid,
        sock?.__botPhone
    ];

    for (const candidate of candidates) {
        add(candidate);

        const number = extractPureNumber(candidate);

        if (number) {
            add(number);
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════
// 👤 PARTICIPANT
// ═══════════════════════════════════════════════════════

function findParticipant(participants, identities) {
    if (
        !Array.isArray(participants) ||
        !participants.length
    ) {
        return null;
    }

    const ids = Array.isArray(identities)
        ? identities
        : [identities];

    for (const identity of ids) {
        if (!identity) continue;

        const raw = cleanRawId(identity);

        if (!raw) continue;

        for (const p of participants) {
            if (!p) continue;

            if (
                cleanRawId(p.id) === raw ||
                cleanRawId(p.jid) === raw ||
                cleanRawId(p.lid) === raw ||
                cleanRawId(p.phone) === raw ||
                cleanRawId(p.phoneNumber) === raw
            ) {
                return p;
            }
        }
    }

    for (const identity of ids) {
        const number =
            normalizeStoredNumber(identity);

        if (!number) continue;

        for (const p of participants) {
            if (!p) continue;

            if (
                isSameNumber(number, p.phoneNumber) ||
                isSameNumber(number, p.phone) ||
                isSameNumber(number, p.id) ||
                isSameNumber(number, p.jid) ||
                isSameNumber(number, p.lid)
            ) {
                return p;
            }
        }
    }

    return null;
}

function resolveBotParticipant(sock, metadata) {
    if (!metadata?.participants) {
        return null;
    }

    const identities =
        getBotIdentities(sock);

    if (!identities.length) {
        return null;
    }

    return findParticipant(
        metadata.participants,
        identities
    );
}

function getParticipantPhone(participant) {
    if (!participant) return "";

    const candidates = [
        participant.phoneNumber,
        participant.phone,
        participant.jid,
        participant.id,
        participant.lid
    ];

    for (const candidate of candidates) {
        const number =
            normalizeStoredNumber(candidate);

        if (number) {
            return number;
        }
    }

    return "";
}

function getBotNumber(sock, metadata = null) {
    // Prefer a real phone/JID identity over an @lid identifier. LID values
    // can contain digits that are not the account's phone number.
    if (metadata) {
        const participant = resolveBotParticipant(sock, metadata);
        const participantCandidates = [
            participant?.phoneNumber,
            participant?.phone,
            participant?.jid,
            participant?.id
        ];
        for (const candidate of participantCandidates) {
            const raw = cleanRawId(candidate);
            if (!raw || raw.endsWith("@lid")) continue;
            const number = normalizeStoredNumber(candidate);
            if (number) return number;
        }
    }

    const preferredCandidates = [
        sock?.user?.phone,
        sock?.authState?.creds?.me?.phone,
        sock?.botPhone,
        sock?.__botPhone,
        sock?.user?.jid,
        sock?.authState?.creds?.me?.jid,
        sock?.botJid,
        sock?.__botJid,
        sock?.user?.id,
        sock?.authState?.creds?.me?.id
    ];
    for (const candidate of preferredCandidates) {
        const raw = cleanRawId(candidate);
        if (!raw || raw.endsWith("@lid")) continue;
        const number = normalizeStoredNumber(candidate);
        if (number) return number;
    }

    // Fall back to all known identities only when no phone-style identity exists.
    for (const identity of getBotIdentities(sock)) {
        const number = normalizeStoredNumber(identity);
        if (number) return number;
    }
    return "";
}

// ═══════════════════════════════════════════════════════
// 👑 MAIN BOT
// ═══════════════════════════════════════════════════════

const mainBotCache = new WeakMap();

function getMainBotNumber(sock) {
    if (!sock) return "";

    try {
        const cached =
            mainBotCache.get(sock);

        if (cached) {
            return cached;
        }

        const candidates = [
            sock?.mainBotNumber,
            sock?.__mainBotNumber,
            process.env.MAIN_BOT_NUMBER,
            sock?.user?.mainBotNumber
        ];

        for (const candidate of candidates) {
            const number =
                normalizeStoredNumber(candidate);

            if (number) {
                mainBotCache.set(
                    sock,
                    number
                );

                return number;
            }
        }
    } catch {}

    return "";
}

// ═══════════════════════════════════════════════════════
// 📦 MODE / ELITE CACHE
// ═══════════════════════════════════════════════════════

let modeCache = {
    elite: false
};

let eliteCache = [];
let eliteSet = new Set();

let modeReady = false;
let eliteReady = false;

let modeMtime = 0;
let eliteMtime = 0;

let modeLoading = null;
let eliteLoading = null;

let dataDirReady = false;
let dataDirPromise = null;

let lastFileCheck = 0;

// ═══════════════════════════════════════════════════════
// 📁 DATA DIRECTORY
// ═══════════════════════════════════════════════════════

async function ensureDataDir() {
    if (dataDirReady) {
        return;
    }

    if (!dataDirPromise) {
        dataDirPromise =
            fs.promises
                .mkdir(dataDir, {
                    recursive: true
                })
                .then(() => {
                    dataDirReady = true;
                })
                .catch(() => {})
                .finally(() => {
                    dataDirPromise = null;
                });
    }

    await dataDirPromise;
}

// ═══════════════════════════════════════════════════════
// 🔒 STRICT ELITE GATE (SYNC)
// يقرأ الحالة مباشرة قبل تشغيل أي listener أو command.
// ═══════════════════════════════════════════════════════
let strictModeValue = false;
let strictModeMtime = -1;
let strictEliteSignature = "";
let strictEliteSet = new Set();

function readModeSync() {
    try {
        if (!fs.existsSync(modeFile)) {
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(modeFile, JSON.stringify({ elite: false }, null, 2), "utf8");
            strictModeValue = false;
            strictModeMtime = fs.statSync(modeFile).mtimeMs;
            return strictModeValue;
        }

        const stat = fs.statSync(modeFile);
        if (stat.mtimeMs === strictModeMtime) return strictModeValue;

        const parsed = JSON.parse(fs.readFileSync(modeFile, "utf8") || "{}");
        strictModeValue = parsed?.elite === true;
        strictModeMtime = stat.mtimeMs;
        return strictModeValue;
    } catch {
        // Fail closed only when the file exists but cannot be read: don't silently
        // switch a protected bot to normal mode because of a transient read error.
        return strictModeValue;
    }
}

function readEliteSetSync() {
    const candidates = [
        eliteFile,
        path.join(dataDir, "النخبه.json"),
        path.join(dataDir, "النخبة"),
        path.join(dataDir, "النخبه")
    ];

    let signature = "";
    for (const candidate of candidates) {
        try {
            const stat = fs.statSync(candidate);
            signature += `${candidate}:${stat.mtimeMs}:${stat.size}|`;
        } catch {
            signature += `${candidate}:missing|`;
        }
    }
    if (signature === strictEliteSignature) return strictEliteSet;

    const set = new Set();
    for (const candidate of candidates) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const parsed = JSON.parse(fs.readFileSync(candidate, "utf8") || "[]");
            const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? Object.values(parsed).flat() : []);
            for (const item of list) {
                const values = item && typeof item === "object"
                    ? [item.number, item.phone, item.phoneNumber, item.id, item.jid, item.lid]
                    : [item];
                for (const value of values) {
                    const n = normalizeStoredNumber(value);
                    if (n) set.add(n);
                }
            }
            if (set.size) break;
        } catch {}
    }

    strictEliteSignature = signature;
    strictEliteSet = set;
    return strictEliteSet;
}

function getEarlySenderNumber(msg) {
    const raw = msg?.key?.participant || msg?.key?.remoteJid || "";
    return normalizeStoredNumber(raw);
}

function isStrictEliteAllowed(msg, sock, metadata = null) {
    const eliteNumbers = readEliteSetSync();

    // In elite mode, a fromMe command is allowed only when at least one
    // known phone/JID identity for this bot is explicitly in the elite list.
    // Check all identities because Baileys may expose an @lid as user.id.
    if (msg?.key?.fromMe === true) {
        const candidates = [getBotNumber(sock, metadata), ...getBotIdentities(sock)];
        const participant = metadata ? resolveBotParticipant(sock, metadata) : null;
        if (participant) {
            candidates.push(participant.phoneNumber, participant.phone, participant.jid, participant.id, participant.lid);
        }
        for (const candidate of candidates) {
            const number = normalizeStoredNumber(candidate);
            if (number && eliteNumbers.has(number)) return true;
        }
        return false;
    }

    const sender = getEarlySenderNumber(msg);
    if (!sender) return false;
    if (checkOwner(sender)) return true;
    return eliteNumbers.has(sender);
}

// ═══════════════════════════════════════════════════════
// ⚙️ MODE
// ═══════════════════════════════════════════════════════

async function refreshMode(force = false) {
    if (
        modeLoading &&
        !force
    ) {
        return modeLoading;
    }

    modeLoading =
        (async () => {
            try {
                await ensureDataDir();

                let stat;

                try {
                    stat =
                        await fs.promises.stat(
                            modeFile
                        );
                } catch {
                    await fs.promises.writeFile(
                        modeFile,
                        JSON.stringify(
                            {
                                elite: false
                            },
                            null,
                            2
                        ),
                        "utf8"
                    );

                    stat =
                        await fs.promises.stat(
                            modeFile
                        );
                }

                const mtime =
                    stat.mtimeMs;

                if (
                    !force &&
                    modeReady &&
                    mtime === modeMtime
                ) {
                    return;
                }

                const content =
                    await fs.promises.readFile(
                        modeFile,
                        "utf8"
                    );

                let parsed = {};

                try {
                    parsed =
                        JSON.parse(
                            content || "{}"
                        );
                } catch {
                    parsed = {};
                }

                if (
                    parsed &&
                    typeof parsed ===
                        "object"
                ) {
                    modeCache = {
                        ...modeCache,
                        ...parsed
                    };
                }

                modeMtime = mtime;
                modeReady = true;

            } catch {}
        })();

    try {
        await modeLoading;
    } finally {
        modeLoading = null;
    }
}

// ═══════════════════════════════════════════════════════
// 👑 ELITE
// ═══════════════════════════════════════════════════════

async function refreshElite(force = false) {
    if (
        eliteLoading &&
        !force
    ) {
        return eliteLoading;
    }

    eliteLoading =
        (async () => {
            try {
                await ensureDataDir();

                let stat;

                try {
                    stat =
                        await fs.promises.stat(
                            eliteFile
                        );
                } catch {
                    await fs.promises.writeFile(
                        eliteFile,
                        "[]",
                        "utf8"
                    );

                    stat =
                        await fs.promises.stat(
                            eliteFile
                        );
                }

                const mtime =
                    stat.mtimeMs;

                if (
                    !force &&
                    eliteReady &&
                    mtime === eliteMtime
                ) {
                    return;
                }

                let data = [];
                const eliteCandidates = [
                    eliteFile,
                    path.join(dataDir, "النخبه.json"),
                    path.join(dataDir, "النخبة"),
                    path.join(dataDir, "النخبه")
                ];

                for (const candidate of eliteCandidates) {
                    try {
                        if (!fs.existsSync(candidate)) continue;
                        const content = await fs.promises.readFile(candidate, "utf8");
                        const parsed = JSON.parse(content || "[]");
                        if (Array.isArray(parsed)) { data = parsed; break; }
                        if (parsed && typeof parsed === "object") { data = Object.values(parsed).flat(); break; }
                    } catch {}
                }

                const result = [];
                const set = new Set();

                if (
                    Array.isArray(data)
                ) {
                    for (
                        const item of data
                    ) {
                        let values = [];

                        if (
                            typeof item ===
                                "string" ||
                            typeof item ===
                                "number"
                        ) {
                            values.push(item);

                        } else if (
                            item &&
                            typeof item ===
                                "object"
                        ) {
                            values.push(
                                item.number,
                                item.phone,
                                item.phoneNumber,
                                item.id,
                                item.jid,
                                item.lid
                            );
                        }

                        for (
                            const value of values
                        ) {
                            const number =
                                normalizeStoredNumber(
                                    value
                                );

                            if (
                                number &&
                                !set.has(number)
                            ) {
                                set.add(number);
                                result.push(
                                    number
                                );
                            }
                        }
                    }
                }

                eliteCache = result;
                eliteSet = set;

                eliteMtime = mtime;
                eliteReady = true;

            } catch {}
        })();

    try {
        await eliteLoading;
    } finally {
        eliteLoading = null;
    }
}

// ═══════════════════════════════════════════════════════
// ⚡ BACKGROUND REFRESH (مُحدث لاستجابة فورية)
// ═══════════════════════════════════════════════════════

function scheduleFileRefresh() {
    const now = Date.now();

    if (
        now - lastFileCheck <
        FILE_CHECK_TIME
    ) {
        return;
    }

    lastFileCheck = now;

    void refreshMode().catch(() => {});
    void refreshElite().catch(() => {});
}

function getModeFast() {
    // تحديث فوري بدون تأخير ۳۰ ثانية لضمان قراءة التغيير فور حدوثه
    void refreshMode().catch(() => {});
    return modeCache;
}

function getEliteFast() {
    void refreshElite().catch(() => {});
    return eliteCache;
}

function checkElite(value) {
    const number =
        normalizeStoredNumber(value);

    return (
        !!number &&
        eliteSet.has(number)
    );
}

function checkEliteIdentities(values) {
    if (!Array.isArray(values)) {
        values = [values];
    }

    for (
        const value of values
    ) {
        if (checkElite(value)) {
            return true;
        }
    }

    return false;
}

// ═══════════════════════════════════════════════════════
// 🛡️ GROUP CACHE
// ═══════════════════════════════════════════════════════

const groupCache = new Map();
const groupLoading = new Map();

async function getGroupMetadata(
    sock,
    jid,
    force = false
) {
    if (
        !jid ||
        !jid.endsWith("@g.us")
    ) {
        return null;
    }

    const now = Date.now();
    const cached =
        groupCache.get(jid);

    if (
        !force &&
        cached &&
        now - cached.time <
            GROUP_CACHE_TIME
    ) {
        return cached.data;
    }

    const existing =
        groupLoading.get(jid);

    if (existing) {
        return existing;
    }

    const promise =
        (async () => {
            try {
                const metadata =
                    await sock.groupMetadata(
                        jid
                    );

                if (metadata) {
                    groupCache.set(
                        jid,
                        {
                            data: metadata,
                            time: Date.now()
                        }
                    );

                    if (
                        groupCache.size >
                        MAX_GROUP_CACHE
                    ) {
                        const first =
                            groupCache.keys()
                                .next()
                                .value;

                        if (first) {
                            groupCache.delete(
                                first
                            );
                        }
                    }
                }

                return (
                    metadata ||
                    cached?.data ||
                    null
                );

            } catch {
                return (
                    cached?.data ||
                    null
                );

            } finally {
                groupLoading.delete(
                    jid
                );
            }
        })();

    groupLoading.set(
        jid,
        promise
    );

    return promise;
}

export function clearGroupMetadataCache(
    jid = null
) {
    try {
        if (jid) {
            groupCache.delete(jid);
            groupLoading.delete(jid);
            return;
        }

        groupCache.clear();
        groupLoading.clear();

    } catch {}
}

// ═══════════════════════════════════════════════════════
// 🚀 LIVE PLUGIN LOADER
// ═══════════════════════════════════════════════════════

export async function getLoadedPlugins(sock) {
    if (!sock) {
        return [];
    }

    try {
        const plugins = await loadPlugins(sock);
        // loadPlugins already removes invalid modules; preserve array identity
        // so the command/listener index can be reused between messages.
        return Array.isArray(plugins) ? plugins : [];
    } catch (error) {
        console.error(
            "Plugin Loader Error:",
            error?.message || error
        );
        return [];
    }
}

export function clearPluginsCache(sock = null) {
    try { invalidatePluginCache(); } catch {}
}

// ═══════════════════════════════════════════════════════
// 🛡️ MESSAGE DEDUPLICATION
// ═══════════════════════════════════════════════════════

const processedMessages =
    new Map();

let cleanupRunning = false;

function getSocketSessionId(sock) {
    return (
        sock?.user?.id ||
        sock?.user?.jid ||
        sock?.user?.lid ||
        "unknown"
    );
}

function wasProcessed(id, sock, scope = "") {
    if (!id) {
        return false;
    }

    const session =
        String(
            getSocketSessionId(sock)
        );

    const key =
        `${session}:${scope}:${id}`;

    const now =
        Date.now();

    const previous =
        processedMessages.get(
            key
        );

    if (
        previous &&
        now - previous <
            MESSAGE_CACHE_TIME
    ) {
        return true;
    }

    processedMessages.set(
        key,
        now
    );

    if (
        processedMessages.size >
            MAX_PROCESSED_MESSAGES &&
        !cleanupRunning
    ) {
        cleanupRunning = true;

        queueMicrotask(() => {
            try {
                const cutoff =
                    Date.now() -
                    MESSAGE_CACHE_TIME;

                let count = 0;

                for (
                    const [
                        cacheKey,
                        time
                    ]
                    of processedMessages
                ) {
                    if (
                        time <
                        cutoff
                    ) {
                        processedMessages.delete(
                            cacheKey
                        );

                        count++;

                        if (
                            count >=
                            1000
                        ) {
                            break;
                        }
                    }
                }

                if (
                    processedMessages.size >
                    MAX_PROCESSED_MESSAGES *
                        1.25
                ) {
                    const removeCount =
                        processedMessages.size -
                        MAX_PROCESSED_MESSAGES;

                    let removed = 0;

                    for (
                        const key
                        of processedMessages.keys()
                    ) {
                        processedMessages.delete(
                            key
                        );

                        removed++;

                        if (
                            removed >=
                            removeCount
                        ) {
                            break;
                        }
                    }
                }

            } finally {
                cleanupRunning = false;
            }
        });
    }

    return false;
}

// ═══════════════════════════════════════════════════════
// 👤 SENDER
// ═══════════════════════════════════════════════════════

function resolveSender(
    sock,
    msg,
    isGroup,
    metadata
) {
    let rawSender = "";

    if (msg?.key?.fromMe) {
        rawSender =
            sock?.user?.id ||
            sock?.user?.jid ||
            sock?.user?.lid ||
            "";

    } else if (isGroup) {
        rawSender =
            msg?.key?.participant ||
            msg?.participant ||
            "";

    } else {
        rawSender =
            msg?.key?.remoteJid ||
            "";
    }

    let number =
        normalizeStoredNumber(
            rawSender
        );

    if (
        isGroup &&
        metadata?.participants &&
        rawSender
    ) {
        const participant =
            findParticipant(
                metadata.participants,
                [rawSender]
            );

        if (participant) {
            const resolved =
                getParticipantPhone(
                    participant
                );

            if (resolved) {
                number = resolved;
            }
        }
    }

    return {
        sender: rawSender,
        number
    };
}

// ═══════════════════════════════════════════════════════
// 📋 INTERACTIVE
// ═══════════════════════════════════════════════════════

function extractInteractiveResponseId(msg) {
    try {
        const message =
            msg?.message;

        if (!message) {
            return "";
        }

        const listId =
            message
                ?.listResponseMessage
                ?.singleSelectReply
                ?.selectedRowId;

        if (listId) {
            return String(
                listId
            ).trim();
        }

        const buttonId =
            message
                ?.buttonsResponseMessage
                ?.selectedButtonId;

        if (buttonId) {
            return String(
                buttonId
            ).trim();
        }

        const templateId =
            message
                ?.templateButtonReplyMessage
                ?.selectedId;

        if (templateId) {
            return String(
                templateId
            ).trim();
        }

        const flow =
            message
                ?.interactiveResponseMessage
                ?.nativeFlowResponseMessage ||
            message?.nativeFlowResponseMessage;

        if (flow?.paramsJson) {
            let parsed;

            try {
                parsed =
                    typeof flow.paramsJson ===
                        "string"
                        ? JSON.parse(
                              flow.paramsJson
                          )
                        : flow.paramsJson;
            } catch {
                parsed = null;
            }

            if (parsed?.id) {
                return String(
                    parsed.id
                ).trim();
            }

            if (
                parsed?.selectedRowId
            ) {
                return String(
                    parsed.selectedRowId
                ).trim();
            }

            if (
                parsed?.selectedId
            ) {
                return String(
                    parsed.selectedId
                ).trim();
            }

            if (
                parsed?.command
            ) {
                return String(
                    parsed.command
                ).trim();
            }
        }

    } catch {}

    return "";
}

function normalizeMenuCommand(id) {
    if (!id) {
        return "";
    }

    let value =
        String(id).trim();

    const lower =
        value.toLowerCase();

    if (
        lower.startsWith("cmd:")
    ) {
        value =
            value.slice(4).trim();

    } else if (
        lower.startsWith(
            "command:"
        )
    ) {
        value =
            value.slice(8).trim();
    }

    return value
        .replace(
            /^[./\\#,!^&+=]+/,
            ""
        )
        .trim();
}

// ═══════════════════════════════════════════════════════
// 🚀 ENTRY
// ═══════════════════════════════════════════════════════

const chatMessageQueues = new Map();
let pendingMessageCount = 0;
let activeMessageWorkers = 0;
const requestedConcurrency = Number.parseInt(
    process.env.ARTHUR_CONCURRENCY || "6",
    10
);
const MAX_CONCURRENT_MESSAGE_WORKERS = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.min(12, requestedConcurrency))
    : 6;
const workerWaiters = [];

async function acquireMessageWorker() {
    if (activeMessageWorkers < MAX_CONCURRENT_MESSAGE_WORKERS) {
        activeMessageWorkers++;
        return;
    }
    // The slot is handed directly to the next waiter by releaseMessageWorker.
    await new Promise(resolve => workerWaiters.push(resolve));
}

function releaseMessageWorker() {
    const next = workerWaiters.shift();
    if (next) {
        next();
        return;
    }
    activeMessageWorkers = Math.max(0, activeMessageWorkers - 1);
}

function queueMessage(sock, msg) {
    const id = msg?.key?.id;
    const jid = String(msg?.key?.remoteJid || `unknown:${id || Date.now()}`);
    const participant = String(
        msg?.key?.participant ||
        msg?.participant ||
        msg?.key?.remoteJid ||
        "unknown"
    );
    // Serialize a whole chat/group so shared game and moderation state cannot race.
    const queueKey = jid;
    const scope = `${jid}:${participant}`;
    if (id && wasProcessed(id, sock, scope)) return false;
    const previous = chatMessageQueues.get(queueKey) || Promise.resolve();
    pendingMessageCount++;

    const task = previous.catch(() => {}).then(async () => {
        await acquireMessageWorker();
        try {
            await executeHandlerLogic(sock, msg);
        } catch (error) {
            console.error("Message Worker Error:", error?.stack || error?.message || error);
        } finally {
            pendingMessageCount = Math.max(0, pendingMessageCount - 1);
            releaseMessageWorker();
            if (chatMessageQueues.get(queueKey) === task) chatMessageQueues.delete(queueKey);
        }
    });

    chatMessageQueues.set(queueKey, task);
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

export function handleMessages(sock, update) {
    try {
        // Accept normal incoming notifications and the outgoing append updates
        // that main.js explicitly forwards. Ignore history replay and other update types.
        const updateType = update?.type;
        if (updateType && updateType !== "notify" && updateType !== "append") return 0;

        const messages = Array.isArray(update?.messages)
            ? update.messages
            : update?.message
                ? [update.message]
                : [];

        let queued = 0;
        for (const msg of messages) {
            if (!msg?.message || !msg?.key?.remoteJid) continue;

            // main.js only forwards append updates containing outgoing messages.
            // Keep this guard here too, so an append event cannot run incoming messages.
            if (updateType === "append" && msg.key.fromMe !== true) continue;

            // Permit only clearly prefixed commands sent by this bot account;
            // ignore its ordinary replies to prevent loops.
            if (msg.key.fromMe && !isOwnPrivateChatCommand(sock, msg)) continue;
            if (msg.key.remoteJid === "status@broadcast") continue;

            try {
                if (queueMessage(sock, msg)) queued++;
            } catch (error) {
                console.error("Message Queue Error:", error?.stack || error?.message || error);
            }
        }
        return queued;
    } catch (error) {
        console.error("handleMessages Error:", error?.stack || error?.message || error);
        return 0;
    }
}

// ═══════════════════════════════════════════════════════
// ⚡ MAIN EXECUTION
// ═══════════════════════════════════════════════════════


function checkOwner(value) {
    const n = normalizeStoredNumber(value);
    if (!n) return false;
    const owners = Array.isArray(config?.owner) ? config.owner : [config?.owner];
    return owners.some(x => isSameNumber(n, x));
}

function pluginCommands(plugin) {
    const values = [];
    const add = value => {
        if (value === undefined || value === null) return;
        const key = String(value).trim().toLowerCase();
        if (key && !values.includes(key)) values.push(key);
    };
    const command = plugin?.command;
    if (Array.isArray(command)) command.forEach(add); else add(command);
    const aliases = plugin?.aliases;
    if (Array.isArray(aliases)) aliases.forEach(add); else add(aliases);
    return values;
}

function pluginPermission(plugin, { isOwner, isElite }) {
    if (plugin?.ownerOnly === true && !isOwner) return false;
    if (plugin?.eliteOnly === true && !isElite && !isOwner) return false;
    const category = String(plugin?.category || "").toLowerCase();
    if ((category.includes("مطور") || category.includes("dev")) && !isOwner) return false;
    return true;
}

function cleanDecorationLines(text) {
    return String(text || "")
        .split("\n")
        .filter(line => {
            const plain = line.replace(/[\*`_~ ]/g, "").trim();
            if (!plain) return true;

            if (/ARTHUR.*BOT|BOT.*ARTHUR/i.test(plain)) {
                return false;
            }

            if (/^(╭|╰|┏|┗|◇❐|╔|╚|┌|└).*?(╮|╯|┓|┛|❐◇|╗|╝|┐|┘)$/.test(plain)) {
                return false;
            }

            if (/^[╭╮╰╯┣┫┃┏┓┗┛┌┐└┘╔╗╚╝━═─—◇❐╾🩸👑⚔️]+$/.test(plain)) {
                return false;
            }

            return true;
        })
        .join("\n")
        .trim();
}

function decorateOutgoingPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const out = { ...payload };
    if (typeof out.text === "string" && out.text.trim() && !isArthurDecorated(out.text)) {
        out.text = arthurBox(cleanDecorationLines(out.text));
    }
    if (typeof out.caption === "string" && out.caption.trim() && !isArthurDecorated(out.caption)) {
        out.caption = arthurBox(cleanDecorationLines(out.caption));
    }
    return out;
}

function createArthurSocket(sock) {
    return new Proxy(sock, {
        get(target, prop, receiver) {
            if (prop === "sendMessage") {
                return async (jid, content, options) => {
                    return target.sendMessage(jid, decorateOutgoingPayload(content), options);
                };
            }
            if (prop === "relayMessage") {
                return async (jid, message, options) => {
                    const out = message && typeof message === "object" ? { ...message } : message;
                    if (out?.extendedTextMessage?.text && !isArthurDecorated(out.extendedTextMessage.text)) {
                        out.extendedTextMessage = { ...out.extendedTextMessage, text: arthurBox(cleanDecorationLines(out.extendedTextMessage.text)) };
                    }
                    if (out?.imageMessage?.caption && !isArthurDecorated(out.imageMessage.caption)) {
                        out.imageMessage = { ...out.imageMessage, caption: arthurBox(cleanDecorationLines(out.imageMessage.caption)) };
                    }
                    if (out?.videoMessage?.caption && !isArthurDecorated(out.videoMessage.caption)) {
                        out.videoMessage = { ...out.videoMessage, caption: arthurBox(cleanDecorationLines(out.videoMessage.caption)) };
                    }
                    // Native-flow interactive messages (such as .اوامر and .كود)
                    // bypass sendMessage, so decorate their visible body/footer here.
                    const decorateInteractive = (message) => {
                        if (!message || typeof message !== "object") return message;
                        const result = { ...message };
                        if (result.interactiveMessage) {
                            const interactive = { ...result.interactiveMessage };
                            if (interactive.body?.text && !isArthurDecorated(interactive.body.text)) {
                                interactive.body = { ...interactive.body, text: arthurBox(cleanDecorationLines(interactive.body.text)) };
                            }
                            result.interactiveMessage = interactive;
                        }
                        if (result.viewOnceMessage?.message) {
                            result.viewOnceMessage = { ...result.viewOnceMessage, message: decorateInteractive(result.viewOnceMessage.message) };
                        }
                        if (result.ephemeralMessage?.message) {
                            result.ephemeralMessage = { ...result.ephemeralMessage, message: decorateInteractive(result.ephemeralMessage.message) };
                        }
                        return result;
                    };
                    const decorated = decorateInteractive(out);
                    return target.relayMessage(jid, decorated, options);
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

let pluginRuntimeCache = {
    source: null,
    commandIndex: new Map(),
    onMessagePlugins: []
};

function getPluginRuntimeIndex(plugins) {
    if (pluginRuntimeCache.source === plugins) return pluginRuntimeCache;

    const commandIndex = new Map();
    const onMessagePlugins = [];
    for (const plugin of plugins) {
        if (typeof plugin?.onMessage === "function") onMessagePlugins.push(plugin);
        if (!plugin?.command) continue;
        for (const key of pluginCommands(plugin)) {
            if (!commandIndex.has(key)) commandIndex.set(key, plugin);
        }
    }

    pluginRuntimeCache = { source: plugins, commandIndex, onMessagePlugins };
    return pluginRuntimeCache;
}

// Allow only prefixed commands sent in the bot account's own private chat.
// Ordinary outgoing messages remain ignored to avoid reply loops.
function unwrapOwnChatContent(message) {
    let content = message || {};
    for (let i = 0; i < 5; i++) {
        const wrapped = content.ephemeralMessage?.message
            || content.viewOnceMessage?.message
            || content.viewOnceMessageV2?.message
            || content.documentWithCaptionMessage?.message;
        if (!wrapped) break;
        content = wrapped;
    }
    return content;
}

function isOwnPrivateChatCommand(sock, msg) {
    try {
        const jid = cleanRawId(msg?.key?.remoteJid);
        if (!jid || jid === "status@broadcast") return false;

        // Only process outgoing messages that are clearly commands. This prevents
        // the bot from reacting to its own ordinary replies and creating loops.
        const content = unwrapOwnChatContent(msg?.message);
        const text = String(
            content.conversation
            || content.extendedTextMessage?.text
            || content.imageMessage?.caption
            || content.videoMessage?.caption
            || content.documentMessage?.caption
            || content.buttonsResponseMessage?.selectedButtonId
            || content.listResponseMessage?.singleSelectReply?.selectedRowId
            || content.templateButtonReplyMessage?.selectedId
            || content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
            || ''
        ).trim();
        const configuredPrefix = config?.prefix;
        const prefixes = Array.isArray(configuredPrefix)
            ? configuredPrefix.map(value => String(value)).filter(Boolean)
            : [String(configuredPrefix ?? '.')].filter(Boolean);
        const isPrefixedCommand = Boolean(text && prefixes.some(prefix => text.startsWith(prefix)));
        if (!isPrefixedCommand || msg?.key?.fromMe !== true) return false;

        // In groups, fromMe confirms the command was sent by this bot account.
        // Allow prefixed commands only; never process its normal outgoing messages.
        if (jid.endsWith('@g.us')) return true;

        // Private self-chat: verify the destination is one of the bot's own IDs.
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return false;

        const identities = getBotIdentities(sock).map(cleanRawId).filter(Boolean);
        const ownJidAliases = new Set();
        for (const identity of identities) {
            ownJidAliases.add(identity);
            const at = identity.indexOf('@');
            if (at > 0) ownJidAliases.add(identity.slice(0, at));
        }

        let isSelfChat = ownJidAliases.has(jid);
        if (!isSelfChat && !jid.endsWith('@lid')) {
            const at = jid.indexOf('@');
            const jidUser = at > 0 ? jid.slice(0, at) : jid;
            const chatNumber = normalizeStoredNumber(jidUser);
            if (chatNumber) {
                isSelfChat = identities.some(identity => {
                    if (identity.endsWith('@lid')) return false;
                    return normalizeStoredNumber(identity) === chatNumber;
                });
            }
        }
        return isSelfChat;
    } catch (error) {
        console.error('[SELF CHAT CHECK]', error?.message || error);
        return false;
    }
}

async function executeHandlerLogic(
    sock,
    msg
) {
    try {
        const jid =
            msg.key?.remoteJid;

        if (!jid) {
            return;
        }

        const isGroup = jid.endsWith("@g.us");
        const isPrivate = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
        const metadataPromise = isGroup
            ? getGroupMetadata(sock, jid)
            : Promise.resolve(null);
        const metadata = await metadataPromise;

        // Strict elite gate stays enabled. For group messages, resolve metadata
        // first so the bot's phone identity can be matched to its participant.
        if (readModeSync() && !isStrictEliteAllowed(msg, sock, metadata)) {
            return;
        }

        let rawPlugins = [];
        try {
            rawPlugins = await loadPlugins(sock);
        } catch (err) {
            console.error("Plugin Load Error:", err);
        }

        const plugins = Array.isArray(rawPlugins) ? rawPlugins : [];
        const pluginSock = createArthurSocket(sock);
        if (!plugins.length) return;

        getModeFast();
        getEliteFast();

        const runtimeIndex = getPluginRuntimeIndex(plugins);
        const commandIndex = runtimeIndex.commandIndex;
        const onMessagePlugins = runtimeIndex.onMessagePlugins;

        const botIdentities =
            getBotIdentities(sock);

        const botNumber =
            getBotNumber(
                sock,
                metadata
            );

        const botParticipant =
            isGroup
                ? resolveBotParticipant(
                      sock,
                      metadata
                  )
                : null;

        const participantPhone =
            getParticipantPhone(
                botParticipant
            );

        const mainNumber =
            getMainBotNumber(sock);

        const isMainBot =
            !!(
                mainNumber &&
                (
                    isSameNumber(
                        botNumber,
                        mainNumber
                    ) ||
                    isSameNumber(
                        participantPhone,
                        mainNumber
                    ) ||
                    botIdentities.some(
                        identity =>
                            isSameNumber(
                                identity,
                                mainNumber
                            )
                    )
                )
            );

        const resolved =
            resolveSender(
                sock,
                msg,
                isGroup,
                metadata
            );

        const sender =
            resolved.sender;

        const number =
            resolved.number;

        const isOwnerUser =
            checkOwner(number) ||
            checkOwner(sender);

        let isEliteUser =
            checkEliteIdentities([
                number,
                sender
            ]);

        // لا تجعل تسجيل رقم البوت في النخبة جميع المستخدمين نخبة.
        // رسائل البوت الذاتية تُقيّم برقم المرسل المحسوب في resolveSender أعلاه.

        if (
            !isEliteUser &&
            (isMainBot || isOwnerUser)
        ) {
            isEliteUser = true;
        }

        let botAdminData = {
            isAdmin: false,
            isSuperAdmin: false,
            participant:
                botParticipant,
            metadata
        };

        if (
            isGroup &&
            botParticipant
        ) {
            const admin =
                botParticipant.admin;

            botAdminData.isSuperAdmin =
                admin ===
                "superadmin";

            botAdminData.isAdmin =
                admin === "admin" ||
                botAdminData.isSuperAdmin;
        }

        const botIsAdmin =
            botAdminData.isAdmin;

        const botIsSuperAdmin =
            botAdminData.isSuperAdmin;

        const message =
            msg.message;

        const normalText =
            message.conversation ||
            message.extendedTextMessage?.text ||
            message.imageMessage?.caption ||
            message.videoMessage?.caption ||
            "";

        const interactiveId =
            extractInteractiveResponseId(
                msg
            );

        const fromInteractive =
            !!interactiveId;

        const text =
            String(
                interactiveId ||
                normalText ||
                ""
            ).trim();

        const mode = getModeFast();
        const restrictedMode = mode?.elite === true;

        // In elite mode, normal onMessage listeners are also restricted.
        // Security listeners explicitly marked alwaysOn continue to protect the group.
        if (onMessagePlugins.length) {
            const context = {
                jid, sender, number, isGroup, isPrivate, message: msg,
                isElite: isEliteUser, isOwner: isOwnerUser,
                botNumber, mainBotNumber: mainNumber, isMainBot,
                isInteractive: fromInteractive, interactiveId: interactiveId || null,
                isListResponse: fromInteractive, isAdmin: botIsAdmin,
                isSuperAdmin: botIsSuperAdmin, adminMode: botIsAdmin,
                botIsAdmin, botIsSuperAdmin, botParticipant: botParticipant || null,
                groupMetadata: metadata || null, restrictedMode
            };

            for (const plugin of onMessagePlugins) {
                const alwaysOn = plugin?.alwaysOn === true;
                if (restrictedMode && !alwaysOn && !isEliteUser && !isOwnerUser && !isMainBot) continue;
                try {
                    const listenerResult = await plugin.onMessage(pluginSock, msg, context);
                    if (listenerResult?.handled === true) return;
                } catch (listenerError) {
                    console.error(`❌ Listener Error: ${listenerError?.message || listenerError}`);
                }
            }
        }

        if (restrictedMode && !isMainBot && !isEliteUser && !isOwnerUser) {
            return;
        }

        if (!text) {
            return;
        }

        const configuredPrefix = config?.prefix;
        const prefixes = Array.isArray(configuredPrefix)
            ? configuredPrefix.map(value => String(value)).filter(Boolean)
            : [String(configuredPrefix ?? ".")].filter(Boolean);
        const matchedPrefix = fromInteractive
            ? ""
            : prefixes.find(prefix => text.startsWith(prefix)) || "";
        const hasPrefix = Boolean(matchedPrefix);

        if (!hasPrefix && !fromInteractive) {
            return;
        }

        let noPrefixText = hasPrefix
            ? text.slice(matchedPrefix.length).trim()
            : text;

        if (fromInteractive) {
            noPrefixText =
                normalizeMenuCommand(
                    noPrefixText
                );
        }

        if (!noPrefixText) {
            return;
        }

        const space =
            noPrefixText.search(
                /\s/
            );

        const commandName =
            (
                space === -1
                    ? noPrefixText
                    : noPrefixText.slice(
                          0,
                          space
                      )
            ).toLowerCase();

        if (!commandName) {
            return;
        }

        const cmd =
            commandIndex.get(
                commandName
            );

        if (!cmd) {
            return;
        }

        if (!pluginPermission(cmd, { isOwner: isOwnerUser, isElite: isEliteUser })) {
            return await sock.sendMessage(jid, {
                text: arthurBox("❌ ليس لديك صلاحية استخدام هذا الأمر")
            }, { quoted: msg });
        }

        log(
            "cmd",
            `${commandName} ← ${
                number ||
                sender ||
                "UNKNOWN"
            } ← ${
                isEliteUser
                    ? "ELITE"
                    : botIsAdmin
                    ? "BOT ADMIN"
                    : "USER"
            }`
        );

        try {
            await cmd.execute(
                pluginSock,
                msg,
                {
                    text,
                    noPrefixText,
                    commandName,

                    jid,
                    sender,
                    number,

                    isGroup,
                    isPrivate,
                    hasPrefix,

                    isElite:
                        isEliteUser,

                    isOwner: isOwnerUser,

                    botNumber,

                    mainBotNumber:
                        mainNumber,

                    isMainBot,

                    isInteractive:
                        fromInteractive,

                    interactiveId:
                        interactiveId ||
                        null,

                    isListResponse:
                        fromInteractive,

                    isAdmin:
                        botIsAdmin,

                    isSuperAdmin:
                        botIsSuperAdmin,

                    adminMode:
                        botIsAdmin,

                    botIsAdmin,
                    botIsSuperAdmin,

                    botParticipant:
                        botParticipant ||
                        null,

                    groupMetadata:
                        metadata ||
                        null
                }
            );

        } catch (error) {
            console.error(
                `❌ Command Execution Failed [${commandName}]:`,
                error?.message ||
                    error
            );
        }

    } catch (error) {
        console.error(
            "Critical Execute Handler Error:",
            error?.message ||
                error
        );
    }
}

// ═══════════════════════════════════════════════════════
// 🔥 WARMUP
// ═══════════════════════════════════════════════════════

export async function warmupHandler(
    sock
) {
    try {
        await Promise.all([
            refreshMode(true),
            refreshElite(true),
            getLoadedPlugins(sock)
        ]);

        const botNumber =
            getBotNumber(sock);

        const identities =
            getBotIdentities(sock);

        log(
            "ok",
            `Handler Ready | Bot: ${
                botNumber ||
                "UNKNOWN"
            }`
        );

        log(
            "bot",
            `Identities: ${
                identities.join(
                    " | "
                ) ||
                "NONE"
            }`
        );

        log(
            "elite",
            `Elite: ${
                eliteCache.length
            }`
        );

        log(
            "ok",
            `Mode: ${
                modeCache.elite
                    ? "ELITE"
                    : "NORMAL"
            }`
        );

        return true;

    } catch (error) {
        console.error(
            "Handler Warmup Error:",
            error?.message ||
                error
        );

        return false;
    }
}

// ═══════════════════════════════════════════════════════
// 🧹 CLEAN SHUTDOWN
// ═══════════════════════════════════════════════════════

export function clearHandlerCaches() {
    try {
        groupCache.clear();
        groupLoading.clear();

        processedMessages.clear();
        chatMessageQueues.clear();
        pendingMessageCount = 0;
        pluginRuntimeCache = { source: null, commandIndex: new Map(), onMessagePlugins: [] };
        strictModeMtime = -1;
        strictEliteSignature = "";
        strictEliteSet = new Set();

        modeReady = false;
        eliteReady = false;

        modeMtime = 0;
        eliteMtime = 0;

        modeCache = {
            elite: false
        };

        eliteCache = [];
        eliteSet = new Set();

        lastFileCheck = 0;

    } catch {}
}