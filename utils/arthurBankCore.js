

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scheduleArthurGithubSync } from './arthurGithubSync.js';

// ═══════════════════════════════════════════════════════
// ARTHUR WORLD CORE — Unified Edition
// البنك + الفرق + العشائر + الخزائن + التقدم + الألعاب
// ES Modules | Node.js | Termux
// ═══════════════════════════════════════════════════════

const DATA_DIR = path.join(process.cwd(), 'data', 'arthur_bank_games');
const DB_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_FILE = path.join(DATA_DIR, 'state.json.bak');

const DAY = 86_400_000;
const DEFAULT_WALLET = 1500;
const DAILY_REWARD = 500;
const DAILY_COOLDOWN = DAY;
const MAX_INTEREST_DAYS = 30;
const MAX_LEDGER_ENTRIES = 5000;
const MAX_PROCESSED_RESULTS = 10000;

let lastSaveError = null;
let dbState;

// ───────────────────────────────────────────────────────
// الأدوات العامة
// ───────────────────────────────────────────────────────

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value, fallback = 0) {
  return Math.floor(finiteNumber(value, fallback));
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'id') {
  return `${prefix}_${randomUUID()}`;
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
  return Math.floor(finiteNumber(value)).toLocaleString('en-US');
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

  return cleanId(context.mentionedJid?.[0] || '');
}

const spamRecords = new Map();

export function checkSpam(id, cooldown = 1500) {
  const key = cleanId(id);
  if (!key) return true;

  const now = Date.now();
  const last = spamRecords.get(key) || 0;

  if (now - last < Math.max(0, cooldown)) return true;

  spamRecords.set(key, now);

  if (spamRecords.size > 5000) {
    for (const [user, timestamp] of spamRecords) {
      if (now - timestamp > 60_000) spamRecords.delete(user);
    }
  }

  return false;
}

function validAmount(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function parseAmount(value) {
  const normalized = String(value || '').replace(/[,،_]/g, '');

  if (!/^\d+$/.test(normalized)) return 0;

  return validAmount(Number(normalized));
}

function ensureDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ───────────────────────────────────────────────────────
// قاعدة البيانات — تحافظ على بيانات XO القديمة
// ───────────────────────────────────────────────────────

function initialState() {
  return {
    version: 7,
    accounts: {},
    clans: {},
    teams: {},
    duels: {},
    xo: {},
    transactions: [],
    processedResults: {},
    world: {
      market: [],
      games: {},
      season: {
        id: 1,
        startedAt: Date.now()
      }
    }
  };
}

function loadDatabase() {
  ensureDirectory();

  if (!fs.existsSync(DB_FILE)) return initialState();

  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    if (!isObject(parsed)) {
      throw new Error('Database root must be an object.');
    }

    const base = initialState();

    return {
      ...base,
      ...parsed,
      version: 7,
      accounts: isObject(parsed.accounts) ? parsed.accounts : {},
      clans: isObject(parsed.clans) ? parsed.clans : {},
      teams: isObject(parsed.teams) ? parsed.teams : {},
      duels: isObject(parsed.duels) ? parsed.duels : {},
      xo: isObject(parsed.xo) ? parsed.xo : {},
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
        : [],
      processedResults: isObject(parsed.processedResults)
        ? parsed.processedResults
        : {},
      world: {
        ...base.world,
        ...(isObject(parsed.world) ? parsed.world : {}),
        market: Array.isArray(parsed.world?.market)
          ? parsed.world.market
          : [],
        games: isObject(parsed.world?.games)
          ? parsed.world.games
          : {},
        season: {
          ...base.world.season,
          ...(isObject(parsed.world?.season) ? parsed.world.season : {})
        }
      }
    };
  } catch (error) {
    const backupName = `${DB_FILE}.corrupt-${Date.now()}`;

    try {
      fs.copyFileSync(DB_FILE, backupName);
    } catch (backupError) {
      console.error('[ARTHUR WORLD] Backup failed:', backupError?.message);
      throw new Error('تعذر قراءة قاعدة البيانات وحفظ نسخة منها.');
    }

    console.error('[ARTHUR WORLD] Invalid database:', backupName, error?.message);
    throw new Error('قاعدة البيانات غير صالحة؛ راجع النسخة الاحتياطية قبل التشغيل.');
  }
}

dbState = loadDatabase();

function writeAtomic(file, content) {
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tempFile, content, {
      encoding: 'utf8',
      flag: 'wx'
    });

    fs.renameSync(tempFile, file);
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}

    throw error;
  }
}

function saveDatabase() {
  ensureDirectory();

  try {
    const serialized = JSON.stringify(dbState, null, 2);

    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, BACKUP_FILE);
      } catch (error) {
        console.error('[ARTHUR WORLD] Backup warning:', error?.message);
      }
    }

    // أولًا: الحفظ المحلي الذري.
    writeAtomic(DB_FILE, serialized);
    lastSaveError = null;

    // ثانيًا: جدولة المزامنة إلى GitHub بعد نجاح الحفظ المحلي.
    // خطأ الرفع لا يلغي الحفظ المحلي.
    try {
      scheduleArthurGithubSync();
    } catch (syncError) {
      console.error(
        '[ARTHUR WORLD] GitHub sync scheduling failed:',
        syncError?.message || syncError
      );
    }

    return true;
  } catch (error) {
    lastSaveError = error;
    console.error('[ARTHUR WORLD] Save failed:', error?.stack || error);
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
// سجل المعاملات ومنع تكرار العمليات
// ───────────────────────────────────────────────────────

function recordTransaction(type, data = {}) {
  dbState.transactions.push({
    id: makeId('tx'),
    type,
    at: Date.now(),
    ...data
  });

  if (dbState.transactions.length > MAX_LEDGER_ENTRIES) {
    dbState.transactions.splice(
      0,
      dbState.transactions.length - MAX_LEDGER_ENTRIES
    );
  }
}

function hasProcessedResult(key) {
  return Boolean(key && dbState.processedResults[key]);
}

function markProcessedResult(key, details = {}) {
  if (!key) return;

  dbState.processedResults[key] = {
    at: Date.now(),
    ...details
  };

  const keys = Object.keys(dbState.processedResults);

  if (keys.length > MAX_PROCESSED_RESULTS) {
    keys.sort((a, b) =>
      dbState.processedResults[a].at - dbState.processedResults[b].at
    );

    for (const oldKey of keys.slice(0, keys.length - MAX_PROCESSED_RESULTS)) {
      delete dbState.processedResults[oldKey];
    }
  }
}

export function getTransactions(limit = 50) {
  const count = Math.max(1, Math.min(500, integer(limit, 50)));
  return dbState.transactions.slice(-count).reverse();
}

// ───────────────────────────────────────────────────────
// الحسابات
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

  if (!isObject(account)) {
    return { account: defaults, changed: true };
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (account[key] === undefined || account[key] === null) {
      account[key] = clone(value);
      changed = true;
    }
  }

  const numericFields = [
    'wallet', 'bank', 'vault', 'debt', 'creditScore',
    'points', 'xp', 'level', 'wins', 'losses',
    'lastDaily', 'lastInterest', 'createdAt'
  ];

  for (const key of numericFields) {
    const n = Number(account[key]);

    if (!Number.isFinite(n)) {
      account[key] = defaults[key];
      changed = true;
    } else {
      const normalized = Math.max(key === 'level' ? 1 : 0, n);

      if (normalized !== account[key]) {
        account[key] = normalized;
        changed = true;
      }
    }
  }

  if (!isObject(account.skills)) {
    account.skills = { ...defaults.skills };
    changed = true;
  }

  for (const [key, value] of Object.entries(defaults.skills)) {
    const n = Number(account.skills[key]);

    if (!Number.isFinite(n) || n < 1) {
      account.skills[key] = value;
      changed = true;
    } else if (n !== account.skills[key]) {
      account.skills[key] = n;
      changed = true;
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

export function getAccount(id) {
  const key = cleanId(id);

  if (!key) throw new Error('Invalid account ID.');

  if (!Object.hasOwn(dbState.accounts, key)) {
    dbState.accounts[key] = newAccount();
    saveDatabase();
    return dbState.accounts[key];
  }

  const result = migrateAccount(dbState.accounts[key]);
  dbState.accounts[key] = result.account;

  if (result.changed) saveDatabase();

  return dbState.accounts[key];
}

export function calculateRank(points) {
  const value = nonNegative(points);

  if (value >= 100000) return '👑 أسطورة';
  if (value >= 50000) return '💎 ماسي';
  if (value >= 20000) return '🏆 ذهبي';
  if (value >= 10000) return '🥇 فضي';
  if (value >= 5000) return '🥉 برونزي';
  if (value >= 1000) return '⚔️ مقاتل';

  return '🌱 مبتدئ';
}

export function xpNeeded(level) {
  return Math.max(1, integer(level, 1)) * 400;
}

function applyLevelUps(account) {
  let levelsGained = 0;

  while (account.xp >= xpNeeded(account.level)) {
    account.xp -= xpNeeded(account.level);
    account.level++;
    account.wallet += account.level * 350;
    account.points += 50;
    levelsGained++;
  }

  return levelsGained;
}

// ───────────────────────────────────────────────────────
// فوائد البنك
// ───────────────────────────────────────────────────────

function applyInterest(account) {
  const now = Date.now();
  const last = nonNegative(account.lastInterest, now);

  if (now <= last) return false;

  if (account.bank <= 0) {
    account.lastInterest = now;
    return false;
  }

  const elapsedDays = Math.floor((now - last) / DAY);
  if (elapsedDays < 1) return false;

  const days = Math.min(elapsedDays, MAX_INTEREST_DAYS);

  for (let i = 0; i < days; i++) {
    account.bank = Math.floor(account.bank * 1.03);
  }

  account.lastInterest = last + days * DAY;
  return true;
}

export function getBankBalance(id) {
  const account = getAccount(id);

  if (applyInterest(account)) saveDatabase();

  return account.bank;
}

// ───────────────────────────────────────────────────────
// التقدم والمكافآت — يحافظ على واجهة XO
// ───────────────────────────────────────────────────────

export function addProgress(
  id,
  {
    gold = 0,
    points = 0,
    xp = 0,
    win = false,
    loss = false,
    idempotencyKey = ''
  } = {}
) {
  const key = idempotencyKey
    ? `progress:${cleanId(id)}:${String(idempotencyKey).slice(0, 180)}`
    : '';

  if (key && hasProcessedResult(key)) {
    return {
      account: getAccount(id),
      levelsGained: 0,
      bonusGold: 0,
      totalGold: 0,
      duplicate: true
    };
  }

  const account = getAccount(id);
  const goldAmount = integer(gold);
  const pointAmount = integer(points);
  const xpAmount = nonNegative(xp);

  const luck = Math.max(1, finiteNumber(account.skills?.luck, 1));
  const bonusGold = goldAmount > 0
    ? Math.floor(goldAmount * (luck * 0.05))
    : 0;

  const totalGold = goldAmount + bonusGold;

  account.wallet = Math.max(0, account.wallet + totalGold);
  account.points = Math.max(0, account.points + pointAmount);
  account.xp += xpAmount;

  if (win) account.wins++;
  if (loss) account.losses++;

  const levelsGained = applyLevelUps(account);

  if (key) markProcessedResult(key, { type: 'progress', player: cleanId(id) });

  recordTransaction('progress', {
    player: cleanId(id),
    gold: totalGold,
    points: pointAmount,
    xp: xpAmount
  });

  saveDatabase();

  return { account, levelsGained, bonusGold, totalGold, duplicate: false };
}

// ───────────────────────────────────────────────────────
// عمليات البنك
// ───────────────────────────────────────────────────────

export function deposit(id, amount) {
  const value = validAmount(amount);

  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  const account = getAccount(id);

  if (account.wallet < value) {
    return { ok: false, error: 'رصيد المحفظة لا يكفي.' };
  }

  account.wallet -= value;
  account.bank += value;

  recordTransaction('deposit', { player: cleanId(id), amount: value });
  saveDatabase();

  return { ok: true, amount: value, account };
}

export function withdraw(id, amount) {
  const value = validAmount(amount);

  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  const account = getAccount(id);
  applyInterest(account);

  if (account.bank < value) {
    return { ok: false, error: 'رصيد البنك لا يكفي.' };
  }

  account.bank -= value;
  account.wallet += value;

  recordTransaction('withdraw', { player: cleanId(id), amount: value });
  saveDatabase();

  return { ok: true, amount: value, account };
}

export function transfer(fromId, toId, amount, options = {}) {
  const from = cleanId(fromId);
  const to = cleanId(toId);
  const value = validAmount(amount);
  const transactionId = String(options?.transactionId || '').slice(0, 180);

  if (!from || !to || from === to) {
    return { ok: false, error: 'الحساب المستلم غير صالح.' };
  }

  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  const txKey = transactionId ? `transfer:${transactionId}` : '';

  if (txKey && hasProcessedResult(txKey)) {
    return { ok: false, duplicate: true, error: 'تم تنفيذ هذه العملية سابقًا.' };
  }

  const sender = getAccount(from);
  const receiver = getAccount(to);

  if (sender.wallet < value) {
    return { ok: false, error: 'رصيد المحفظة لا يكفي.' };
  }

  sender.wallet -= value;
  receiver.wallet += value;

  if (txKey) markProcessedResult(txKey, { type: 'transfer', from, to, amount: value });

  recordTransaction('transfer', { from, to, amount: value });
  saveDatabase();

  return { ok: true, amount: value, sender, receiver };
}

export function claimDaily(id) {
  const account = getAccount(id);
  const now = Date.now();
  const elapsed = now - nonNegative(account.lastDaily);

  if (elapsed < DAILY_COOLDOWN) {
    return { ok: false, remaining: DAILY_COOLDOWN - elapsed };
  }

  account.wallet += DAILY_REWARD;
  account.points += 25;
  account.xp += 50;
  account.lastDaily = now;

  const levelsGained = applyLevelUps(account);

  recordTransaction('daily', {
    player: cleanId(id),
    amount: DAILY_REWARD
  });

  saveDatabase();

  return { ok: true, reward: DAILY_REWARD, levelsGained, account };
}

// ───────────────────────────────────────────────────────
// الفرق والعشائر — عالم مشترك بين القروبات
// ───────────────────────────────────────────────────────

function teamKey(id) {
  return cleanId(id);
}

function getTeamRecord(id) {
  return dbState.teams[teamKey(id)] || null;
}

function teamRole(team, playerId) {
  return team?.members?.[cleanId(playerId)]?.role || '';
}

function isTeamLeader(team, playerId) {
  const role = teamRole(team, playerId);
  return role === 'leader' || role === 'officer';
}

export function getTeam(id) {
  const team = getTeamRecord(id);
  return team ? clone(team) : null;
}

export function listTeams(limit = 50) {
  const count = Math.max(1, Math.min(200, integer(limit, 50)));

  return Object.values(dbState.teams)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, count)
    .map(clone);
}

export function getPlayerTeam(playerId) {
  const player = cleanId(playerId);
  if (!player) return null;

  return Object.values(dbState.teams).find(team =>
    team.members && Object.hasOwn(team.members, player)
  ) || null;
}

export function createTeam(ownerId, name, options = {}) {
  const owner = cleanId(ownerId);
  const teamName = String(name || '').trim().slice(0, 40);

  if (!owner || teamName.length < 2) {
    return { ok: false, error: 'أدخل اسم فريق صحيحًا.' };
  }

  if (getPlayerTeam(owner)) {
    return { ok: false, error: 'أنت عضو في فريق بالفعل.' };
  }

  const duplicate = Object.values(dbState.teams).some(team =>
    normalizeText(team.name) === normalizeText(teamName)
  );

  if (duplicate) return { ok: false, error: 'اسم الفريق مستخدم بالفعل.' };

  const id = makeId('team');
  const now = Date.now();

  const team = {
    id,
    name: teamName,
    description: String(options.description || '').slice(0, 200),
    owner,
    members: {
      [owner]: {
        role: 'leader',
        joinedAt: now,
        contribution: 0
      }
    },
    treasury: 0,
    invites: {},
    wins: 0,
    losses: 0,
    createdAt: now,
    updatedAt: now
  };

  getAccount(owner);
  dbState.teams[id] = team;

  recordTransaction('team_create', { teamId: id, owner });
  saveDatabase();

  return { ok: true, team: clone(team) };
}

export function inviteTeamMember(teamId, inviterId, targetId) {
  const team = getTeamRecord(teamId);
  const inviter = cleanId(inviterId);
  const target = cleanId(targetId);

  if (!team || !target) return { ok: false, error: 'الفريق أو اللاعب غير موجود.' };
  if (!isTeamLeader(team, inviter)) return { ok: false, error: 'لا تملك صلاحية الدعوة.' };
  if (team.members[target]) return { ok: false, error: 'اللاعب عضو في الفريق بالفعل.' };
  if (getPlayerTeam(target)) return { ok: false, error: 'اللاعب ينتمي إلى فريق آخر.' };

  team.invites[target] = { invitedBy: inviter, at: Date.now() };
  team.updatedAt = Date.now();

  saveDatabase();
  return { ok: true, team: clone(team) };
}

export function acceptTeamInvite(teamId, playerId) {
  const team = getTeamRecord(teamId);
  const player = cleanId(playerId);

  if (!team || !player || !team.invites[player]) {
    return { ok: false, error: 'لا توجد دعوة صالحة.' };
  }

  if (getPlayerTeam(player)) {
    return { ok: false, error: 'غادر فريقك الحالي أولًا.' };
  }

  delete team.invites[player];

  team.members[player] = {
    role: 'member',
    joinedAt: Date.now(),
    contribution: 0
  };

  team.updatedAt = Date.now();
  getAccount(player);

  recordTransaction('team_join', { teamId: team.id, player });
  saveDatabase();

  return { ok: true, team: clone(team) };
}

export function leaveTeam(teamId, playerId) {
  const team = getTeamRecord(teamId);
  const player = cleanId(playerId);

  if (!team?.members?.[player]) {
    return { ok: false, error: 'أنت لست عضوًا في هذا الفريق.' };
  }

  if (team.owner === player) {
    return { ok: false, error: 'القائد يجب أن ينقل القيادة أو يحل الفريق أولًا.' };
  }

  delete team.members[player];
  delete team.invites[player];
  team.updatedAt = Date.now();

  saveDatabase();
  return { ok: true };
}

export function setTeamRole(teamId, ownerId, targetId, role) {
  const team = getTeamRecord(teamId);
  const owner = cleanId(ownerId);
  const target = cleanId(targetId);

  if (!team || team.owner !== owner) {
    return { ok: false, error: 'هذه الصلاحية للقائد فقط.' };
  }

  if (!team.members[target]) {
    return { ok: false, error: 'اللاعب ليس عضوًا في الفريق.' };
  }

  if (!['member', 'officer'].includes(role)) {
    return { ok: false, error: 'الرتبة غير صالحة.' };
  }

  if (target === team.owner) {
    return { ok: false, error: 'لا يمكن تغيير رتبة القائد بهذه الطريقة.' };
  }

  team.members[target].role = role;
  team.updatedAt = Date.now();

  saveDatabase();
  return { ok: true, team: clone(team) };
}

export function transferTeamLeadership(teamId, ownerId, targetId) {
  const team = getTeamRecord(teamId);
  const owner = cleanId(ownerId);
  const target = cleanId(targetId);

  if (!team || team.owner !== owner) {
    return { ok: false, error: 'هذه العملية للقائد الحالي فقط.' };
  }

  if (!team.members[target]) {
    return { ok: false, error: 'العضو الجديد غير موجود في الفريق.' };
  }

  team.members[owner].role = 'officer';
  team.members[target].role = 'leader';
  team.owner = target;
  team.updatedAt = Date.now();

  saveDatabase();
  return { ok: true, team: clone(team) };
}

export function dissolveTeam(teamId, ownerId) {
  const team = getTeamRecord(teamId);

  if (!team || team.owner !== cleanId(ownerId)) {
    return { ok: false, error: 'حل الفريق من صلاحية القائد فقط.' };
  }

  if (team.treasury !== 0) {
    return { ok: false, error: 'يجب تصفية خزينة الفريق قبل حله.' };
  }

  delete dbState.teams[team.id];

  recordTransaction('team_dissolve', {
    teamId: team.id,
    owner: cleanId(ownerId)
  });

  saveDatabase();
  return { ok: true };
}

export function contributeToTeam(teamId, playerId, amount) {
  const team = getTeamRecord(teamId);
  const player = cleanId(playerId);
  const value = validAmount(amount);

  if (!team || !team.members[player]) {
    return { ok: false, error: 'يجب أن تكون عضوًا في الفريق.' };
  }

  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  const account = getAccount(player);

  if (account.wallet < value) {
    return { ok: false, error: 'رصيد محفظتك لا يكفي.' };
  }

  account.wallet -= value;
  team.treasury += value;
  team.members[player].contribution += value;
  team.updatedAt = Date.now();

  recordTransaction('team_contribution', {
    teamId: team.id,
    player,
    amount: value
  });

  saveDatabase();

  return { ok: true, amount: value, wallet: account.wallet, treasury: team.treasury };
}

export function withdrawFromTeam(teamId, playerId, amount, options = {}) {
  const team = getTeamRecord(teamId);
  const player = cleanId(playerId);
  const value = validAmount(amount);

  if (!team || !team.members[player]) {
    return { ok: false, error: 'أنت لست عضوًا في الفريق.' };
  }

  if (team.owner !== player) {
    return { ok: false, error: 'سحب أموال الخزينة متاح للقائد فقط.' };
  }

  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  if (team.treasury < value) {
    return { ok: false, error: 'خزينة الفريق لا تكفي.' };
  }

  const account = getAccount(player);

  team.treasury -= value;
  account.wallet += value;
  team.updatedAt = Date.now();

  recordTransaction('team_withdraw', {
    teamId: team.id,
    player,
    amount: value,
    reason: String(options.reason || '').slice(0, 100)
  });

  saveDatabase();

  return { ok: true, amount: value, wallet: account.wallet, treasury: team.treasury };
}

export function rewardTeam(teamId, amount, options = {}) {
  const team = getTeamRecord(teamId);
  const value = validAmount(amount);
  const resultId = String(options.resultId || '').slice(0, 180);

  if (!team) return { ok: false, error: 'الفريق غير موجود.' };
  if (!value) return { ok: false, error: 'المبلغ غير صالح.' };

  const key = resultId ? `team-reward:${team.id}:${resultId}` : '';

  if (key && hasProcessedResult(key)) {
    return { ok: false, duplicate: true, error: 'تم صرف مكافأة هذه النتيجة سابقًا.' };
  }

  team.treasury += value;
  team.updatedAt = Date.now();

  if (key) markProcessedResult(key, { type: 'team_reward', teamId: team.id, amount: value });

  recordTransaction('team_reward', {
    teamId: team.id,
    amount: value,
    resultId
  });

  saveDatabase();
  return { ok: true, treasury: team.treasury, amount: value };
}

// ───────────────────────────────────────────────────────
// تسجيل الألعاب والنتائج المشتركة
// ───────────────────────────────────────────────────────

export function registerGame(gameId, details = {}) {
  const id = cleanId(gameId);

  if (!id) return { ok: false, error: 'معرّف اللعبة غير صالح.' };

  const old = dbState.world.games[id];

  dbState.world.games[id] = {
    id,
    name: String(details.name || old?.name || id).slice(0, 80),
    description: String(details.description || old?.description || '').slice(0, 300),
    enabled: details.enabled === undefined ? (old?.enabled ?? true) : Boolean(details.enabled),
    registeredAt: old?.registeredAt || Date.now(),
    updatedAt: Date.now()
  };

  saveDatabase();

  return { ok: true, game: clone(dbState.world.games[id]) };
}

export function getRegisteredGames() {
  return Object.values(dbState.world.games).map(clone);
}

export function settleGameResult({
  gameId,
  resultId,
  winners = [],
  losers = [],
  participants = [],
  rewards = {},
  teamRewards = []
} = {}) {
  const game = cleanId(gameId);
  const result = String(resultId || '').trim().slice(0, 180);

  if (!game || !result) {
    return { ok: false, error: 'يجب توفير gameId و resultId.' };
  }

  const gameInfo = dbState.world.games[game];

  if (gameInfo && !gameInfo.enabled) {
    return { ok: false, error: 'هذه اللعبة معطلة.' };
  }

  const key = `game-result:${game}:${result}`;

  if (hasProcessedResult(key)) {
    return { ok: false, duplicate: true, error: 'تمت معالجة هذه النتيجة سابقًا.' };
  }

  const winnerIds = [...new Set(winners.map(cleanId).filter(Boolean))];
  const loserIds = [...new Set(losers.map(cleanId).filter(Boolean))];
  const participantIds = [...new Set([
    ...participants.map(cleanId),
    ...winnerIds,
    ...loserIds
  ].filter(Boolean))];

  const gold = Math.max(0, integer(rewards.gold));
  const points = Math.max(0, integer(rewards.points));
  const xp = Math.max(0, integer(rewards.xp));

  const normalizedTeamRewards = [];

  for (const item of teamRewards) {
    const teamId = cleanId(item?.teamId);
    const amount = validAmount(item?.gold);

    if (!teamId || !getTeamRecord(teamId) || !amount) {
      return { ok: false, error: 'إحدى مكافآت الفرق غير صالحة.' };
    }

    normalizedTeamRewards.push({ teamId, amount });
  }

  const updates = [];

  for (const player of participantIds) {
    const isWinner = winnerIds.includes(player);
    const isLoser = loserIds.includes(player);

    const outcome = addProgress(player, {
      gold: isWinner ? gold : 0,
      points: isWinner ? points : 0,
      xp: isWinner ? xp : Math.max(0, Math.floor(xp / 3)),
      win: isWinner,
      loss: isLoser,
      idempotencyKey: `${game}:${result}:${player}`
    });

    updates.push({
      player,
      won: isWinner,
      levelsGained: outcome.levelsGained
    });
  }

  for (const item of normalizedTeamRewards) {
    const team = getTeamRecord(item.teamId);
    team.treasury += item.amount;
    team.updatedAt = Date.now();

    recordTransaction('game_team_reward', {
      game,
      result,
      teamId: team.id,
      amount: item.amount
    });
  }

  markProcessedResult(key, {
    type: 'game_result',
    gameId: game,
    resultId: result,
    participants: participantIds
  });

  recordTransaction('game_result', {
    gameId: game,
    resultId: result,
    winners: winnerIds,
    losers: loserIds
  });

  saveDatabase();

  return { ok: true, gameId: game, resultId: result, updates };
}

// ───────────────────────────────────────────────────────
// واجهة أمر البنك — توافق مع نظام plugins الحالي
// ───────────────────────────────────────────────────────

function formatDuration(ms) {
  const minutes = Math.ceil(Math.max(0, ms) / 60000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return hours > 0
    ? `${hours} ساعة و${remaining} دقيقة`
    : `${minutes} دقيقة`;
}

async function reply(sock, jid, text, mentions = []) {
  try {
    const options = {};

    if (Array.isArray(mentions) && mentions.length) {
      options.mentions = mentions;
    }

    await sock.sendMessage(jid, { text, ...options });
  } catch (error) {
    console.error('[ARTHUR BANK] Reply error:', error?.message || error);
  }
}

export default {
  name: 'arthur-bank',
  command: 'بنك',
  aliases: ['bank', 'محفظة', 'رصيدي'],
  category: 'economy',
  description: 'بنك ARTHUR: الرصيد، الإيداع، السحب، التحويل، المكافأة اليومية.',
  usage: '.بنك | .بنك إيداع 100 | .بنك سحب 100 | .بنك يومي',
  alwaysOn: true,

  async execute(sock, msg, data = {}) {
    const jid = chatId(msg, data);
    const sender = userId(msg, data);

    if (!jid || !sender) return;

    let args = getArgs(msg, data);

    if (
      args.length &&
      /^(?:\.|!|\/)?(?:بنك|bank|محفظة|رصيدي)$/i.test(args[0])
    ) {
      args = args.slice(1);
    }

    const sub = normalizeText(args[0] || 'رصيد');
    const account = getAccount(sender);

    if (['رصيد', 'حساب', 'balance'].includes(sub)) {
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

      await reply(
        sock,
        jid,
        result.ok
          ? `🎁 المكافأة اليومية\n\n💰 الذهب: +${formatMoney(result.reward)}\n⭐ النقاط: +25\n✨ الخبرة: +50\n` +
            (result.levelsGained ? `🎉 ترقيات: ${result.levelsGained}` : '')
          : `⏳ استلمت مكافأتك اليومية سابقًا.\nعد بعد: ${formatDuration(result.remaining)}`
      );
      return;
    }

    if (['ايداع', 'إيداع', 'deposit'].includes(sub)) {
      const result = deposit(sender, parseAmount(args[1]));

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم الإيداع: ${formatMoney(result.amount)}\n👛 المحفظة: ${formatMoney(result.account.wallet)}\n🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error}`
      );
      return;
    }

    if (['سحب', 'withdraw'].includes(sub)) {
      const result = withdraw(sender, parseAmount(args[1]));

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم السحب: ${formatMoney(result.amount)}\n👛 المحفظة: ${formatMoney(result.account.wallet)}\n🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error}`
      );
      return;
    }

    if (['تحويل', 'ارسال', 'إرسال', 'transfer'].includes(sub)) {
      const target = mentionTarget(msg, data);
      const amountToken = args.slice(1).find(token => /^\d[\d,_،]*$/.test(token));
      const amount = parseAmount(amountToken);

      if (!target || !amount) {
        await reply(sock, jid, '❌ الطريقة الصحيحة:\n.بنك تحويل @لاعب المبلغ');
        return;
      }

      const result = transfer(sender, target, amount);

      await reply(
        sock,
        jid,
        result.ok
          ? `✅ تم تحويل ${formatMoney(amount)} إلى @${target.split('@')[0]}.`
          : `❌ ${result.error}`,
        result.ok ? [target] : []
      );
      return;
    }

    if (['ترتيب', 'الاغنياء', 'الأغنياء', 'top'].includes(sub)) {
      const ranking = Object.entries(dbState.accounts)
        .map(([id, raw]) => {
          const a = migrateAccount(raw).account;

          return {
            id,
            total: nonNegative(a.wallet) +
              nonNegative(a.bank) +
              nonNegative(a.vault)
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
