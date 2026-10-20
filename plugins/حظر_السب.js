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
const MAX_STRIKES_PER_GROUP = 5000;
const MAX_PROCESSED = 5000;
const CACHE_MS = 1500;

const processed = new Set();
const metadataCache = new Map();
const metadataRequests = new Map();

function log(context, error) {
    console.error(
        `[ProfanityGuard] ${context}:`,
        error?.stack || error?.message || error
    );
}

function isObject(value) {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function ensureFile() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify({ groups: {} }, null, 2),
            "utf8"
        );
    }
}

function readDB() {
    ensureFile();

    const parsed = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
    );

    if (!isObject(parsed)) {
        throw new Error("بنية ملف المحظورات غير صحيحة.");
    }

    if (!isObject(parsed.groups)) {
        parsed.groups = {};
    }

    return parsed;
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

// ═══════════════════════════════════════
// تطبيع النص وكشف التحايل بالرموز والتفكيك
// ═══════════════════════════════════════

function normalizeText(value) {
    return String(value || "")
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

function prepareText(value) {
    const normal = normalizeText(value);

    return {
        normal,
        compact: compactText(normal)
    };
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBannedWord(text, words) {
    const message = prepareText(text);

    if (!message.normal) return null;

    for (const original of words) {
        const banned = prepareText(original);

        if (!banned.normal) continue;

        // المطابقة الطبيعية مع حدود الكلمات.
        const pattern = new RegExp(
            `(^|[^\\p{L}\\p{N}])${escapeRegex(banned.normal)}(?=$|[^\\p{L}\\p{N}])`,
            "u"
        );

        if (pattern.test(message.normal)) {
            return original;
        }

        // المطابقة بعد حذف المسافات والرموز.
        // تفيد في كشف: ك ل م ة، ك-ل-م-ة، ك.ل.م.ة.
        if (
            banned.compact.length >= 3 &&
            message.compact.includes(banned.compact)
        ) {
            return original;
        }

        // السماح بفواصل صغيرة بين الحروف دون إزالة الحروف
        // الأصلية من النص.
        if (banned.compact.length >= 3) {
            const letters = [...banned.compact]
                .map(escapeRegex);

            const flexiblePattern = new RegExp(
                letters.join("[^\\p{L}\\p{N}]{0,3}"),
                "u"
            );

            if (flexiblePattern.test(message.normal)) {
                return original;
            }
        }
    }

    return null;
}

// ═══════════════════════════════════════
// هوية الأعضاء والنخبة
// ═══════════════════════════════════════

function normalizeJid(value) {
    if (typeof value !== "string") return "";

    return value
        .trim()
        .toLowerCase()
        .replace(/:\d+(?=@)/, "");
}

function phoneDigits(value) {
    if (typeof value !== "string") return "";

    const input = value.trim();

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

function sameIdentity(first, second) {
    const a = normalizeJid(first);
    const b = normalizeJid(second);

    if (!a || !b) return false;
    if (a === b) return true;

    const phoneA = phoneDigits(first);
    const phoneB = phoneDigits(second);

    return Boolean(phoneA && phoneB && phoneA === phoneB);
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
                    values.push(String(value));
                    return;
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        collect(item, depth + 1);
                    }

                    return;
                }

                if (isObject(value)) {
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

            // استخدام أول ملف صالح كما في النظام السابق.
            break;
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

function isBot(sock, jid) {
    if (!jid) return false;

    return [
        sock.user?.id,
        sock.user?.lid
    ].filter(Boolean).some(id => sameIdentity(id, jid));
}

// ═══════════════════════════════════════
// بيانات المجموعة والصلاحيات
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

async function getParticipant(sock, jid, sender) {
    const metadata = await getMetadata(sock, jid, true);

    return (metadata.participants || []).find(participant =>
        [
            participant.id,
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
        log("تعذر التحقق من صلاحيات المشرف", error);
        return false;
    }
}

async function canManage(sock, jid, sender, msg) {
    if (
        msg.key?.fromMe ||
        isBot(sock, sender) ||
        isElite(sender)
    ) {
        return true;
    }

    return isAdmin(sock, jid, sender);
}

// ═══════════════════════════════════════
// استخراج نص الرسالة والردود
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

    return (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        content.documentWithCaptionMessage?.message
            ?.documentMessage?.caption ||
        ""
    ).trim();
}

function getContextInfo(msg) {
    const content = unwrap(msg.message);

    return (
        content.extendedTextMessage?.contextInfo ||
        content.imageMessage?.contextInfo ||
        content.videoMessage?.contextInfo ||
        content.documentMessage?.contextInfo ||
        content.buttonsResponseMessage?.contextInfo ||
        content.templateButtonReplyMessage?.contextInfo ||
        content.listResponseMessage?.contextInfo ||
        null
    );
}

function getQuotedText(msg) {
    const context = getContextInfo(msg);

    if (!context?.quotedMessage) return "";

    return getMessageText(context.quotedMessage);
}

function getRawCommand(msg) {
    return getMessageText(msg.message);
}

function getAction(msg, data = {}) {
    const raw = getRawCommand(msg);

    const declared = String(
        data.command ||
        data.cmd ||
        ""
    ).replace(/^[.!/#]/, "").trim();

    if (
        declared === "حظر" ||
        declared === "حظر_تشغيل" ||
        declared === "حظر_ايقاف"
    ) {
        return declared;
    }

    const match = raw.match(
        /^[.!/#]?(حظر_تشغيل|حظر_ايقاف|حظر)(?=\s|$)/u
    );

    return match?.[1] || "";
}

function getArgument(msg, data = {}) {
    const raw = getRawCommand(msg);

    const match = raw.match(
        /^[.!/#]?حظر(?:\s+([\s\S]*))?$/u
    );

    if (match) {
        return (match[1] || "").trim();
    }

    if (typeof data.text === "string") {
        return data.text.trim();
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
// الرسائل والإجراءات
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

    processed.add(id);

    if (processed.size > MAX_PROCESSED) {
        const oldest = processed.values().next().value;

        if (oldest !== undefined) {
            processed.delete(oldest);
        }
    }

    return true;
}

async function deleteMessage(sock, jid, msg) {
    if (!msg.key?.id) {
        throw new Error("معرّف الرسالة غير موجود.");
    }

    const key = {
        ...msg.key,
        remoteJid: jid
    };

    return sock.sendMessage(jid, { delete: key });
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

    if (
        Array.isArray(result) &&
        result.some(item =>
            item.status &&
            String(item.status) !== "200"
        )
    ) {
        return false;
    }

    return true;
}

// ═══════════════════════════════════════
// رسائل التحذيرات
// ═══════════════════════════════════════

const WARNINGS = {
    1: [
        "╭━━━〔 ⚠️ التحذير الأول 〕━━━╮",
        "",
        "تم حذف رسالتك لاحتوائها على كلمة محظورة.",
        "احفظ لسانك واحترم أعضاء المجموعة.",
        "الكلمة الطيبة من حسن الخلق.",
        "",
        "╰━━━━━━━━━━━━━━━━━━╯"
    ].join("\n"),

    2: [
        "╭━━━〔 ⛔ التحذير الثاني 〕━━━╮",
        "",
        "تم حذف رسالتك بسبب تكرار المخالفة.",
        "هذا تنبيه أخير قبل اتخاذ الإجراء التالي.",
        "قال الله تعالى:",
        "﴿وَقُولُوا لِلنَّاسِ حُسْنًا﴾",
        "",
        "احترم الآخرين وابتعد عن السب والإساءة.",
        "╰━━━━━━━━━━━━━━━━━━╯"
    ].join("\n"),

    3: [
        "╭━━━〔 🛡️ المخالفة الثالثة 〕━━━╮",
        "",
        "تكررت المخالفة رغم التنبيهات السابقة.",
        "حفظ اللسان واحترام الآخرين من مكارم الأخلاق.",
        "قال الله تعالى:",
        "﴿مَا يَلْفِظُ مِنْ قَوْلٍ إِلَّا لَدَيْهِ رَقِيبٌ عَتِيدٌ﴾",
        "",
        "سيتم اتخاذ إجراء وفق نظام المجموعة.",
        "╰━━━━━━━━━━━━━━━━━━╯"
    ].join("\n")
};

// ═══════════════════════════════════════
// الإضافة الرئيسية
// ═══════════════════════════════════════

export default {
    alwaysOn: true,

    command: "حظر",
    aliases: [
        "حظر_تشغيل",
        "حظر_ايقاف"
    ],

    category: "الحماية",
    description: "حماية المجموعة من السب والكلمات المحظورة",

    execute: async (sock, msg, data = {}) => {
        const jid = data.jid || msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            return notice(
                sock,
                jid,
                "❌ هذه الأوامر مخصصة للمجموعات فقط."
            );
        }

        const sender =
            data.sender ||
            msg.key?.participant ||
            msg.participant ||
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
                    "❌ الأمر غير معروف.\n" +
                    "استخدم .حظر الكلمة أو .حظر_تشغيل أو .حظر_ايقاف"
                );
            }

            const db = readDB();
            const group = getGroup(db, jid);

            if (action === "حظر_تشغيل") {
                group.enabled = true;
                saveDB(db);

                return notice(
                    sock,
                    jid,
                    "╭━━━〔 🛡️ حماية السب 〕━━━╮\n" +
                    "✅ تم تشغيل الحماية.\n" +
                    `📚 الكلمات والعبارات: ${group.words.length}\n` +
                    "⚠️ المخالفة الأولى: تحذير أول.\n" +
                    "⛔ المخالفة الثانية: تحذير ثانٍ.\n" +
                    "🚫 المخالفة الثالثة: محاولة إخراج العضو.\n" +
                    "╰━━━━━━━━━━━━━━━━━━╯"
                );
            }

            if (action === "حظر_ايقاف") {
                group.enabled = false;
                saveDB(db);

                return notice(
                    sock,
                    jid,
                    "⚠️ تم إيقاف حماية السب في هذه المجموعة.\n" +
                    "📁 الكلمات وسجل المخالفات محفوظان."
                );
            }

            let word = getArgument(msg, data);

            // إذا لم توجد كلمة بعد الأمر، نستخدم الرسالة المقتبسة.
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
                    "• رد على رسالة واكتب .حظر\n" +
                    "• .حظر_تشغيل\n" +
                    "• .حظر_ايقاف\n" +
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
                    "❌ لا يمكن إضافة نص فارغ إلى المحظورات."
                );
            }

            const duplicate = group.words.some(
                item =>
                    normalizeText(item) === normalizeText(word)
            );

            if (duplicate) {
                return notice(
                    sock,
                    jid,
                    `⚠️ الكلمة أو العبارة موجودة مسبقًا:\n${word}`
                );
            }

            if (group.words.length >= MAX_WORDS) {
                return notice(
                    sock,
                    jid,
                    "❌ وصلت قائمة المحظورات إلى الحد الأقصى."
                );
            }

            group.words.push(word);
            saveDB(db);

            return notice(
                sock,
                jid,
                "╭━━━〔 🛡️ قائمة المحظورات 〕━━━╮\n" +
                `✅ تمت إضافة: ${word}\n` +
                `📚 الإجمالي: ${group.words.length}\n` +
                `🔎 المراقبة: ${group.enabled ? "مفعلة" : "متوقفة"}\n` +
                "╰━━━━━━━━━━━━━━━━━━╯"
            );
        } catch (error) {
            log("فشل تنفيذ الأمر", error);

            return notice(
                sock,
                jid,
                "❌ تعذر تنفيذ الأمر أو حفظ ملف المحظورات.\n" +
                "راجع سجل البوت لمعرفة سبب الخطأ."
            );
        }
    },

    onMessage: async (sock, msg) => {
        const jid = msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) return;
        if (!msg.message || !msg.key?.id) return;
        if (msg.key?.fromMe) return;

        const sender =
            msg.key?.participant ||
            msg.participant;

        if (!sender) return;
        if (isBot(sock, sender)) return;
        if (isElite(sender)) return;

        const uniqueId = `${jid}:${msg.key.id}`;

        if (!remember(uniqueId)) return;

        const text = getMessageText(msg.message);

        if (!text) return;

        let db;

        try {
            db = readDB();
        } catch (error) {
            log("تعذر قراءة إعدادات الحماية", error);
            return;
        }

        const group = getGroup(db, jid);

        if (!group.enabled || group.words.length === 0) {
            return;
        }

        const matched = findBannedWord(text, group.words);

        if (!matched) return;

        // إعفاء مشرفي المجموعة من العقوبة.
        // إذا فشل جلب بيانات المشرفين، نتوقف احتياطًا
        // لتجنب طرد شخص بسبب خطأ مؤقت في الشبكة.
        let admin;

        try {
            admin = await isAdmin(sock, jid, sender);
        } catch (error) {
            log("تعذر التحقق من المشرف", error);
            return;
        }

        if (admin) return;

        const strikes = group.strikes;
        const oldCount = Number(strikes[sender] || 0);
        const count = Math.min(oldCount + 1, 3);

        strikes[sender] = count;

        // إزالة أقدم السجلات عند تجاوز الحد.
        const entries = Object.entries(strikes);

        if (entries.length > MAX_STRIKES_PER_GROUP) {
            const excess = entries.length - MAX_STRIKES_PER_GROUP;

            for (const [key] of entries.slice(0, excess)) {
                if (key !== sender) {
                    delete strikes[key];
                }
            }
        }

        try {
            saveDB(db);
        } catch (error) {
            log("تعذر حفظ سجل المخالفات", error);
            return;
        }

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
                (deleted
                    ? ""
                    : "\n⚠️ تعذر حذف الرسالة، تحقق من صلاحيات البوت."),
                { mentions: [sender] }
            );

            console.log(
                `[ProfanityGuard] ${jid}: مخالفة ${count}/3`
            );

            return;
        }

        // المخالفة الثالثة: الحذف والإخراج بالتوازي.
        // لا نحاول إخراج هوية غير مؤكدة.
        const removalTask = (async () => {
            try {
                const participant = await getParticipant(
                    sock,
                    jid,
                    sender
                );

                if (!participant?.id) {
                    throw new Error(
                        "تعذر التحقق من هوية العضو في المجموعة."
                    );
                }

                if (isBot(sock, participant.id)) {
                    throw new Error(
                        "تم منع محاولة إخراج البوت."
                    );
                }

                return await removeMember(
                    sock,
                    jid,
                    participant.id
                );
            } catch (error) {
                log("تعذر إخراج العضو", error);
                return false;
            }
        })();

        const [deleted, removed] = await Promise.all([
            deletionTask,
            removalTask
        ]);

        metadataCache.delete(jid);

        const ending = removed
            ? "\n✅ تمت إزالة العضو من المجموعة."
            : "\n⚠️ تعذر إخراج العضو. تأكد من صلاحيات البوت وهوية العضو.";

        await notice(
            sock,
            jid,
            `${mention}\n${WARNINGS[3]}` +
            ending +
            (deleted
                ? ""
                : "\n⚠️ تعذر حذف الرسالة."),
            { mentions: [sender] }
        );

        console.log(
            `[ProfanityGuard] ${jid}: المخالفة الثالثة؛ ` +
            `الحذف=${deleted}؛ الإخراج=${removed}`
        );
    }
};