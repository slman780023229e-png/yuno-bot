import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAccount,
  userId,
  chatId,
  formatMoney
} from '../utils/arthurBankCore.js';
import {
  getStoreItems,
  buyStoreItem,
  getStoreInventory
} from '../utils/arthurStore.js';

function textOf(msg) {
  const m = msg?.message || {};
  return String(m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
}
function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').trim();
}
async function send(sock, jid, text) { return sock.sendMessage(jid, { text }); }
function accountIsOpen(id) { return Boolean(getAccount(id).bankProfile?.name); }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../متجر'), // preferred sibling folder
  path.resolve(__dirname, 'متجر') // legacy nested folder
];
const STORE_DIR = STORE_DIR_CANDIDATES.find(dir => fs.existsSync(dir)) || STORE_DIR_CANDIDATES[0];
function imageFor(item) {
  if (!item?.image) return null;
  const full = path.resolve(STORE_DIR, item.image);
  if (!full.startsWith(STORE_DIR + path.sep) || !fs.existsSync(full)) return null;
  return full;
}
async function sendAsset(sock, jid, fileName, caption) {
  const full = path.resolve(STORE_DIR, 'صور', fileName);
  if (full.startsWith(path.resolve(STORE_DIR, 'صور') + path.sep) && fs.existsSync(full)) {
    try { return await sock.sendMessage(jid, { image: fs.readFileSync(full), caption }); }
    catch (error) { console.error('[ARTHUR STORE] Banner send failed:', error?.message || error); }
  }
  return send(sock, jid, caption);
}
async function sendItemCard(sock, jid, item, caption) {
  const img = imageFor(item);
  if (img) {
    try { return await sock.sendMessage(jid, { image: fs.readFileSync(img), caption }); }
    catch (error) { console.error('[ARTHUR STORE] Image send failed:', error?.message || error); }
  }
  return send(sock, jid, `${item?.emoji || '🛍️'} ${caption}`);
}

export default {
  name: 'arthur-shared-store',
  command: ['متجر', 'حقيبة'],
  aliases: ['store', 'shop', 'inventory'],
  category: 'economy',
  description: 'متجر ARTHUR المشترك لجميع الألعاب وحقيبة العناصر مع صور المنتجات.',

  async execute(sock, msg, context = {}) {
    const jid = chatId(msg, context) || msg?.key?.remoteJid;
    const id = userId(msg, context);
    if (!jid || !id) return;

    const raw = textOf(msg).replace(/^[.!/#]+/, '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    const first = normalized(parts[0]);
    const sub = normalized(parts[1] || '');

    if (first === 'حقيبة' || ['حقيبتي', 'مخزني'].includes(sub)) {
      const items = getStoreInventory(id);
      await sendAsset(sock, jid, 'bag.png', `╭━━━『 🎒 حقيبة ARTHUR 』━━━╮\n\n${items.length ? `عدد أنواع العناصر: ${items.length}` : 'حقيبتك فارغة حاليًا.'}\n\n${items.length ? 'ستظهر صورة كل عنصر مع اسمه وكميته:' : 'اكتب .متجر لشراء العناصر.'}\n╰━━━━━━━━━━━━━━━━━━╯`);
      for (const item of items) {
        const caption = `🎒 *${item.name}*\n📦 الكمية: × ${item.qty}\n${item.description || ''}`.trim();
        await sendItemCard(sock, jid, item, caption);
      }
      return;
    }

    if (sub === 'شراء' || sub === 'buy') {
      if (!accountIsOpen(id)) {
        return send(sock, jid, '🏦 قبل الشراء، افتح حسابك في البنك أولًا:\n.بنك فتح حساب\n\nستختار اسمك وشعارك، وبعدها تقدر تشتري من المتجر.');
      }
      const itemToken = parts[2] || '';
      const qtyToken = parts[3] || '1';
      const items = getStoreItems();
      const byNumber = /^\d+$/.test(itemToken) ? items[Number(itemToken) - 1] : null;
      const item = byNumber || items.find(value => value.id === itemToken || normalized(value.name) === normalized(itemToken));
      if (!item) return send(sock, jid, '❌ اختر رقم المنتج الصحيح من .متجر ثم اكتب مثلًا: .متجر شراء 1 2');
      const result = buyStoreItem(id, item.id, Number(qtyToken));
      if (!result.ok) return send(sock, jid, `❌ ${result.error}`);
      const caption = `✅ *تم الشراء بنجاح*\n\n${item.emoji || '🛍️'} ${item.name} × ${result.quantity}\n💰 السعر الإجمالي: ${formatMoney(result.total)} جواهر 💎\n🎒 في حقيبتك الآن: ${result.owned}\n👛 المتبقي في المحفظة: ${formatMoney(result.wallet)} جواهر 💎`;
      return sendItemCard(sock, jid, item, caption);
    }

    const items = getStoreItems();
    const account = getAccount(id);
    const profileLine = account.bankProfile?.name
      ? `👤 ${account.bankProfile.logo || '🎮'} ${account.bankProfile.name}`
      : `🪪 افتح حسابك للشراء: .بنك فتح حساب`;
    await sendAsset(sock, jid, 'store.png',
      `╭━━━『 🏪 ARTHUR WORLD STORE 』━━━╮\n` +
      `${profileLine}\n` +
      `👛 محفظتك: ${formatMoney(account.wallet)} جواهر 💎\n\n` +
      `🖼️ هذه منتجات المتجر؛ ستصل صورة صغيرة لكل منتج مع السعر وطريقة الشراء.\n` +
      `🎒 حقيبتك: .متجر حقيبتي\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
    );
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const caption = `${index + 1}. ${item.emoji || '🛍️'} *${item.name}*\n💰 السعر: ${formatMoney(item.price)} جواهر 💎\n${item.description || ''}\n🛒 للشراء: .متجر شراء ${index + 1} [الكمية]`;
      await sendItemCard(sock, jid, item, caption);
    }
  }
};
