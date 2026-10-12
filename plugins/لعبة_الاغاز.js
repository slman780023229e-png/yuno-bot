import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  addProgress,
  getAccount,
  save,
  registerGame,
  userId,
  chatId
} from "../utils/arthurBankCore.js";

import {
  registerActiveGame,
  unregisterActiveGame,
  hasActiveGameType
} from "../utils/arthurGameSessions.js";

import { getItemCount, consumeStoreItem, grantStoreItem } from "../utils/arthurStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../ذكاء");
const active = new Map();
const recentByChat = new Map();
const lastStart = new Map();

registerGame("arthur_riddles", {
  name: "ARTHUR Riddles",
  description: "ألغاز ذكية بإجابات مباشرة",
  enabled: true
});

registerGame("arthur_traps", {
  name: "ARTHUR Traps",
  description: "أسئلة فخاخ تحتاج إلى الانتباه",
  enabled: true
});

function getText(msg) {
  let message = msg?.message || {};

  for (let i = 0; i < 5; i++) {
    const wrapped =
      message.ephemeralMessage?.message ||
      message.viewOnceMessage?.message ||
      message.viewOnceMessageV2?.message ||
      message.documentWithCaptionMessage?.message;

    if (!wrapped) break;
    message = wrapped;
  }

  return String(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  ).trim();
}

function cleanCommand(text) {
  return String(text || "").trim().replace(/^[.!/#]+/, "").trim();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}%+-]+/gu, "")
    .trim();
}

async function loadFlexible(baseName) {
  const jsPath = path.join(DATA_DIR, `${baseName}.js`);
  const jsonPath = path.join(DATA_DIR, `${baseName}.json`);

  let jsExists = false;
  try {
    await fs.access(jsPath);
    jsExists = true;
  } catch {}

  if (jsExists) {
    const url = pathToFileURL(jsPath);
    url.searchParams.set("reload", String(Date.now()));
    const module = await import(url.href);

    if (module.default === undefined) {
      throw new Error(`${baseName}.js يجب أن يستخدم export default`);
    }

    return module.default;
  }

  return JSON.parse(await fs.readFile(jsonPath, "utf8"));
}

async function react(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key }
    });
  } catch (error) {
    console.error("[ARTHUR RIDDLES] Reaction error:", error?.message || error);
  }
}

async function send(sock, chat, text, options = {}) {
  try {
    return await sock.sendMessage(chat, { text }, options);
  } catch (error) {
    console.error("[ARTHUR RIDDLES] Send error:", error?.message || error);
    return null;
  }
}

function matches(text, answers) {
  const submitted = normalize(text);
  return Boolean(submitted) && answers.some(answer => normalize(answer) === submitted);
}

function parseHintRequest(raw) {
  const cleaned = cleanCommand(raw).replace(/\s+/g, " ");
  const normalized = normalize(cleaned);
  const match = normalized.match(/^تلميح([123])?$/);
  if (match) return { isHint: true, tier: match[1] ? Number(match[1]) : 0 };
  if (normalized === "لغزتلميح") return { isHint: true, tier: 1 };
  return { isHint: false, tier: 0 };
}

function hintStoreId(tier) {
  return ({ 1: "hint_light", 2: "hint_medium", 3: "hint_strong" })[tier] || null;
}

function buildHint(item, tier) {
  const answer = String(item?.answers?.[0] ?? "").trim();
  const letters = [...answer.replace(/\s+/g, "")];
  if (tier === 1) {
    const clue = String(item?.hint || item?.category || item?.topic || "").trim();
    return clue || "فكّر في صياغة اللغز، فقد تكون الكلمة الأساسية هي المفتاح.";
  }
  if (!letters.length) return "اقرأ اللغز ببطء وانتبه للكلمات التي قد تحمل معنى مزدوجًا.";
  if (tier === 2) {
    return `الإجابة تبدأ بحرف «${letters[0]}»، وتتكوّن من ${letters.length} حرفًا دون احتساب المسافات.`;
  }
  const revealCount = Math.min(letters.length, Math.max(1, Math.ceil(letters.length * 0.6)));
  const revealed = letters.slice(0, revealCount).join("");
  return letters.length <= 2
    ? `الإجابة تبدأ بـ «${revealed}». حاول إكمالها.`
    : `بداية الإجابة: «${revealed}…» (${letters.length} حرفًا دون المسافات).`;
}

async function handleHintRequest(sock, chat, id, raw, game, msg) {
  const request = parseHintRequest(raw);
  if (!request.isHint) return false;
  if (!request.tier) {
    await send(sock, chat,
      "💡 متجر التلميحات — اختر القوة المناسبة:\n\n" +
      "1️⃣ تلميح خفيف — 100 ذهب في المتجر\n" +
      "2️⃣ تلميح متوسط — 250 ذهب في المتجر\n" +
      "3️⃣ تلميح قوي — 500 ذهب في المتجر\n\n" +
      "الشراء: .متجر شراء 1 أو 2 أو 3\n" +
      "بعد الشراء اكتب: تلميح 1 أو تلميح 2 أو تلميح 3\n" +
      "التلميح يُستهلك من حقيبتك ويصل إليك على الخاص."
    );
    return true;
  }
  if (!game?.item) {
    await send(sock, chat, "💡 لا يوجد لغز نشط الآن. اكتب «الغاز» أو «فخ» لبدء اللعب.");
    return true;
  }
  if (!game.hintsUsed) game.hintsUsed = new Map();
  if (!game.hintsUsed.has(id)) game.hintsUsed.set(id, new Set());
  const used = game.hintsUsed.get(id);
  if (used.has(request.tier)) {
    await send(sock, chat, "استخدمت هذا المستوى من التلميح في اللغز الحالي. يمكنك اختيار مستوى آخر.");
    return true;
  }
  const itemId = hintStoreId(request.tier);
  const owned = getItemCount(id, itemId);
  if (owned < 1) {
    await send(sock, chat, `❌ لا تملك هذا التلميح في حقيبتك. اشتره من المتجر: .متجر\n🛒 الشراء: .متجر شراء ${request.tier} 1`);
    return true;
  }
  const consumed = consumeStoreItem(id, itemId, 1);
  if (!consumed.ok) {
    await send(sock, chat, "❌ لم أتمكن من استخدام العنصر. افتح حقيبتك وتأكد من رصيدها.");
    return true;
  }
  const names = { 1: "خفيف", 2: "متوسط", 3: "قوي" };
  try {
    await sock.sendMessage(id, {
      text: `💡 تلميح ${names[request.tier]} من حقيبتك\n\n${buildHint(game.item, request.tier)}\n\n🎒 المتبقي من هذا التلميح: ${consumed.remaining}`
    });
    used.add(request.tier);
    await send(sock, chat, `💡 أرسلت لك التلميح ${names[request.tier]} على الخاص، واستُخدمت قطعة واحدة من حقيبتك.`);
  } catch (error) {
    grantStoreItem(id, itemId, 1);
    await send(sock, chat, "❌ تعذر إرسال التلميح على الخاص. أُعيد العنصر إلى حقيبتك.");
  }
  return true;
}

async function startRiddle(sock, msg, context, type) {
  const chat = chatId(msg, context) || msg.key.remoteJid;
  if (!chat) return;

  if (hasActiveGameType(chat, "intelligence")) {
    await send(sock, chat, "⚠️ يوجد تحدي ذكاء نشط في هذه المجموعة. أكملوا التحدي قبل بدء لغز جديد.");
    return;
  }

  if (active.has(chat)) {
    await send(sock, chat, "🧩 يوجد لغز نشط بالفعل. حاول حله أولًا أو اكتب «لغز تلميح» لعرض التلميح.");
    return;
  }

  const last = lastStart.get(chat) || 0;
  if (Date.now() - last < 2500) return;
  lastStart.set(chat, Date.now());

  let riddles;

  try {
    riddles = await loadFlexible("الغاز_100_مرحلة");
  } catch (error) {
    console.error("[ARTHUR RIDDLES] Data load error:", error?.stack || error);
    await send(sock, chat, "❌ تعذر قراءة plugins/ذكاء/الغاز_100_مرحلة.json أو ملف JS البديل.");
    return;
  }

  if (!Array.isArray(riddles)) {
    await send(sock, chat, "❌ ملف الألغاز يجب أن يحتوي على مصفوفة.");
    return;
  }

  const pool = riddles.filter(item =>
    item &&
    typeof item.question === "string" &&
    Array.isArray(item.answers) &&
    item.answers.length &&
    (type === "all" || item.type === type)
  );

  if (!pool.length) {
    await send(sock, chat, "لا توجد أسئلة من هذا النوع في ملف الألغاز.");
    return;
  }

  const recent = recentByChat.get(chat) || [];
  let candidates = pool.filter(item => !recent.includes(item.id));
  if (!candidates.length) candidates = pool.slice();

  const item = candidates[Math.floor(Math.random() * candidates.length)];
  const sessionId = `${chat}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const gameId = item.type === "فخ" ? "arthur_traps" : "arthur_riddles";

  const game = {
    item,
    chat,
    sessionId,
    gameId,
    type: item.type,
    attempted: new Set(),
    hintsUsed: new Map(),
    startedAt: Date.now(),
    timer: null
  };

  active.set(chat, game);
  registerActiveGame(chat, `riddle:${sessionId}`, "riddle");

  const history = [...recent, item.id].slice(-25);
  recentByChat.set(chat, history);

  await send(sock, chat,
    `╭━━━〔 ${item.type === "فخ" ? "🪤 تحدي الفخاخ" : "🧩 لغز ARTHUR"} 〕━━━╮\n\n` +
    `❓ ${item.question}\n\n` +
    `🏆 الجائزة: ${item.type === "فخ" ? "150 ذهب + 25 نقطة" : "100 ذهب + 15 نقطة"}\n` +
    `✍️ أرسل الإجابة مباشرة دون أمر.\n` +
    `💡 للتلميح المدفوع: تلميح ثم تلميح 1/2/3\n` +
    `⏳ أمامكم 60 ثانية.\n` +
    `╰━━━━━━━━━━━━━━━━━━╯`
  );

  game.timer = setTimeout(async () => {
    if (active.get(chat) !== game) return;
    active.delete(chat);
    unregisterActiveGame(chat, `riddle:${sessionId}`);

    await send(sock, chat,
      `⌛ انتهى وقت اللغز!\nالإجابة: ${item.answers[0]}`
    );
  }, 60_000);
}

async function handleMessage(sock, msg, context = {}) {
  if (!msg?.key || msg.key.fromMe) return;

  const chat = chatId(msg, context) || msg.key.remoteJid;
  const id = userId(msg, context);
  const raw = getText(msg);

  if (!chat || !id || !raw) return;

  const command = cleanCommand(raw);
  const normalizedCommand = normalize(command);
  const prefixed = /^[.!/#]/.test(raw);

  if (parseHintRequest(raw).isHint) {
    await handleHintRequest(sock, chat, id, raw, active.get(chat), msg);
    return { handled: true };
  }

  if (["لغز", "الغاز", "فخ", "فخاخ"].includes(normalizedCommand)) {
    const type = ["فخ", "فخاخ"].includes(normalizedCommand)
      ? "فخ"
      : normalizedCommand === "لغز" || normalizedCommand === "الغاز"
        ? (normalizedCommand === "الغاز" ? "all" : "لغز")
        : "all";

    await startRiddle(sock, msg, context, type);
    return { handled: true };
  }

  const game = active.get(chat);
  if (!game) return;

  // Let other bot commands work while a riddle is active.
  if (prefixed) return;

  if (game.attempted.has(id)) return { handled: true };
  game.attempted.add(id);

  if (!matches(raw, game.item.answers)) {
    await react(sock, msg, "❌");
    return { handled: true };
  }

  active.delete(chat);
  clearTimeout(game.timer);
  unregisterActiveGame(chat, `riddle:${game.sessionId}`);
  await react(sock, msg, "✅");

  const rewards = game.type === "فخ"
    ? { gold: 150, points: 25, xp: 30 }
    : { gold: 100, points: 15, xp: 20 };

  const outcome = addProgress(id, {
    ...rewards,
    win: true,
    idempotencyKey: `${game.gameId}:${game.sessionId}:${id}`
  });

  await send(sock, chat,
    `🎉 إجابة صحيحة!\n` +
    `🏆 حصلت على ${outcome.duplicate ? 0 : rewards.gold} ذهب\n` +
    `⭐ حصلت على ${outcome.duplicate ? 0 : rewards.points} نقطة\n` +
    `✨ حصلت على ${outcome.duplicate ? 0 : rewards.xp} خبرة\n\n` +
    `الإجابة: ${game.item.answers[0]}`,
    { quoted: msg }
  );

  return { handled: true };
}

export default {
  name: "arthur-riddles-traps",
  command: ["لغز", "الغاز", "فخ", "فخاخ"],
  aliases: ["riddle", "trap"],
  category: "games",
  description: "ألغاز وفخاخ مع إجابة مباشرة وتفاعل ومكافآت البنك.",

  async execute(sock, msg, context = {}) {
    return await handleMessage(sock, msg, context);
  },

  async onMessage(sock, msg, context = {}) {
    return await handleMessage(sock, msg, context);
  }
};
