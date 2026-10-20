import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "المحظورات.json");

const ELITE_FILES = [
"النخبة.json",
"النخبه.json",
"النخبة",
"النخبه"
];

const MAX_WORDS = 2000;
const MAX_STRIKES = 5000;
const MAX_PROCESSED = 5000;
const CACHE_MS = 3000;

const processed = new Map();
const metadataCache = new Map();
const metadataRequests = new Map();

function log(context, error) {
console.error(
"[ProfanityGuard] ${context}:",
error?.stack || error?.message || error
);
}

function isObject(value) {
return value !== null &&
typeof value === "object" &&
!Array.isArray(value);
}

// ═══════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════

function ensureFile() {
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({
            enabled: false,
            words: [],
            groups: {}
        }, null, 2),
        "utf8"
    );
}

}

function readDB() {
ensureFile();

const db = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8")
);

if (!isObject(db)) {
    throw new Error("ملف المحظورات ليس كائن JSON صالحًا.");
}

if (!Array.isArray(db.words)) {
    db.words = [];
}

if (!isObject(db.groups)) {
    db.groups = {};
}

db.enabled = db.enabled === true;

return db;

}

function saveDB(db) {
ensureFile();

const temp = `${DATA_FILE}.tmp`;

try {
    fs.writeFileSync(
        temp,
        JSON.stringify(db, null, 2),
        "utf8"
    );

    fs.renameSync(temp, DATA_FILE);
} catch (error) {
    try {
        if (fs.existsSync(temp)) {
            fs.unlinkSync(temp);
        }
    } catch {}

    throw error;
}

}

function getGroup(db, jid) {
if (!isObject(db.groups[jid])) {
db.groups[jid] = {
enabled: false,
words: [],
strikes: {}
};
}

const group = db.groups[jid];

if (!Array.isArray(group.words)) {
    group.words = [];
}

if (!isObject(group.strikes)) {
    group.strikes = {};
}

group.enabled = group.enabled === true;

return group;

}

function getAllWords(db, group) {
const result = [];
const seen = new Set();

for (const word of [
    ...db.words,
    ...group.words
]) {
    if (typeof word !== "string") continue;

    const key = normalizeText(word);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(word);
}

return result;

}

// ═══════════════════════════════════════
// TEXT NORMALIZATION
// ═══════════════════════════════════════

function normalizeText(value) {
return String(value ?? "")
.normalize("NFKC")
.toLowerCase()
.replace(/[\u064B-\u065F\u0670\u0640]/g, "")
.replace(/[أإآٱ]/g, "ا")
.replace(/ى/g, "ي")
.replace(/ؤ/g, "و")
.replace(/ئ/g, "ي")
.replace(
/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,
""
)
.replace(/\s+/g, " ")
.trim();
}

function compactText(value) {
return normalizeText(value)
.replace(/[^\p{L}\p{N}]/gu, "");
}

function escapeRegex(value) {
return value.replace(/[.*+?^${}()|[]\]/g, "\$&");
}

function findBannedWord(text, words) {
const normal = normalizeText(text);

if (!normal) return null;

const compact = compactText(normal);

for (const original of words) {
    const banned = normalizeText(original);
    const compactBanned = compactText(original);

    if (!banned) continue;

    const exactPattern = new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapeRegex(banned)}(?=$|[^\\p{L}\\p{N}])`,
        "u"
    );

    if (exactPattern.test(normal)) {
        return original;
    }

    if (
        compactBanned.length >= 3 &&
        compact.includes(compactBanned)
    ) {
        return original;
    }

    if (compactBanned.length >= 3) {
        const letters = [...compactBanned]
            .map(escapeRegex);

        const flexiblePattern = new RegExp(
            letters.join("[^\\p{L}\\p{N}]{0,3}"),
            "u"
        );

        if (flexiblePattern.test(normal)) {
            return original;
        }
    }
}

return null;

}

// ═══════════════════════════════════════
// IDENTITIES AND ELITE
// ═══════════════════════════════════════

function normalizeJid(value) {
if (typeof value !== "string") return "";

return value
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/, "");

}

function phoneDigits(value) {
if (
typeof value !== "string" &&
typeof value !== "number"
) {
return "";
}

const input = String(value).trim();

if (/^\+?\d+$/.test(input)) {
    const digits = input.replace(/\D/g, "");
    return digits.length >= 5 ? digits : "";
}

const match = normalizeJid(input).match(
    /^(\+?\d+)@(s\.whatsapp\.net|c\.us)$/
);

if (!match) return "";

const digits = match[1].replace(/\D/g, "");

return digits.length >= 5 ? digits : "";

}

function sameIdentity(a, b) {
const first = normalizeJid(a);
const second = normalizeJid(b);

if (!first || !second) return false;
if (first === second) return true;

const phoneA = phoneDigits(a);
const phoneB = phoneDigits(b);

return Boolean(phoneA && phoneB && phoneA === phoneB);

}

function isBot(sock, jid) {
if (!jid) return false;

return [
    sock?.user?.id,
    sock?.user?.lid,
    sock?.user?.jid
].filter(Boolean).some(id => sameIdentity(id, jid));

}

function getElite() {
const elite = new Set();

for (const filename of ELITE_FILES) {
    const filepath = path.join(DATA_DIR, filename);

    if (!fs.existsSync(filepath)) continue;

    try {
        const parsed = JSON.parse(
            fs.readFileSync(filepath, "utf8")
        );

        const values = [];

        function collect(value, depth = 0) {
            if (depth > 12 || value == null) return;

            if (
                typeof value === "string" ||
                typeof value === "number"
            ) {
                values.push(value);
                return;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    collect(item, depth + 1);
                }

                return;
            }

            if (isObject(value)) {
                const identityKeys = [
                    "number",
                    "phone",
                    "phoneNumber",
                    "id",
                    "jid",
                    "lid"
                ];

                let foundIdentity = false;

                for (const key of identityKeys) {
                    if (value[key] != null) {
                        values.push(value[key]);
                        foundIdentity = true;
                    }
                }

                if (!foundIdentity) {
                    for (const item of Object.values(value)) {
                        collect(item, depth + 1);
                    }
                }
            }
        }

        collect(parsed);

        for (const value of values) {
            const digits = phoneDigits(value);

            if (digits) elite.add(digits);
        }

        if (elite.size) break;
    } catch (error) {
        log(`تعذرت قراءة ملف النخبة ${filename}`, error);
    }
}

return elite;

}

function isElite(jid) {
const digits = phoneDigits(jid);

return Boolean(digits && getElite().has(digits));

}

// ═══════════════════════════════════════
// GROUP METADATA AND ADMIN PERMISSIONS
// ═══════════════════════════════════════

async function getMetadata(sock, jid, fresh = false) {
const cached = metadataCache.get(jid);

if (
    !fresh &&
    cached &&
    Date.now() - cached.time < CACHE_MS
) {
    return cached.value;
}

if (!fresh && metadataRequests.has(jid)) {
    return metadataRequests.get(jid);
}

const request = (async () => {
    try {
        const metadata = await sock.groupMetadata(jid);

        metadataCache.set(jid, {
            value: metadata,
            time: Date.now()
        });

        return metadata;
    } finally {
        if (metadataRequests.get(jid) === request) {
            metadataRequests.delete(jid);
        }
    }
})();

metadataRequests.set(jid, request);

return request;

}

async function getParticipant(sock, jid, sender) {
const metadata = await getMetadata(sock, jid, true);

return (metadata?.participants || []).find(participant =>
    [
        participant.id,
        participant.jid,
        participant.lid,
        participant.phoneNumber
    ].filter(Boolean).some(id => sameIdentity(id, sender))
) || null;

}

async function isAdmin(sock, jid, sender) {
try {
const participant = await getParticipant(
sock,
jid,
sender
);

    return Boolean(
        participant &&
        (
            participant.admin === "admin" ||
            participant.admin === "superadmin"
        )
    );
} catch (error) {
    log("تعذر التحقق من المشرف", error);
    return false;
}

}

async function canManage(sock, jid, sender, msg) {
if (
msg?.key?.fromMe ||
isBot(sock, sender) ||
isElite(sender)
) {
return true;
}

return isAdmin(sock, jid, sender);

}

// ═══════════════════════════════════════
// MESSAGE TEXT AND QUOTED MESSAGES
// ═══════════════════════════════════════

function unwrap(message) {
let current = message;

const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "deviceSentMessage",
    "editedMessage"
];

for (let i = 0; i < 12; i++) {
    if (!isObject(current)) return {};

    let next = null;

    for (const wrapper of wrappers) {
        const nested = current[wrapper]?.message;

        if (isObject(nested)) {
            next = nested;
            break;
        }
    }

    if (!next) return current;

    current = next;
}

return current || {};

}

function getMessageText(message) {
const content = unwrap(message);

const text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    "";

return typeof text === "string" ? text.trim() : "";

}

function getContextInfo(msg) {
const content = unwrap(msg?.message);

return (
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.documentMessage?.contextInfo ||
    content.buttonsResponseMessage?.contextInfo ||
    content.listResponseMessage?.contextInfo ||
    null
);

}

function getQuotedText(msg) {
const context = getContextInfo(msg);

return context?.quotedMessage
    ? getMessageText(context.quotedMessage)
    : "";

}

function getRawCommand(msg) {
return getMessageText(msg?.message);
}

function getAction(msg, data = {}) {
const raw = getRawCommand(msg);

const match = raw.match(
    /^[.!/#]?(حظر_تشغيل|حظر_ايقاف|حظر)(?=\s|$)/u
);

if (match) return match[1];

const declared = String(
    data.commandName ||
    data.command ||
    data.cmd ||
    ""
).replace(/^[.!/#]/, "").trim();

if ([
    "حظر",
    "حظر_تشغيل",
    "حظر_ايقاف"
].includes(declared)) {
    return declared;
}

return "";

}

function getArgument(msg, data = {}) {
const raw = getRawCommand(msg);

const match = raw.match(
    /^[.!/#]?حظر(?:\s+([\s\S]*))?$/u
);

if (match) {
    return (match[1] || "").trim();
}

const noPrefixText = String(
    data.noPrefixText || ""
).trim();

const contextualMatch = noPrefixText.match(
    /^حظر(?:\s+([\s\S]*))?$/u
);

if (contextualMatch) {
    return (contextualMatch[1] || "").trim();
}

if (typeof data.args === "string") {
    return data.args.trim();
}

if (Array.isArray(data.args)) {
    return data.args.join(" ").trim();
}

return "";

}

// ═══════════════════════════════════════
// MESSAGE OPERATIONS
// ═══════════════════════════════════════

async function notice(sock, jid, text, options = {}) {
if (!jid) return;

try {
    await sock.sendMessage(jid, {
        text,
        ...options
    });
} catch (error) {
    log("فشل إرسال الإشعار", error);
}

}

function remember(id) {
if (!id || processed.has(id)) return false;

processed.set(id, Date.now());

if (processed.size > MAX_PROCESSED) {
    const oldest = processed.keys().next().value;

    if (oldest !== undefined) {
        processed.delete(oldest);
    }
}

return true;

}

async function deleteMessage(sock, jid, msg) {
if (!msg?.key?.id) {
throw new Error("معرّف الرسالة غير موجود.");
}

return sock.sendMessage(jid, {
    delete: {
        ...msg.key,
        remoteJid: jid
    }
});

}

async function removeMember(sock, jid, participant) {
if (!participant || isBot(sock, participant)) {
return false;
}

const result = await sock.groupParticipantsUpdate(
    jid,
    [participant],
    "remove"
);

if (Array.isArray(result)) {
    const failed = result.some(item =>
        item?.status != null &&
        !["200", "success"].includes(
            String(item.status).toLowerCase()
        )
    );

    if (failed) return false;
}

return true;

}

// ═══════════════════════════════════════
// WARNINGS
// ═══════════════════════════════════════

const WARNINGS = {
1: [
"╭━━━〔 ⚠️ التحذير الأول 〕━━━╮",
"",
"تم رصد كلمة محظورة في رسالتك.",
"يرجى احترام أعضاء المجموعة والابتعاد عن الإساءة.",
"",
"╰━━━━━━━━━━━━━━━━━━╯"
].join("\n"),

2: [
    "╭━━━〔 ⛔ التحذير الثاني 〕━━━╮",
    "",
    "تكررت المخالفة للمرة الثانية.",
    "هذا تحذير أخير قبل محاولة إزالة العضو.",
    "يرجى احترام الآخرين.",
    "",
    "╰━━━━━━━━━━━━━━━━━━╯"
].join("\n"),

3: [
    "╭━━━〔 🛡️ المخالفة الثالثة 〕━━━╮",
    "",
    "تكررت المخالفة للمرة الثالثة.",
    "سيحاول البوت إزالة العضو وفق صلاحياته.",
    "",
    "╰━━━━━━━━━━━━━━━━━━╯"
].join("\n")

};

// ═══════════════════════════════════════
// MAIN COMMAND
// ═══════════════════════════════════════

export default {
alwaysOn: true,

command: "حظر",
aliases: [
    "حظر_تشغيل",
    "حظر_ايقاف"
],

category: "الحماية",
description: "حماية جميع المجموعات من الكلمات المحظورة",

execute: async (sock, msg, data = {}) => {
    const jid = data.jid || msg?.key?.remoteJid;

    if (!jid?.endsWith("@g.us")) {
        return notice(
            sock,
            jid,
            "❌ هذه الأوامر مخصصة للمجموعات فقط."
        );
    }

    const sender =
        data.sender ||
        msg?.key?.participant ||
        msg?.participant ||
        "";

    if (!sender) {
        return notice(
            sock,
            jid,
            "❌ تعذر تحديد هوية منفذ الأمر."
        );
    }

    try {
        if (!await canManage(sock, jid, sender, msg)) {
            return notice(
                sock,
                jid,
                "❌ الأمر للمشرفين والنخبة فقط."
            );
        }

        const action = getAction(msg, data);

        if (!action) {
            return notice(
                sock,
                jid,
                "❌ أمر غير معروف.\n\n" +
                "• .حظر الكلمة\n" +
                "• .حظر_تشغيل\n" +
                "• .حظر_ايقاف"
            );
        }

        const db = readDB();
        const group = getGroup(db, jid);

        // تشغيل عام لجميع المجموعات.
        if (action === "حظر_تشغيل") {
            db.enabled = true;
            group.enabled = true;

            saveDB(db);

            return notice(
                sock,
                jid,
                "╭━━━〔 🛡️ حماية آرثر 〕━━━╮\n" +
                "✅ تم تشغيل الحماية العامة.\n" +
                "🌐 الحماية مفعّلة لجميع المجموعات.\n" +
                `📚 الكلمات العامة: ${db.words.length}\n` +
                `📚 كلمات هذه المجموعة: ${group.words.length}\n` +
                "⚠️ المخالفة الأولى: تحذير.\n" +
                "⛔ المخالفة الثانية: تحذير أخير.\n" +
                "🚫 المخالفة الثالثة: محاولة الإخراج.\n" +
                "╰━━━━━━━━━━━━━━━━━━╯"
            );
        }

        if (action === "حظر_ايقاف") {
            db.enabled = false;

            for (const entry of Object.values(db.groups)) {
                if (isObject(entry)) {
                    entry.enabled = false;
                }
            }

            saveDB(db);

            return notice(
                sock,
                jid,
                "⚠️ تم إيقاف الحماية العامة في جميع المجموعات.\n" +
                "📁 الكلمات وسجلات المخالفات محفوظة."
            );
        }

        let word = getArgument(msg, data);

        if (!word) {
            word = getQuotedText(msg);
        }

        word = String(word || "").trim();

        if (!word) {
            return notice(
                sock,
                jid,
                "╭━━━〔 طريقة الاستخدام 〕━━━╮\n" +
                "• .حظر الكلمة\n" +
                "  إضافة كلمة لجميع المجموعات.\n\n" +
                "• رد على رسالة واكتب .حظر\n" +
                "  إضافة النص المقتبس إلى المحظورات.\n\n" +
                "• .حظر_تشغيل\n" +
                "  تشغيل الحماية العامة.\n\n" +
                "• .حظر_ايقاف\n" +
                "  إيقاف الحماية العامة.\n" +
                "╰━━━━━━━━━━━━━━━━━━╯"
            );
        }

        if (word.length > 100) {
            return notice(
                sock,
                jid,
                "❌ الحد الأقصى للكلمة أو العبارة 100 حرف."
            );
        }

        if (!normalizeText(word)) {
            return notice(
                sock,
                jid,
                "❌ لا يمكن إضافة نص فارغ."
            );
        }

        const normalized = normalizeText(word);

        const exists = [
            ...db.words,
            ...group.words
        ].some(item =>
            typeof item === "string" &&
            normalizeText(item) === normalized
        );

        if (exists) {
            return notice(
                sock,
                jid,
                "⚠️ الكلمة أو العبارة موجودة مسبقًا:\n" +
                word
            );
        }

        if (db.words.length >= MAX_WORDS) {
            return notice(
                sock,
                jid,
                "❌ وصلت قائمة المحظورات العامة إلى الحد الأقصى."
            );
        }

        // الكلمات الجديدة تُطبّق على كل المجموعات.
        db.words.push(word);
        saveDB(db);

        return notice(
            sock,
            jid,
            "╭━━━〔 🛡️ المحظورات العامة 〕━━━╮\n" +
            `✅ تمت إضافة: ${word}\n` +
            `📚 إجمالي الكلمات العامة: ${db.words.length}\n` +
            `🌐 الحماية العامة: ${db.enabled ? "مفعّلة" : "متوقفة"}\n` +
            "╰━━━━━━━━━━━━━━━━━━╯"
        );
    } catch (error) {
        log("فشل تنفيذ الأمر", error);

        return notice(
            sock,
            jid,
            "❌ تعذر تنفيذ الأمر أو حفظ الإعدادات.\n" +
            "راجع سجل تشغيل البوت لمعرفة السبب."
        );
    }
},

// ═══════════════════════════════════════
// AUTOMATIC MESSAGE MONITOR
// ═══════════════════════════════════════

onMessage: async (sock, msg, context = {}) => {
    const jid =
        context.jid ||
        msg?.key?.remoteJid;

    if (!jid?.endsWith("@g.us")) return;
    if (!msg?.message || !msg?.key?.id) return;
    if (msg.key.fromMe) return;

    const sender =
        context.sender ||
        msg.key.participant ||
        msg.participant ||
        "";

    if (!sender) return;
    if (isBot(sock, sender)) return;
    if (isElite(sender)) return;

    const uniqueId = `${jid}:${msg.key.id}`;

    if (!remember(uniqueId)) return;

    try {
        const db = readDB();
        const group = getGroup(db, jid);

        // يدعم التشغيل العام والملفات القديمة لكل مجموعة.
        const enabled =
            db.enabled === true ||
            group.enabled === true;

        if (!enabled) return;

        const words = getAllWords(db, group);

        if (!words.length) return;

        const text = getMessageText(msg.message);

        if (!text) return;

        const matched = findBannedWord(text, words);

        if (!matched) return;

        // تأكيد صلاحية المشرف قبل تطبيق العقوبة.
        // عند فشل جلب بيانات المجموعة نتوقف احتياطًا.
        const participant = await getParticipant(
            sock,
            jid,
            sender
        );

        if (!participant) {
            log(
                `تعذر التحقق من العضو ${sender} في ${jid}`,
                "لم يتم تطبيق العقوبة"
            );
            return;
        }

        if (
            participant.admin === "admin" ||
            participant.admin === "superadmin"
        ) {
            return;
        }

        const strikes = group.strikes;
        const oldCount = Number(strikes[sender] || 0);
        const count = Math.min(oldCount + 1, 3);

        strikes[sender] = count;

        const entries = Object.keys(strikes);

        if (entries.length > MAX_STRIKES) {
            for (
                const key of entries.slice(
                    0,
                    entries.length - MAX_STRIKES
                )
            ) {
                if (key !== sender) {
                    delete strikes[key];
                }
            }
        }

        saveDB(db);

        console.log(
            `[ProfanityGuard] group=${jid} ` +
            `sender=${sender} strike=${count}/3 ` +
            `matched=${matched}`
        );

        // محاولة الحذف قبل إرسال التحذير.
        const deletionTask = deleteMessage(
            sock,
            jid,
            msg
        ).then(
            () => true,
            error => {
                log("فشل حذف الرسالة", error);
                return false;
            }
        );

        const mention = `@${sender.split("@")[0]}`;

        if (count < 3) {
            const deleted = await deletionTask;

            await notice(
                sock,
                jid,
                `${mention}\n${WARNINGS[count]}` +
                (
                    deleted
                        ? ""
                        : "\n⚠️ تعذر حذف الرسالة؛ تحقق من صلاحيات البوت."
                ),
                { mentions: [sender] }
            );

            return;
        }

        // المخالفة الثالثة: حذف الرسالة ومحاولة الإخراج.
        const removalTask = (async () => {
            try {
                const freshParticipant = await getParticipant(
                    sock,
                    jid,
                    sender
                );

                if (!freshParticipant?.id) {
                    throw new Error(
                        "تعذر تحديد معرّف العضو للإخراج."
                    );
                }

                if (
                    freshParticipant.admin === "admin" ||
                    freshParticipant.admin === "superadmin"
                ) {
                    return false;
                }

                if (isBot(sock, freshParticipant.id)) {
                    return false;
                }

                return await removeMember(
                    sock,
                    jid,
                    freshParticipant.id
                );
            } catch (error) {
                log("فشل إخراج العضو", error);
                return false;
            }
        })();

        const [deleted, removed] = await Promise.all([
            deletionTask,
            removalTask
        ]);

        metadataCache.delete(jid);

        await notice(
            sock,
            jid,
            `${mention}\n${WARNINGS[3]}` +
            (
                removed
                    ? "\n✅ تمت إزالة العضو من المجموعة."
                    : "\n⚠️ تعذرت إزالة العضو؛ تحقق من صلاحيات البوت."
            ) +
            (
                deleted
                    ? ""
                    : "\n⚠️ تعذر حذف الرسالة."
            ),
            { mentions: [sender] }
        );

        console.log(
            `[ProfanityGuard] group=${jid} ` +
            `thirdStrike=true deleted=${deleted} removed=${removed}`
        );
    } catch (error) {
        log("خطأ أثناء مراقبة الرسالة", error);
    }
}

};