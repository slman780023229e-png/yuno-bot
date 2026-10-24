import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAccount, getBankBalance, getArgs, userId, chatId, save, formatMoney } from '../utils/arthurBankCore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'data', 'مزرعة_آرثر.json');
const STATE_FILE = path.join(ROOT, 'data', 'مزرعة_آرثر_حفظ.json');
const now = () => Date.now();
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
const norm = s => String(s || '').trim().normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!c?.crops || !c?.animals || !c?.farm) throw new Error('missing required config');
    return c;
  } catch (e) {
    console.error('[ARTHUR FARM] config load error:', e.message);
    throw new Error('تعذر قراءة data/مزرعة_آرثر.json؛ تأكد من وجود ملف الإعدادات وصحة JSON.');
  }
}
function readState() {
  try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; }
  catch { return {}; }
}
let state = readState();
function persist() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}
function cfg() { return loadConfig(); }
function player(id) {
  if (!state[id]) state[id] = { farm: null, pendingBet: null, activeBet: null };
  return state[id];
}
function account(id) { return getAccount(id); }
function wallet(id) { return num(account(id).wallet); }
function charge(id, amount) {
  amount = num(amount);
  const a = account(id);
  if (amount <= 0) return { ok: false, message: 'المبلغ غير صالح.' };
  if (num(a.wallet) < amount) return { ok: false, message: `رصيد محفظتك لا يكفي. تحتاج ${formatMoney(amount)} ولديك ${formatMoney(a.wallet)}.` };
  a.wallet -= amount; save(); return { ok: true };
}
function credit(id, amount) { const a = account(id); a.wallet = num(a.wallet) + num(amount); save(); }
function ensureFarm(id) { const p = player(id); if (!p.farm) return null; return p.farm; }
function initFarm(id, c) {
  return { owner: id, createdAt: now(), level: c.farm.startingLevel, plots: c.farm.startingPlots, fields: {}, storageCapacity: c.farm.startingStorage, inventory: {}, water: c.farm.startingWater, waterCapacity: c.farm.startingWaterCapacity, well: false, lastWellAt: 0, pens: {}, animals: {}, xp: 0, wins: 0, losses: 0 };
}
function invCount(f) { return Object.values(f.inventory).reduce((a, b) => a + num(b), 0); }
function addItem(f, name, qty) { f.inventory[name] = num(f.inventory[name]) + qty; if (f.inventory[name] <= 0) delete f.inventory[name]; }
function timeLeft(ms) { const sec = Math.max(0, Math.ceil(ms / 1000)); if (sec < 60) return `${sec} ثانية`; return `${Math.floor(sec / 60)} دقيقة${sec % 60 ? ` و${sec % 60} ثانية` : ''}`; }
function farmOverview(id, c) {
  const f = ensureFarm(id); if (!f) return `🏡 لم تشترِ مزرعة بعد.\n💰 السعر: ${formatMoney(c.farm.purchasePrice)}\nاكتب: .شراء مزرعة`;
  const fields = [];
  for (let i = 1; i <= f.plots; i++) {
    const crop = f.fields[i];
    if (!crop) fields.push(`${i}. 🟫 أرض فارغة`);
    else {
      const def = c.crops[crop.crop];
      const left = crop.readyAt - now();
      fields.push(`${i}. ${def?.emoji || '🌱'} ${crop.crop} — ${left <= 0 ? 'جاهز للحصاد' : `ينضج بعد ${timeLeft(left)}`}${crop.watered ? ' 💧' : ''}`);
    }
  }
  return `🩸 *ARTHUR FARM — مزرعتك*\n\n🌱 المستوى: ${f.level}\n🧑‍🌾 قطع الأرض: ${f.plots}\n💧 الماء: ${f.water}/${f.waterCapacity}${f.well ? ' | بئر موجود' : ''}\n📦 المخزن: ${invCount(f)}/${f.storageCapacity}\n🐄 الحيوانات: ${Object.values(f.animals).reduce((a,b)=>a+num(b),0)}\n✨ الخبرة: ${f.xp}\n\n*الأراضي:*\n${fields.join('\n')}\n\n📌 .بذور | .مخزني | .ماء | .حيوانات | .متجر المزرعة`;
}
function help() {
 return `🩸 *ARTHUR FARM — دليل المزرعة*\n\n🏡 .مزرعة — عرض المزرعة\n🛒 .شراء مزرعة\n🌱 .بذور — أسعار البذور\n🌾 .زراعة 1 طماطم\n🌾 .حصاد 1\n💧 .ماء — حالة الماء\n💧 .شراء ماء 20\n🕳️ .شراء بئر\n📦 .مخزني\n💰 .بيع طماطم 3 | .بيع الكل\n🏗️ .توسعة المزرعة\n📦 .تطوير المخزن\n🚰 .تطوير الماء\n🐄 .حيوانات\n🏚️ .شراء حظيرة دجاج\n🐔 .شراء حيوان دجاج 1\n🌾 .علف دجاج 2\n🥚 .جمع المنتجات\n🎲 .رهان @لاعب 500 — إنشاء تحدي افتراضي\n🎲 .قبول الرهان — قبول التحدي الوارد\n❌ .رفض الرهان — رفضه\n\nتُستخدم محفظة بنك ARTHUR. لا تستبدل ملفات البنك أو المعالج.`;
}
async function reply(sock, jid, text, mentions = []) { await sock.sendMessage(jid, { text, ...(mentions.length ? { mentions } : {}) }); }
function getMention(msg, data) {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo || msg?.message?.imageMessage?.contextInfo || {};
  const mentioned = ctx.mentionedJid?.[0];
  const quoted = ctx.participant;
  return String(data.target || mentioned || quoted || '').trim();
}

export default {
  name: 'arthur-farm', command: 'مزرعة', aliases: ['مزرعتي','شراء','بذور','زراعة','حصاد','مخزني','ماء','بيع','توسعة','تطوير','متجر','حيوانات','حظيرتي','علف','جمع','رهان','قبول','رفض','ترتيب','تسميد','سقي','رهاني','إنهاء'],
  category: 'games', description: 'مملكة زراعية: محاصيل ومياه ومخازن وحيوانات وتحديات افتراضية.',
  async execute(sock, msg, data = {}) {
    const jid = chatId(msg, data), id = userId(msg, data);
    if (!jid || !id) return;
    let args = getArgs(msg, data);
    if (args.length && /^(?:\.|!|\/)?(?:مزرعة|مزرعتي|شراء|بذور|زراعة|حصاد|مخزني|ماء|بيع|توسعة|تطوير|متجر|حيوانات|حظيرتي|علف|جمع|رهان|قبول|رفض|ترتيب)/i.test(args[0])) {
      const first = norm(args[0]);
      if (['مزرعة','مزرعتي','بذور','زراعة','حصاد','مخزني','ماء','بيع','توسعة','تطوير','متجر','حيوانات','حظيرتي','علف','جمع','رهان','قبول','رفض','ترتيب'].includes(first)) args = [first, ...args.slice(1)];
      else if (first === 'شراء') args = ['شراء', ...args.slice(1)];
    }
    // Prefix parser: handler supplies text without prefix in normal use; support full command too.
    const raw = String(data.noPrefixText || data.text || args.join(' ')).trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    let cmd = norm(parts[0] || 'مزرعة');
    if (cmd.startsWith('.')) cmd = cmd.slice(1);
    if (cmd === 'مزرعتي') cmd = 'مزرعة';
    if (cmd === 'شراء' && norm(parts[1]) === 'مزرعة') { cmd = 'شراء مزرعة'; parts.splice(1, 1); }
    else if (cmd === 'شراء' && norm(parts[1]) === 'ماء') { cmd = 'شراء ماء'; parts.splice(1, 1); }
    else if (cmd === 'شراء' && norm(parts[1]) === 'بئر') { cmd = 'شراء بئر'; parts.splice(1, 1); }
    else if (cmd === 'شراء' && norm(parts[1]) === 'حظيرة') { cmd = 'شراء حظيرة'; parts.splice(1, 1); }
    else if (cmd === 'شراء' && norm(parts[1]) === 'حيوان') { cmd = 'شراء حيوان'; parts.splice(1, 1); }
    else if (cmd === 'تطوير' && norm(parts[1]) === 'المخزن') { cmd = 'تطوير المخزن'; parts.splice(1, 1); }
    else if (cmd === 'تطوير' && norm(parts[1]) === 'الماء') { cmd = 'تطوير الماء'; parts.splice(1, 1); }
    else if (cmd === 'توسعة' && norm(parts[1]) === 'المزرعة') { cmd = 'توسعة المزرعة'; parts.splice(1, 1); }
    else if (cmd === 'قبول' && norm(parts[1]) === 'الرهان') { cmd = 'قبول الرهان'; parts.splice(1, 1); }
    else if (cmd === 'رفض' && norm(parts[1]) === 'الرهان') { cmd = 'رفض الرهان'; parts.splice(1, 1); }
    else if (cmd === 'إنهاء' && norm(parts[1]) === 'الرهان') { cmd = 'إنهاء الرهان'; parts.splice(1, 1); }
    else if (cmd === 'رهاني') cmd = 'رهاني';
    else if (cmd === 'متجر') cmd = 'متجر المزرعة';
    else if (cmd === 'ترتيب') cmd = 'ترتيب المزارعين';
    else if (cmd === 'حظيرتي') cmd = 'حيوانات';
    const a = parts.slice(1);
    let c;
    try { c = cfg(); } catch (e) { return reply(sock, jid, `❌ ${e.message}`); }
    const p = player(id);
    const f = ensureFarm(id);

    if (cmd === 'مساعدة' || cmd === 'مزرعة مساعدة' || cmd === 'help') return reply(sock, jid, help());
    if (cmd === 'مزرعة') return reply(sock, jid, farmOverview(id, c));
    if (cmd === 'شراء مزرعة') {
      if (p.farm) return reply(sock, jid, '🏡 لديك مزرعة بالفعل! اكتب .مزرعة لعرضها.');
      const paid = charge(id, c.farm.purchasePrice); if (!paid.ok) return reply(sock, jid, `❌ ${paid.message}`);
      p.farm = initFarm(id, c); persist(); return reply(sock, jid, `👑 مبروك! أصبحت مالك مزرعة ARTHUR FARM.\n💰 التكلفة: ${formatMoney(c.farm.purchasePrice)}\n🌱 الأراضي: ${p.farm.plots}\n💧 الماء: ${p.farm.water}/${p.farm.waterCapacity}\n📦 سعة المخزن: ${p.farm.storageCapacity}\nاكتب .مزرعة لعرض مزرعتك.`);
    }
    if (cmd === 'بذور' || cmd === 'متجر المزرعة') {
      const crops = Object.entries(c.crops).map(([n,x]) => `${x.emoji} ${n}: بذرة ${formatMoney(x.seedPrice)} | نضج ${x.growMinutes} د | بيع ${formatMoney(x.sellPrice)}`).join('\n');
      const animals = Object.entries(c.animals).map(([n,x]) => `${x.emoji} ${n}: ${formatMoney(x.price)} | المنتج ${x.product} كل ${x.productEveryMinutes} د`).join('\n');
      return reply(sock, jid, `🌱 *متجر البذور*\n${crops}\n\n🐄 *متجر الحيوانات*\n${animals}\n\n🏗️ التوسعة والمخزن والماء: اكتب .توسعة المزرعة أو .تطوير المخزن أو .تطوير الماء`);
    }
    if (!f && !['شراء مزرعة','ترتيب المزارعين','رهان','قبول الرهان','رفض الرهان'].includes(cmd)) return reply(sock, jid, '🏡 يجب شراء مزرعة أولًا. اكتب .شراء مزرعة');

    if (cmd === 'زراعة') {
      const plot = num(a[0], 0), cropName = a.slice(1).join(' '), key = Object.keys(c.crops).find(k => norm(k) === norm(cropName));
      if (!Number.isInteger(plot) || plot < 1 || plot > f.plots) return reply(sock, jid, `❌ رقم قطعة الأرض غير صالح. لديك ${f.plots} قطع.`);
      if (!key) return reply(sock, jid, '❌ المحصول غير موجود. اكتب .بذور لرؤية المحاصيل.');
      if (f.fields[plot]) return reply(sock, jid, `❌ الأرض ${plot} مشغولة بمحصول ${f.fields[plot].crop}. احصده أولًا.`);
      const crop = c.crops[key], paid = charge(id, crop.seedPrice); if (!paid.ok) return reply(sock, jid, `❌ ${paid.message}`);
      f.fields[plot] = { crop: key, plantedAt: now(), readyAt: now() + crop.growMinutes * 60000, watered: false, fertilized: false };
      p.farm.xp += 1; persist(); return reply(sock, jid, `${crop.emoji} زُرع ${key} في الأرض ${plot}!\n💰 ثمن البذرة: ${formatMoney(crop.seedPrice)}\n⏳ النضج بعد ${crop.growMinutes} دقيقة.\n💧 الماء المتوفر: ${f.water}/${f.waterCapacity}`);
    }
    if (cmd === 'حصاد') {
      const plot = num(a[0], 0); if (!plot || plot > f.plots || !f.fields[plot]) return reply(sock, jid, '❌ لا يوجد محصول في قطعة الأرض المحددة.');
      const crop = f.fields[plot], def = c.crops[crop.crop];
      if (crop.readyAt > now()) return reply(sock, jid, `⏳ لم ينضج ${crop.crop} بعد. بقي ${timeLeft(crop.readyAt - now())}.`);
      if (invCount(f) + 1 > f.storageCapacity) return reply(sock, jid, '📦 المخزن ممتلئ! بِع بعض المنتجات أو طوّر المخزن قبل الحصاد.');
      addItem(f, crop.crop, 1); delete f.fields[plot]; f.xp += def.xp; persist(); return reply(sock, jid, `🌾 تم حصاد ${def.emoji} ${crop.crop}!\n📦 أضيف إلى المخزن.\n💵 سعر البيع الأساسي: ${formatMoney(def.sellPrice)}\n📦 المخزن: ${invCount(f)}/${f.storageCapacity}`);
    }
    if (cmd === 'ماء') { if (f.well) { const cycles = Math.floor((now() - num(f.lastWellAt, now())) / (c.water.wellCooldownMinutes * 60000)); if (cycles > 0) { f.water = Math.min(f.waterCapacity, f.water + cycles * c.water.wellRefillUnits); f.lastWellAt = num(f.lastWellAt, now()) + cycles * c.water.wellCooldownMinutes * 60000; persist(); } } return reply(sock, jid, `💧 *مخزون المياه*\nالماء: ${f.water}/${f.waterCapacity}\n${f.well ? `🕳️ البئر: موجود — يعيد ${c.water.wellRefillUnits} وحدة كل ${c.water.wellCooldownMinutes} دقيقة.` : `🕳️ لا يوجد بئر. شراؤه: ${formatMoney(c.water.wellPrice)} — .شراء بئر`}\nلشراء الماء: .شراء ماء 20 (السعر ${formatMoney(c.water.buyUnitPrice)} لكل وحدة).`); }
    if (cmd === 'شراء ماء') {
      const qty = num(a[0], 0); if (qty < 1 || qty > f.waterCapacity - f.water) return reply(sock, jid, `❌ الكمية غير صالحة. المساحة المتاحة ${f.waterCapacity - f.water}.`);
      const cost = qty * c.water.buyUnitPrice, paid = charge(id, cost); if (!paid.ok) return reply(sock, jid, `❌ ${paid.message}`);
      f.water += qty; persist(); return reply(sock, jid, `💧 تم شراء ${qty} وحدة ماء مقابل ${formatMoney(cost)}. المخزون ${f.water}/${f.waterCapacity}.`);
    }
    if (cmd === 'شراء بئر') {
      if (f.well) return reply(sock, jid, '🕳️ لديك بئر بالفعل.'); const paid = charge(id, c.water.wellPrice); if (!paid.ok) return reply(sock, jid, `❌ ${paid.message}`);
      f.well = true; f.lastWellAt = now(); persist(); return reply(sock, jid, `🕳️ تم حفر البئر! اكتب .ماء لمعرفة حالة المياه.`);
    }
    if (cmd === 'سقي') {
      const plot = num(a[0], 0); if (!plot || !f.fields[plot]) return reply(sock, jid, '❌ حدد قطعة أرض مزروعة: .سقي 1');
      if (f.fields[plot].watered) return reply(sock, jid, '💧 هذا المحصول تم سقيه بالفعل.');
      if (f.water < c.water.waterPerCrop) return reply(sock, jid, '🚱 الماء غير كافٍ. اكتب .شراء ماء 10 أو استخدم البئر بعد تجدد الماء.');
      f.water -= c.water.waterPerCrop; f.fields[plot].watered = true; f.fields[plot].readyAt = Math.max(now(), f.fields[plot].readyAt - Math.min(60000, c.crops[f.fields[plot].crop].growMinutes * 5000)); persist();
      return reply(sock, jid, `💧 تم سقي الأرض ${plot}! انخفض وقت النضج قليلًا. الماء: ${f.water}/${f.waterCapacity}.`);
    }
    if (cmd === 'تسميد') {
      const plot = num(a[0], 0); if (!plot || !f.fields[plot]) return reply(sock, jid, '❌ استخدم .تسميد 1');
      const cost = 100, paid = charge(id, cost); if (!paid.ok) return reply(sock, jid, `❌ ${paid.message}`);
      if (f.fields[plot].fertilized) { credit(id, cost); return reply(sock, jid, '🧪 هذا المحصول سُمّد بالفعل.'); }
      f.fields[plot].fertilized = true; f.fields[plot].readyAt = Math.max(now(), f.fields[plot].readyAt - 120000); persist(); return reply(sock, jid, `🧪 تم تسميد المحصول مقابل ${formatMoney(cost)} وتقليل وقت نموه.`);
    }
    if (cmd === 'مخزني') {
      const items = Object.entries(f.inventory); return reply(sock, jid, `📦 *مخزنك*\nالسعة: ${invCount(f)}/${f.storageCapacity}\n${items.length ? items.map(([n,q]) => `• ${n}: ${q}`).join('\n') : 'المخزن فارغ.'}\n\n💰 قيمة البيع الأساسية التقريبية: ${formatMoney(items.reduce((sum,[n,q])=>sum+num(q)*(c.crops[n]?.sellPrice || Object.values(c.animals).find(x=>x.product===n)?.productSellPrice || 0),0))}`);
    }
    if (cmd === 'بيع') {
      if (!a.length) return reply(sock, jid, 'استخدم .بيع طماطم 2 أو .بيع الكل');
      let qty = 0, total = 0, sold = [];
      if (norm(a[0]) === 'الكل') {
        for (const [name, count] of Object.entries(f.inventory)) { const price = c.crops[name]?.sellPrice || Object.values(c.animals).find(x=>x.product===name)?.productSellPrice || 0; if (price > 0) { total += price * count; qty += count; sold.push(`${name} ×${count}`); delete f.inventory[name]; } }
      } else {
        const name = Object.keys(c.crops).find(k=>norm(k)===norm(a[0])) || [...new Set(Object.values(c.animals).map(x=>x.product))].find(k=>norm(k)===norm(a[0]));
        if (!name) return reply(sock, jid, '❌ المنتج غير معروف.');
        const available = num(f.inventory[name]); qty = norm(a[1]) === 'الكل' || !a[1] ? available : Math.min(available, num(a[1]));
        if (qty < 1) return reply(sock, jid, '❌ لا توجد كمية متاحة للبيع.');
        const price = c.crops[name]?.sellPrice || Object.values(c.animals).find(x=>x.product===name)?.productSellPrice || 0; total = price * qty; delete f.inventory[name]; if (available > qty) f.inventory[name] = available - qty; sold.push(`${name} ×${qty}`);
      }
      if (qty < 1 || total < 1) return reply(sock, jid, '❌ لا توجد منتجات قابلة للبيع.');
      credit(id, total); persist(); return reply(sock, jid, `💰 تم البيع بنجاح!\n📦 ${sold.join('، ')}\n💵 الأرباح: ${formatMoney(total)}\n👛 رصيد المحفظة: ${formatMoney(wallet(id))}`);
    }
    if (cmd === 'توسعة المزرعة') {
      const options = c.plotExpansions.filter(x=>x.plots>f.plots);
      if (!a.length) return reply(sock, jid, `🏗️ *توسعة الأراضي*\nحاليًا: ${f.plots} قطعة\n${options.map(x=>`${x.plots} قطعة: ${formatMoney(x.price)}`).join('\n')}\nاكتب .توسعة المزرعة عدد_الأراضي`);
      const target = num(a[0]); const opt = c.plotExpansions.find(x=>x.plots===target && x.plots>f.plots); if (!opt) return reply(sock, jid, '❌ اختر مستوى توسعة صحيحًا من القائمة.');
      const paid = charge(id,opt.price); if (!paid.ok) return reply(sock,jid,`❌ ${paid.message}`); f.plots=opt.plots; f.level++; persist(); return reply(sock,jid,`🏡 تمت التوسعة! أصبحت تملك ${f.plots} قطعة أرض.`);
    }
    if (cmd === 'تطوير المخزن') {
      const opt = c.storageUpgrades.find(x=>x.capacity>f.storageCapacity); if (!opt) return reply(sock,jid,'👑 مخزنك وصل إلى أعلى مستوى.');
      const paid=charge(id,opt.price); if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`); f.storageCapacity=opt.capacity; persist(); return reply(sock,jid,`📦 تمت ترقية المخزن إلى ${f.storageCapacity} وحدة مقابل ${formatMoney(opt.price)}.`);
    }
    if (cmd === 'تطوير الماء') {
      const opt=c.waterUpgrades.find(x=>x.capacity>f.waterCapacity); if(!opt)return reply(sock,jid,'👑 وصلت سعة المياه إلى الحد الأعلى.');
      const paid=charge(id,opt.price); if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`); f.waterCapacity=opt.capacity; persist(); return reply(sock,jid,`🚰 تمت ترقية خزان الماء إلى ${f.waterCapacity} وحدة. لم تتم تعبئة الخزان تلقائيًا.`);
    }
    if (cmd === 'حيوانات') {
      const pens=Object.entries(f.pens).map(([n,q])=>`${n}: ${q} سعة`); const animals=Object.entries(f.animals).map(([n,q])=>`${c.animals[n]?.emoji||'🐾'} ${n}: ${q}`).join('\n') || 'لا تملك حيوانات.';
      return reply(sock,jid,`🐄 *مزرعة الحيوانات*\n${animals}\n\n🏚️ الحظائر: ${pens.join('، ') || 'لا توجد حظائر'}\n\n${Object.entries(c.animals).map(([n,x])=>`${x.emoji} ${n}: ${formatMoney(x.price)} | المنتج ${x.product}`).join('\n')}\n\n.شراء حظيرة دجاج\n.شراء حيوان دجاج 1\n.علف دجاج 2\n.جمع المنتجات`);
    }
    if (cmd === 'شراء حظيرة') {
      const name=Object.keys(c.pens).find(k=>norm(k)===norm(a.join(' '))); if(!name)return reply(sock,jid,'❌ نوع الحظيرة غير معروف.');
      if(f.pens[name])return reply(sock,jid,'🏚️ لديك حظيرة من هذا النوع بالفعل.'); const paid=charge(id,c.pens[name].price);if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`);f.pens[name]=c.pens[name].capacity;persist();return reply(sock,jid,`🏚️ تم شراء حظيرة ${name} بسعة ${f.pens[name]}.`);
    }
    if (cmd === 'شراء حيوان') {
      const name=Object.keys(c.animals).find(k=>norm(k)===norm(a[0])); const qty=Math.max(1,Math.min(100,num(a[1],1))); if(!name)return reply(sock,jid,'❌ نوع الحيوان غير معروف.'); if(!f.pens[name])return reply(sock,jid,`❌ تحتاج إلى حظيرة ${name} أولًا: .شراء حظيرة ${name}`);
      if(num(f.animals[name])+qty>f.pens[name])return reply(sock,jid,`❌ سعة الحظيرة لا تكفي. السعة ${f.pens[name]} والحالي ${num(f.animals[name])}.`);
      const cost=c.animals[name].price*qty,paid=charge(id,cost);if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`);f.animals[name]=num(f.animals[name])+qty;f.animalLastProduct ||= {};f.animalLastProduct[name] ||= now();persist();return reply(sock,jid,`🐾 اشتريت ${qty} من ${name} مقابل ${formatMoney(cost)}.`);
    }
    if (cmd === 'علف') {
      const name=Object.keys(c.animals).find(k=>norm(k)===norm(a[0]));const qty=Math.max(1,Math.min(100,num(a[1],1)));if(!name||!num(f.animals[name]))return reply(sock,jid,'❌ لا تملك هذا الحيوان.');const cost=c.animals[name].feedPrice*qty;const paid=charge(id,cost);if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`);f.feed ||= {};f.feed[name]=num(f.feed[name])+qty;persist();return reply(sock,jid,`🌾 اشتريت ${qty} وجبة علف لـ${name}. إجمالي العلف المتاح: ${f.feed[name]}.`);
    }
    if (cmd === 'جمع المنتجات') {
      let collected=[];for(const [name,count] of Object.entries(f.animals)){const def=c.animals[name];if(!def||count<1)continue;const last=f.animalLastProduct?.[name]||now();const cycles=Math.floor((now()-last)/(def.productEveryMinutes*60000));const feedUnits=num(f.feed?.[name]);const fundedCycles=Math.min(cycles,Math.floor(feedUnits/count));const qty=fundedCycles*count;if(qty>0){if(invCount(f)+qty>f.storageCapacity)return reply(sock,jid,'📦 المخزن لا يتسع للمنتجات. بع بعض المخزون أولًا.');addItem(f,def.product,qty);f.feed[name]=feedUnits-qty;f.animalLastProduct[name]=last+fundedCycles*def.productEveryMinutes*60000;collected.push(`${def.product} ×${qty} من ${name}`);}}
      if(!collected.length)return reply(sock,jid,'⏳ لا توجد منتجات جاهزة. تأكد من مرور وقت الإنتاج وتوفر العلف (وحدة علف لكل حيوان في دورة إنتاج).');persist();return reply(sock,jid,`🐄 تم جمع المنتجات:\n${collected.join('\n')}\n📦 ${invCount(f)}/${f.storageCapacity}`);
    }
    if (cmd === 'رهان') {
      const target=getMention(msg,data); const amount=num(a.find(x=>/^\d+$/.test(x)),0); if(!target||target===id)return reply(sock,jid,'🎲 لتحدي لاعب، اعمل منشن له واكتب مثلًا: .رهان @اللاعب 500');
      if(amount<c.bet.min||amount>c.bet.max)return reply(sock,jid,`❌ قيمة التحدي يجب أن تكون بين ${c.bet.min} و${c.bet.max}.`);
      if(!ensureFarm(target))return reply(sock,jid,'❌ يجب أن يمتلك اللاعب الآخر مزرعة أولًا.');
      if(p.pendingBet||p.activeBet||player(target).pendingBet||player(target).activeBet)return reply(sock,jid,'❌ أحد اللاعبين لديه تحدٍ آخر قيد التنفيذ.');
      const paid=charge(id,amount);if(!paid.ok)return reply(sock,jid,`❌ ${paid.message}`);
      p.pendingBet={from:id,to:target,amount,createdAt:now(),chat:jid};player(target).pendingBet={from:id,to:target,amount,createdAt:now(),chat:jid};persist();return reply(sock,jid,`🎲 *تحدي حصاد جديد!*\n👤 المتحدي: @${id.split('@')[0]}\n👤 المنافس: @${target.split('@')[0]}\n💰 الرهان: ${formatMoney(amount)} لكل لاعب\n⏳ المدة: ${c.bet.durationMinutes} دقيقة\n\nلقبول التحدي: .قبول الرهان\nلرفضه: .رفض الرهان`,[id,target]);
    }
    if (cmd === 'قبول الرهان') {
      const bet=p.pendingBet;if(!bet||bet.to!==id)return reply(sock,jid,'❌ لا يوجد تحدٍ وارد لك.');const paid=charge(id,bet.amount);if(!paid.ok)return reply(sock,jid,`❌ لا يمكنك تغطية الرهان: ${paid.message}`);
      const shared={...bet,acceptedAt:now(),endsAt:now()+c.bet.durationMinutes*60000,startXP:{[bet.from]:num(player(bet.from).farm?.xp),[bet.to]:num(player(bet.to).farm?.xp)}};
      player(bet.from).activeBet=shared;player(bet.to).activeBet=shared;player(bet.from).pendingBet=null;player(bet.to).pendingBet=null;persist();return reply(sock,jid,`⚔️ بدأ تحدي الحصاد!\nكل لاعب لديه ${c.bet.durationMinutes} دقيقة لحصد المحاصيل.\nالفائز هو صاحب أكبر قيمة من المحاصيل التي حصدها خلال التحدي.\nاكتب .رهاني لمعرفة الوقت المتبقي.`);
    }
    if (cmd === 'رفض الرهان') {
      const bet=p.pendingBet;if(!bet||bet.to!==id)return reply(sock,jid,'❌ لا يوجد تحدٍ وارد لك.');credit(bet.from,bet.amount);player(bet.from).pendingBet=null;p.pendingBet=null;persist();return reply(sock,jid,'❌ تم رفض التحدي وإرجاع مبلغ المتحدي.');
    }
    if (cmd === 'رهاني') {
      if(!p.activeBet)return reply(sock,jid,'لا يوجد تحدٍ نشط.');const b=p.activeBet;return reply(sock,jid,`⚔️ التحدي نشط. الوقت المتبقي: ${timeLeft(b.endsAt-now())}.\nعند الانتهاء استخدم .إنهاء الرهان`);
    }
    if (cmd === 'إنهاء الرهان') {
      if(!p.activeBet)return reply(sock,jid,'لا يوجد تحدٍ نشط.');const b=p.activeBet;if(now()<b.endsAt)return reply(sock,jid,`⏳ لم ينتهِ التحدي. بقي ${timeLeft(b.endsAt-now())}.`);
      const p1=player(b.from).farm,p2=player(b.to).farm;const score1=Math.max(0,num(p1?.xp)-num(b.startXP?.[b.from])),score2=Math.max(0,num(p2?.xp)-num(b.startXP?.[b.to]));const winner=score1===score2?'':score1>score2?b.from:b.to;const pot=b.amount*2;const fee=Math.floor(pot*c.bet.feePercent/100);
      if(winner)credit(winner,pot-fee);else {credit(b.from,b.amount);credit(b.to,b.amount);}player(b.from).activeBet=null;player(b.to).activeBet=null;if(winner)player(winner).farm.wins++;if(winner){const loser=winner===b.from?b.to:b.from;player(loser).farm.losses++;}persist();return reply(sock,jid,winner?`🏆 انتهى التحدي! الفائز: @${winner.split('@')[0]}\n💰 الجائزة: ${formatMoney(pot-fee)} (بعد رسم ${fee}).`:'🤝 انتهى التحدي بالتعادل، وأُعيد الرهان لكل لاعب.',winner?[winner]:[]);
    }
    if (cmd === 'ترتيب المزارعين') {
      const rows=Object.entries(state).filter(([,v])=>v.farm).map(([uid,v])=>({uid, f:v.farm, value:num(v.farm.xp)*100+num(v.farm.plots)*200+invCount(v.farm)*10})).sort((a,b)=>b.value-a.value).slice(0,10);
      return reply(sock,jid,`🏆 *أفضل المزارعين*\n${rows.length?rows.map((r,i)=>`${i+1}. @${r.uid.split('@')[0]} — مستوى ${r.f.level} | خبرة ${r.f.xp}`).join('\n'):'لا يوجد مزارعون بعد.'}`,rows.map(r=>r.uid));
    }
    return reply(sock,jid,help());
  }
};