import {
  getAccount,
  getBankBalance,
  calculateRank,
  xpNeeded,
  formatMoney,
  userId,
  chatId,
  getArgs,
  mentionTarget,
  deposit,
  withdraw,
  transfer,
  claimDaily,
  db,
  getTeam,
  getPlayerTeam,
  contributeToTeam,
  withdrawFromTeam
} from '../utils/arthurBankCore.js';

function parseAmount(value) {
  const text = String(value || '').replace(/[,،_]/g, '');
  if (!/^\d+$/.test(text)) return 0;

  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function duration(ms) {
  const minutes = Math.ceil(Math.max(0, ms) / 60000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return hours
    ? `${hours} ساعة و${remaining} دقيقة`
    : `${minutes} دقيقة`;
}

async function reply(sock, jid, text, mentions = []) {
  const options = {};

  if (mentions.length) options.mentions = mentions;

  await sock.sendMessage(jid, { text, ...options });
}

export default {
  name: 'arthur-bank-commands',
  command: 'بنك',
  aliases: ['bank', 'محفظة', 'رصيدي'],
  category: 'economy',
  description: 'أوامر بنك ARTHUR والاقتصاد والفرق.',
  usage: '.بنك',

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

    const sub = String(args[0] || 'رصيد').toLowerCase();

    // ─────────────── الرصيد ───────────────
    if (['رصيد', 'حساب', 'balance'].includes(sub)) {
      const account = getAccount(sender);
      const bank = getBankBalance(sender);

      return reply(
        sock,
        jid,
        `╭━━━『 🏦 ARTHUR BANK 』━━━╮\n\n` +
        `👛 المحفظة: ${formatMoney(account.wallet)}\n` +
        `🏦 البنك: ${formatMoney(bank)}\n` +
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
    }

    // ─────────────── المكافأة اليومية ───────────────
    if (['يومي', 'daily'].includes(sub)) {
      const result = claimDaily(sender);

      if (!result.ok) {
        return reply(
          sock,
          jid,
          `⏳ استلمت مكافأتك اليومية سابقًا.\n` +
          `عد بعد: ${duration(result.remaining)}`
        );
      }

      return reply(
        sock,
        jid,
        `╭━━━『 🎁 مكافأة ARTHUR 』━━━╮\n\n` +
        `💰 الذهب: +${formatMoney(result.reward)}\n` +
        `⭐ النقاط: +25\n` +
        `✨ الخبرة: +50\n` +
        (result.levelsGained
          ? `🎉 ترقيات: ${result.levelsGained}\n`
          : '') +
        `\n╰━━━━━━━━━━━━━━━━━━╯`
      );
    }

    // ─────────────── الإيداع ───────────────
    if (['ايداع', 'إيداع', 'deposit'].includes(sub)) {
      const result = deposit(sender, parseAmount(args[1]));

      return reply(
        sock,
        jid,
        result.ok
          ? `✅ تم الإيداع: ${formatMoney(result.amount)}\n` +
            `👛 المحفظة: ${formatMoney(result.account.wallet)}\n` +
            `🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error}`
      );
    }

    // ─────────────── السحب ───────────────
    if (['سحب', 'withdraw'].includes(sub)) {
      const result = withdraw(sender, parseAmount(args[1]));

      return reply(
        sock,
        jid,
        result.ok
          ? `✅ تم السحب: ${formatMoney(result.amount)}\n` +
            `👛 المحفظة: ${formatMoney(result.account.wallet)}\n` +
            `🏦 البنك: ${formatMoney(result.account.bank)}`
          : `❌ ${result.error}`
      );
    }

    // ─────────────── التحويل ───────────────
    if (['تحويل', 'ارسال', 'إرسال', 'transfer'].includes(sub)) {
      const target = mentionTarget(msg, data);
      const amountToken = args.slice(1).find(
        token => /^\d[\d,_،]*$/.test(token)
      );
      const amount = parseAmount(amountToken);

      if (!target || !amount) {
        return reply(
          sock,
          jid,
          '❌ الطريقة الصحيحة:\n.بنك تحويل @لاعب 100'
        );
      }

      const result = transfer(sender, target, amount);

      return reply(
        sock,
        jid,
        result.ok
          ? `✅ تم تحويل ${formatMoney(amount)} إلى @${target.split('@')[0]}.`
          : `❌ ${result.error}`,
        result.ok ? [target] : []
      );
    }

    // ─────────────── ترتيب الأغنياء ───────────────
    if (['ترتيب', 'الاغنياء', 'الأغنياء', 'top'].includes(sub)) {
      const ranking = Object.entries(db().accounts)
        .map(([id, account]) => ({
          id,
          total:
            Math.max(0, Number(account.wallet) || 0) +
            Math.max(0, Number(account.bank) || 0) +
            Math.max(0, Number(account.vault) || 0)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const lines = ranking.map((item, index) =>
        `${index + 1}. @${item.id.split('@')[0]} — ${formatMoney(item.total)}`
      );

      return reply(
        sock,
        jid,
        `╭━━━『 👑 أغنى اللاعبين 』━━━╮\n\n` +
        (lines.join('\n') || 'لا توجد حسابات بعد.') +
        `\n\n╰━━━━━━━━━━━━━━━━━━╯`,
        ranking.map(item => item.id)
      );
    }

    // ─────────────── عرض الفريق والخزينة ───────────────
    if (['فريقي', 'فريق', 'team'].includes(sub)) {
      const team = getPlayerTeam(sender);

      if (!team) {
        return reply(
          sock,
          jid,
          '❌ أنت لست عضوًا في فريق حاليًا.'
        );
      }

      return reply(
        sock,
        jid,
        `╭━━━『 🛡️ ${team.name} 』━━━╮\n\n` +
        `🆔 المعرّف: ${team.id}\n` +
        `👑 القائد: @${team.owner.split('@')[0]}\n` +
        `👥 الأعضاء: ${Object.keys(team.members || {}).length}\n` +
        `💰 الخزينة: ${formatMoney(team.treasury)}\n` +
        `🏆 الانتصارات: ${team.wins || 0}\n` +
        `💔 الخسائر: ${team.losses || 0}\n\n` +
        `╰━━━━━━━━━━━━━━━━━━╯`,
        [team.owner]
      );
    }

    // ─────────────── إيداع في خزينة الفريق ───────────────
    if (['تبرع', 'ايداع_فريق', 'إيداع_فريق'].includes(sub)) {
      const team = getPlayerTeam(sender);
      const amount = parseAmount(args[1]);

      if (!team) {
        return reply(sock, jid, '❌ يجب أن تكون عضوًا في فريق.');
      }

      const result = contributeToTeam(team.id, sender, amount);

      return reply(
        sock,
        jid,
        result.ok
          ? `✅ أودعت ${formatMoney(result.amount)} في خزينة ${team.name}.\n` +
            `👛 محفظتك: ${formatMoney(result.wallet)}\n` +
            `🏦 خزينة الفريق: ${formatMoney(result.treasury)}`
          : `❌ ${result.error}`
      );
    }

    // ─────────────── سحب من خزينة الفريق ───────────────
    if (['سحب_فريق', 'سحبفريق'].includes(sub)) {
      const team = getPlayerTeam(sender);
      const amount = parseAmount(args[1]);

      if (!team) {
        return reply(sock, jid, '❌ يجب أن تكون عضوًا في فريق.');
      }

      const result = withdrawFromTeam(team.id, sender, amount);

      return reply(
        sock,
        jid,
        result.ok
          ? `✅ سحبت ${formatMoney(result.amount)} من خزينة الفريق.\n` +
            `👛 محفظتك: ${formatMoney(result.wallet)}\n` +
            `🏦 خزينة الفريق: ${formatMoney(result.treasury)}`
          : `❌ ${result.error}`
      );
    }

    // ─────────────── المساعدة ───────────────
    return reply(
      sock,
      jid,
      `╭━━━『 🏦 ARTHUR BANK 』━━━╮\n\n` +
      `💳 الاقتصاد الشخصي\n` +
      `• .بنك — عرض الرصيد\n` +
      `• .بنك يومي — المكافأة اليومية\n` +
      `• .بنك إيداع 100 — إيداع في البنك\n` +
      `• .بنك سحب 100 — سحب من البنك\n` +
      `• .بنك تحويل @لاعب 100 — تحويل أموال\n` +
      `• .بنك ترتيب — أغنى اللاعبين\n\n` +
      `🛡️ اقتصاد الفرق\n` +
      `• .بنك فريقي — معلومات فريقك\n` +
      `• .بنك تبرع 100 — إيداع في خزينة الفريق\n` +
      `• .بنك سحب_فريق 100 — سحب للقائد فقط\n\n` +
      `╰━━━━━━━━━━━━━━━━━━╯`
    );
  }
};