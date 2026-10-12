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
const DATA_DIR_CANDIDATES = [
  path.resolve(__dirname, "../ذكاء"), // preferred: sibling of plugins
  path.resolve(__dirname, "ذكاء")     // compatibility: nested inside plugins
];
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
  for (const dataDir of DATA_DIR_CANDIDATES) {
    const jsPath = path.join(dataDir, `${baseName}.js`);
    const jsonPath = path.join(dataDir, `${baseName}.json`);

    try {
      await fs.access(jsPath);
      const url = pathToFileURL(jsPath);
      url.searchParams.set("reload", String(Date.now()));
      const module = await import(url.href);
      if (module.default === undefined) {
        throw new Error(`${baseName}.js يجب أن يستخدم export default`);
      }
      return module.default;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    try {
      await fs.access(jsonPath);
      return JSON.parse(await fs.readFile(jsonPath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  throw new Error(`لم يتم العثور على ${baseName}.json أو ${baseName}.js في مجلد ذكاء بجانب plugins أو داخله.`);
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
      "1️⃣ تلميح خفيف — 100 جواهر 💎 في المتجر\n" +
      "2️⃣ تلميح متوسط — 250 جواهر 💎 في المتجر\n" +
      "3️⃣ تلميح قوي — 500 جواهر 💎 في المتجر\n\n" +
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


function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clearRiddle(game) {
  if (game?.timer) clearTimeout(game.timer);
  if (game?.chat && game?.sessionId) unregisterActiveGame(game.chat, `riddle:${game.sessionId}`);
  if (game?.chat && active.get(game.chat) === game) active.delete(game.chat);
}

async function finishRiddle(sock, game, reason = "ended") {
  if (!game || active.get(game.chat) !== game) return;
  clearRiddle(game);
  const reasonText = reason === "completed"
    ? `🏆 أكملت جميع مراحل الألغاز حتى المرحلة ${game.stages[game.stages.length - 1]?.number || 1}!`
    : reason === "timeout"
      ? "⌛ انتهى وقت السؤال، وتم إيقاف فعالية الألغاز."
      : "🛑 تم إنهاء فعالية الألغاز وإيقافها.";
  await send(sock, game.chat, `${reasonText}\n\nاكتب «الغاز فردي» للعب وحدك أو «الغاز جماعي» للعب مع الجميع.`);
}

async function sendCurrentRiddle(sock, game) {
  if (active.get(game.chat) !== game) return;
  if (game.stageIndex >= game.stages.length) {
    await finishRiddle(sock, game, "completed");
    return;
  }
  const stage = game.stages[game.stageIndex];
  if (game.questionIndex >= stage.items.length) {
    game.stageIndex++;
    game.questionIndex = 0;
    if (game.stageIndex >= game.stages.length) {
      await finishRiddle(sock, game, "completed");
      return;
    }
    const next = game.stages[game.stageIndex];
    await send(sock, game.chat, `🎉 اجتزتم المرحلة ${stage.number}!\n➡️ المرحلة التالية: ${next.number}`);
    return sendCurrentRiddle(sock, game);
  }

  game.item = stage.items[game.questionIndex];
  game.attempted = new Set();
  game.hintsUsed = new Map();
  game.transitioning = false;
  const mode = game.mode === "solo" ? `👤 فردي — اللاعب: @${game.owner.split("@")[0]}` : "👥 جماعي — الإجابة متاحة للجميع";
  await send(sock, game.chat,
    `╭━━━〔 🧩 مراحل ألغاز ARTHUR 〕━━━╮\n\n` +
    `${mode}\n📚 المرحلة: ${stage.number} / 100\n❓ السؤال: ${game.questionIndex + 1} / ${stage.items.length}\n\n` +
    `${game.item.question}\n\n` +
    `🏆 الجائزة: ${game.type === "فخ" ? "150 جواهر 💎 + 25 نقطة" : "100 جواهر 💎 + 15 نقطة"}\n` +
    `💡 التلميح: تلميح ثم تلميح 1/2/3\n` +
    `🛑 للإيقاف: انهاء أو توقف\n⏳ الوقت: 60 ثانية\n╰━━━━━━━━━━━━━━━━━━╯`,
    game.mode === "solo" ? { mentions: [game.owner] } : {}
  );
  game.questionSentAt = Math.floor(Date.now() / 1000);

  if (game.timer) clearTimeout(game.timer);
  game.timer = setTimeout(async () => {
    if (active.get(game.chat) !== game) return;
    await send(sock, game.chat,
      "⌛ انتهى الوقت، لكن السؤال لم يُحتسب محلولًا. سنعيد السؤال نفسه؛ لن تنتقل للمرحلة التالية إلا بعد إجابة صحيحة."
    );
    // Keep the same question and stage until someone answers correctly.
    await sendCurrentRiddle(sock, game);
  }, 60_000);
}

async function startRiddle(sock, msg, context, type, mode = "group") {
  const chat = chatId(msg, context) || msg.key.remoteJid;
  const owner = userId(msg, context);
  if (!chat || !owner) return;
  if (hasActiveGameType(chat, "intelligence")) {
    await send(sock, chat, "⚠️ يوجد تحدي ذكاء نشط في هذه المجموعة. أكملوه قبل بدء الألغاز.");
    return;
  }
  if (active.has(chat)) {
    await send(sock, chat, "🧩 توجد فعالية ألغاز نشطة بالفعل. اكتب «انهاء» أو «توقف» لإيقافها.");
    return;
  }
  const last = lastStart.get(chat) || 0;
  if (Date.now() - last < 1500) return;
  lastStart.set(chat, Date.now());

  let riddles;
  try {
    riddles = await loadFlexible("الغاز_100_مرحلة");
  } catch (error) {
    console.error("[ARTHUR RIDDLES] Data load error:", error?.stack || error);
    await send(sock, chat, "❌ تعذر قراءة ملف الألغاز داخل مجلد ذكاء بجانب plugins أو داخله.");
    return;
  }
  if (!Array.isArray(riddles)) {
    await send(sock, chat, "❌ ملف الألغاز يجب أن يحتوي على مصفوفة.");
    return;
  }
  const pool = riddles.filter(item =>
    item && typeof item.question === "string" &&
    Array.isArray(item.answers) && item.answers.length &&
    (type === "all" || item.type === type)
  );
  if (!pool.length) {
    await send(sock, chat, "لا توجد أسئلة من هذا النوع في ملف الألغاز.");
    return;
  }

  const stages = [];
  for (let number = 1; number <= 100; number++) {
    const items = shuffle(pool.filter(item => Number(item.difficulty) === number));
    if (items.length) stages.push({ number, items });
  }
  if (!stages.length) {
    await send(sock, chat, "لا توجد مراحل صالحة في ملف الألغاز.");
    return;
  }

  const sessionId = `${chat}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const game = {
    chat, owner, mode, type, stages, stageIndex: 0, questionIndex: 0,
    sessionId, gameId: type === "فخ" ? "arthur_traps" : "arthur_riddles",
    attempted: new Set(), hintsUsed: new Map(), startedAt: Date.now(), timer: null
  };
  active.set(chat, game);
  registerActiveGame(chat, `riddle:${sessionId}`, "riddle");
  await send(sock, chat, `🚀 بدأت فعالية الألغاز ${mode === "solo" ? "الفردية" : "الجماعية"}! عدد المراحل المتاحة: ${stages.length}.\nيمكنك إيقافها في أي وقت بكتابة «انهاء» أو «توقف».`);
  await sendCurrentRiddle(sock, game);
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

  const game = active.get(chat);
  if (["انهاء", "انهي", "توقف", "وقف", "الغاءالفعاليه"].includes(normalizedCommand)) {
    if (!game) {
      await send(sock, chat, "لا توجد فعالية ألغاز نشطة لإيقافها.");
      return { handled: true };
    }
    if (game.owner !== id) {
      await send(sock, chat, "إيقاف الفعالية متاح للشخص الذي بدأها فقط.");
      return { handled: true };
    }
    await finishRiddle(sock, game, "ended");
    return { handled: true };
  }

  const isStart = /^(لغز|الغاز|فخ|فخاخ)(فردي|جماعي|للجميع)?$/.test(normalizedCommand);
  if (isStart) {
    const solo = normalizedCommand.includes("فردي");
    let type = normalizedCommand.startsWith("فخ") ? "فخ" :
      normalizedCommand.startsWith("لغز") ? "لغز" : "all";
    if (normalizedCommand.startsWith("الغاز")) type = "all";
    await startRiddle(sock, msg, context, type, solo ? "solo" : "group");
    return { handled: true };
  }

  if (!game || prefixed) return;
  if (game.transitioning) return { handled: true };
  if (game.mode === "solo" && id !== game.owner) return { handled: true };
  const messageTime = Number(msg.messageTimestamp || msg.message?.messageTimestamp || 0);
  if (messageTime && game.questionSentAt && messageTime <= game.questionSentAt) return { handled: true };

  if (!matches(raw, game.item.answers)) {
    await react(sock, msg, "❌");
    await send(sock, chat, "❌ إجابة غير صحيحة، جرّب مرة ثانية!");
    return { handled: true };
  }

  // The first correct answer claims this question; simultaneous answers are ignored.
  game.transitioning = true;
  game.attempted.add(id);
  clearTimeout(game.timer);
  game.timer = null;
  await react(sock, msg, "✅");
  const rewards = game.item?.type === "فخ"
    ? { gold: 150, points: 25, xp: 30 }
    : { gold: 100, points: 15, xp: 20 };
  const outcome = addProgress(id, {
    ...rewards, win: true,
    idempotencyKey: `${game.gameId}:${game.sessionId}:${game.stageIndex}:${game.questionIndex}:${id}`
  });
  await send(sock, chat,
    `🎉 إجابة صحيحة يا ${msg.pushName || "لاعب"}!\n` +
    `🏆 +${outcome.duplicate ? 0 : rewards.gold} جواهر 💎 | ⭐ +${outcome.duplicate ? 0 : rewards.points} نقطة | ✨ +${outcome.duplicate ? 0 : rewards.xp} خبرة\n` +
    `الإجابة: ${game.item.answers[0]}`
  );
  game.questionIndex++;
  await sendCurrentRiddle(sock, game);
  return { handled: true };
}

export default {
  name: "arthur-riddles-traps",
  command: ["لغز", "الغاز", "فخ", "فخاخ", "لغز فردي", "لغز جماعي", "الغاز فردي", "الغاز جماعي"],
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
