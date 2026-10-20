import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
const monitorFile = path.join(dataDir, "monitorState.json");

const eliteFiles = [
  path.join(dataDir, "النخبة.json"),
  path.join(dataDir, "النخبه.json"),
  path.join(dataDir, "النخبة"),
  path.join(dataDir, "النخبه")
];

fs.mkdirSync(dataDir, { recursive: true });

const initializedSockets = new WeakSet();
const cooldown = new Map();
const processingGroups = new Set();
const pendingActions = new Map();

const BRAND = "🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸";
const FRAME = "◇❐ ═━━━━━━━╾ 🩸 ╼━━━━━━━═ ❐◇";

// ─────────────────────────────────────────
// حفظ الحالة وقراءتها
// ─────────────────────────────────────────

function loadState() {
  try {
    if (!fs.existsSync(monitorFile)) return {};

    const parsed = JSON.parse(fs.readFileSync(monitorFile, "utf8"));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("صيغة ملف الحالة غير صحيحة");
    }

    return parsed;
  } catch (error) {
    console.error("[ARTHUR MONITOR] خطأ قراءة الحالة:", error.message);
    return {};
  }
}

function saveState(state) {
  const tempFile = `${monitorFile}.tmp`;

  try {
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempFile, monitorFile);
    return true;
  } catch (error) {
    console.error("[ARTHUR MONITOR] خطأ حفظ الحالة:", error.message);

    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}

    return false;
  }
}

function getGroupState(state, jid) {
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

// ─────────────────────────────────────────
// قراءة قائمة النخبة
// ─────────────────────────────────────────

function normalizeId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function collectEliteIds(value, output = []) {
  if (typeof value === "string" || typeof value === "number") {
    const id = normalizeId(String(value));
    if (id) output.push(id);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectEliteIds(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = normalizeId(key);

      if (/^\d{5,20}$/.test(normalizedKey) || normalizedKey.includes("@")) {
        output.push(normalizedKey);
      }

      collectEliteIds(item, output);
    }
  }

  return output;
}

function getEliteIds() {
  const ids = [];

  for (const file of eliteFiles) {
    if (!fs.existsSync(file)) continue;

    try {
      collectEliteIds(JSON.parse(fs.readFileSync(file, "utf8")), ids);
    } catch (error) {
      console.error("[ARTHUR MONITOR] ملف نخبة غير صالح:", file, error.message);
    }
  }

  return [...new Set(ids)];
}

function isElite(userJid) {
  const id = normalizeId(userJid);
  if (!id) return false;

  const eliteIds = getEliteIds();

  if (eliteIds.includes(id)) return true;

  // مطابقة أرقام الهاتف فقط مع هويات الهاتف.
  if (id.endsWith("@s.whatsapp.net")) {
    const number = id.split("@")[0].split(":")[0];

    return eliteIds.some(entry => {
      if (entry.endsWith("@s.whatsapp.net")) {
        return entry.split("@")[0].split(":")[0] === number;
      }

      return /^\d{5,20}$/.test(entry) && entry === number;
    });
  }

  return false;
}

function getBotIds(sock) {
  return [sock?.user?.id, sock?.user?.lid]
    .map(normalizeId)
    .filter(Boolean);
}

function isBot(userJid, sock) {
  const id = normalizeId(userJid);
  if (!id) return false;

  const botIds = getBotIds(sock);

  if (botIds.includes(id)) return true;

  if (id.endsWith("@s.whatsapp.net")) {
    const number = id.split("@")[0].split(":")[0];

    return botIds.some(botId =>
      botId.endsWith("@s.whatsapp.net") &&
      botId.split("@")[0].split(":")[0] === number
    );
  }

  return false;
}

// ─────────────────────────────────────────
// الرسائل والردود
// ─────────────────────────────────────────

async function sendText(sock, jid, text, quoted, mentions = []) {
  return sock.sendMessage(
    jid,
    {
      text: `${BRAND}\n${FRAME}\n\n${text}`,
      mentions
    },
    quoted ? { quoted } : {}
  );
}

function getMessageBody(message) {
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

// ─────────────────────────────────────────
// إعادة توازن الإشراف بعد حدث promote/demote
// ─────────────────────────────────────────

async function restoreEliteAdmins(sock, groupId) {
  const metadata = await sock.groupMetadata(groupId);
  const participants = metadata.participants || [];

  const botAdmin = participants.some(
    p => isBot(p.id, sock) && Boolean(p.admin)
  );

  if (!botAdmin) {
    throw new Error("البوت ليس مشرفًا في المجموعة");
  }

  const eliteAdmins = participants.filter(
    p => isElite(p.id) && !p.admin && !isBot(p.id, sock)
  );

  // لا تُنزِل مشرفين تلقائيًا؛ فقط حاول إعادة ترقية أعضاء النخبة.
  const results = [];

  for (const participant of eliteAdmins) {
    try {
      const result = await sock.groupParticipantsUpdate(
        groupId,
        [participant.id],
        "promote"
      );

      results.push({
        id: participant.id,
        success: true,
        result
      });
    } catch (error) {
      results.push({
        id: participant.id,
        success: false,
        error: error.message
      });
    }
  }

  return {
    totalParticipants: participants.length,
    totalAdmins: participants.filter(p => p.admin).length,
    eliteAdmins: participants.filter(p => isElite(p.id) && p.admin).length,
    promotionAttempts: results.length,
    failedPromotions: results.filter(r => !r.success)
  };
}

// ─────────────────────────────────────────
// التقرير والتصفية المؤكدة
// ─────────────────────────────────────────

async function executeClean(sock, groupId) {
  const metadata = await sock.groupMetadata(groupId);
  const participants = metadata.participants || [];

  const owner = metadata.owner || metadata.subjectOwner || null;

  const toRemove = participants
    .filter(p =>
      !isElite(p.id) &&
      !isBot(p.id, sock) &&
      p.id !== owner
    )
    .map(p => p.id);

  if (!toRemove.length) {
    await sendText(sock, groupId, "✅ لا توجد حسابات مؤهلة للتصفية.");
    return;
  }

  const state = loadState();
  const config = getGroupState(state, groupId);

  config.waitingChoice = false;
  config.pendingSince = 0;
  config.lastEvent = null;

  saveState(state);

  pendingActions.set(groupId, {
    type: "clean",
    ids: toRemove,
    expiresAt: Date.now() + 2 * 60 * 1000
  });

  await sendText(
    sock,
    groupId,
    [
      "⚠️ *تأكيد التصفية الجماعية*",
      "",
      `👥 عدد الأعضاء المستهدفين: ${toRemove.length}`,
      "",
      "لن يتم طرد أي عضو حتى تؤكد النخبة:",
      "اكتب `تأكيد التصفية` للتنفيذ.",
      "اكتب `إلغاء التصفية` للإلغاء.",
      "",
      "⏳ تنتهي صلاحية التأكيد بعد دقيقتين."
    ].join("\n")
  );
}

async function handleParticipantUpdate(sock, update) {
  const groupId = update?.id;

  if (!groupId?.endsWith("@g.us")) return;
  if (!["promote", "demote"].includes(update.action)) return;

  const state = loadState();
  const config = state[groupId];

  if (!config?.active) return;

  const targets = (update.participants || [])
    .map(p => typeof p === "string" ? p : p?.id)
    .filter(Boolean);

  const key = [
    groupId,
    update.action,
    [...targets].sort().join(","),
    update.author || ""
  ].join("|");

  if (cooldown.has(key)) return;

  cooldown.set(key, Date.now());

  for (const [oldKey, timestamp] of cooldown) {
    if (Date.now() - timestamp > 30000) cooldown.delete(oldKey);
  }

  if (processingGroups.has(groupId)) return;
  processingGroups.add(groupId);

  try {
    const report = await restoreEliteAdmins(sock, groupId);

    const actor = update.author || update.by || "";
    const target = targets[0] || "";

    config.waitingChoice = true;
    config.pendingSince = Date.now();
    config.lastEvent = {
      action: update.action,
      actor,
      targets
    };

    saveState(state);

    const actionName = update.action === "promote"
      ? "رفع عضو إلى مشرف"
      : "إزالة إشراف عضو";

    const mentions = [...new Set([...targets, ...(actor ? [actor] : [])])];

    await sendText(
      sock,
      groupId,
      [
        "🚨 *تم رصد تغيير في الإشراف*",
        "",
        `📌 التغيير: ${actionName}`,
        actor ? `👤 المنفّذ: @${actor.split("@")[0]}` : "👤 المنفّذ: غير معروف",
        target ? `🎯 المستهدف: @${target.split("@")[0]}` : "🎯 المستهدف: غير معروف",
        "",
        `🛡️ محاولات ترقية النخبة: ${report.promotionAttempts}`,
        `⚠️ محاولات فاشلة: ${report.failedPromotions.length}`,
        "",
        "خيارات النخبة:",
        "1️⃣ عرض تقرير المراجعة",
        "2️⃣ إلغاء المراجعة",
        "",
        "⚠️ التصفية الجماعية تحتاج تأكيدًا منفصلًا."
      ].join("\n"),
      null,
      mentions
    );
  } catch (error) {
    console.error("[ARTHUR MONITOR] خطأ في مراقبة الإشراف:", error);

    try {
      await sendText(
        sock,
        groupId,
        "❌ تعذرت معالجة حدث الإشراف. تحقق من صلاحيات البوت وسجل التشغيل."
      );
    } catch {}
  } finally {
    processingGroups.delete(groupId);
  }
}

async function handleMessage(sock, message) {
  if (!message?.message || message.key?.fromMe) return;

  const groupId = message.key?.remoteJid;
  if (!groupId?.endsWith("@g.us")) return;

  const sender = message.key.participant || "";
  if (!sender) return;

  const body = getMessageBody(message);
  if (!body) return;

  const command = body.replace(/^\./, "").trim();

  // تأكيد التصفية أو إلغاؤها
  const pending = pendingActions.get(groupId);

  if (
    pending &&
    Date.now() <= pending.expiresAt &&
    isElite(sender)
  ) {
    if (command === "إلغاء التصفية") {
      pendingActions.delete(groupId);
      await sendText(sock, groupId, "✅ تم إلغاء التصفية.");
      return;
    }

    if (command === "تأكيد التصفية") {
      pendingActions.delete(groupId);

      if (processingGroups.has(groupId)) {
        await sendText(sock, groupId, "⏳ توجد عملية أخرى قيد التنفيذ.");
        return;
      }

      processingGroups.add(groupId);

      try {
        const metadata = await sock.groupMetadata(groupId);
        const current = metadata.participants || [];
        const owner = metadata.owner || metadata.subjectOwner || null;

        const safeTargets = pending.ids.filter(id => {
          const participant = current.find(p => p.id === id);

          return participant &&
            !isElite(id) &&
            !isBot(id, sock) &&
            id !== owner;
        });

        if (safeTargets.length) {
          const results = await sock.groupParticipantsUpdate(
            groupId,
            safeTargets,
            "remove"
          );

          await sendText(
            sock,
            groupId,
            `تم إرسال طلب إزالة ${safeTargets.length} عضو. افحص نتيجة العملية وسجل التشغيل للتأكد من نجاحها.`
          );

          console.log("[ARTHUR MONITOR] نتائج التصفية:", results);
        } else {
          await sendText(sock, groupId, "✅ لم يعد هناك أعضاء مؤهلون للتصفية.");
        }
      } catch (error) {
        console.error("[ARTHUR MONITOR] خطأ التصفية:", error);
        await sendText(sock, groupId, "❌ فشلت التصفية. تحقق من صلاحيات البوت.");
      } finally {
        processingGroups.delete(groupId);
      }

      return;
    }
  }

  const state = loadState();
  const config = getGroupState(state, groupId);

  if (command === "مراقبه شغل" || command === "مراقبه طفي") {
    if (!isElite(sender) && !isBot(sender, sock)) {
      await sendText(sock, groupId, "⛔ هذا الأمر مخصص للنخبة.", message);
      return;
    }

    config.active = command === "مراقبه شغل";
    config.waitingChoice = false;
    config.pendingSince = 0;
    config.lastEvent = null;

    saveState(state);

    await sendText(
      sock,
      groupId,
      config.active
        ? "✅ تم تشغيل مراقبة الإشراف."
        : "🛑 تم إيقاف مراقبة الإشراف.",
      message
    );

    return;
  }

  if (!config.waitingChoice) return;
  if (!isElite(sender) && !isBot(sender, sock)) return;

  if (
    config.pendingSince &&
    Date.now() - config.pendingSince > 10 * 60 * 1000
  ) {
    config.waitingChoice = false;
    config.pendingSince = 0;
    config.lastEvent = null;
    saveState(state);

    await sendText(sock, groupId, "⌛ انتهت مهلة المراجعة.");
    return;
  }

  if (command === "1") {
    config.waitingChoice = false;
    config.pendingSince = 0;
    config.lastEvent = null;

    saveState(state);

    const metadata = await sock.groupMetadata(groupId);
    const participants = metadata.participants || [];
    const admins = participants.filter(p => p.admin);
    const outsideElite = admins.filter(
      p => !isElite(p.id) && !isBot(p.id, sock)
    );

    await sendText(
      sock,
      groupId,
      [
        "👑 *تقرير مراجعة الإشراف*",
        "",
        `👥 أعضاء المجموعة: ${participants.length}`,
        `🛡️ إجمالي المشرفين: ${admins.length}`,
        `👑 مشرفو النخبة: ${admins.filter(p => isElite(p.id)).length}`,
        `📋 مشرفون خارج النخبة: ${outsideElite.length}`,
        "",
        "لم يتم طرد أي عضو. إذا أردت التصفية، استخدم أمر التصفية المؤكد بشكل منفصل."
      ].join("\n")
    );

    return;
  }

  if (command === "2") {
    config.waitingChoice = false;
    config.pendingSince = 0;
    config.lastEvent = null;

    saveState(state);

    await sendText(sock, groupId, "✅ تم إلغاء المراجعة دون تغيير إعداد المراقبة.");
  }
}

// ─────────────────────────────────────────
// تسجيل المستمعين
// ─────────────────────────────────────────

export function initMonitorListener(sock) {
  if (!sock?.ev || typeof sock.ev.on !== "function") {
    throw new Error("[ARTHUR MONITOR] اتصال Baileys غير صالح.");
  }

  if (initializedSockets.has(sock)) return;
  initializedSockets.add(sock);

  sock.ev.on("group-participants.update", update => {
    handleParticipantUpdate(sock, update).catch(error => {
      console.error("[ARTHUR MONITOR] خطأ الحدث:", error);
    });
  });

  sock.ev.on("messages.upsert", async ({ messages = [] }) => {
    for (const message of messages) {
      try {
        await handleMessage(sock, message);
      } catch (error) {
        console.error("[ARTHUR MONITOR] خطأ الرسالة:", error);
      }
    }
  });

  console.log("[ARTHUR MONITOR] Listener initialized.");
}

// ─────────────────────────────────────────
// الإضافة والأمر الأصلي
// ─────────────────────────────────────────

export default {
  command: "مراقبه",
  description: "مراقبة تغييرات الإشراف مع تقرير للنخبة",
  category: "الحماية",

  execute: async (sock, msg, data) => {
    try {
      initMonitorListener(sock);

      const jid = data?.jid || msg?.key?.remoteJid;

      if (!jid?.endsWith("@g.us")) {
        return sock.sendMessage(
          jid || msg?.key?.remoteJid,
          { text: "❌ الأمر للمجموعات فقط." },
          { quoted: msg }
        );
      }

      const rawText = typeof data?.text === "string"
        ? data.text.trim()
        : "";

      const args = rawText
        ? rawText.split(/\s+/).slice(1)
        : [];

      const state = loadState();
      const config = getGroupState(state, jid);
      const action = (args[0] || "").toLowerCase();

      if (!action) {
        return sock.sendMessage(
          jid,
          {
            text: [
              `${BRAND}`,
              "",
              config.active ? "🟢 المراقب مفعل." : "🔴 المراقب متوقف.",
              "",
              "صيغة الأمر:",
              ".مراقبه شغل",
              ".مراقبه طفي"
            ].join("\n")
          },
          { quoted: msg }
        );
      }

      const sender = msg?.key?.participant || "";

      if (!isElite(sender) && !isBot(sender, sock)) {
        return sock.sendMessage(
          jid,
          { text: "⛔ هذا الأمر مخصص للنخبة." },
          { quoted: msg }
        );
      }

      if (action === "طفي") {
        config.active = false;
        config.waitingChoice = false;
        config.pendingSince = 0;
        config.lastEvent = null;

        saveState(state);
        pendingActions.delete(jid);

        return sock.sendMessage(
          jid,
          { text: "🛑 تم إيقاف المراقب." },
          { quoted: msg }
        );
      }

      if (action === "شغل") {
        if (config.active) {
          return sock.sendMessage(
            jid,
            { text: "⚠️ المراقب مفعل مسبقًا." },
            { quoted: msg }
          );
        }

        config.active = true;
        config.waitingChoice = false;
        config.pendingSince = 0;
        config.lastEvent = null;

        saveState(state);

        return sock.sendMessage(
          jid,
          {
            text: [
              "✅ تم تشغيل المراقب بنجاح.",
              "",
              "🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐆𝐔𝐀𝐑𝐃",
              "⚠️ انتبه من الخيانة."
            ].join("\n")
          },
          { quoted: msg }
        );
      }

      return sock.sendMessage(
        jid,
        { text: "❌ خيار غير معروف.\nاستخدم: شغل أو طفي." },
        { quoted: msg }
      );
    } catch (error) {
      console.error("[ARTHUR MONITOR] خطأ الأمر:", error);

      try {
        await sock.sendMessage(
          data?.jid || msg?.key?.remoteJid,
          { text: "❌ حدث خطأ أثناء تنفيذ أمر المراقبة." },
          { quoted: msg }
        );
      } catch {}
    }
  }
};