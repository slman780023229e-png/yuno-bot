import fs from 'node:fs';
import path from 'node:path';

// ═══════════════════════════════════════════════════════
// ARTHUR BANK CORE — Stable Edition
// متوافق مع ES Modules و Node.js / Termux
// ═══════════════════════════════════════════════════════

const DATA_DIR = path.join(
  process.cwd(),
  'data',
  'arthur_bank_games'
);

const DB_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_FILE = path.join(DATA_DIR, 'state.json.bak');
const DAY = 24 * 60 * 60 * 1000;

const DEFAULT_WALLET = 1500;
const DAILY_REWARD = 500;
const DAILY_COOLDOWN = DAY;
const MAX_INTEREST_DAYS = 30;

let dbState;
let lastSaveError = null;

// ───────────────────────────────────────────────────────
// أدوات عامة
// ───────────────────────────────────────────────────────

function finiteNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function integer(value, fallback = 0) {
  return Math.floor(finiteNumber(value, fallback));
}

export function cleanId(id) {
  return String(id || '')
    .trim()
    .replace(/[^0-9a-zA-Z_@.:-]/g, '')
    .slice(0, 120);
}

export function normalizeText(text) {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

export function formatMoney(value) {
  return Math.floor(finiteNumber(value, 0))
    .toLocaleString('en-US');
}

export function userId(msg, data = {}) {
  return cleanId(
    data.sender ||
    data.userId ||
    msg?.key?.participant ||
    msg?.participant ||
    msg?.key?.participantAlt ||
    ''
  );
}

export function chatId(msg, data = {}) {
  return cleanId(
    data.jid ||
    data.chat ||
    msg?.key?.remoteJid ||
    msg?.chat ||
    ''
  );
}

export function getArgs(msg, data = {}) {
  let text = String(
    data.text ??
    data.noPrefixText ??
    data.args ??
    ''
  ).trim();

  if (!text) {
    const m = msg?.message || {};
    text = String(
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      ''
    ).trim();
  }

  return text.split(/\s+/).filter(Boolean);
}

export function mentionTarget(msg, data = {}) {
  if (data.target) return cleanId(data.target);

  const m = msg?.message || {};
  const context =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    {};

  const mentions = context.mentionedJid || [];

  return cleanId(mentions[0] || '');
}

// محدد بسيط لتقليل تكرار بعض الأوامر.
// لا يُستخدم بدل حماية المعالج الرئيسي.
const spamRecords = new Map();

export function checkSpam(id, cooldown = 1500) {
  const key = cleanId(id);
  if (!key) return true;

  const now = Date.now();
  const last = spamRecords.get(key) || 0;

  if (now - last < Math.max(0, cooldown)) {
    return true;
  }

  spamRecords.set(key, now);

  if (spamRecords.size > 5000) {
    for (const [user, timestamp] of spamRecords) {
      if (now - timestamp > 60_000) {
        spamRecords.delete(user);
      }
    }
  }

  return false;
}

// ───────────────────────────────────────────────────────
// بنية قاعدة البيانات
// ───────────────────────────────────────────────────────

function initialState() {
  return {
    version: 6,
    accounts: {},
    clans: {},
    duels: {},
    xo: {},
    world: {
      market: [],
      season: {
        id: 1,
        startedAt: Date.now()
      }
    }
  };
}

function ensureDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function loadDatabase() {
  ensureDirectory();

  if (!fs.existsSync(DB_FILE)) {
    return initialState();
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!isPlainObject(parsed)) {
      throw new Error('Database root must be an object.');
    }

    const base = initialState();

    return {
      ...base,
      ...parsed,
      version: 6,
      accounts: isPlainObject(parsed.accounts)
        ? parsed.accounts
        : {},
      clans: isPlainObject(parsed.clans)
        ? parsed.clans
        : {},
      duels: isPlainObject(parsed.duels)
        ? parsed.duels
        : {},
      xo: isPlainObject(parsed.xo)
        ? parsed.xo
        : {},
      world: {
        ...base.world,
        ...(isPlainObject(parsed.world) ? parsed.world : {}),
        market: Array.isArray(parsed.world?.market)
          ? parsed.world.market
          : [],
        season: {
          ...base.world.season,
          ...(isPlainObject(parsed.world?.season)
            ? parsed.world.season
            : {})
        }
      }
    };
  } catch (error) {
    // لا نستبدل ملفًا تالفًا بصمت؛ نحفظ نسخة منه أولًا.
    const backupName =
      `${DB_FILE}.corrupt-${Date.now()}`;

    try {
      fs.copyFileSync(DB_FILE, backupName);
    } catch (backupError) {
      console.error(
        '[ARTHUR BANK] Could not preserve damaged database:',
        backupError?.message || backupError
      );

      // منع بدء البنك بقاعدة فارغة إذا تعذر حفظ الملف الأصلي.
      throw new Error(
        'تعذر قراءة قاعدة البنك وحفظ نسخة احتياطية منها.'
      );
    }

    console.error(
      `[ARTHUR BANK] Invalid database preserved at ${backupName}`,
      error?.message || error
    );

    // لا نكتب قاعدة جديدة فوق الملف الأصلي هنا.
    // على المشغل مراجعة النسخة الاحتياطية قبل إعادة التشغيل.
    throw new Error(
      'ملف البنك غير صالح. تم حفظ نسخة احتياطية؛ أصلح الملف قبل التشغيل.'
    );
  }
}

dbState = loadDatabase();

// ───────────────────────────────────────────────────────
// الحفظ الآمن
// ───────────────────────────────────────────────────────

function writeAtomic(file, content) {
  const tempFile =
    `${file}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tempFile, content, {
      encoding: 'utf8',
      flag: 'wx'
    });

    fs.renameSync(tempFile, file);
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}

    throw error;
  }
}

function saveDatabase() {
  ensureDirectory();

  const serialized = JSON.stringify(dbState, null, 2);

  try {
    // نحتفظ بآخر نسخة سليمة قبل استبدال الملف.
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, BACKUP_FILE);
      } catch (backupError) {
        console.error(
          '[ARTHUR BANK] Backup warning:',
          backupError?.message || backupError
        );
      }
    }

    writeAtomic(DB_FILE, serialized);
    lastSaveError = null;

    return true;
  } catch (error) {
    lastSaveError = error;

    console.error(
      '[ARTHUR BANK] Save failed:',
      error?.stack || error
    );

    throw error;
  }
}

export function db() {
  return dbState;
}

export function getDatabase() {
  return dbState;
}

export function save() {
  return saveDatabase();
}

export function saveState() {
  return saveDatabase();
}

export function getSaveStatus() {
  return {
    ok: lastSaveError === null,
    error: lastSaveError?.message || null,
    file: DB_FILE
  };
}

// ───────────────────────────────────────────────────────
// إنشاء الحسابات وترحيل الحسابات القديمة
// ───────────────────────────────────────────────────────

function newAccount() {
  const now = Date.now();

  return {
    wallet: DEFAULT_WALLET,
    bank: 0,
    vault: 0,
    debt: 0,
    creditScore: 100,

    points: 0,
    xp: 0,
    level: 1,

    wins: 0,
    losses: 0,
    title: '',

    inventory: [],

    skills: {
      luck: 1,
      strength: 1,
      defense: 1
    },

    lastDaily: 0,
    lastInterest: now,
    createdAt: now
  };
}

function migrateAccount(account) {
  let changed = false;

  const defaults = newAccount();

  if (!isPlainObject(account)) {
    return {
      account: defaults,
      changed: true
    };
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (account[key] === undefined || account[key] === null) {
      account[key] = structuredCloneSafe(value);
      changed = true;
    }
  }

  const numericFields = [
    'wallet',
    'bank',
    'vault',
    'debt',
    'creditScore',
    'points',
    'xp',
    'level',
    'wins',
    'losses',
    'lastDaily',
    'lastInterest',
    'createdAt'
  ];

  for (const key of numericFields) {
    const value = Number(account[key]);

    if (!Number.isFinite(value)) {
      account[key] = defaults[key];
      changed = true;
    } else {
      const minimum = key === 'level' ? 1 : 0;
      const normalized = Math.max(minimum, value);

      if (normalized !== account[key]) {
        account[key] = normalized;
        changed = true;
      }
    }
  }

  if (!isPlainObject(account.skills)) {
    account.skills = { ...defaults.skills };
    changed = true;
  } else {
    for (const [key, value] of Object.entries(defaults.skills)) {
      if (!Number.isFinite(Number(account.skills[key]))) {
        account.skills[key] = value;
        changed = true;
      } else {
        const normalized = Math.max(1, Number(account.skills[key]));

        if (normalized !== account.skills[key]) {
          account.skills[key] = normalized;
          changed = true;
        }
      }
    }
  }

  if (!Array.isArray(account.inventory)) {
    account.inventory = [];
    changed = true;
  }

  if (typeof account.title !== 'string') {
    account.title = '';
    changed = true;
  }

  return { account, changed };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getAccount(id) {
  const key = cleanId(id);

  if (!key) {
    throw new Error('Invalid account ID.');
  }

  if (!Object.hasOwn(dbState.accounts, key)) {
    dbState.accounts[key] = newAccount();
    saveDatabase();

    return dbState.accounts[key];
  }

  const result = migrateAccount(dbState.accounts[key]);

  dbState.accounts[key] = result.account;

  if (result.changed) {
    saveDatabase();
  }

  return dbState.accounts[key];
}

// ───────────────────────────────────────────────────────
// الرتب والمستويات
// ───────────────────────────────────────────────────────

export function calculateRank(points) {
  const value = nonNegative(points);

  if (value >= 100_000) return '👑 أسطورة';
  if (value >= 50_000) return '💎 ماسي';
  if (value >= 20_000) return '🏆 ذهبي';
  if (value >= 10_000) return '🥇 فضي';
  if (value >= 5_000) return '🥉 برونزي';
  if (value >= 1_000) return '⚔️ مقاتل';
  return '🌱 مبتدئ';
}

export function xpNeeded(level) {
  return Math.max(1, integer(level, 1)) * 400;
}

// ───────────────────────────────────────────────────────
// الفوائد البنكية
// ───────────────────────────────────────────────────────

function applyInterest(account) {
  const now = Date.now();
  const last = nonNegative(account.lastInterest, now);

  if (now <= last || account.bank <= 0) {
    if (now > last) account.lastInterest = now;
    return false;
  }

  const elapsedDays = Math.floor((now - last) / DAY);

  if (elapsedDays < 1) return false;

  // حد أقصى للفترات المحتسبة في عملية واحدة.
  const days = Math.min(elapsedDays, MAX_INTEREST_DAYS);

  for (let i = 0; i < days; i++) {
    account.bank = Math.floor(account.bank * 1.03);
  }

  account.lastInterest = last + days * DAY;

  return true;
}

export function getBankBalance(id) {
  const account = getAccount(id);

  if (applyInterest(account)) {
    saveDatabase();
  }

  return account.bank;
}

// ───────────────────────────────────────────────────────
// المكافآت والتقدم — واجهة متوافقة مع XO
// ───────────────────────────────────────────────────────

export function addProgress(
  id,
  {
    gold = 0,
    points = 0,
    xp = 0,
    win = false,
    loss = false
  } = {}
) {
  const account = getAccount(id);

  const goldAmount = integer(gold);
  const pointAmount = integer(points);
  const xpAmount = nonNegative(xp);

  let bonusGold = 0;

  if (goldAmount > 0) {
    const luck = Math.max(
      1,
      finiteNumber(account.skills?.luck, 1)
    );

    bonusGold = Math.floor(
      goldAmount * (luck * 0.05)
    );
  }

  const totalGold = goldAmount + bonusGold;

  account.wallet = Math.max(
    0,
    integer(account.wallet) + totalGold
  );

  account.points = Math.max(
    0,
    integer(account.points) + pointAmount
  );

  account.xp = nonNegative(account.xp) + xpAmount;

  if (win) account.wins++;
  if (loss) account.losses++;

  let levelsGained = 0;

  // إصلاح مهم: حساب المطلوب من جديد بعد كل ترقية.
  while (account.xp >= xpNeeded(account.level)) {
    account.xp -= xpNeeded(account.level);
    account.level++;

    account.wallet += account.level * 350;
    account.points += 50;

    levelsGained++;
  }

  saveDatabase();

  return {
    account,
    levelsGained,
    bonusGold,
    totalGold
  };
}

// ───────────────────────────────────────────────────────
// عمليات مالية
// ───────────────────────────────────────────────────────

export function deposit(id, amount) {
  const value = integer(amount);

  if (value <= 0) {
    return { ok: false, error: 'المبلغ غير صالح.' };
  }

  const account = getAccount(id);

  if (account.wallet < value) {
    return { ok: false, error: 'رصيد المحفظة لا يكفي.' };
  }

  account.wallet -= value;
  account.bank += value;

  saveDatabase();

  return {
    ok: true,
    amount: value,
    account
  };
}

export function withdraw(id, amount) {
  const value = integer(amount);

  if (value <= 0) {
    return { ok: false, error: 'المبلغ غير صالح.' };
  }

  const account = getAccount(id);

  applyInterest(account);

  if (account.bank < value) {
    return { ok: false, error: 'رصيد البنك لا يكفي.' };
  }

  account.bank -= value;
  account.wallet += value;

  saveDatabase();

  return {
    ok: true,
    amount: value,
    account
  };
}

export function transfer(fromId, toId, amount) {
  const from = cleanId(fromId);
  const to = cleanId(toId);
  const value = integer(amount);

  if (!from || !to || from === to) {
    return { ok: false, error: 'الحساب المستلم غير صالح.' };
  }

  if (value <= 0) {
    return { ok: false, error: 'المبلغ غير صالح.' };
  }

  const sender = getAccount(from);
  const receiver = getAccount(to);

  if (sender.wallet < value) {
    return { ok: false, error: 'رصيد المحفظة لا يكفي.' };
  }

  sender.wallet -= value;
  receiver.wallet += value;

  saveDatabase();

  return {
    ok: true,
    amount: value,
    sender,
    receiver
  };
}

export function claimDaily(id) {
  const account = getAccount(id);
  const now = Date.now();

  const elapsed = now - nonNegative(account.lastDaily);

  if (elapsed < DAILY_COOLDOWN) {
    return {
      ok: false,
      remaining: DAILY_COOLDOWN - elapsed
    };
  }

  account.wallet += DAILY_REWARD;
  account.points += 25;
  account.xp += 50;
  account.lastDaily = now;

  let levelsGained = 0;

  while (account.xp >= xpNeeded(account.level)) {
    account.xp -= xpNeeded(account.level);
    account.level++;
    account.wallet += account.level * 350;
    account.points += 50;
    levelsGained++;
  }

  saveDatabase();

  return {
    ok: true,
    reward: DAILY_REWARD,
    levelsGained,
    account
  };
}

// ───────────────────────────────────────────────────────
// واجهة أمر البنك
// ───────────────────────────────────────────────────────

function parseAmount(value) {
  const normalized = String(value || '')
    .replace(/[,،_]/g, '');

  if (!/^\d+$/.test(normalized)) return 0;

  const amount = Number(normalized);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

function formatDuration(ms) {
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours} ساعة و${remainingMinutes} دقيقة`;
  }

  return `${minutes} دقيقة`;
}

async function reply(sock, jid, text, quoted) {
  try {
    await sock.sendMessage(
      jid,
      { text },
      quoted ? { quoted } : {}
    );
  } catch (error) {
    console.error(
      '[ARTHUR BANK] Reply error:',
      error?.message || error
    );
  }
}

export default {
  name: 'arthur-bank',
  command: 'بنك',
  aliases: ['bank', 'محفظة', 'رصيدي'],
  category: 'economy',
  description: 'بنك ARTHUR: رصيد، إيداع، سحب، تحويل، ومكافأة يومية.',
  usage: '.بنك | .بنك إيداع 100 | .بنك سحب 100 | .بنك يومي',
  alwaysOn: true,

  async execute(sock, msg, data = {}) {
    const jid = chatId(msg, data);
    const sender = userId(msg, data);

    if (!jid || !sender) return;

    let args = getArgs(msg, data);

    // دعم handler الذي يمرر النص بعد الأمر أو النص الكامل.
    if (args.length && /^(?:\.|!|\/)?(?:بنك|bank|محفظة|رصيدي)$/i.test(args[0])) {
      args = args.slice(1);
    }

    const sub = normalizeText(args[0] || 'رصيد');
    const account = getAccount(sender);

    if (['رصيد', 'حساب', 'balance', ''].includes(sub)) {
      const bankBalance = getBankBalance(sender);

      await reply(
        sock,
        jid,
        `╭━━━『 🏦 ARTHUR BANK 』━━━╮\n\n` +
        `👛 المحفظة: ${formatMoney(account.wallet)}\n` +
        `🏦 البنك: ${formatMoney(bankBalance)}\n` +
        `🔐 الخزنة: ${formatMoney(account.vault)}\n` +
        `📉 الديون: ${formatMoney(account.debt)}\n\n` +
        `⭐ النقاط: ${formatMoney(account.points)}\n` +
        `✨ الخبرة: ${formatMoney(account.xp)} / ${formatMoney(xpNeeded(account.level))}\n` +
        `📈 المستوى: ${account.level}\n` +
        `🏆 الانتصارات: ${account.wins}\n` +
        `💔 الخسائر: ${account.losses}\n` +
        `🎖️ الرتبة: ${calculateRank(account.points)}\n\n` +
        `╰━━━━━━━━━━━━━━━━━━╯`
      );

      return;
    }

    if (['يومي', 'daily'].includes(sub)) {
      const result = claimDaily(sender);

      if (!result.ok) {
        await reply(
          sock,
          jid,
          `⏳ استلمت مكافأتك اليومية سابقًا.\n` +
          `عد بعد: ${formatDuration(result.remaining)}`
        );

        return;
      }

      await reply(
        sock,
        jid,
        `╭━━━『 🎁 المكافأة اليومية 』━━━╮\n\n` +
        `💰 الذهب: +${formatMoney(result.reward)}\n` +
        `⭐ النقاط: +25\n` +
        `✨ الخبرة: +50\n` +
        (result.levelsGained
          ? `🎉 ترقيات جديدة: ${result.levelsGained}\n`
          : '') +
        `\n╰━━━━━━━━━━━━━━━━━━╯`
      );

      return;
    }

    if (['ايداع', 'إيداع', 'deposit'].includes(sub)) {
      const amount = parseAmount(args[1]);
      const result = deposit(sender, amount);

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم إيداع ${formatMoney(amount)} في البنك.\n👛 المحفظة: ${formatMoney(result.account.wallet)}\n🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error || 'أدخل مبلغًا صحيحًا.'}`
      );

      return;
    }

    if (['سحب', 'withdraw'].includes(sub)) {
      const amount = parseAmount(args[1]);
      const result = withdraw(sender, amount);

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم سحب ${formatMoney(amount)} من البنك.\n👛 المحفظة: ${formatMoney(result.account.wallet)}\n🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error || 'أدخل مبلغًا صحيحًا.'}`
      );

      return;
    }

    if (['تحويل', 'ارسال', 'إرسال', 'transfer'].includes(sub)) {
      const target = mentionTarget(msg, data);

      // يقبل: .بنك تحويل @لاعب 100
      // ويقبل: .بنك تحويل 100 @لاعب
      const amountToken = args.slice(1).find(
        token => /^\d[\d,_،]*$/.test(token)
      );

      const amount = parseAmount(amountToken);

      if (!target || !amount) {
        await reply(
          sock,
          jid,
          '❌ الطريقة الصحيحة:\n.بنك تحويل @لاعب المبلغ'
        );

        return;
      }

      const result = transfer(sender, target, amount);

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم تحويل ${formatMoney(amount)} إلى @${target.split('@')[0]}.`
          : `❌ ${result.error}`,
        [target]
      );

      return;
    }

    if (['ترتيب', 'الاغنياء', 'الأغنياء', 'top'].includes(sub)) {
      const ranking = Object.entries(dbState.accounts)
        .map(([id, raw]) => {
          const migrated = migrateAccount(raw).account;

          return {
            id,
            wallet: nonNegative(migrated.wallet),
            bank: nonNegative(migrated.bank),
            total:
              nonNegative(migrated.wallet) +
              nonNegative(migrated.bank) +
              nonNegative(migrated.vault)
          };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const lines = ranking.map((item, index) =>
        `${index + 1}. @${item.id.split('@')[0]} — ${formatMoney(item.total)}`
      );

      await reply(
        sock,
        jid,
        `╭━━━『 👑 أغنى اللاعبين 』━━━╮\n\n` +
        (lines.join('\n') || 'لا توجد حسابات بعد.') +
        `\n\n╰━━━━━━━━━━━━━━━━━━╯`,
        ranking.map(item => item.id)
      );

      return;
    }

    await reply(
      sock,
      jid,
      `╭━━━『 🏦 ARTHUR BANK 』━━━╮\n\n` +
      `.بنك — عرض الرصيد\n` +
      `.بنك يومي — المكافأة اليومية\n` +
      `.بنك إيداع 100 — إيداع\n` +
      `.بنك سحب 100 — سحب\n` +
      `.بنك تحويل @لاعب 100 — تحويل\n` +
      `.بنك ترتيب — أغنى اللاعبين\n\n` +
      `╰━━━━━━━━━━━━━━━━━━╯`
    );
  }
};