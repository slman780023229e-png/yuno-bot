const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
//       🩸 ARTHUR BOT • MONITOR ELITE ULTIMATE
//       مراقبة الإشراف • حماية النخبة • حفظ الحالة
// ═══════════════════════════════════════════════════════

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "monitorState.json");

const ELITE_FILES = [
    "النخبة.json",
    "النخبه.json",
    "النخبة",
    "النخبه"
];

const BRAND = "🩸 *𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓* 🩸";
const FRAME = "◇❐ ═━━━━━━━╾ 🩸 ╼━━━━━━━═ ❐◇";

const initializedSockets = new WeakSet();
const processingGroups = new Set();
const recentEvents = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });

// ───────────────────────────────────────────────────────
// قراءة الحالة وحفظها بصورة ذرية
// ───────────────────────────────────────────────────────

function loadState() {
    if (!fs.existsSync(STATE_FILE)) return {};

    try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("صيغة ملف الحالة غير صحيحة");
        }

        return data;
    } catch (error) {
        console.error("[MONITOR] تعذرت قراءة ملف الحالة:", error.message);
        return {};
    }
}

let state = loadState();

function saveState() {
    const tempFile = `${STATE_FILE}.tmp`;

    try {
        fs.writeFileSync(
            tempFile,
            JSON.stringify(state, null, 2),
            "utf8"
        );

        fs.renameSync(tempFile, STATE_FILE);
        return true;
    } catch (error) {
        console.error("[MONITOR] تعذر حفظ الحالة:", error.message);

        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}

        return false;
    }
}

// ───────────────────────────────────────────────────────
// تطبيع الهويات والتحقق من النخبة
// ───────────────────────────────────────────────────────

function normalizeId(value) {
    if (typeof value !== "string") return "";

    return value
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
}

function getEliteEntries(value, output = []) {
    if (typeof value === "string" || typeof value === "number") {
        const id = normalizeId(String(value));

        if (id) output.push(id);
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            getEliteEntries(item, output);
        }

        return output;
    }

    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            const normalizedKey = normalizeId(key);

            if (
                normalizedKey &&
                (
                    /^\d{5,20}$/.test(normalizedKey) ||
                    normalizedKey.includes("@")
                )
            ) {
                output.push(normalizedKey);
            }

            getEliteEntries(item, output);
        }
    }

    return output;
}

function loadEliteIds() {
    const found = [];

    for (const fileName of ELITE_FILES) {
        const filePath = path.join(DATA_DIR, fileName);

        if (!fs.existsSync(filePath)) continue;

        try {
            const parsed = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            );

            getEliteEntries(parsed, found);
        } catch (error) {
            console.error(
                `[MONITOR] خطأ في ملف ${fileName}:`,
                error.message
            );
        }
    }

    return [...new Set(found)];
}

function identityMatches(userId, eliteEntries) {
    const id = normalizeId(userId);
    if (!id) return false;

    // المطابقة الدقيقة أولًا، بما فيها الهويات غير الهاتفية.
    if (eliteEntries.includes(id)) return true;

    // لا نقارن أرقام LID بأرقام الهاتف؛ ذلك قد يخلط بين الأشخاص.
    if (id.endsWith("@s.whatsapp.net")) {
        const phone = id.split("@")[0].split(":")[0];

        return eliteEntries.some(entry => {
            if (entry.endsWith("@s.whatsapp.net")) {
                return entry.split("@")[0].split(":")[0] === phone;
            }

            return /^\d{5,20}$/.test(entry) && entry === phone;
        });
    }

    return false;
}

function isElite(userId) {
    return identityMatches(userId, loadEliteIds());
}

function getBotIds(sock) {
    const ids = [];

    for (const value of [sock?.user?.id, sock?.user?.lid]) {
        const normalized = normalizeId(value);

        if (normalized) ids.push(normalized);
    }

    return ids;
}

function isBot(userId, sock) {
    const id = normalizeId(userId);
    if (!id) return false;

    const botIds = getBotIds(sock);

    if (botIds.includes(id)) return true;

    // مطابقة رقم الهاتف فقط عندما تكون الهويتان من نوع الهاتف.
    if (id.endsWith("@s.whatsapp.net")) {
        const phone = id.split("@")[0].split(":")[0];

        return botIds.some(botId =>
            botId.endsWith("@s.whatsapp.net") &&
            botId.split("@")[0].split(":")[0] === phone
        );
    }

    return false;
}

// ───────────────────────────────────────────────────────
// قراءة نص الرسالة بما فيها بعض الأغلفة
// ───────────────────────────────────────────────────────

function unwrapMessage(message) {
    let current = message;

    for (let i = 0; i < 8 && current; i++) {
        const wrapper =
            current.ephemeralMessage ||
            current.viewOnceMessage ||
            current.viewOnceMessageV2 ||
            current.viewOnceMessageV2Extension ||
            current.documentWithCaptionMessage;

        if (wrapper?.message) {
            current = wrapper.message;
        } else {
            break;
        }
    }

    return current || {};
}

function getMessageText(message) {
    const msg = unwrapMessage(message);

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.templateButtonReplyMessage?.selectedId ||
        ""
    ).trim();
}

// ───────────────────────────────────────────────────────
// إرسال الرسائل
// ───────────────────────────────────────────────────────

async function sendText(sock, jid, text, mentions = []) {
    return sock.sendMessage(jid, {
        text: `${BRAND}\n${FRAME}\n\n${text}`,
        mentions
    });
}

function getGroupState(jid) {
    if (!state[jid] || typeof state[jid] !== "object") {
        state[jid] = {
            active: false,
            waitingChoice: false,
            pendingSince: 0,
            lastEvent: null
        };
    }

    return state[jid];
}

// ───────────────────────────────────────────────────────
// مراجعة الإشراف دون طرد الأعضاء أو تغيير صلاحياتهم
// ───────────────────────────────────────────────────────

async function executeReview(sock, jid) {
    const metadata = await sock.groupMetadata(jid);
    const participants = metadata.participants || [];

    const admins = participants.filter(p => p.admin);
    const elites = admins.filter(p => isElite(p.id));
    const otherAdmins = admins.filter(p =>
        !isElite(p.id) && !isBot(p.id, sock)
    );

    const lines = [
        "👑 *تقرير مراجعة الإشراف*",
        "",
        `👥 عدد أعضاء المجموعة: ${participants.length}`,
        `🛡️ عدد المشرفين: ${admins.length}`,
        `👑 مشرفون من النخبة: ${elites.length}`,
        `📋 مشرفون خارج قائمة النخبة: ${otherAdmins.length}`,
        "",
        "لم يتم طرد أي عضو أو تغيير أي صلاحية."
    ];

    if (otherAdmins.length) {
        lines.push("", "*المشرفون خارج قائمة النخبة:*");

        for (const admin of otherAdmins.slice(0, 30)) {
            lines.push(`• @${String(admin.id).split("@")[0]}`);
        }

        if (otherAdmins.length > 30) {
            lines.push(`• وهناك ${otherAdmins.length - 30} مشرفين آخرين.`);
        }
    }

    await sendText(
        sock,
        jid,
        lines.join("\n"),
        otherAdmins.slice(0, 30).map(p => p.id)
    );
}

// ───────────────────────────────────────────────────────
// رصد تغييرات الإشراف
// ───────────────────────────────────────────────────────

async function handleParticipantUpdate(sock, update) {
    const jid = update?.id;

    if (!jid || !jid.endsWith("@g.us")) return;

    if (!["promote", "demote"].includes(update.action)) return;

    const groupState = getGroupState(jid);
    if (!groupState.active) return;

    const now = Date.now();
    const participants = Array.isArray(update.participants)
        ? update.participants
        : [];

    const eventKey = [
        jid,
        update.action,
        participants.map(p => typeof p === "string" ? p : p?.id).join(","),
        update.author || "",
        Math.floor(now / 5000)
    ].join("|");

    if (recentEvents.has(eventKey)) return;

    recentEvents.set(eventKey, now);

    for (const [key, timestamp] of recentEvents) {
        if (now - timestamp > 30000) recentEvents.delete(key);
    }

    // لا ننفذ تغييرات صلاحيات تلقائية؛ نطلب مراجعة بشرية من النخبة.
    groupState.waitingChoice = true;
    groupState.pendingSince = now;
    groupState.lastEvent = {
        action: update.action,
        actor: update.author || null,
        participants
    };

    saveState();

    const actionText = update.action === "promote"
        ? "رفع عضو إلى مشرف"
        : "إزالة إشراف عضو";

    const targetIds = participants
        .map(p => typeof p === "string" ? p : p?.id)
        .filter(Boolean);

    const actor = update.author || null;
    const mentions = [...new Set([...targetIds, ...(actor ? [actor] : [])])];

    const body = [
        "⚠️ *تم رصد تغيير في إشراف المجموعة*",
        "",
        `📌 نوع التغيير: ${actionText}`,
        actor ? `👤 المنفّذ: @${actor.split("@")[0]}` : "👤 المنفّذ: غير معروف",
        targetIds.length
            ? `🎯 العضو المستهدف: ${targetIds.map(id => `@${id.split("@")[0]}`).join("، ")}`
            : "🎯 العضو المستهدف: غير معروف",
        "",
        "👑 يا أعضاء النخبة، اختاروا:",
        "",
        "1️⃣ مراجعة المشرفين وإرسال تقرير",
        "2️⃣ إلغاء المراجعة الحالية",
        "",
        "⏳ يجب أن يرسل أحد أعضاء النخبة الرقم في المجموعة."
    ].join("\n");

    await sendText(sock, jid, body, mentions);
}

// ───────────────────────────────────────────────────────
// الأوامر وخيارات المراجعة
// ───────────────────────────────────────────────────────

async function handleIncomingMessage(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!jid || !jid.endsWith("@g.us")) return;

    if (message.key.fromMe) return;

    const sender = message.key.participant || message.participant;
    if (!sender) return;

    const text = getMessageText(message);
    if (!text) return;

    const command = text.trim().replace(/^\./, "").trim();
    const groupState = getGroupState(jid);

    // الأوامر الإدارية متاحة للنخبة فقط.
    if (command === "مراقبه شغل" || command === "مراقبه طفي") {
        if (!isElite(sender) && !isBot(sender, sock)) {
            await sendText(sock, jid, "⛔ هذا الأمر مخصص لأعضاء النخبة.");
            return;
        }

        if (command === "مراقبه شغل") {
            groupState.active = true;
            groupState.waitingChoice = false;
            groupState.pendingSince = 0;
            groupState.lastEvent = null;

            saveState();

            await sendText(
                sock,
                jid,
                "✅ *تم تشغيل مراقبة الإشراف بنجاح.*\n\nسيتم تنبيه النخبة عند رصد تغيير في صلاحيات المشرفين."
            );
        } else {
            groupState.active = false;
            groupState.waitingChoice = false;
            groupState.pendingSince = 0;
            groupState.lastEvent = null;

            saveState();

            await sendText(sock, jid, "🛑 *تم إيقاف مراقبة الإشراف.*");
        }

        return;
    }

    if (!groupState.waitingChoice) return;
    if (!isElite(sender) && !isBot(sender, sock)) return;

    // تنتهي صلاحية الاختيار بعد 10 دقائق.
    if (
        groupState.pendingSince &&
        Date.now() - groupState.pendingSince > 10 * 60 * 1000
    ) {
        groupState.waitingChoice = false;
        groupState.pendingSince = 0;
        groupState.lastEvent = null;
        saveState();

        await sendText(sock, jid, "⌛ انتهت مهلة المراجعة. أرسل أمرًا جديدًا عند الحاجة.");
        return;
    }

    if (command === "1") {
        if (processingGroups.has(jid)) return;

        processingGroups.add(jid);

        // أغلق الطلب الحالي قبل التنفيذ لمنع التكرار.
        groupState.waitingChoice = false;
        groupState.pendingSince = 0;
        groupState.lastEvent = null;
        saveState();

        try {
            await executeReview(sock, jid);
        } catch (error) {
            console.error("[MONITOR] فشلت المراجعة:", error);

            await sendText(
                sock,
                jid,
                "❌ تعذرت مراجعة المجموعة. تحقق من صلاحيات البوت ثم أعد المحاولة."
            );
        } finally {
            processingGroups.delete(jid);
        }

        return;
    }

    if (command === "2") {
        groupState.waitingChoice = false;
        groupState.pendingSince = 0;
        groupState.lastEvent = null;

        saveState();

        await sendText(
            sock,
            jid,
            "✅ تم إلغاء المراجعة الحالية. إعداد المراقبة لم يتغير."
        );
    }
}

// ───────────────────────────────────────────────────────
// تهيئة المستمعين مرة لكل اتصال
// ───────────────────────────────────────────────────────

function initMonitorListener(sock) {
    if (!sock || !sock.ev || typeof sock.ev.on !== "function") {
        throw new Error("[MONITOR] socket أو event emitter غير صالح.");
    }

    // WeakSet يمنع تكرار المستمعين على نفس socket،
    // ويسمح بتسجيلهم مجددًا على socket جديد بعد إعادة الاتصال.
    if (initializedSockets.has(sock)) return;

    initializedSockets.add(sock);

    sock.ev.on("group-participants.update", update => {
        handleParticipantUpdate(sock, update).catch(error => {
            console.error("[MONITOR] خطأ في مراقبة الإشراف:", error);
        });
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const message of messages || []) {
            try {
                await handleIncomingMessage(sock, message);
            } catch (error) {
                console.error("[MONITOR] خطأ في معالجة الرسالة:", error);
            }
        }
    });

    console.log("[MONITOR] ARTHUR MONITOR ELITE initialized.");
}

module.exports = {
    initMonitorListener,
    isElite,
    loadState,
    saveState
};