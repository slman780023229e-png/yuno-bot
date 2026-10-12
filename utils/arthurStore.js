import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getAccount, save } from './arthurBankCore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_CANDIDATES = [
  path.resolve(__dirname, '../متجر/المنتجات.json'), // preferred sibling folder
  path.resolve(__dirname, '../plugins/متجر/المنتجات.json') // legacy nested folder
];
function catalogFile() {
  return CATALOG_CANDIDATES.find(file => fs.existsSync(file)) || CATALOG_CANDIDATES[0];
}

export function getStoreItems() {
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(item => item && item.id && item.name && Number(item.price) >= 0) : [];
  } catch (error) {
    console.error('[ARTHUR STORE] Catalog read failed:', error?.message || error);
    return [];
  }
}

export function getStoreItem(id) {
  return getStoreItems().find(item => item.id === String(id || '')) || null;
}

function inventoryOf(account) {
  if (!Array.isArray(account.inventory)) account.inventory = [];
  return account.inventory;
}

export function getItemCount(playerId, itemId) {
  const account = getAccount(playerId);
  const entry = inventoryOf(account).find(item => item && item.id === itemId);
  return Math.max(0, Math.floor(Number(entry?.qty) || 0));
}

export function buyStoreItem(playerId, itemId, quantity = 1) {
  const item = getStoreItem(itemId);
  const qty = Math.floor(Number(quantity));
  if (!item) return { ok: false, error: 'هذا المنتج غير موجود في المتجر.' };
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) return { ok: false, error: 'الكمية يجب أن تكون من 1 إلى 99.' };

  const account = getAccount(playerId);
  const total = Number(item.price) * qty;
  if (!Number.isSafeInteger(total) || total < 0) return { ok: false, error: 'سعر المنتج غير صالح.' };
  if ((Number(account.wallet) || 0) < total) {
    return { ok: false, error: `رصيدك لا يكفي. السعر ${total} جواهر 💎، ورصيد محفظتك ${Math.floor(Number(account.wallet) || 0)} جواهر 💎.` };
  }

  const inventory = inventoryOf(account);
  let entry = inventory.find(value => value && value.id === item.id);
  if (!entry) {
    entry = { id: item.id, qty: 0 };
    inventory.push(entry);
  }
  account.wallet -= total;
  entry.qty = Math.max(0, Math.floor(Number(entry.qty) || 0)) + qty;
  save();
  return { ok: true, item, quantity: qty, total, wallet: account.wallet, owned: entry.qty };
}

export function consumeStoreItem(playerId, itemId, quantity = 1) {
  const qty = Math.floor(Number(quantity));
  if (!Number.isSafeInteger(qty) || qty < 1) return { ok: false, error: 'كمية الاستخدام غير صالحة.' };
  const account = getAccount(playerId);
  const inventory = inventoryOf(account);
  const index = inventory.findIndex(value => value && value.id === itemId);
  if (index < 0 || Math.floor(Number(inventory[index].qty) || 0) < qty) {
    return { ok: false, count: 0, error: 'لا تملك هذا العنصر في حقيبتك.' };
  }
  inventory[index].qty -= qty;
  const remaining = inventory[index].qty;
  if (remaining <= 0) inventory.splice(index, 1);
  save();
  return { ok: true, remaining: Math.max(0, remaining) };
}

export function grantStoreItem(playerId, itemId, quantity = 1) {
  const qty = Math.floor(Number(quantity));
  if (!Number.isSafeInteger(qty) || qty < 1) return { ok: false };
  const account = getAccount(playerId);
  const inventory = inventoryOf(account);
  let entry = inventory.find(value => value && value.id === itemId);
  if (!entry) { entry = { id: itemId, qty: 0 }; inventory.push(entry); }
  entry.qty = Math.max(0, Math.floor(Number(entry.qty) || 0)) + qty;
  save();
  return { ok: true, count: entry.qty };
}

export function getStoreInventory(playerId) {
  const account = getAccount(playerId);
  const inventory = inventoryOf(account);
  const catalog = getStoreItems();
  return inventory
    .filter(entry => entry && Number(entry.qty) > 0)
    .map(entry => ({ ...getStoreItem(entry.id), id: entry.id, qty: Math.floor(Number(entry.qty) || 0) }))
    .map(entry => entry.name ? entry : ({ id: entry.id, name: entry.id, emoji: '🎒', qty: entry.qty, price: 0, description: '' }));
}

export function getStoreAudit() {
  const accounts = db()?.accounts || {};
  let total = 0;
  for (const account of Object.values(accounts)) {
    for (const item of Array.isArray(account?.inventory) ? account.inventory : []) {
      total += Math.max(0, Math.floor(Number(item?.qty) || 0));
    }
  }
  return { players: Object.keys(accounts).length, itemsOwned: total };
}
