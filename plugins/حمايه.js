import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "contactGuard.json");

const MAX_PROCESSED = 10000;
const SETTINGS_CACHE_MS = 500;
const METADATA_CACHE_MS = 1000;
const MAX_METADATA_CACHE = 500;

const MESSAGE_WRAPPERS = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "deviceSentMessage",
    "editedMessage"
];

const processedMessages = new Set();
const metadataCache = new Map();
const metadataRequests = new Map();

let settingsCache = null;
let settingsCacheTime = 0;

function log(context, error) {
    console.error(
        `[ContactGuard] ${context}:`,
        error?.stack || error?.message || error
    );
}

function isObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function ensureStorage() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, "{}", "utf8");
    }
}

function normalizeJid(value) {
    if (typeof value !== "string") return "";

    return value
        .trim()
        .toLowerCase()
        .replace(/:\d+(?=@)/, "");
}

function getPhone(value) {
    if (typeof value !== "string") return "";

    const input = value.trim();

    if (/^\+?\d{5,}$/.test(input)) {
        return input.replace(/\D/g, "");
    }

    const jid = normalizeJid(input);

    const match = jid.match(
        /^(\+?\d+)@(s\.whatsapp\.net|c\.us)$/
    );

    return match
        ? match[1].replace(/\D/g, "")
        : "";
}

function sameIdentity(a, b) {
    const first = normalizeJid(a);
    const second = normalizeJid(b);

    if (!first || !second) return false;

    if (first === second) return true;

    const phoneA = getPhone(a);
    const phoneB = getPhone(b);

    return Boolean(
        phoneA &&
        phoneB &&
        phoneA === phoneB
    );
}

// ==============================
// SETTINGS
// ==============================

function loadData(force = false) {
    const now = Date.now();

    if (
        !force &&
        settingsCache &&
        now - settingsCacheTime < SETTINGS_CACHE_MS
    ) {
        return settingsCache;
    }

    try {
        ensureStorage();

        const parsed = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        if (!isObject(parsed)) {
            throw new Error("ملف الإعدادات غير صالح.");
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
        settingsCacheTime = now;

        return clean;
    } catch (error) {
        log("فشل قراءة الإعدادات", error);

        settingsCache = null;
        settingsCacheTime = 0;

        throw error;
    }
}

function saveData(data) {
    ensureStorage();

    const temporaryFile =
        `${DATA_FILE}.${process.pid}.tmp`;

    try {
        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(temporaryFile, DATA_FILE);

        settingsCache = { ...data };
        settingsCacheTime = Date.now();

        return true;
    } catch (error) {
        try {
            if (fs.existsSync(temporaryFile)) {
                fs.unlinkSync(temporaryFile);
            }
        } catch {}

        throw error;
    }
}

// ==============================
// IDENTITIES
// ==============================

function getSenderCandidates(msg) {
    return [
        msg.key?.participant,
        msg.participant,
        msg.key?.participantAlt
    ].filter(
        value => typeof value === "string" && value.length > 0
    );
}

function getBotIdentities(sock) {
    return [
        sock.user?.id,
        sock.user?.lid
    ].filter(Boolean);
}

function isBotIdentity(sock, candidates) {
    const botIds = getBotIdentities(sock);

    return candidates.some(candidate =>
        botIds.some(botId =>
            sameIdentity(candidate, botId)
        )
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
            ids.some(id =>
                sameIdentity(candidate, id)
            )
        );
    }) || null;
}

// ==============================
// GROUP METADATA CACHE
// ==============================

function trimMetadataCache() {
    while (metadataCache.size > MAX_METADATA_CACHE) {
        const oldest = metadataCache.keys().next().value;

        if (oldest === undefined) break;

        metadataCache.delete(oldest);
    }
}

async function getGroupMetadata(sock, jid, fresh = false) {
    const now = Date.now();
    const cached = metadataCache.get(jid);

    if (
        !fresh &&
        cached &&
        now - cached.time < METADATA_CACHE_MS
    ) {
        return cached.value;
    }

    if (metadataRequests.has(jid)) {
        return metadataRequests.get(jid);
    }

    const request = (async () => {
        const metadata = await sock.groupMetadata(jid);

        if (!metadata || !Array.isArray(metadata.participants)) {
            throw new Error("بيانات أعضاء المجموعة غير صالحة.");
        }

        metadataCache.delete(jid);

        metadataCache.set(jid, {
            value: metadata,
            time: Date.now()
        });

        trimMetadataCache();

        return metadata;
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

// ==============================
// MESSAGE DETECTION
// ==============================

function unwrapMessage(message) {
    let current = message;

    for (let depth = 0; depth < 15; depth++) {
        if (!isObject(current)) return null;

        if (
            current.contactMessage ||
            current.contactsArrayMessage
        ) {
            return current;
        }

        let nestedMessage = null;

        for (const wrapper of MESSAGE_WRAPPERS) {
            const nested = current[wrapper]?.message;

            if (isObject(nested)) {
                nestedMessage = nested;
                break;
            }
        }

        if (!nestedMessage) return current;

        current = nestedMessage;
    }

    return null;
}

function detectContacts(message) {
    const content = unwrapMessage(message);

    if (!content) {
        return {
            hasContact: false,
            count: 0
        };
    }

    if (content.contactMessage) {
        return {
            hasContact: true,
            count: 1
        };
    }

    if (content.contactsArrayMessage) {
        const contacts =
            content.contactsArrayMessage.contacts;

        return {
            hasContact: true,
            count: Array.isArray(contacts)
                ? Math.max(contacts.length, 1)
                : 1
        };
    }

    return {
        hasContact: false,
        count: 0
    };
}

// ==============================
// DUPLICATE PROTECTION
// ==============================

function rememberMessage(id) {
    if (!id || processedMessages.has(id)) {
        return false;
    }

    processedMessages.add(id);

    if (processedMessages.size > MAX_PROCESSED) {
        const oldest =
            processedMessages.values().next().value;

        if (oldest !== undefined) {
            processedMessages.delete(oldest);
        }
    }

    return true;
}

// ==============================
// MESSAGE DELETION
// ==============================

async function deleteContactMessage(sock, jid, msg) {
    if (!msg.key?.id) {
        throw new Error("معرف الرسالة غير موجود.");
    }

    const key = {
        ...msg.key,
        remoteJid: jid
    };

    return sock.sendMessage(jid, {
        delete: key
    });
}

// ==============================
// PARTICIPANT REMOVAL
// ==============================

async function removeParticipant(sock, jid, participantJid) {
    if (!participantJid) {
        throw new Error("هوية العضو غير متوفرة.");
    }

    if (isBotIdentity(sock, [participantJid])) {
        throw new Error("تم منع استهداف البوت.");
    }

    const result = await sock.groupParticipantsUpdate(
        jid,
        [participantJid],
        "remove"
    );

    if (!Array.isArray(result) || result.length === 0) {
        throw new Error("لم تصل نتيجة مؤكدة من واتساب.");
    }

    const failed = result.some(item => {
        const status = Number(item?.status);

        return !Number.isFinite(status) ||
            status < 200 ||
            status >= 300;
    });

    if (failed) {
        throw new Error(
            `فشلت عملية الإخراج: ${JSON.stringify(result)}`
        );
    }

    return true;
}

// ==============================
// NOTIFICATIONS
// ==============================

async function sendNotice(sock, jid, text) {
    if (!jid) return;

    try {
        await sock.sendMessage(jid, { text });
    } catch (error) {
        log("فشل إرسال الإشعار", error);
    }
}

// ==============================
// COMMAND
// ==============================

async function checkAdmin(sock, jid, senderCandidates) {
    const metadata = await getGroupMetadata(
        sock,
        jid,
        true
    );

    const participant = findParticipant(
        metadata.participants,
        senderCandidates
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

// ==============================
// MAIN PLUGIN
// ==============================

export default {
    alwaysOn: true,

    command: "حمايه",

    category: "الحماية",

    description: "حماية المجموعة من إرسال جهات الاتصال",

    execute: async (sock, msg, data = {}) => {
        const jid = data.jid || msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            return sendNotice(
                sock,
                jid,
                "❌ هذا الأمر مخصص للمجموعات فقط."
            );
        }

        const senderCandidates = [
            data.sender,
            ...getSenderCandidates(msg)
        ].filter(Boolean);

        if (senderCandidates.length === 0) {
            return sendNotice(
                sock,
                jid,
                "❌ تعذر تحديد هوية منفذ الأمر."
            );
        }

        try {
            const isBot = Boolean(
                msg.key?.fromMe ||
                isBotIdentity(sock, senderCandidates)
            );

            const isAdmin = isBot
                ? true
                : await checkAdmin(
                    sock,
                    jid,
                    senderCandidates
                );

            if (!isAdmin) {
                return sendNotice(
                    sock,
                    jid,
                    "❌ هذا الأمر للمشرفين فقط."
                );
            }

            const db = loadData(true);

            const enabled = db[jid] !== true;

            db[jid] = enabled;

            saveData(db);

            const message = enabled
                ? [
                    "╔══════════════════════╗",
                    "       🛡️ CONTACT GUARD",
                    "╚══════════════════════╝",
                    "",
                    "✅ تم تفعيل حماية جهات الاتصال.",
                    "",
                    "📌 أي عضو يرسل جهة اتصال",
                    "سيتم التعامل مع رسالته.",
                    "",
                    "🚫 لا يوجد استثناء للنخبة.",
                    "🚫 لا يوجد استثناء للمشرفين.",
                    "",
                    "◇❐ ═━╾ 🩸 ╼━═ ❐◇"
                ].join("\n")
                : [
                    "╔══════════════════════╗",
                    "       🛡️ CONTACT GUARD",
                    "╚══════════════════════╝",
                    "",
                    "⚠️ تم تعطيل حماية جهات الاتصال.",
                    "",
                    "لن تتم معالجة جهات الاتصال.",
                    "",
                    "◇❐ ═━╾ 🩸 ╼━═ ❐◇"
                ].join("\n");

            await sendNotice(sock, jid, message);

        } catch (error) {
            log("فشل تنفيذ أمر الحماية", error);

            await sendNotice(
                sock,
                jid,
                "❌ تعذر تنفيذ الأمر أو حفظ الإعدادات."
            );
        }
    },

    // ==========================
    // AUTOMATIC MESSAGE HANDLER
    // ==========================

    onMessage: async (sock, msg) => {
        const jid = msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) return;
        if (!msg.message || !msg.key?.id) return;
        if (msg.key.fromMe) return;

        let db;

        try {
            db = loadData();
        } catch {
            return;
        }

        if (db[jid] !== true) return;

        const { hasContact, count } = detectContacts(
            msg.message
        );

        if (!hasContact) return;

        const senderCandidates = getSenderCandidates(msg);

        if (!senderCandidates.length) {
            log(
                "تم اكتشاف جهة اتصال لكن تعذر تحديد المرسل",
                new Error("Missing sender identity")
            );

            return;
        }

        if (isBotIdentity(sock, senderCandidates)) return;

        const uniqueId = `${jid}:${msg.key.id}`;

        if (!rememberMessage(uniqueId)) return;

        const startedAt = Date.now();

        // حذف الرسالة يبدأ مباشرة.
        const deletionTask = deleteContactMessage(
            sock,
            jid,
            msg
        ).then(
            () => true,
            error => {
                log("فشل حذف رسالة جهة الاتصال", error);
                return false;
            }
        );

        // جلب هوية العضو بالتزامن مع الحذف.
        const participantTask = getGroupMetadata(
            sock,
            jid
        ).then(
            metadata => findParticipant(
                metadata.participants,
                senderCandidates
            ),
            error => {
                log("فشل جلب بيانات المجموعة", error);
                return null;
            }
        );

        const participant = await participantTask;

        let removal = false;

        if (participant) {
            const targetJid =
                participant.id ||
                participant.phoneNumber;

            if (
                targetJid &&
                !isBotIdentity(sock, [targetJid])
            ) {
                try {
                    await removeParticipant(
                        sock,
                        jid,
                        targetJid
                    );

                    removal = true;

                } catch (error) {
                    log("فشل إخراج مرسل جهة الاتصال", error);
                }
            }
        } else {
            log(
                "تعذر التحقق من هوية العضو؛ لم تتم محاولة إخراجه",
                new Error(senderCandidates.join(", "))
            );
        }

        const deletion = await deletionTask;

        metadataCache.delete(jid);

        console.log(
            [
                "╭━━━━━━━━━━━━━━━━━━━━━━╮",
                "┃ 🛡️ CONTACT GUARD",
                "┣━━━━━━━━━━━━━━━━━━━━━━┫",
                `┃ 👤 المرسل: ${senderCandidates[0]}`,
                `┃ 📦 جهات الاتصال: ${count}`,
                `┃ 🗑️ حذف الرسالة: ${deletion ? "نجح" : "فشل"}`,
                `┃ 🚫 إخراج العضو: ${removal ? "نجح" : "فشل أو تعذر التحقق"}`,
                `┃ ⏱️ الوقت: ${Date.now() - startedAt} ms`,
                "╰━━━━━━━━━━━━━━━━━━━━━━╯"
            ].join("\n")
        );
    }
};