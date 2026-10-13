import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  db,
  save,
  addProgress,
  getAccount,
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
const MENU_TTL = 60_000;
const MAX_RECENT_QUESTIONS = 30;

const choices = new Map();
const startIntents = new Map();
const soloGames = new Map();
const lobbies = new Map();
const groupGames = new Map();
const recentByPlayer = new Map();

registerGame("arthur_intelligence", {
  name: "ARTHUR Intelligence",
  description: "لعبة ذكاء فردية وجماعية بمراحل متدرجة",
  enabled: true
});

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}%+-]+/gu, "")
    .trim();
}

function commandText(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[.!/#]+/, "")
    .trim()
    .toLowerCase();
}

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
    message.documentMessage?.caption ||
    ""
  ).trim();
}

function isPrefixed(text) {
  return /^[.!/#]/.test(String(text || "").trim());
}

async function loadFlexible(baseName) {
  // Prefer JSON first: a stale/broken ${baseName}.js beside a valid JSON file
  // must not prevent the game from starting.
  for (const dataDir of DATA_DIR_CANDIDATES) {
    const jsonPath = path.join(dataDir, `${baseName}.json`);
    try {
      await fs.access(jsonPath);
      const raw = await fs.readFile(jsonPath, "utf8");
      try {
        return JSON.parse(raw.replace(/^\uFEFF/, ""));
      } catch (error) {
        throw new Error(`تعذر تحليل ${jsonPath}: ${error.message}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  // Only use JS data files when no JSON file exists in any supported location.
  for (const dataDir of DATA_DIR_CANDIDATES) {
    const jsPath = path.join(dataDir, `${baseName}.js`);
    try {
      await fs.access(jsPath);
      const url = pathToFileURL(jsPath);
      url.searchParams.set("reload", String(Date.now()));
      const module = await import(url.href);
      if (module.default === undefined) {
        throw new Error(`${jsPath} يجب أن يستخدم export default`);
      }
      return module.default;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(`تعذر تحميل ملف البيانات ${jsPath}: ${error.message}`);
      }
    }
  }

  throw new Error(`لم يتم العثور على ${baseName}.json أو ${baseName}.js. المسارات المفحوصة: ${DATA_DIR_CANDIDATES.join(" | ")}`);
}

async function loadData() {
  const [config, questions] = await Promise.all([
    loadFlexible("مراحل"),
    loadFlexible("اسئلة_الذكاء")
  ]);

  if (!Array.isArray(config?.stages) || !Array.isArray(questions)) {
    throw new Error("ملفات مراحل أو أسئلة الذكاء غير صالحة.");
  }

  return { config, questions };
}

function getPersistentStore() {
  const database = db();

  if (!database.world || typeof database.world !== "object") {
    database.world = {};
  }

  if (
    !database.world.arthurIntelligence ||
    typeof database.world.arthurIntelligence !== "object"
  ) {
    database.world.arthurIntelligence = { players: {} };
  }

  if (
    !database.world.arthurIntelligence.players ||
    typeof database.world.arthurIntelligence.players !== "object"
  ) {
    database.world.arthurIntelligence.players = {};
  }

  return database.world.arthurIntelligence;
}

function getPlayerProgress(id) {
  const store = getPersistentStore();

  if (!store.players[id]) {
    store.players[id] = {
      stage: 0,
      completedStages: 0,
      totalCorrect: 0,
      totalWrong: 0,
      soloGames: 0,
      groupGames: 0
    };
  }

  return store.players[id];
}

function chooseUniqueQuestions(bank, difficulty, count, recent = []) {
  const pool = bank.filter(item =>
    Number(item.difficulty) === Number(difficulty) &&
    typeof item.question === "string" &&
    Array.isArray(item.answers) &&
    item.answers.length
  );

  if (!pool.length) {
    throw new Error(`لا توجد أسئلة صالحة للمستوى ${difficulty}`);
  }

  const recentSet = new Set(recent);
  let candidates = pool.filter(item => !recentSet.has(item.id));

  if (candidates.length < count) candidates = pool.slice();

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, Math.min(count, candidates.length));
}

async function react(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key }
    });
  } catch (error) {
    console.error("[ARTHUR INTELLIGENCE] Reaction error:", error?.message || error);
  }
}

async function safeSend(sock, chat, content, options = {}) {
  try {
    return await sock.sendMessage(chat, content, options);
  } catch (error) {
    console.error("[ARTHUR INTELLIGENCE] Send error:", error?.message || error);
    return null;
  }
}

function playerKey(chat, id) {
  return `${chat}::${id}`;
}

function parseHintRequest(raw) {
  const cleaned = commandText(raw).replace(/\s+/g, " ");
  const match = cleaned.match(/^تلميح(?:\s+([123]))?$/);
  if (match) return { isHint: true, tier: match[1] ? Number(match[1]) : 0 };
  if (cleaned === "لغز تلميح") return { isHint: true, tier: 1 };
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
    return clue || "ركز على الكلمات الأساسية في السؤال، واستبعد الإجابات التي لا تناسب السياق.";
  }
  if (!letters.length) return "اقرأ السؤال ببطء وانتبه للكلمات التي تغيّر معناه.";
  if (tier === 2) {
    return `الإجابة تبدأ بحرف «${letters[0]}»، وتتكوّن من ${letters.length} حرفًا دون احتساب المسافات.`;
  }
  const revealCount = Math.min(letters.length, Math.max(1, Math.ceil(letters.length * 0.6)));
  const revealed = letters.slice(0, revealCount).join("");
  return letters.length <= 2
    ? `الإجابة تبدأ بـ «${revealed}». حاول إكمالها.`
    : `بداية الإجابة: «${revealed}…» (${letters.length} حرفًا دون المسافات).`;
}

async function handleHintRequest(sock, chat, id, raw, solo, group, msg) {
  const request = parseHintRequest(raw);
  if (!request.isHint) return false;
  if (!request.tier) {
    await safeSend(sock, chat, {
      text: "💡 متجر التلميحات — اختر القوة المناسبة:\n\n" +
        "1️⃣ تلميح خفيف — اشتره من المتجر بـ 100 جواهر 💎\n" +
        "2️⃣ تلميح متوسط — اشتره من المتجر بـ 250 جواهر 💎\n" +
        "3️⃣ تلميح قوي — اشتره من المتجر بـ 500 جواهر 💎\n\n" +
        "الشراء: .متجر شراء 1 أو 2 أو 3\n" +
        "بعد الشراء اكتب: تلميح 1 أو تلميح 2 أو تلميح 3\n" +
        "التلميح يُستهلك من حقيبتك ويصل إليك على الخاص."
    }, { quoted: msg });
    return true;
  }

  const game = solo || group;
  if (!game?.question) {
    await safeSend(sock, chat, { text: "💡 لا يوجد سؤال نشط لك الآن. ابدأ لعبة الذكاء أولًا." }, { quoted: msg });
    return true;
  }
  if (group && !group.players?.has(id)) {
    await safeSend(sock, chat, { text: "يجب أن تكون مشاركًا في التحدي الجماعي حتى تشتري تلميحًا." }, { quoted: msg });
    return true;
  }

  if (!game.hintsUsed) game.hintsUsed = new Map();
  if (!game.hintsUsed.has(id)) game.hintsUsed.set(id, new Set());
  const used = game.hintsUsed.get(id);
  if (used.has(request.tier)) {
    await safeSend(sock, chat, { text: "استخدمت هذا المستوى من التلميح في السؤال الحالي. يمكنك اختيار مستوى آخر." }, { quoted: msg });
    return true;
  }

  const itemId = hintStoreId(request.tier);
  const owned = getItemCount(id, itemId);
  if (owned < 1) {
    await safeSend(sock, chat, { text: `❌ لا تملك هذا التلميح في حقيبتك. اشتره من المتجر: .متجر\n🛒 الشراء: .متجر شراء ${request.tier} 1` }, { quoted: msg });
    return true;
  }

  const consumed = consumeStoreItem(id, itemId, 1);
  if (!consumed.ok) {
    await safeSend(sock, chat, { text: "❌ لم أتمكن من استخدام العنصر. افتح حقيبتك وتأكد من رصيدها." }, { quoted: msg });
    return true;
  }
  const hintText = buildHint(game.question, request.tier);
  const names = { 1: "خفيف", 2: "متوسط", 3: "قوي" };
  try {
    await sock.sendMessage(id, {
      text: `💡 تلميح ${names[request.tier]} من حقيبتك\n\n${hintText}\n\n🎒 المتبقي من هذا التلميح: ${consumed.remaining}`
    });
    used.add(request.tier);
    await safeSend(sock, chat, { text: `💡 أرسلت لك التلميح ${names[request.tier]} على الخاص، واستُخدمت قطعة واحدة من حقيبتك.` }, { quoted: msg });
  } catch (error) {
    grantStoreItem(id, itemId, 1);
    await safeSend(sock, chat, { text: "❌ تعذر إرسال التلميح على الخاص. أُعيد العنصر إلى حقيبتك." }, { quoted: msg });
  }
  return true;
}

function answerCorrect(text, answers) {
  const submitted = normalizeAnswer(text);
  return Boolean(submitted) && answers.some(answer =>
    normalizeAnswer(answer) === submitted
  );
}

function stageReward(config) {
  return config.stageRewards || { gold: 250, points: 40, xp: 60 };
}

function soloReward(config) {
  return config.soloRewards || { gold: 100, points: 15, xp: 25 };
}

async function startMenu(sock, msg, context) {
  const chat = chatId(msg, context) || msg.key.remoteJid;
  const id = userId(msg, context);

  if (!chat || !id) return;

  if (hasActiveGameType(chat, "riddle")) {
    await safeSend(sock, chat, {
      text: "⚠️ يوجد لغز أو فخ نشط في هذه المجموعة. أكملوه أولًا."
    }, { quoted: msg });
    return;
  }

  if (lobbies.has(chat) || groupGames.has(chat)) {
    await safeSend(sock, chat, {
      text: "⚠️ يوجد تحدٍ جماعي نشط في هذه المجموعة بالفعل."
    }, { quoted: msg });
    return;
  }

  if (soloGames.has(playerKey(chat, id))) {
    await safeSend(sock, chat, {
      text: "🧠 لديك تحدٍ فردي نشط. أجب عن السؤال الحالي أولًا."
    }, { quoted: msg });
    return;
  }

  choices.set(playerKey(chat, id), {
    expiresAt: Date.now() + MENU_TTL
  });
  startIntents.set(playerKey(chat, id), Date.now() + MENU_TTL);

  await safeSend(sock, chat, {
    text:
      "╭━━━〔 🧠 ARTHUR INTELLIGENCE 〕━━━╮\n\n" +
      "اختر طريقة اللعب بإرسال الرقم فقط:\n\n" +
      "1️⃣ ذكاء فردي — مراحل تحفظ تقدمك\n" +
      "2️⃣ ذكاء جماعي — شارك مع أعضاء المجموعة\n\n" +
      "⏳ صلاحية الاختيار دقيقة واحدة.\n" +
      "╰━━━━━━━━━━━━━━━━━━━━╯"
  }, { quoted: msg });
}

async function startSolo(sock, msg, context, chat, id) {
  if (hasActiveGameType(chat, "riddle")) {
    await safeSend(sock, chat, { text: "⚠️ يوجد تحدي ألغاز نشط في هذه المجموعة. أكملوه أولًا." }, { quoted: msg });
    return;
  }
  const { config, questions } = await loadData();
  const player = getPlayerProgress(id);
  const stageIndex = Math.min(
    Math.max(0, Number(player.stage) || 0),
    config.stages.length - 1
  );
  const stage = config.stages[stageIndex];
  const count = Math.max(1, Number(config.questionsPerStage) || 5);

  const recentKey = `solo:${id}`;
  const recent = recentByPlayer.get(recentKey) || [];
  const selected = chooseUniqueQuestions(
    questions,
    stage.difficulty,
    count,
    recent
  );

  const game = {
    id: `solo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    mode: "solo",
    chat,
    sessionToken: `intelligence:solo:${id}`,
    playerId: id,
    playerName: msg.pushName || "اللاعب",
    stageIndex,
    questionIndex: 0,
    questions: selected,
    startedAt: Date.now()
  };

  soloGames.set(playerKey(chat, id), game);
  registerActiveGame(chat, game.sessionToken, "intelligence");
  player.soloGames = (player.soloGames || 0) + 1;
  save();

  await safeSend(sock, chat, {
    text:
      `🔥 بدأت رحلتك الفردية يا ${game.playerName}!\n\n` +
      `📚 المرحلة ${stageIndex + 1}: ${stage.name}\n` +
      `❓ عدد الأسئلة: ${selected.length}\n` +
      `🏆 مكافأة اجتياز المرحلة: ${stageReward(config).gold} جواهر 💎\n\n` +
      "الإجابة تكون مباشرة دون كتابة أمر."
  }, { quoted: msg });

  await sendSoloQuestion(sock, game);
}

async function sendSoloQuestion(sock, game) {
  const stage = (await loadFlexible("مراحل")).stages[game.stageIndex];
  const question = game.questions[game.questionIndex];

  if (!question) return;

  game.question = question;
  game.hintsUsed = new Map();

  await safeSend(sock, game.chat, {
    text:
      `🧠 المرحلة ${game.stageIndex + 1}: ${stage.name}\n` +
      `❓ السؤال ${game.questionIndex + 1}/${game.questions.length}\n\n` +
      `${question.question}\n\n` +
      "✍️ أرسل إجابتك مباشرة."
  });
}

async function completeSoloStage(sock, game) {
  const { config } = await loadData();
  const stageNumber = game.stageIndex + 1;
  const player = getPlayerProgress(game.playerId);
  const rewards = stageReward(config);

  if (stageNumber > (player.completedStages || 0)) {
    player.completedStages = stageNumber;
    player.stage = stageNumber;

    const outcome = addProgress(game.playerId, {
      ...rewards,
      idempotencyKey: `intelligence-solo-stage:${game.playerId}:${stageNumber}`
    });

    save();

    await safeSend(sock, game.chat, {
      text:
        `🏆 ممتاز! اجتزت المرحلة ${stageNumber}!\n\n` +
        `💰 حصلت على ${outcome.duplicate ? 0 : rewards.gold} جواهر 💎\n` +
        `⭐ حصلت على ${outcome.duplicate ? 0 : rewards.points} نقطة\n` +
        `✨ حصلت على ${outcome.duplicate ? 0 : rewards.xp} خبرة`
    });
  } else {
    player.stage = Math.max(Number(player.stage) || 0, stageNumber);
    save();

    await safeSend(sock, game.chat, {
      text: `🎉 اجتزت المرحلة ${stageNumber}! مكافأة اجتيازها سبق تسجيلها لحسابك.`
    });
  }

  const nextIndex = game.stageIndex + 1;
  soloGames.delete(playerKey(game.chat, game.playerId));
  unregisterActiveGame(game.chat, game.sessionToken);

  if (nextIndex >= config.stages.length) {
    player.stage = config.stages.length;
    save();

    await safeSend(sock, game.chat, {
      text:
        "👑 أسطوري! أكملت جميع مراحل الذكاء المتاحة.\n" +
        "سيُحفظ تقدمك، ويمكنك إعادة اللعب لتحسين خبرتك."
    });
    return;
  }

  await safeSend(sock, game.chat, {
    text:
      `🔓 فُتحت لك المرحلة التالية!\n` +
      `📚 المرحلة ${nextIndex + 1}: ${config.stages[nextIndex].name}\n` +
      `اكتب ذكاء ثم اختر 1 للمتابعة.`
  });
}

async function handleSoloAnswer(sock, msg, context, game, text) {
  if (!answerCorrect(text, game.question.answers)) {
    const player = getPlayerProgress(game.playerId);
    player.totalWrong = (player.totalWrong || 0) + 1;
    save();
    await react(sock, msg, "❌");
    await safeSend(sock, game.chat, { text: "❌ إجابة غير صحيحة، حاول مرة ثانية!" }, { quoted: msg });
    return true;
  }

  await react(sock, msg, "✅");

  const player = getPlayerProgress(game.playerId);
  player.totalCorrect = (player.totalCorrect || 0) + 1;

  const reward = soloReward(await loadFlexible("مراحل"));
  const outcome = addProgress(game.playerId, {
    ...reward,
    idempotencyKey: `intelligence-solo-question:${game.playerId}:${game.question.id}`
  });

  const recentKey = `solo:${game.playerId}`;
  const recent = recentByPlayer.get(recentKey) || [];
  recent.push(game.question.id);
  recentByPlayer.set(recentKey, recent.slice(-MAX_RECENT_QUESTIONS));

  save();

  await safeSend(sock, game.chat, {
    text: outcome.duplicate
      ? "✅ صح! مكافأة هذا السؤال سبق استلامها، نكمل."
      : `✅ صح! حصلت على ${reward.gold} جواهر 💎 و${reward.points} نقطة و${reward.xp} خبرة.`
  }, { quoted: msg });

  game.questionIndex++;

  if (game.questionIndex >= game.questions.length) {
    await completeSoloStage(sock, game);
  } else {
    await sendSoloQuestion(sock, game);
  }

  return true;
}

async function startGroupLobby(sock, msg, context, chat) {
  const { config } = await loadData();

  if (hasActiveGameType(chat, "riddle")) {
    await safeSend(sock, chat, {
      text: "⚠️ يوجد لغز أو فخ نشط. أكملوه قبل بدء المسابقة الجماعية."
    });
    return;
  }

  if (soloGames.size && [...soloGames.values()].some(game => game.chat === chat)) {
    await safeSend(sock, chat, {
      text: "⚠️ يوجد لاعب يخوض تحديًا فرديًا في هذه المجموعة. يمكنكم اللعب جماعيًا بعد انتهاء التحدي."
    });
    return;
  }

  const lobby = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    chat,
    players: new Map(),
    expiresAt: Date.now() + Math.max(10, Number(config.joinSeconds) || 30) * 1000,
    timer: null
  };

  lobbies.set(chat, lobby);
  registerActiveGame(chat, `intelligence:lobby:${lobby.id}`, "intelligence");

  await safeSend(sock, chat, {
    text:
      "👥 فُتح التسجيل لتحدي الذكاء الجماعي!\n\n" +
      `⏳ مدة التسجيل: ${Math.max(10, Number(config.joinSeconds) || 30)} ثانية.\n` +
      "كل لاعب يريد الدخول يكتب: شارك\n" +
      "نحتاج لاعبين اثنين على الأقل."
  }, { quoted: msg });

  lobby.timer = setTimeout(async () => {
    try {
      if (lobbies.get(chat) !== lobby) return;
      lobbies.delete(chat);

      if (lobby.players.size < 2) {
        unregisterActiveGame(chat, `intelligence:lobby:${lobby.id}`);
        await safeSend(sock, chat, {
          text: "❌ أُلغي التحدي؛ لم ينضم لاعبان على الأقل. اكتب ذكاء لبدء التسجيل مجددًا."
        });
        return;
      }

      const { config: latestConfig, questions } = await loadData();
      const game = {
        ...lobby,
        mode: "group",
        stageIndex: 0,
        questionIndex: 0,
        stageQuestions: [],
        question: null,
        attempted: new Set(),
        correctThisQuestion: new Set(),
        transitioning: false,
        questionsBank: questions,
        config: latestConfig,
        timer: null
      };

      groupGames.set(chat, game);
      unregisterActiveGame(chat, `intelligence:lobby:${lobby.id}`);
      registerActiveGame(chat, `intelligence:group:${game.id}`, "intelligence");

      for (const [id] of game.players) {
        const p = getPlayerProgress(id);
        p.groupGames = (p.groupGames || 0) + 1;
      }
      save();

      await safeSend(sock, chat, {
        text:
          `🚀 بدأ التحدي الجماعي!\n` +
          `👥 المشاركون: ${game.players.size}\n` +
          `📚 عدد المراحل: ${game.config.stages.length}\n` +
          `🏆 ترتيبكم النهائي يعتمد على عدد الإجابات الصحيحة.`
      });

      await sendGroupQuestion(sock, game);
    } catch (error) {
      console.error("[ARTHUR INTELLIGENCE] Group start error:", error?.stack || error);
      lobbies.delete(chat);
      groupGames.delete(chat);
      unregisterActiveGame(chat, `intelligence:lobby:${lobby.id}`);
      await safeSend(sock, chat, {
        text: "❌ حدث خطأ في بدء التحدي الجماعي. راجع سجل تشغيل البوت."
      });
    }
  }, Math.max(10, Number(config.joinSeconds) || 30) * 1000);
}

async function sendGroupQuestion(sock, game) {
  const stage = game.config.stages[game.stageIndex];

  if (!stage) {
    await finishGroup(sock, game);
    return;
  }

  if (!game.stageQuestions.length) {
    game.stageQuestions = chooseUniqueQuestions(
      game.questionsBank,
      stage.difficulty,
      Math.max(1, Number(game.config.questionsPerStage) || 5)
    );
    game.questionIndex = 0;

    await safeSend(sock, game.chat, {
      text:
        `⚔️ انتقلتم إلى المرحلة ${game.stageIndex + 1}: ${stage.name}\n` +
        `الأسئلة أصعب الآن. استعدوا!`
    });
  }

  const question = game.stageQuestions[game.questionIndex];

  if (!question) {
    game.stageIndex++;
    game.stageQuestions = [];

    if (game.stageIndex >= game.config.stages.length) {
      await finishGroup(sock, game);
      return;
    }

    await sendGroupQuestion(sock, game);
    return;
  }

  game.question = question;
  game.hintsUsed = new Map();
  game.attempted = new Set();
  game.correctThisQuestion = new Set();
  game.transitioning = false;
  game.answerLocked = false;

  await safeSend(sock, game.chat, {
    text:
      `🧠 الذكاء الجماعي — المرحلة ${game.stageIndex + 1}/${game.config.stages.length}\n` +
      `❓ السؤال ${game.questionIndex + 1}/${game.stageQuestions.length}\n\n` +
      `${question.question}\n\n` +
      `⏳ الوقت: ${game.config.groupAnswerSeconds || 15} ثانية\n` +
      "أرسلوا الإجابات مباشرة!"
  });
  game.questionSentAt = Math.floor(Date.now() / 1000);

  clearTimeout(game.timer);
  game.timer = setTimeout(async () => {
    await advanceGroupQuestion(sock, game, true);
  }, Math.max(5, Number(game.config.groupAnswerSeconds) || 15) * 1000);
}

async function advanceGroupQuestion(sock, game, timedOut = false) {
  if (groupGames.get(game.chat) !== game || game.transitioning) return;

  game.transitioning = true;
  clearTimeout(game.timer);

  if (timedOut && game.question) {
    // A stage/question is never cleared without a correct answer.
    await safeSend(sock, game.chat, {
      text: "⌛ انتهى الوقت، لكن السؤال لم يُحتسب محلولًا. سنعيد السؤال نفسه؛ لا تنتقل المرحلة إلا بعد إجابة صحيحة."
    });
    game.transitioning = false;
    game.answerLocked = false;
    await sendGroupQuestion(sock, game);
    return;
  }

  game.questionIndex++;

  if (game.questionIndex >= game.stageQuestions.length) {
    game.stageIndex++;
    game.stageQuestions = [];
    game.questionIndex = 0;

    if (game.stageIndex >= game.config.stages.length) {
      await finishGroup(sock, game);
      return;
    }
  }

  await sendGroupQuestion(sock, game);
}

async function handleGroupAnswer(sock, msg, context, game, text) {
  if (game.transitioning || game.answerLocked) return true;

  const id = userId(msg, context);
  const player = game.players.get(id);
  if (!player) return true;

  // Ignore answers that were sent before the current question appeared.
  const messageTime = Number(msg.messageTimestamp || msg.message?.messageTimestamp || 0);
  if (messageTime && game.questionSentAt && messageTime < game.questionSentAt) return true;

  if (!answerCorrect(text, game.question.answers)) {
    await react(sock, msg, "❌");
    await safeSend(sock, game.chat, { text: "❌ إجابة غير صحيحة، جرّب مرة ثانية!" }, { quoted: msg });
    return true;
  }

  // Lock immediately so two correct answers cannot win the same question.
  game.answerLocked = true;
  game.attempted.add(id);
  game.correctThisQuestion.add(id);
  player.correct++;
  player.points += 10;

  const p = getPlayerProgress(id);
  p.totalCorrect = (p.totalCorrect || 0) + 1;
  save();

  await react(sock, msg, "✅");

  await safeSend(sock, game.chat, {
    text: `صح يا ${player.name}! حصلت على 10 نقاط في ترتيب المسابقة.`
  }, { quoted: msg });

  // First correct answer wins this question; advance immediately.
  await advanceGroupQuestion(sock, game, false);
  return true;
}

async function finishGroup(sock, game) {
  if (groupGames.get(game.chat) !== game) return;

  clearTimeout(game.timer);
  groupGames.delete(game.chat);
  unregisterActiveGame(game.chat, `intelligence:group:${game.id}`);

  const ranking = [...game.players.entries()]
    .map(([id, player], index) => ({
      id,
      name: player.name || "لاعب",
      correct: player.correct || 0,
      points: player.points || 0,
      joined: index
    }))
    .sort((a, b) =>
      b.correct - a.correct ||
      b.points - a.points ||
      a.joined - b.joined
    );

  const rewardConfig = game.config.groupRewards || {};
  const rankRewards = [
    rewardConfig.first || { gold: 500, points: 100, xp: 150 },
    rewardConfig.second || { gold: 300, points: 60, xp: 100 },
    rewardConfig.third || { gold: 200, points: 40, xp: 70 }
  ];
  const participantReward =
    rewardConfig.participant || { gold: 50, points: 10, xp: 25 };

  let report = "╭━━━〔 🏆 نتائج تحدي الذكاء 〕━━━╮\n\n";

  for (let i = 0; i < ranking.length; i++) {
    const player = ranking[i];
    const reward = rankRewards[i] || participantReward;

    const outcome = addProgress(player.id, {
      ...reward,
      win: i === 0,
      idempotencyKey: `intelligence-group:${game.id}:${player.id}`
    });

    const rewardGold = outcome.duplicate ? 0 : reward.gold;
    report +=
      `${i + 1}. ${player.name}\n` +
      `   🧠 الإجابات الصحيحة: ${player.correct}\n` +
      `   ⭐ نقاط المسابقة: ${player.points}\n` +
      `   💰 مكافأة البنك: ${rewardGold} جواهر 💎\n\n`;
  }

  save();

  report += "╰━━━━━━━━━━━━━━━━━━╯\n";
  report += ranking.length
    ? `🥇 الأكثر إجابة صحيحة: ${ranking[0].name} (${ranking[0].correct} إجابة صحيحة)`
    : "لم يتم تسجيل مشاركين.";

  await safeSend(sock, game.chat, { text: report });
}

async function handleMessage(sock, msg, context = {}) {
  if (!msg?.key || msg.key.fromMe) return;

  const chat = chatId(msg, context) || msg.key.remoteJid;
  const id = userId(msg, context);
  const raw = getText(msg);

  if (!chat || !id || !raw) return;

  const wasPrefixed = isPrefixed(raw);
  const text = commandText(raw);
  const normalized = normalizeAnswer(text);
  const key = playerKey(chat, id);

  const soloForHint = soloGames.get(key);
  const groupForHint = groupGames.get(chat);
  if (await handleHintRequest(sock, chat, id, raw, soloForHint, groupForHint, msg)) {
    return { handled: true };
  }

  // The menu and game commands work with or without the configured prefix.
  if (normalized === "ذكا" || normalized === "لعبهالذكا") {
    await startMenu(sock, msg, context);
    return { handled: true };
  }

  const choice = choices.get(key);

  if (choice && choice.expiresAt < Date.now()) {
    choices.delete(key);
    startIntents.delete(key);
  }

  // "ابدأ" is handled here only after the intelligence menu was opened,
  // so the riddles plugin can also use the same keyword without collisions.
  if (normalized === "ابدأ" || normalized === "ابدا") {
    const expires = startIntents.get(key) || 0;
    if (expires < Date.now()) return;
    startIntents.delete(key);
    choices.delete(key);
    try {
      await startSolo(sock, msg, context, chat, id);
    } catch (error) {
      console.error("[ARTHUR INTELLIGENCE] Direct start error:", error?.stack || error);
      await safeSend(sock, chat, { text: "❌ تعذر بدء الذكاء. تأكد من وجود مجلد ذكاء بجانب plugins وملفات المراحل والأسئلة داخله." });
    }
    return { handled: true };
  }

  if (choices.has(key) && ["1", "2"].includes(normalized)) {
    choices.delete(key);
    startIntents.delete(key);

    try {
      if (normalized === "1") {
        await startSolo(sock, msg, context, chat, id);
      } else {
        if (lobbies.has(chat) || groupGames.has(chat)) {
          await safeSend(sock, chat, {
            text: "يوجد تسجيل أو تحدٍ جماعي نشط بالفعل."
          });
        } else {
          await startGroupLobby(sock, msg, context, chat);
        }
      }
    } catch (error) {
      console.error("[ARTHUR INTELLIGENCE] Start error:", error?.stack || error);
      await safeSend(sock, chat, {
        text: "❌ تعذر بدء اللعبة. تأكد من وجود مجلد ذكاء بجانب plugins وملفات المراحل والأسئلة داخله."
      });
    }

    return { handled: true };
  }

  let lobby = lobbies.get(chat);
  const intentExpires = startIntents.get(key) || 0;
  if (normalized === "شارك" && !lobby && !groupGames.has(chat) && intentExpires >= Date.now()) {
    startIntents.delete(key);
    choices.delete(key);
    try {
      await startGroupLobby(sock, msg, context, chat);
      lobby = lobbies.get(chat);
    } catch (error) {
      console.error("[ARTHUR INTELLIGENCE] Direct lobby error:", error?.stack || error);
      await safeSend(sock, chat, { text: "❌ تعذر فتح التسجيل الجماعي." });
      return { handled: true };
    }
  }

  if (lobby && normalized === "شارك") {
    if (lobby.players.has(id)) {
      await safeSend(sock, chat, { text: "أنت مسجل بالفعل في هذا التحدي." });
      return { handled: true };
    }

    lobby.players.set(id, {
      name: msg.pushName || `لاعب ${lobby.players.size + 1}`,
      correct: 0,
      points: 0
    });

    await safeSend(sock, chat, {
      text: `✅ تم تسجيلك يا ${msg.pushName || "لاعب"}! عدد المشاركين: ${lobby.players.size}`
    }, { quoted: msg });

    return { handled: true };
  }

  if (wasPrefixed && !["ذكا", "لعبهالذكا"].includes(normalized)) {
    return;
  }

  const solo = soloGames.get(key);

  if (solo) {
    await handleSoloAnswer(sock, msg, context, solo, raw);
    return { handled: true };
  }

  const group = groupGames.get(chat);

  if (group) {
    await handleGroupAnswer(sock, msg, context, group, raw);
    return { handled: true };
  }

  return;
}

export default {
  name: "arthur-intelligence",
  command: ["ذكاء", "لعبة_الذكاء"],
  aliases: ["intelligence"],
  category: "games",
  description: "لعبة ذكاء متكاملة: مراحل فردية وتحدي جماعي وترتيب ومكافآت بنك.",

  async execute(sock, msg, context = {}) {
    await handleMessage(sock, msg, context);
  },

  async onMessage(sock, msg, context = {}) {
    return await handleMessage(sock, msg, context);
  }
};
