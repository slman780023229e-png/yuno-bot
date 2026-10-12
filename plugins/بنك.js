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
  withdrawFromTeam,
  save
} from '../utils/arthurBankCore.js';

// Persist account setup state in the bank database so plugin hot-reloads
// or restarts do not lose the user's current name/logo step.
function setupStore() {
  const database = db();
  if (!database.accountSetup || typeof database.accountSetup !== 'object' || Array.isArray(database.accountSetup)) {
    database.accountSetup = {};
  }
  return database.accountSetup;
}

function setAccountSetup(sender, value) {
  setupStore()[sender] = value;
  save();
}

function getAccountSetup(sender) {
  return setupStore()[sender] || null;
}

function deleteAccountSetup(sender) {
  delete setupStore()[sender];
  save();
}

function extractIncomingText(msg) {
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
    ''
  ).trim();
}

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

    if (
      (sub === 'حذف' && ['الحساب', 'حساب'].includes(String(args[1] || '').toLowerCase())) ||
      ['حذف_الحساب', 'حذفحساب'].includes(sub)
    ) {
      const current = db().accounts?.[sender];
      if (!current) return reply(sock, jid, 'ℹ️ لا يوجد حساب بنكي محفوظ لحذفه.');
      setAccountSetup(sender, { step: 'delete_confirm', startedAt: Date.now() });
      return reply(sock, jid,
        '⚠️ تأكيد حذف حساب ARTHUR BANK\n\n' +
        'سيتم حذف حسابك البنكي ورصيدك وتقدمك الاقتصادي نهائيًا. هذا لا يحذف رسائلك أو رقمك من واتساب.\n\n' +
        'للتأكيد اكتب: تأكيد حذف الحساب\n' +
        'للإلغاء اكتب: إلغاء'
      );
    }

    if ((sub === 'فتح' && String(args[1] || '').toLowerCase() === 'حساب') || ['فتح_حساب', 'فتححساب'].includes(sub)) {
      const account = getAccount(sender);
      if (account.bankProfile?.name) {
        return reply(sock, jid, `🏦 حسابك مفتوح بالفعل!\n\n${account.bankProfile.logo || '🎮'} الاسم: ${account.bankProfile.name}\nالشعار: ${account.bankProfile.logo || '🎮'}\n\nلتعديل الملف: .بنك تعديل الحساب`);
      }
      setAccountSetup(sender, { step: 'name', startedAt: Date.now() });
      return reply(sock, jid, `╭━━━『 🏦 فتح حساب ARTHUR 』━━━╮\n\nأهلًا بك في بنك ARTHUR! سننشئ لك بطاقة خاصة.\n\n1️⃣ اكتب الاسم الذي تريد ظهوره في البطاقة (من 2 إلى 24 حرفًا).\nاكتب إلغاء إذا أردت التوقف.\n\n╰━━━━━━━━━━━━━━━━━━━━╯`);
    }

    if ((sub === 'تعديل' && String(args[1] || '').toLowerCase() === 'الحساب') || sub === 'تعديل_الحساب') {
      setAccountSetup(sender, { step: 'name', startedAt: Date.now(), editing: true });
      return reply(sock, jid, '📝 تعديل بطاقة البنك\nاكتب الاسم الجديد (من 2 إلى 24 حرفًا)، أو اكتب إلغاء.');
    }

    if (['بطاقتي', 'ملفي', 'بطاقة'].includes(sub)) {
      const account = getAccount(sender);
      if (!account.bankProfile?.name) return reply(sock, jid, 'ليس لديك ملف مصرفي بعد. اكتب: .بنك فتح حساب');
      return reply(sock, jid, `╭━━━『 🏦 بطاقة ARTHUR 』━━━╮\n\n${account.bankProfile.logo || '🎮'} ${account.bankProfile.name}\n🆔 الحساب: ${sender.split('@')[0]}\n👛 المحفظة: ${formatMoney(account.wallet)} جواهر 💎\n🏦 البنك: ${formatMoney(getBankBalance(sender))} جواهر 💎\n⭐ النقاط: ${formatMoney(account.points)}\n🎖️ الرتبة: ${calculateRank(account.points)}\n\n╰━━━━━━━━━━━━━━━━━━╯`);
    }

    // ─────────────── الرصيد ───────────────
    if (['رصيد', 'حساب', 'balance'].includes(sub)) {
      const account = getAccount(sender);
      const bank = getBankBalance(sender);

      return reply(
        sock,
        jid,
        `╭━━━『 🏦 ARTHUR BANK 』━━━╮\n\n` +
        (account.bankProfile?.name ? `${account.bankProfile.logo || '🎮'} ${account.bankProfile.name}\n\n` : `🪪 ملف البنك: غير مفتوح — .بنك فتح حساب\n\n`) +
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
        `💰 الجواهر 💎: +${formatMoney(result.reward)}\n` +
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
      `• .بنك فتح حساب — إنشاء بطاقة باسم وشعار\n` +
      `• .بنك بطاقتي — عرض بطاقتك\n` +
      `• .بنك حذف الحساب — حذف حسابك بعد التأكيد\n` +
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
  },

  async onMessage(sock, msg, context = {}) {
    if (!msg?.key || msg.key.fromMe) return;
    const sender = userId(msg, context);
    const jid = chatId(msg, context) || msg.key.remoteJid;
    if (!sender || !jid) return;
    const pending = getAccountSetup(sender);
    if (!pending) return;
    const raw = extractIncomingText(msg);
    if (!raw) return;
    const plain = raw.replace(/^[.!/#]+/, '').trim();
    const normalized = plain.toLowerCase().replace(/[أإآٱ]/g, 'ا');
    if (normalized === 'الغاء' || normalized === 'إلغاء' || normalized === 'cancel') {
      deleteAccountSetup(sender);
      await reply(sock, jid, 'تم إلغاء إعداد بطاقة البنك.');
      return { handled: true };
    }
    if (/^[.!/#]/.test(raw)) return;

    if (pending.step === 'delete_confirm') {
      if (Date.now() - pending.startedAt > 2 * 60_000) {
        deleteAccountSetup(sender);
        await reply(sock, jid, 'انتهت مهلة تأكيد الحذف. لم يتم حذف حسابك.');
        return { handled: true };
      }
      const confirmation = normalized.replace(/\s+/g, ' ').trim();
      if (!['تاكيد حذف الحساب', 'تاكيد حذف حساب', 'احذف حسابي'].includes(confirmation)) {
        await reply(sock, jid, 'لم يتم حذف الحساب. للتأكيد اكتب بالضبط: تأكيد حذف الحساب، أو اكتب إلغاء.');
        return { handled: true };
      }
      delete db().accounts[sender];
      deleteAccountSetup(sender);
      save();
      await reply(sock, jid, '🗑️ تم حذف حسابك البنكي وتقدمك الاقتصادي. إذا رغبت بالعودة يمكنك فتح حساب جديد عبر: .بنك فتح حساب');
      return { handled: true };
    }
    if (Date.now() - pending.startedAt > 10 * 60_000) {
      deleteAccountSetup(sender);
      await reply(sock, jid, 'انتهت مهلة فتح الحساب. اكتب .بنك فتح حساب للبدء من جديد.');
      return { handled: true };
    }
    if (pending.step === 'name') {
      const name = plain.replace(/^(?:الاسم|اسم)\s*[:：-]?\s*/i, '').trim();
      if (name.length < 2 || name.length > 24) {
        await reply(sock, jid, '❌ الاسم يجب أن يكون من 2 إلى 24 حرفًا. أعد كتابة الاسم فقط.');
        return { handled: true };
      }
      pending.name = name;
      pending.step = 'logo';
      setAccountSetup(sender, pending);
      await reply(sock, jid, `جميل يا ${name}! الآن أرسل شعارك: إيموجي أو رمز قصير مثل 👑 أو 🐉 أو ☘️.`);
      return { handled: true };
    }
    if (pending.step === 'logo') {
      const logo = plain.replace(/^(?:الشعار|شعار)\s*[:：-]?\s*/i, '').trim();
      if (!logo || [...logo].length > 12) {
        await reply(sock, jid, '❌ أرسل شعارًا قصيرًا مثل 👑 أو 🐉 أو ☘️.');
        return { handled: true };
      }
      const account = getAccount(sender);
      account.bankProfile = { name: pending.name, logo, openedAt: account.bankProfile?.openedAt || Date.now(), updatedAt: Date.now() };
      save();
      deleteAccountSetup(sender);
      await reply(sock, jid, `╭━━━『 ✅ تم فتح حسابك 』━━━╮\n\n${logo} *${pending.name}*\n🏦 أصبح لديك ملف مصرفي في ARTHUR BANK.\n🛍️ المتجر: .متجر\n🎒 حقيبتك: .متجر حقيبتي\n🪪 بطاقتك: .بنك بطاقتي\n\n╰━━━━━━━━━━━━━━━━━━╯`);
      return { handled: true };
    }
  }

};