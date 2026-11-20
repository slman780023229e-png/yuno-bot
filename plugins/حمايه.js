import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "contactGuard.json");

const MAX_PROCESSED = 10000;
const MAX_CACHE = 300;
const CACHE_TTL = 1500;
const REQUEST_TIMEOUT = 8000;

const WRAPPERS = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "deviceSentMessage",
    "editedMessage"
];

const processed = new Set();
const metadataCache = new Map();
const metadataRequests = new Map();

let settingsCache = null;
let settingsTime = 0;

function log(context, error) {
    console.error(
        `[ContactGuard] ${context}:`,
        error?.stack || error?.message || error
    );
}

function isObject(value) {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function ensureStorage() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, "{}", "utf8");
    }
}

function normalizeJid(value) {
    if (typeof value !== "string") return "";

    return value.trim()
        .toLowerCase()
        .replace(/:\d+(?=@)/, "");
}

function getPhone(value) {
    if (typeof value !== "string") return "";

    const input = value.trim();

    if (/^\+?\d{5,}$/.test(input)) {
        return input.replace(/\D/g, "");
    }

    const match = normalizeJid(input).match(
        /^(\+?\d+)@(s\.whatsapp\.net|c\.us)$/
    );

    return match ? match[1].replace(/\D/g, "") : "";
}

function sameIdentity(a, b) {
    const x = normalizeJid(a);
    const y = normalizeJid(b);

    if (!x || !y) return false;
    if (x === y) return true;

    const px = getPhone(a);
    const py = getPhone(b);

    return Boolean(px && py && px === py);
}

function loadData(force = false) {
    const now = Date.now();

    if (
        !force &&
        settingsCache &&
        now - settingsTime < 500
    ) {
        return settingsCache;
    }

    ensureStorage();

    const parsed = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
    );

    if (!isObject(parsed)) {
        throw new Error("Invalid settings file");
    }

    const clean = {};

    for (const [jid, enabled] of Object.entries(parsed)) {
        if (
            jid.endsWith("@g.us") &&
            typeof enabled === "boolean"
        ) {
            clean[jid] = enabled;
        }
    }

    settingsCache = clean;
    settingsTime = now;

    return clean;
}

function saveData(data) {
    ensureStorage();

    const temp = `${DATA_FILE}.tmp`;

    fs.writeFileSync(
        temp,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    fs.renameSync(temp, DATA_FILE);

    settingsCache = { ...data };
    settingsTime = Date.now();
}

function remember(id) {
    if (!id || processed.has(id)) return false;

    processed.add(id);

    if (processed.size > MAX_PROCESSED) {
        const oldest = processed.values().next().value;
        processed.delete(oldest);
    }

    return true;
}

function unwrap(message) {
    let current = message;

    for (let i = 0; i < 15; i++) {
        if (!isObject(current)) return null;

        if (
            current.contactMessage ||
            current.contactsArrayMessage
        ) {
            return current;
        }

        let next = null;

        for (const wrapper of WRAPPERS) {
            if (isObject(current[wrapper]?.message)) {
                next = current[wrapper].message;
                break;
            }
        }

        if (!next) return current;

        current = next;
    }

    return null;
}

function detectContact(message) {
    const content = unwrap(message);

    if (!content) {
        return { found: false, count: 0 };
    }

    if (content.contactMessage) {
        return { found: true, count: 1 };
    }

    if (content.contactsArrayMessage) {
        const contacts = content.contactsArrayMessage.contacts;

        return {
            found: true,
            count: Array.isArray(contacts)
                ? Math.max(contacts.length, 1)
                : 1
        };
    }

    return { found: false, count: 0 };
}

function getSenderCandidates(msg) {
    return [
        msg.key?.participant,
        msg.participant,
        msg.key?.participantAlt
    ].filter(Boolean);
}

function isBot(sock, candidates) {
    const botIds = [
        sock.user?.id,
        sock.user?.lid
    ].filter(Boolean);

    return candidates.some(candidate =>
        botIds.some(bot => sameIdentity(candidate, bot))
    );
}

function findParticipant(participants, candidates) {
    if (!Array.isArray(participants)) return null;

    return participants.find(participant => {
        const ids = [
            participant.id,
            participant.phoneNumber
        ].filter(Boolean);

        return candidates.some(candidate =>
            ids.some(id => sameIdentity(candidate, id))
        );
    }) || null;
}

function trimCache() {
    while (metadataCache.size > MAX_CACHE) {
        const oldest = metadataCache.keys().next().value;

        if (oldest === undefined) break;

        metadataCache.delete(oldest);
    }
}

async function getMetadata(sock, jid) {
    const now = Date.now();
    const cached = metadataCache.get(jid);

    if (cached && now - cached.time < CACHE_TTL) {
        // تحديث موقع العنصر داخل الكاش
        metadataCache.delete(jid);
        metadataCache.set(jid, cached);

        return cached.value;
    }

    const pending = metadataRequests.get(jid);

    if (pending) return pending;

    let timer;

    const request = (async () => {
        try {
            const metadata = await Promise.race([
                Promise.resolve().then(() =>
                    sock.groupMetadata(jid)
                ),

                new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(
                            new Error("Metadata timeout")
                        ),
                        REQUEST_TIMEOUT
                    );
                })
            ]);

            if (!Array.isArray(metadata?.participants)) {
                throw new Error("Invalid group metadata");
            }

            metadataCache.delete(jid);

            metadataCache.set(jid, {
                value: metadata,
                time: Date.now()
            });

            trimCache();

            return metadata;

        } finally {
            clearTimeout(timer);
        }
    })();

    metadataRequests.set(jid, request);

    try {
        return await request;
    } finally {
        if (metadataRequests.get(jid) === request) {
            metadataRequests.delete(jid);
        }
    }
}

async function withTimeout(promise, label) {
    let timer;

    try {
        return await Promise.race([
            promise,

            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(
                        new Error(`${label}: timeout`)
                    ),
                    REQUEST_TIMEOUT
                );
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function safeDelete(sock, jid, msg) {
    try {
        await withTimeout(
            sock.sendMessage(jid, {
                delete: {
                    ...msg.key,
                    remoteJid: jid
                }
            }),
            "Delete"
        );

        return true;

    } catch (error) {
        log("Delete failed", error);
        return false;
    }
}

async function removeParticipant(sock, jid, participant) {
    if (!participant?.id) return false;

    try {
        const result = await withTimeout(
            sock.groupParticipantsUpdate(
                jid,
                [participant.id],
                "remove"
            ),
            "Remove"
        );

        // بعض إصدارات Baileys تعيد نتيجة تحتوي على status.
        if (Array.isArray(result) && result.length) {
            const failed = result.some(item =>
                item?.status != null &&
                Number(item.status) !== 200
            );

            return !failed;
        }

        return true;

    } catch (error) {
        log("Remove failed", error);
        return false;
    }
}

async function sendNotice(sock, jid, text) {
    try {
        await sock.sendMessage(jid, { text });
    } catch (error) {
        log("Notice failed", error);
    }
}

async function checkAdmin(sock, jid, candidates) {
    const metadata = await withTimeout(
        getMetadata(sock, jid),
        "Metadata"
    );

    const participant = findParticipant(
        metadata.participants,
        candidates
    );

    return Boolean(
        participant &&
        (
            participant.admin === "admin" ||
            participant.admin === "superadmin" ||
            participant.isAdmin === true ||
            participant.isSuperAdmin === true
        )
    );
}

export default {
    alwaysOn: true,
    command: "حمايه",
    category: "الحماية",
    description: "حماية المجموعة من جهات الاتصال",

    execute: async (sock, msg, data = {}) => {
        const jid = data.jid || msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            return sendNotice(
                sock,
                jid,
                "❌ هذا الأمر للمجموعات فقط."
            );
        }

        const candidates = [
            data.sender,
            ...getSenderCandidates(msg)
        ].filter(Boolean);

        try {
            const bot = Boolean(
                msg.key?.fromMe ||
                isBot(sock, candidates)
            );

            const admin = bot || await checkAdmin(
                sock,
                jid,
                candidates
            );

            if (!admin) {
                return sendNotice(
                    sock,
                    jid,
                    "❌ الأمر للمشرفين فقط."
                );
            }

            const db = loadData(true);
            const enabled = db[jid] !== true;

            db[jid] = enabled;

            saveData(db);

            metadataCache.delete(jid);

            await sendNotice(
                sock,
                jid,
                enabled
                    ? "🛡️ تم تفعيل حماية جهات الاتصال بنجاح."
                    : "⚠️ تم تعطيل حماية جهات الاتصال."
            );

        } catch (error) {
            log("Command failed", error);

            await sendNotice(
                sock,
                jid,
                "❌ تعذر تنفيذ الأمر."
            );
        }
    },

    onMessage: async (sock, msg) => {
        try {
            const jid = msg.key?.remoteJid;

            if (!jid?.endsWith("@g.us")) return;
            if (!msg.message || !msg.key?.id) return;
            if (msg.key.fromMe) return;

            const db = loadData();

            if (db[jid] !== true) return;

            const detected = detectContact(msg.message);

            if (!detected.found) return;

            const candidates = getSenderCandidates(msg);

            if (!candidates.length || isBot(sock, candidates)) {
                return;
            }

            if (!remember(`${jid}:${msg.key.id}`)) return;

            const started = Date.now();

            // حذف الرسالة يبدأ فورًا دون انتظار بيانات المجموعة.
            const deletion = safeDelete(sock, jid, msg);

            let participant = null;

            try {
                const metadata = await getMetadata(sock, jid);

                participant = findParticipant(
                    metadata.participants,
                    candidates
                );

            } catch (error) {
                log("Identity verification failed", error);
            }

            let removed = false;

            // لا يوجد طرد إذا لم يتم التحقق من هوية المرسل.
            if (participant?.id) {
                removed = await removeParticipant(
                    sock,
                    jid,
                    participant
                );

                // تحديث الكاش بعد محاولة تغيير عضوية المجموعة.
                metadataCache.delete(jid);
            }

            const deleted = await deletion;

            console.log(
                [
                    "╭━━━━━━━━━━━━━━━━━━━━━━╮",
                    "┃ 🛡️ CONTACT GUARD",
                    "┣━━━━━━━━━━━━━━━━━━━━━━┫",
                    `┃ Contacts: ${detected.count}`,
                    `┃ Identity: ${participant ? "Verified" : "Unknown"}`,
                    `┃ Deletion: ${deleted ? "Success" : "Failed"}`,
                    `┃ Removal: ${removed ? "Success" : participant ? "Failed" : "Skipped"}`,
                    `┃ Time: ${Date.now() - started} ms`,
                    "╰━━━━━━━━━━━━━━━━━━━━━━╯"
                ].join("\n")
            );

        } catch (error) {
            log("Message handler failed", error);
        }
    }
};