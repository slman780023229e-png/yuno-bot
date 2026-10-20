import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "monitorState.json");

const ELITE_FILES = [
    "النخبة.json",
    "النخبه.json",
    "النخبة",
    "النخبه"
];

const BRAND = "🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸";
const listeners = new WeakSet();
const pendingGroups = new Set();

fs.mkdirSync(DATA_DIR, { recursive: true });

function readState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        return parsed && !Array.isArray(parsed) && typeof parsed === "object"
            ? parsed
            : {};
    } catch (error) {
        console.error("[ARTHUR MONITOR] قراءة الحالة فشلت:", error.message);
        return {};
    }
}

let state = readState();

function saveState() {
    const temp = `${STATE_FILE}.tmp`;

    try {
        fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
        fs.renameSync(temp, STATE_FILE);
        return true;
    } catch (error) {
        console.error("[ARTHUR MONITOR] حفظ الحالة فشل:", error.message);
        try {
            if (fs.existsSync(temp)) fs.unlinkSync(temp);
        } catch {}
        return false;
    }
}

function normalize(value) {
    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";
}

function collectIds(value, result = []) {
    if (typeof value === "string" || typeof value === "number") {
        const id = normalize(String(value));
        if (id) result.push(id);
        return result;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectIds(item, result);
        return result;
    }

    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            const k = normalize(key);

            if (/^\d{5,20}$/.test(k) || k.includes("@")) {
                result.push(k);
            }

            collectIds(item, result);
        }
    }

    return result;
}

function getEliteIds() {
    const ids = [];

    for (const name of ELITE_FILES) {
        const file = path.join(DATA_DIR, name);
        if (!fs.existsSync(file)) continue;

        try {
            collectIds(JSON.parse(fs.readFileSync(file, "utf8")), ids);
        } catch (error) {
            console.error(`[ARTHUR MONITOR] ملف النخبة ${name}:`, error.message);
        }
    }

    return [...new Set(ids)];
}

function isElite(jid) {
    const id = normalize(jid);
    if (!id) return false;

    const elites = getEliteIds();

    if (elites.includes(id)) return true;

    // مطابقة رقم الهاتف فقط مع هوية هاتف، وليس مع LID.
    if (id.endsWith("@s.whatsapp.net")) {
        const phone = id.split("@")[0].split(":")[0];

        return elites.some(entry => {
            if (entry.endsWith("@s.whatsapp.net")) {
                return entry.split("@")[0].split(":")[0] === phone;
            }
            return /^\d{5,20}$/.test(entry) && entry === phone;
        });
    }

    return false;
}

function isBot(jid, sock) {
    const id = normalize(jid);
    const botIds = [sock?.user?.id, sock?.user?.lid]
        .map(normalize)
        .filter(Boolean);

    if (botIds.includes(id)) return true;

    if (id.endsWith("@s.whatsapp.net")) {
        const phone = id.split("@")[0].split(":")[0];

        return botIds.some(botId =>
            botId.endsWith("@s.whatsapp.net") &&
            botId.split("@")[0].split(":")[0] === phone
        );
    }

    return false;
}

function getGroupState(jid) {
    if (!state[jid] || typeof state[jid] !== "object") {
        state[jid] = {
            active: false,
            waitingChoice: false,
            pendingSince: 0
        };
    }

    return state[jid];
}

function getText(message) {
    let content = message?.message;

    for (let i = 0; i < 8 && content; i++) {
        const wrapper =
            content.ephemeralMessage ||
            content.viewOnceMessage ||
            content.viewOnceMessageV2 ||
            content.documentWithCaptionMessage;

        if (!wrapper?.message) break;
        content = wrapper.message;
    }

    return (
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption ||
        content?.buttonsResponseMessage?.selectedButtonId ||
        content?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ""
    ).trim();
}

async function reply(sock, jid, text, mentions = []) {
    return sock.sendMessage(jid, {
        text: `${BRAND}\n◇❐ ═━━━━━━━╾ 🩸 ╼━━━━━━━═ ❐◇\n\n${text}`,
        mentions
    });
}

async function reviewGroup(sock, jid) {
    const metadata = await sock.groupMetadata(jid);
    const participants = metadata.participants || [];
    const admins = participants.filter(p => p.admin);
    const eliteAdmins = admins.filter(p => isElite(p.id));
    const otherAdmins = admins.filter(
        p => !isElite(p.id) && !isBot(p.id, sock)
    );

    const lines = [
        "👑 *تقرير مراجعة الإشراف*",
        "",
        `👥 أعضاء المجموعة: ${participants.length}`,
        `🛡️ المشرفون: ${admins.length}`,
        `👑 مشرفو النخبة: ${eliteAdmins.length}`,
        `📋 مشرفون خارج النخبة: ${otherAdmins.length}`,
        "",
        "لم يتم طرد أي عضو أو تغيير صلاحياته."
    ];

    if (otherAdmins.length) {
        lines.push("", "*المشرفون خارج النخبة:*");

        for (const admin of otherAdmins.slice(0, 30)) {
            lines.push(`• @${admin.id.split("@")[0]}`);
        }
    }

    await reply(
        sock,
        jid,
        lines.join("\n"),
        otherAdmins.slice(0, 30).map(p => p.id)
    );
}

async function onParticipantUpdate(sock, update) {
    const jid = update?.id;

    if (!jid?.endsWith("@g.us")) return;
    if (!["promote", "demote"].includes(update.action)) return;

    const config = getGroupState(jid);
    if (!config.active) return;

    const action = update.action === "promote"
        ? "رفع عضو إلى مشرف"
        : "إزالة إشراف عضو";

    const targets = (update.participants || [])
        .map(p => typeof p === "string" ? p : p?.id)
        .filter(Boolean);

    config.waitingChoice = true;
    config.pendingSince = Date.now();
    saveState();

    const actor = update.author;
    const mentions = [...new Set([...targets, ...(actor ? [actor] : [])])];

    await reply(sock, jid, [
        "⚠️ *تم رصد تغيير في الإشراف*",
        "",
        `📌 التغيير: ${action}`,
        actor ? `👤 المنفّذ: @${actor.split("@")[0]}` : "👤 المنفّذ: غير معروف",
        targets.length
            ? `🎯 المستهدف: ${targets.map(id => `@${id.split("@")[0]}`).join("، ")}`
            : "🎯 المستهدف: غير معروف",
        "",
        "👑 *اختر الإجراء:*",
        "1️⃣ مراجعة المشرفين وإرسال تقرير",
        "2️⃣ إلغاء المراجعة",
        "",
        "⏳ الرد متاح للنخبة فقط لمدة 10 دقائق."
    ].join("\n"), mentions);
}

async function onMessage(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!jid?.endsWith("@g.us")) return;
    if (message.key.fromMe) return;

    const sender = message.key.participant;
    if (!sender) return;

    const text = getText(message).trim();
    if (!text) return;

    const command = text.replace(/^\./, "").trim();
    const config = getGroupState(jid);

    if (command === "مراقبه شغل" || command === "مراقبه طفي") {
        if (!isElite(sender) && !isBot(sender, sock)) {
            await reply(sock, jid, "⛔ هذا الأمر مخصص للنخبة.");
            return;
        }

        config.active = command === "مراقبه شغل";
        config.waitingChoice = false;
        config.pendingSince = 0;
        saveState();

        await reply(
            sock,
            jid,
            config.active
                ? "✅ تم تشغيل مراقبة الإشراف."
                : "🛑 تم إيقاف مراقبة الإشراف."
        );
        return;
    }

    if (!config.waitingChoice) return;
    if (!isElite(sender) && !isBot(sender, sock)) return;

    if (Date.now() - config.pendingSince > 10 * 60 * 1000) {
        config.waitingChoice = false;
        config.pendingSince = 0;
        saveState();
        await reply(sock, jid, "⌛ انتهت مهلة الاختيار.");
        return;
    }

    if (command === "2") {
        config.waitingChoice = false;
        config.pendingSince = 0;
        saveState();
        await reply(sock, jid, "✅ أُلغيت المراجعة، وما زالت حالة المراقبة كما هي.");
        return;
    }

    if (command === "1") {
        if (pendingGroups.has(jid)) return;
        pendingGroups.add(jid);

        config.waitingChoice = false;
        config.pendingSince = 0;
        saveState();

        try {
            await reviewGroup(sock, jid);
        } catch (error) {
            console.error("[ARTHUR MONITOR] تعذرت المراجعة:", error);
            await reply(sock, jid, "❌ تعذرت المراجعة. افحص صلاحيات البوت وسجل الأخطاء.");
        } finally {
            pendingGroups.delete(jid);
        }
    }
}

export function initMonitorListener(sock) {
    if (!sock?.ev || typeof sock.ev.on !== "function") {
        throw new Error("[ARTHUR MONITOR] اتصال Baileys غير صالح.");
    }

    if (listeners.has(sock)) return;
    listeners.add(sock);

    sock.ev.on("group-participants.update", update => {
        onParticipantUpdate(sock, update).catch(error => {
            console.error("[ARTHUR MONITOR] خطأ في حدث الإشراف:", error);
        });
    });

    sock.ev.on("messages.upsert", async ({ messages = [] }) => {
        for (const message of messages) {
            try {
                await onMessage(sock, message);
            } catch (error) {
                console.error("[ARTHUR MONITOR] خطأ في الرسالة:", error);
            }
        }
    });

    console.log("🩸 ARTHUR MONITOR: تم تشغيل المستمع بنجاح.");
}