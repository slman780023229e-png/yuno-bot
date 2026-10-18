import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../data");
const file = path.join(dataDir, "contactGuard.json");

const ELITE_FILES = [
    "النخبة.json",
    "النخبه.json",
    "النخبة",
    "النخبه"
];

const MESSAGE_WRAPPERS = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "deviceSentMessage",
    "editedMessage"
];

// حدود الذاكرة والتخزين المؤقت
const MAX_PROCESSED_MESSAGES = 5000;
const SETTINGS_CACHE_MS = 1000;
const METADATA_CACHE_MS = 1500;

const processedMessages = new Set();
const metadataCache = new Map();
const metadataRequests = new Map();

let settingsCache = null;
let settingsCacheTime = 0;
let eliteCache = null;
let eliteCacheTime = 0;

function logError(context, error) {
    console.error(
        `[ContactGuard] ${context}:`,
        error?.stack || error?.message || error
    );
}

function ensureStorage() {
    fs.mkdirSync(dataDir, { recursive: true });

    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "{}", "utf8");
    }
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

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
            fs.readFileSync(file, "utf8")
        );

        if (!isPlainObject(parsed)) {
            throw new Error("ملف الإعدادات ليس كائن JSON صالحًا.");
        }

        const result = {};

        for (const [jid, enabled] of Object.entries(parsed)) {
            if (
                typeof jid === "string" &&
                jid.endsWith("@g.us") &&
                typeof enabled === "boolean"
            ) {
                result[jid] = enabled;
            }
        }

        settingsCache = result;
        settingsCacheTime = now;

        return result;
    } catch (error) {
        logError("فشل تحميل الإعدادات", error);

        // لا نستخدم إعدادات قديمة إذا فشلت القراءة.
        settingsCache = null;
        settingsCacheTime = 0;

        return {};
    }
}

function saveData(data) {
    ensureStorage();

    const temporaryFile = `${file}.tmp`;

    try {
        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(temporaryFile, file);

        settingsCache = { ...data };
        settingsCacheTime = Date.now();
    } catch (error) {
        try {
            if (fs.existsSync(temporaryFile)) {
                fs.unlinkSync(temporaryFile);
            }
        } catch {}

        throw error;
    }
}

function normalizeJid(jid) {
    if (typeof jid !== "string") return "";

    return jid
        .trim()
        .toLowerCase()
        .replace(/:\d+(?=@)/, "");
}

function phoneDigits(value) {
    if (typeof value !== "string") return "";

    const input = value.trim();

    if (!input) return "";

    if (/^\+?\d+$/.test(input)) {
        const digits = input.replace(/\D/g, "");
        return digits.length >= 5 ? digits : "";
    }

    const jid = normalizeJid(input);

    const match = jid.match(
        /^(\+?\d+)@(s\.whatsapp\.net|c\.us)$/
    );

    if (!match) return "";

    const digits = match[1].replace(/\D/g, "");

    return digits.length >= 5 ? digits : "";
}

function sameIdentity(first, second) {
    const a = normalizeJid(first);
    const b = normalizeJid(second);

    if (!a || !b) return false;
    if (a === b) return true;

    const phoneA = phoneDigits(first);
    const phoneB = phoneDigits(second);

    return Boolean(phoneA && phoneB && phoneA === phoneB);
}

function getElite(force = false) {
    const now = Date.now();

    if (
        !force &&
        eliteCache &&
        now - eliteCacheTime < 5000
    ) {
        return eliteCache;
    }

    const elite = new Set();

    for (const filename of ELITE_FILES) {
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) continue;

        try {
            const parsed = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            );

            const values = [];

            function collect(value, depth = 0) {
                if (depth > 12 || value == null) return;

                if (
                    typeof value === "string" ||
                    typeof value === "number"
                ) {
                    values.push(String(value));
                    return;
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        collect(item, depth + 1);
                    }

                    return;
                }

                if (isPlainObject(value)) {
                    for (const item of Object.values(value)) {
                        collect(item, depth + 1);
                    }
                }
            }

            collect(parsed);

            for (const value of values) {
                const digits = phoneDigits(value);

                if (digits) elite.add(digits);
            }

            // الحفاظ على أولوية أول ملف صالح.
            eliteCache = elite;
            eliteCacheTime = now;

            return elite;
        } catch (error) {
            logError(
                `تعذرت قراءة ملف النخبة ${filename}`,
                error
            );
        }
    }

    eliteCache = elite;
    eliteCacheTime = now;

    return elite;
}

function isEliteNumber(jid, elite, participant) {
    const candidates = [
        jid,
        participant?.phoneNumber,
        participant?.id
    ];

    for (const candidate of candidates) {
        const digits = phoneDigits(candidate);

        if (digits && elite.has(digits)) {
            return true;
        }
    }

    return false;
}

function getBotIdentities(sock) {
    return [
        sock.user?.id,
        sock.user?.lid
    ].filter(Boolean);
}

function isBotIdentity(sock, jid) {
    if (!jid) return false;

    return getBotIdentities(sock).some(
        botJid => sameIdentity(botJid, jid)
    );
}

function findParticipant(participants, jid, extraJids = []) {
    const candidates = [jid, ...extraJids].filter(Boolean);

    return participants.find(participant => {
        const ids = [
            participant.id,
            participant.phoneNumber
        ].filter(Boolean);

        return candidates.some(candidate =>
            ids.some(id => sameIdentity(candidate, id))
        );
    });
}

// مشاركة طلب بيانات المجموعة بين الرسائل المتزامنة.
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

    if (!fresh && metadataRequests.has(jid)) {
        return metadataRequests.get(jid);
    }

    const request = (async () => {
        const metadata = await sock.groupMetadata(jid);

        metadataCache.set(jid, {
            value: metadata,
            time: Date.now()
        });

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

async function getGroupAdminStatus(sock, chatId, senderJid) {
    if (!chatId?.endsWith("@g.us") || !senderJid) {
        return { isAdmin: false, participant: null };
    }

    try {
        const metadata = await getGroupMetadata(
            sock,
            chatId,
            true
        );

        const participant = findParticipant(
            metadata.participants || [],
            senderJid
        );

        const isAdmin = Boolean(
            participant &&
            (
                participant.admin === "admin" ||
                participant.admin === "superadmin"
            )
        );

        return { isAdmin, participant };
    } catch (error) {
        logError("فشل التحقق من مشرف المجموعة", error);

        return { isAdmin: false, participant: null };
    }
}

function unwrapMessage(message) {
    let current = message;

    for (let depth = 0; depth < 12; depth++) {
        if (!isPlainObject(current)) return null;

        if (
            current.contactMessage ||
            current.contactsArrayMessage
        ) {
            return current;
        }

        let next = null;

        for (const wrapper of MESSAGE_WRAPPERS) {
            const nested = current[wrapper]?.message;

            if (isPlainObject(nested)) {
                next = nested;
                break;
            }
        }

        if (!next) return current;

        current = next;
    }

    return current;
}

function detectContacts(message) {
    const content = unwrapMessage(message);

    if (!content) {
        return { hasContact: false, count: 0 };
    }

    if (content.contactMessage) {
        return { hasContact: true, count: 1 };
    }

    if (content.contactsArrayMessage) {
        const contacts = content.contactsArrayMessage.contacts;

        return {
            hasContact: true,
            count: Array.isArray(contacts)
                ? Math.max(contacts.length, 1)
                : 1
        };
    }

    return { hasContact: false, count: 0 };
}

function rememberMessage(id) {
    if (!id || processedMessages.has(id)) {
        return false;
    }

    processedMessages.add(id);

    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        const oldest = processedMessages.values().next().value;

        if (oldest !== undefined) {
            processedMessages.delete(oldest);
        }
    }

    return true;
}

async function deleteContactMessage(sock, jid, msg) {
    if (!msg.key?.id) {
        throw new Error("معرّف الرسالة غير موجود.");
    }

    const key = {
        ...msg.key,
        remoteJid: jid
    };

    if (!key.participant && msg.participant) {
        key.participant = msg.participant;
    }

    return sock.sendMessage(jid, { delete: key });
}

async function removeParticipant(sock, jid, participantJid) {
    if (!participantJid) {
        throw new Error("هوية العضو المطلوب إخراجه غير موجودة.");
    }

    if (isBotIdentity(sock, participantJid)) {
        throw new Error("تم منع محاولة إخراج البوت نفسه.");
    }

    const result = await sock.groupParticipantsUpdate(
        jid,
        [participantJid],
        "remove"
    );

    if (
        Array.isArray(result) &&
        result.some(item =>
            item.status &&
            String(item.status) !== "200"
        )
    ) {
        throw new Error(
            `لم تؤكد المنصة نجاح الإخراج: ${JSON.stringify(result)}`
        );
    }

    return result;
}

async function sendNotice(sock, jid, text) {
    if (!jid) return;

    try {
        await sock.sendMessage(jid, { text });
    } catch (error) {
        logError("فشل إرسال الإشعار", error);
    }
}

export default {
    alwaysOn: true,
    command: "حمايه",
    category: "الحماية",
    description: "حماية جهات الاتصال في المجموعات",

    execute: async (sock, msg, data = {}) => {
        const jid = data.jid || msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            return sendNotice(
                sock,
                jid,
                "❌ هذا الأمر مخصص للمجموعات فقط."
            );
        }

        const sender =
            data.sender ||
            msg.key?.participant ||
            msg.participant ||
            msg.key?.remoteJid;

        if (!sender) {
            return sendNotice(
                sock,
                jid,
                "❌ تعذر تحديد هوية منفذ الأمر."
            );
        }

        try {
            const elite = getElite(true);

            const isBot = Boolean(
                msg.key?.fromMe ||
                isBotIdentity(sock, sender)
            );

            const isElite = isEliteNumber(
                sender,
                elite,
                null
            );

            const { isAdmin } = await getGroupAdminStatus(
                sock,
                jid,
                sender
            );

            if (!isAdmin && !isElite && !isBot) {
                return sendNotice(
                    sock,
                    jid,
                    "❌ الأمر للمشرفين والنخبة فقط."
                );
            }

            const db = loadData(true);
            const enabled = db[jid] !== true;

            db[jid] = enabled;
            saveData(db);

            const statusText = enabled
                ? [
                    "╔════════════════════╗",
                    "   🛡️ حماية جهات الاتصال",
                    "╚════════════════════╝",
                    "",
                    "✅ تم تفعيل الحماية بنجاح.",
                    "📌 سيتم حذف رسالة جهة الاتصال",
                    "🚫 ومحاولة إخراج المرسل.",
                    "",
                    "◇❐ ═━╾ 🩸 ╼━═ ❐◇"
                ].join("\n")
                : [
                    "╔════════════════════╗",
                    "   🛡️ حماية جهات الاتصال",
                    "╚════════════════════╝",
                    "",
                    "⚠️ تم تعطيل الحماية.",
                    "📌 لن تعالج هذه الإضافة",
                    "جهات الاتصال في المجموعة.",
                    "",
                    "◇❐ ═━╾ 🩸 ╼━═ ❐◇"
                ].join("\n");

            await sendNotice(sock, jid, statusText);
        } catch (error) {
            logError("فشل تنفيذ أمر الحماية", error);

            await sendNotice(
                sock,
                jid,
                "❌ تعذر تنفيذ الأمر أو حفظ الإعدادات."
            );
        }
    },

    onMessage: async (sock, msg) => {
        const jid = msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) return;
        if (!msg.message || !msg.key?.id) return;
        if (msg.key?.fromMe) return;

        const { hasContact, count } = detectContacts(
            msg.message
        );

        if (!hasContact) return;

        const sender =
            msg.key?.participant ||
            msg.participant;

        if (!sender || isBotIdentity(sock, sender)) return;

        const uniqueKey = `${jid}:${msg.key.id}`;

        // حجز الرسالة فورًا لمنع معالجتها مرتين بالتزامن.
        if (!rememberMessage(uniqueKey)) return;

        const db = loadData();

        if (db[jid] !== true) return;

        const elite = getElite();

        let participant = null;
        let metadataAvailable = false;

        try {
            const metadata = await getGroupMetadata(sock, jid);
            const participants = metadata.participants || [];

            metadataAvailable = true;

            participant = findParticipant(
                participants,
                sender
            );

            // لا نعاقب عضو النخبة، حتى عند اختلاف هوية LID
            // ورقم الهاتف إذا كانت بيانات العضو متاحة.
            if (isEliteNumber(sender, elite, participant)) {
                console.log(
                    `[ContactGuard] استثناء عضو النخبة: ${sender}`
                );
                return;
            }
        } catch (error) {
            logError("تعذر جلب بيانات المجموعة", error);

            // يمكن الاستثناء بالرقم مباشرة إذا كان معروفًا.
            if (isEliteNumber(sender, elite, null)) {
                return;
            }
        }

        const targetJid = participant?.id || "";

        // إذا تعذر التحقق من هوية العضو، نحذف الرسالة فقط.
        // لا نحاول طرد هوية غير مؤكدة.
        if (
            targetJid &&
            isBotIdentity(sock, targetJid)
        ) {
            return;
        }

        const startedAt = Date.now();

        // بدء الحذف فور الانتهاء من فحص النخبة.
        // الطرد لا ينتظر انتهاء الحذف، والعكس صحيح.
        const deletionTask = deleteContactMessage(
            sock,
            jid,
            msg
        ).then(
            () => ({ ok: true }),
            error => {
                logError("فشل حذف رسالة جهة الاتصال", error);
                return { ok: false };
            }
        );

        const removalTask = targetJid
            ? removeParticipant(sock, jid, targetJid).then(
                () => ({ ok: true }),
                error => {
                    logError("فشل إخراج مرسل جهة الاتصال", error);
                    return { ok: false };
                }
            )
            : Promise.resolve({ ok: false });

        const [deletion, removal] = await Promise.all([
            deletionTask,
            removalTask
        ]);

        console.log(
            [
                "╭━━━━━━━━━━━━━━━━━━━━━━╮",
                "┃ 🛡️ YUNO SECURITY",
                "┣━━━━━━━━━━━━━━━━━━━━━━┫",
                `┃ 👤 المرسل: ${sender}`,
                `┃ 📦 عدد جهات الاتصال: ${count}`,
                `┃ 🗑️ حذف الرسالة: ${deletion.ok ? "نجح" : "فشل"}`,
                `┃ 🚫 إخراج المرسل: ${removal.ok ? "نجح" : "فشل أو تعذر التحقق"}`,
                `┃ ⏱️ زمن المعالجة: ${Date.now() - startedAt} ms`,
                "╰━━━━━━━━━━━━━━━━━━━━━━╯"
            ].join("\n")
        );

        // تنظيف الذاكرة المؤقتة للمجموعة بعد عملية الطرد.
        if (removal.ok || metadataAvailable) {
            metadataCache.delete(jid);
        }
    }
};