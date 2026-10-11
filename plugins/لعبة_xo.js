

/**
 * ARTHUR BOT - XO GAME
 * Stable edition
 * - Group XO and bot AI
 * - LID-aware player matching
 * - Invitations with expiry checks
 * - Duplicate message protection
 * - Turn validation and move locking
 * - Arthur Bank rewards
 * - Compatible with execute + onMessage handler
 */

import { db, save, addProgress } from '../utils/arthurBankCore.js';

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

const INVITE_TTL = 2 * 60 * 60 * 1000;
const MESSAGE_TTL = 30_000;
const MAX_PROCESSED = 3000;

const locks = new Set();
const processedMessages = new Map();
const botTimers = new Map();
const inviteTimers = new Map();

// ======================================================
// PLAYER IDENTITIES
// ======================================================

function cleanNum(value) {
  if (value === undefined || value === null) return '';

  const raw = String(value).trim();

  // Never interpret a LID as a phone number.
  if (/@lid$/i.test(raw)) return '';

  const user = raw.split('@')[0].split(':')[0];
  return user.replace(/\D/g, '');
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function samePlayer(a, b) {
  if (!a || !b) return false;

  const x = normalizeId(a);
  const y = normalizeId(b);

  if (x === y) return true;

  const serverA = x.split('@')[1]?.split(':')[0] || '';
  const serverB = y.split('@')[1]?.split(':')[0] || '';

  // Never compare LID digits as phone numbers.
  if (serverA === 'lid' || serverB === 'lid') {
    return false;
  }

  const numA = cleanNum(x);
  const numB = cleanNum(y);

  return Boolean(numA && numB && numA === numB);
}

function getSender(sock, msg) {
  if (msg?.key?.fromMe) {
    return (
      sock?.user?.id ||
      sock?.user?.jid ||
      sock?.user?.lid ||
      ''
    );
  }

  return (
    msg?.key?.participant ||
    msg?.key?.participantAlt ||
    msg?.participant ||
    msg?.participantAlt ||
    (
      msg?.key?.remoteJid?.endsWith('@g.us')
        ? ''
        : msg?.key?.remoteJid
    ) ||
    ''
  );
}

function getPlayerIds(msg, sender) {
  const values = [
    sender,
    msg?.key?.participant,
    msg?.key?.participantAlt,
    msg?.key?.remoteJidAlt,
    msg?.participant,
    msg?.participantAlt
  ];

  return [...new Set(
    values
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
  )];
}

function matchesPlayer(candidate, msg, sender) {
  if (!candidate) return false;

  return getPlayerIds(msg, sender).some(id =>
    samePlayer(candidate, id)
  );
}

function isInvitedPlayer(game, msg, sender) {
  return (
    matchesPlayer(game.invited, msg, sender) ||
    matchesPlayer(game.playerO, msg, sender)
  );
}

// ======================================================
// DATABASE
// ======================================================

function getGames() {
  const database = db();

  if (
    !database.xo ||
    typeof database.xo !== 'object' ||
    Array.isArray(database.xo)
  ) {
    database.xo = {};
    save();
  }

  return database.xo;
}

function validGame(game) {
  return Boolean(
    game &&
    Array.isArray(game.b) &&
    game.b.length === 9 &&
    game.b.every(value =>
      value === '' || value === 'X' || value === 'O'
    ) &&
    game.playerX &&
    game.playerO
  );
}

function isInGroup(key, jid) {
  return String(key).startsWith(`${jid}_`);
}

function findGame(
  games,
  jid,
  msg,
  sender,
  includePending = false
) {
  return Object.entries(games).find(([key, game]) =>
    isInGroup(key, jid) &&
    validGame(game) &&
    (includePending || game.started) &&
    (
      matchesPlayer(game.playerX, msg, sender) ||
      (
        !game.isVsBot &&
        matchesPlayer(game.playerO, msg, sender)
      )
    )
  ) || null;
}

function findPlayerGame(games, jid, msg, sender) {
  return Object.entries(games).find(([key, game]) =>
    isInGroup(key, jid) &&
    validGame(game) &&
    (
      matchesPlayer(game.playerX, msg, sender) ||
      (
        !game.isVsBot &&
        matchesPlayer(game.playerO, msg, sender)
      ) ||
      (
        !game.started &&
        matchesPlayer(game.invited, msg, sender)
      )
    )
  ) || null;
}

// ======================================================
// BOARD
// ======================================================

function checkWinner(board) {
  return WIN_LINES.find(([a, b, c]) =>
    board[a] &&
    board[a] === board[b] &&
    board[b] === board[c]
  ) || null;
}

function renderBoard(board) {
  return [0, 1, 2].map(row =>
    board.slice(row * 3, row * 3 + 3)
      .map((value, col) => {
        if (value === 'X') return '❌';
        if (value === 'O') return '⭕';
        return `\`${row * 3 + col + 1}\``;
      })
      .join(' │ ')
  ).join('\n───────────\n');
}

async function send(sock, jid, content, options) {
  try {
    return await sock.sendMessage(jid, content, options);
  } catch (error) {
    console.error('[XO] Send error:', error?.message || error);
    return null;
  }
}

// ======================================================
// TIMERS
// ======================================================

function clearTimers(key) {
  const botTimer = botTimers.get(key);
  if (botTimer) clearTimeout(botTimer);
  botTimers.delete(key);

  const inviteTimer = inviteTimers.get(key);
  if (inviteTimer) clearTimeout(inviteTimer);
  inviteTimers.delete(key);
}

function expireInvitation(key, jid, sock) {
  const games = getGames();
  const game = games[key];

  if (!game || game.started) return;

  const remaining = Math.max(
    0,
    INVITE_TTL - (Date.now() - (game.createdAt || Date.now()))
  );

  const timer = setTimeout(async () => {
    inviteTimers.delete(key);

    const currentGames = getGames();
    const current = currentGames[key];

    if (!current || current.started) return;

    const age = Date.now() - (current.createdAt || Date.now());

    if (age < INVITE_TTL) {
      expireInvitation(key, jid, sock);
      return;
    }

    delete currentGames[key];
    save();

    await send(sock, jid, {
      text: '⌛ انتهت صلاحية دعوة XO لعدم قبولها خلال ساعتين.'
    });
  }, remaining);

  inviteTimers.set(key, timer);
}

// ======================================================
// MESSAGE DEDUPLICATION
// ======================================================

function wasMessageProcessed(msg) {
  const id = msg?.key?.id;
  if (!id) return false;

  const jid = msg?.key?.remoteJid || '';
  const participant = msg?.key?.participant || '';
  const key = `${jid}:${participant}:${id}`;
  const now = Date.now();

  for (const [oldKey, time] of processedMessages) {
    if (now - time > MESSAGE_TTL) {
      processedMessages.delete(oldKey);
    }
  }

  if (processedMessages.has(key)) return true;

  processedMessages.set(key, now);

  while (processedMessages.size > MAX_PROCESSED) {
    const oldest = processedMessages.keys().next().value;
    if (oldest === undefined) break;
    processedMessages.delete(oldest);
  }

  return false;
}

// ======================================================
// BOT AI
// ======================================================

function chooseBotMove(board) {
  const empty = board
    .map((value, index) => value === '' ? index : -1)
    .filter(index => index !== -1);

  if (!empty.length) return -1;

  // Win when possible.
  for (const index of empty) {
    const test = board.slice();
    test[index] = 'O';

    if (checkWinner(test)) return index;
  }

  // Block the player.
  for (const index of empty) {
    const test = board.slice();
    test[index] = 'X';

    if (checkWinner(test)) return index;
  }

  if (board[4] === '') return 4;

  const corners = [0, 2, 6, 8]
    .filter(index => board[index] === '');

  if (corners.length) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  return empty[Math.floor(Math.random() * empty.length)];
}

// ======================================================
// FINISH GAME
// ======================================================

async function finishGame(sock, jid, key, game, result) {
  const games = getGames();

  // Prevent an old timer from finishing a replacement game.
  if (games[key] !== game) return;

  delete games[key];
  clearTimers(key);
  save();

  if (result.type === 'win') {
    addProgress(result.winner, {
      gold: 300,
      points: 50,
      xp: 60,
      win: true
    });

    if (!game.isVsBot) {
      addProgress(result.loser, {
        points: 10,
        xp: 20,
        loss: true
      });
    }

    save();

    const winnerNum = cleanNum(result.winner);
    const loserNum = cleanNum(result.loser);

    const winnerLabel = winnerNum
      ? `@${winnerNum}`
      : 'الفائز';

    const loserLabel = game.isVsBot
      ? '🤖 البوت'
      : loserNum
        ? `@${loserNum}`
        : 'الخصم';

    return send(sock, jid, {
      text:
        `🎉 *انتهت المباراة بفوز أسطوري!*\n\n` +
        `🏆 الفائز: ${winnerLabel} (+300 🪙)\n` +
        `💔 الخاسر: ${loserLabel}\n\n` +
        renderBoard(game.b),
      mentions: game.isVsBot
        ? [result.winner]
        : [result.winner, result.loser].filter(Boolean)
    });
  }

  if (result.type === 'bot-win') {
    addProgress(game.playerX, {
      points: 5,
      xp: 10,
      loss: true
    });

    save();

    return send(sock, jid, {
      text:
        `🤖 *فاز البوت عليك هذه المرة!*\n\n` +
        renderBoard(game.b),
      mentions: [game.playerX]
    });
  }

  if (result.type === 'draw') {
    addProgress(game.playerX, { xp: 15 });

    if (!game.isVsBot) {
      addProgress(game.playerO, { xp: 15 });
    }

    save();

    return send(sock, jid, {
      text:
        `🤝 *انتهت المباراة بالتعادل!*\n\n` +
        renderBoard(game.b),
      mentions: game.isVsBot
        ? [game.playerX]
        : [game.playerX, game.playerO]
    });
  }
}

// ======================================================
// BOT TURN
// ======================================================

function scheduleBotMove(sock, jid, key, game) {
  const oldTimer = botTimers.get(key);
  if (oldTimer) clearTimeout(oldTimer);

  const timer = setTimeout(async () => {
    botTimers.delete(key);

    const active = getGames()[key];

    if (
      active !== game ||
      !validGame(active) ||
      !active.started ||
      active.turn !== 'BOT'
    ) {
      return;
    }

    if (locks.has(key)) {
      scheduleBotMove(sock, jid, key, active);
      return;
    }

    locks.add(key);

    try {
      const current = getGames()[key];

      if (
        current !== active ||
        !validGame(current) ||
        current.turn !== 'BOT'
      ) {
        return;
      }

      const slot = chooseBotMove(active.b);

      if (slot < 0) {
        await finishGame(sock, jid, key, active, {
          type: 'draw'
        });
        return;
      }

      active.b[slot] = 'O';

      if (checkWinner(active.b)) {
        await finishGame(sock, jid, key, active, {
          type: 'bot-win'
        });
        return;
      }

      if (active.b.every(Boolean)) {
        await finishGame(sock, jid, key, active, {
          type: 'draw'
        });
        return;
      }

      active.turn = active.playerX;
      save();

      const number = cleanNum(active.playerX);
      const label = number ? `@${number}` : 'اللاعب';

      await send(sock, jid, {
        text:
          `🤖 لعب البوت في الخانة (${slot + 1}).\n` +
          `👉 الدور الآن لك ${label}:\n\n` +
          renderBoard(active.b),
        mentions: [active.playerX]
      });
    } catch (error) {
      console.error('[XO] Bot move error:', error?.stack || error);
    } finally {
      locks.delete(key);
    }
  }, 900);

  botTimers.set(key, timer);
}

// ======================================================
// PROCESS MOVE
// ======================================================

async function processMove(sock, msg, rawText) {
  const jid = msg?.key?.remoteJid;
  const text = String(rawText || '').trim();

  if (!jid?.endsWith('@g.us')) return false;
  if (!/^[1-9]$/.test(text)) return false;

  const sender = getSender(sock, msg);
  if (!sender) return false;

  const games = getGames();
  const found = findGame(games, jid, msg, sender);

  if (!found) return false;

  const [key, game] = found;

  if (wasMessageProcessed(msg)) return true;

  if (!game.started) {
    await send(sock, jid, {
      text: '⏳ المباراة لم تبدأ بعد. على اللاعب المدعو كتابة .xo قبول.'
    });
    return true;
  }

  if (locks.has(key)) return true;

  if (game.turn === 'BOT') {
    await send(sock, jid, {
      text: '🤖 انتظر دور البوت حتى ينتهي.'
    });
    return true;
  }

  if (!matchesPlayer(game.turn, msg, sender)) {
    await send(sock, jid, {
      text: '⏳ ليس دورك الآن.'
    });
    return true;
  }

  const slot = Number(text) - 1;

  if (game.b[slot] !== '') {
    await send(sock, jid, {
      text: '⚠️ هذه الخانة محجوزة مسبقًا. اختر رقمًا آخر.'
    });
    return true;
  }

  locks.add(key);

  try {
    if (getGames()[key] !== game || !game.started) return true;
    if (game.b[slot] !== '') return true;
    if (!matchesPlayer(game.turn, msg, sender)) return true;

    const isX = matchesPlayer(game.playerX, msg, sender);
    const mark = isX ? 'X' : 'O';
    const expectedPlayer = isX ? game.playerX : game.playerO;

    if (
      (game.isVsBot && !isX) ||
      !matchesPlayer(expectedPlayer, msg, sender)
    ) {
      return true;
    }

    game.b[slot] = mark;

    if (checkWinner(game.b)) {
      await finishGame(sock, jid, key, game, {
        type: 'win',
        winner: expectedPlayer,
        loser: game.isVsBot
          ? 'BOT'
          : (isX ? game.playerO : game.playerX)
      });

      return true;
    }

    if (game.b.every(Boolean)) {
      await finishGame(sock, jid, key, game, {
        type: 'draw'
      });
      return true;
    }

    if (game.isVsBot) {
      game.turn = 'BOT';
      save();

      scheduleBotMove(sock, jid, key, game);
      return true;
    }

    game.turn = isX ? game.playerO : game.playerX;
    save();

    const nextNum = cleanNum(game.turn);
    const nextLabel = nextNum ? `@${nextNum}` : 'اللاعب التالي';

    await send(sock, jid, {
      text:
        `✅ تم اللعب بنجاح!\n\n` +
        `👉 الدور القادم لـ: ${nextLabel}\n\n` +
        renderBoard(game.b),
      mentions: [game.turn]
    });

    return true;
  } catch (error) {
    console.error('[XO] Move error:', error?.stack || error);
    return true;
  } finally {
    locks.delete(key);
  }
}

// ======================================================
// COMMAND PARSING
// ======================================================

function getAction(fullText) {
  const args = String(fullText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!args.length) return '';

  const first = args[0]
    .replace(/^[.!#/]+/, '')
    .toLowerCase();

  if (first === 'xo' || first === 'اكس' || first === 'إكس') {
    return (args[1] || '').toLowerCase();
  }

  return first;
}

function getMentionedPlayer(msg) {
  const context =
    msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo;

  return context?.mentionedJid?.[0] || '';
}

function isSelfChallenge(msg, sender, mentioned) {
  if (samePlayer(mentioned, sender)) return true;

  return getPlayerIds(msg, sender).some(id =>
    samePlayer(id, mentioned)
  );
}

// ======================================================
// PLUGIN
// ======================================================

export default {
  alwaysOn: true,
  command: 'xo',
  aliases: ['اكس', 'إكس'],
  category: '🎮 قسم الألعاب والبنك',
  description: 'لعبة إكس أو بين اللاعبين أو ضد البوت مع مكافآت البنك',

  execute: async (sock, msg, data = {}) => {
    const jid = data?.jid || msg?.key?.remoteJid;
    const sender = data?.sender || getSender(sock, msg);

    if (!jid || !sender) return;

    const fullText = String(
      data?.noPrefixText ||
      data?.text ||
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      ''
    ).trim();

    // Supports ".xo 5".
    if (/^[1-9]$/.test(fullText)) {
      await processMove(sock, msg, fullText);
      return;
    }

    if (!jid.endsWith('@g.us')) {
      return send(sock, jid, {
        text: '❌ لعبة XO تعمل في المجموعات فقط.'
      });
    }

    const games = getGames();
    const action = getAction(fullText);

    // HELP
    if ([
      'مساعدة', 'اوامر', 'أوامر', 'help', 'قائمة'
    ].includes(action)) {
      return send(sock, jid, {
        text:
          `🎮 *لعبة إكس أو الملكية*\n\n` +
          `• .xo @منشن — تحدي صديقك\n` +
          `• .xo بوت — اللعب ضد البوت\n` +
          `• .xo قبول — قبول الدعوة\n` +
          `• 1-9 — اختيار الخانة\n` +
          `• .xo انهاء — إنهاء المباراة\n\n` +
          `🏆 الفوز: 300 ذهب و50 نقطة و60 خبرة\n` +
          `🤝 التعادل: 15 خبرة لكل لاعب`
      });
    }

    // STOP / CANCEL
    if ([
      'إنهاء', 'انهاء', 'stop', 'الغاء', 'إلغاء'
    ].includes(action)) {
      const found = findPlayerGame(games, jid, msg, sender);

      if (!found) {
        return send(sock, jid, {
          text: '❌ ليس لديك مباراة أو دعوة معلقة.'
        });
      }

      const [key] = found;

      if (locks.has(key)) {
        return send(sock, jid, {
          text: '⏳ انتظر حتى تنتهي الحركة الحالية ثم حاول مجددًا.'
        });
      }

      delete games[key];
      clearTimers(key);
      save();

      return send(sock, jid, {
        text: '🛑 تم إنهاء المباراة أو إلغاء الدعوة بنجاح.'
      });
    }

    // ACCEPT INVITATION — FIXED
    if (action === 'قبول' || action === 'accept') {
      const pending = Object.entries(games).filter(([key, game]) =>
        isInGroup(key, jid) &&
        validGame(game) &&
        !game.started &&
        !game.isVsBot
      );

      const found = pending.find(([key, game]) =>
        isInvitedPlayer(game, msg, sender)
      );

      if (!found) {
        return send(sock, jid, {
          text:
            '❌ لم أجد دعوة معلقة مطابقة لحسابك في هذه المجموعة.\n' +
            'تأكد أنك تقبل الدعوة في المجموعة نفسها.'
        });
      }

      const [key, game] = found;

      if (
        game.createdAt &&
        Date.now() - game.createdAt >= INVITE_TTL
      ) {
        delete games[key];
        clearTimers(key);
        save();

        return send(sock, jid, {
          text: '⌛ انتهت صلاحية هذه الدعوة. أرسل تحديًا جديدًا.'
        });
      }

      if (matchesPlayer(game.playerX, msg, sender)) {
        return send(sock, jid, {
          text: '❌ لا يمكنك قبول تحديك بنفسك.'
        });
      }

      // Important: exclude the invitation being accepted.
      // Otherwise the invitee matches playerO in their own
      // pending invitation and is incorrectly rejected.
      const alreadyPlaying = Object.entries(games).some(
        ([otherKey, otherGame]) =>
          otherKey !== key &&
          isInGroup(otherKey, jid) &&
          validGame(otherGame) &&
          (
            matchesPlayer(otherGame.playerX, msg, sender) ||
            (
              !otherGame.isVsBot &&
              matchesPlayer(otherGame.playerO, msg, sender)
            ) ||
            (
              !otherGame.started &&
              matchesPlayer(otherGame.invited, msg, sender)
            )
          )
      );

      if (alreadyPlaying) {
        return send(sock, jid, {
          text: '⚠️ لديك مباراة أو دعوة أخرى معلقة بالفعل.'
        });
      }

      game.started = true;
      game.turn = game.playerX;

      clearTimers(key);
      save();

      const xNum = cleanNum(game.playerX);
      const oNum = cleanNum(game.playerO);
      const turnNum = cleanNum(game.turn);

      return send(sock, jid, {
        text:
          `⚔️ *بدأت معركة الإكس أو!*\n\n` +
          `❌ اللاعب الأول: ${xNum ? '@' + xNum : 'اللاعب الأول'}\n` +
          `⭕ اللاعب الثاني: ${oNum ? '@' + oNum : 'اللاعب الثاني'}\n\n` +
          `👉 الدور الآن لـ: ${turnNum ? '@' + turnNum : 'اللاعب الأول'}\n` +
          `📌 اكتب رقمًا من 1 إلى 9 للعب.\n\n` +
          renderBoard(game.b),
        mentions: [game.playerX, game.playerO]
      });
    }

    // PLAY AGAINST BOT
    if ([
      'بوت', 'solo', 'الكومبيوتر', 'الكمبيوتر', 'ai', 'bot'
    ].includes(action)) {
      const existing = findPlayerGame(games, jid, msg, sender);

      if (existing) {
        return send(sock, jid, {
          text: '⚠️ لديك مباراة أو دعوة معلقة بالفعل.'
        });
      }

      const key =
        `${jid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      games[key] = {
        playerX: sender,
        playerO: 'BOT',
        invited: '',
        started: true,
        isVsBot: true,
        turn: sender,
        createdAt: Date.now(),
        b: Array(9).fill('')
      };

      save();

      const playerNum = cleanNum(sender);

      return send(sock, jid, {
        text:
          `🤖 *بدأت معركة التحدي ضد البوت!*\n\n` +
          `👤 اللاعب: ${playerNum ? '@' + playerNum : 'أنت'} (❌)\n` +
          `🤖 الخصم: البوت (⭕)\n\n` +
          `👉 دورك بالبداية. اختر رقمًا من 1 إلى 9:\n\n` +
          renderBoard(games[key].b),
        mentions: [sender]
      });
    }

    // CHALLENGE A PLAYER
    const mentioned = getMentionedPlayer(msg);

    if (mentioned) {
      if (isSelfChallenge(msg, sender, mentioned)) {
        return send(sock, jid, {
          text: '❌ لا يمكنك تحدي نفسك.'
        });
      }

      const busy = Object.entries(games).some(([key, game]) =>
        isInGroup(key, jid) &&
        validGame(game) &&
        (
          matchesPlayer(game.playerX, msg, sender) ||
          (
            !game.isVsBot &&
            matchesPlayer(game.playerO, msg, sender)
          ) ||
          samePlayer(game.playerX, mentioned) ||
          samePlayer(game.playerO, mentioned) ||
          samePlayer(game.invited, mentioned)
        )
      );

      if (busy) {
        return send(sock, jid, {
          text: '⚠️ أنت أو خصمك لديكما مباراة أو دعوة معلقة بالفعل.'
        });
      }

      const key =
        `${jid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      games[key] = {
        playerX: sender,
        playerO: mentioned,
        invited: mentioned,
        started: false,
        isVsBot: false,
        turn: sender,
        createdAt: Date.now(),
        b: Array(9).fill('')
      };

      save();
      expireInvitation(key, jid, sock);

      const senderNum = cleanNum(sender);
      const targetNum = cleanNum(mentioned);

      return send(sock, jid, {
        text:
          `🎮 *تحدي إكس أو جديد!*\n\n` +
          `👤 ${senderNum ? '@' + senderNum : 'لاعب'} يتحدى ` +
          `${targetNum ? '@' + targetNum : 'خصمه'}.\n\n` +
          `⏳ على الخصم كتابة .xo قبول للبدء.`,
        mentions: [sender, mentioned]
      });
    }

    return send(sock, jid, {
      text:
        `🎮 *لعبة إكس أو الملكية*\n\n` +
        `• .xo @منشن — تحدي صديقك\n` +
        `• .xo بوت — اللعب ضد البوت\n` +
        `• .xo قبول — قبول الدعوة\n` +
        `• 1-9 — اللعب\n` +
        `• .xo انهاء — إنهاء المباراة\n` +
        `• .xo مساعدة — عرض الأوامر`
    });
  },

  // Standalone numeric moves.
  onMessage: async (sock, msg) => {
    if (!msg?.message) return;

    const content = msg.message;
    const rawText = String(
      content.conversation ||
      content.extendedTextMessage?.text ||
      ''
    ).trim();

    if (!/^[1-9]$/.test(rawText)) return;

    const handled = await processMove(sock, msg, rawText);

    if (handled) return { handled: true };
  }
};