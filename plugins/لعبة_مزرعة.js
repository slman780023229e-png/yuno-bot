/**
 * ARTHUR BOT • FARM PRO
 * Uses the existing ARTHUR economy API: db(), save(), addProgress().
 * No changes to handler.js or the bank core are required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, save, addProgress } from "../utils/arthurBankCore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../data/مزرعة_آرثر.json");
const STATE_PATH = path.join(__dirname, "../data/مزرعة_آرثر_حفظ.json");

const DEFAULT_CONFIG = {
  farmPrice: 1200,
  startingPlots: 3,
  plotPriceBase: 700,
  water: { capacity: 8, refillCost: 90, wellCost: 1200, wellBonus: 4 },
  storage: { capacity: 30, upgradeBase: 500, upgradeBonus: 15 },
  crops: {
    "قمح": { seedPrice: 35, growMinutes: 5, yield: 3, sellPrice: 22, water: 1, emoji: "🌾" },
    "طماطم": { seedPrice: 55, growMinutes: 8, yield: 3, sellPrice: 38, water: 1, emoji: "🍅" },
    "بطاطس": { seedPrice: 45, growMinutes: 7, yield: 3, sellPrice: 32, water: 1, emoji: "🥔" },
    "جزر": { seedPrice: 50, growMinutes: 8, yield: 3, sellPrice: 36, water: 1, emoji: "🥕" },
    "ذرة": { seedPrice: 80, growMinutes: 12, yield: 4, sellPrice: 52, water: 2, emoji: "🌽" },
    "فراولة": { seedPrice: 110, growMinutes: 16, yield: 4, sellPrice: 75, water: 2, emoji: "🍓" },
    "يقطين": { seedPrice: 150, growMinutes: 22, yield: 5, sellPrice: 95, water: 2, emoji: "🎃" }
  },
  fertilizer: { price: 120, speedPercent: 25 },
  market: { sellBonusPercent: 0 },
  virtualChallenges: { enabled: true, maxStake: 5000 }
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function ensureFiles() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  if (!fs.existsSync(STATE_PATH)) fs.writeFileSync(STATE_PATH, JSON.stringify({ version: 1, players: {}, challenges: {} }, null, 2));
}
function config() {
  ensureFiles();
  const loaded = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...loaded, crops: { ...DEFAULT_CONFIG.crops, ...(loaded.crops || {}) } };
}
function state() {
  ensureFiles();
  const s = readJson(STATE_PATH, { version: 1, players: {}, challenges: {} });
  s.players ||= {}; s.challenges ||= {};
  return s;
}
let saveQueued = false;
function persist(s) {
  if (saveQueued) return;
  saveQueued = true;
  try {
    const tmp = STATE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, STATE_PATH);
  } catch (e) { console.error("[FARM] save failed:", e?.message || e); }
  finally { saveQueued = false; }
}
function normalizeId(id) { return String(id || "").split("@")[0].replace(/\D/g, "") || String(id || ""); }
function playerId(msg) {
  return msg?.key?.participant || msg?.participant || (msg?.key?.fromMe ? msg?.key?.remoteJid : "");
}
function getPlayer(s, id) {
  const key = normalizeId(id);
  s.players[key] ||= { farm: false, plots: [], seeds: {}, crops: {}, water: 8, waterCapacity: 8, storageCapacity: 30, wellLevel: 0, storageLevel: 0, stats: { planted: 0, harvested: 0, sold: 0, earned: 0 } };
  const p = s.players[key];
  p.plots ||= []; p.seeds ||= {}; p.crops ||= {}; p.stats ||= { planted: 0, harvested: 0, sold: 0, earned: 0 };
  return p;
}
function economyDb() {
  const d = db();
  if (!d || typeof d !== "object") throw new Error("تعذر الوصول إلى قاعدة البنك.");
  return d;
}
function wallet(id) {
  const d = economyDb();
  const key = normalizeId(id);
  const user = d.users?.[key] || d.users?.[`${key}@s.whatsapp.net`] || d.players?.[key] || d.accounts?.[key];
  const candidates = [user?.gold, user?.money, user?.coins, user?.balance, user?.wallet, d.users?.[key]?.gold];
  const val = candidates.find(v => typeof v === "number" && Number.isFinite(v));
  if (typeof val !== "number") return null;
  return Math.max(0, val);
}
/*
 * Economy writes are delegated to the same addProgress() function used by
 * existing ARTHUR mini-games. We verify funds first and refuse if the current
 * wallet schema cannot be identified. This prevents a shadow farm currency.
 */
function changeGold(id, delta) {
  const before = wallet(id);
  if (before === null) throw new Error("لم أتعرف على حقل رصيدك في البنك. أرسل ملف utils/arthurBankCore.js لربطه بدقة دون تخمين.");
  if (delta < 0 && before < -delta) throw new Error(`رصيدك غير كافٍ. رصيدك الحالي: ${before} 🪙`);
  addProgress(id, { gold: delta });
  save();
  const after = wallet(id);
  if (after === null || (delta < 0 && after > before) || (delta > 0 && after < before)) {
    throw new Error("تعذر التحقق من تحديث رصيد البنك؛ أوقفت العملية لحماية الرصيد.");
  }
  return after;
}
function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString("en-US"); }
function cropName(input, cfg) {
  const raw = String(input || "").trim();
  return Object.keys(cfg.crops).find(k => k === raw || k.toLowerCase() === raw.toLowerCase());
}
function ready(plot, now = Date.now()) { return Boolean(plot?.crop && now >= Number(plot.readyAt || Infinity)); }
function remaining(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} س ${mins % 60} د` : `${mins} دقيقة`;
}
function statusText(id, p, cfg) {
  const readyPlots = p.plots.filter(x => ready(x)).length;
  const growing = p.plots.filter(x => x.crop && !ready(x)).length;
  const empty = p.plots.filter(x => !x.crop).length;
  const seedLines = Object.entries(p.seeds).filter(([, n]) => n > 0).map(([name, n]) => `• ${cfg.crops[name]?.emoji || "🌱"} ${name}: ${n} بذرة`).join("\n") || "• لا توجد بذور";
  const cropLines = Object.entries(p.crops).filter(([, n]) => n > 0).map(([name, n]) => `• ${cfg.crops[name]?.emoji || "🌾"} ${name}: ${n}`).join("\n") || "• المخزن فارغ";
  const plotLines = p.plots.map((x, i) => {
    if (!x.crop) return `${i + 1}. 🟫 أرض فارغة`;
    const c = cfg.crops[x.crop];
    return `${i + 1}. ${c?.emoji || "🌱"} ${x.crop} — ${ready(x) ? "✅ ناضجة وجاهزة للحصاد" : `⏳ تنضج بعد ${remaining(x.readyAt - Date.now())}`}${x.watered ? " · 💧 مسقية" : " · ⚠️ تحتاج سقي"}`;
  }).join("\n") || "لا توجد قطع أرض";
  return `🌾 *مزرعة آرثر PRO*\n\n💰 رصيد البنك: ${wallet(id) === null ? "غير معروف" : fmt(wallet(id)) + " 🪙"}\n🚜 الأرض: ${p.farm ? "مملوكة" : "غير مشتراة"}\n🌱 القطع: ${p.plots.length} | فارغة: ${empty}\n✅ ناضجة: ${readyPlots} | 🌿 تنمو: ${growing}\n💧 الماء: ${p.water}/${p.waterCapacity}\n📦 المخزن: ${Object.values(p.crops).reduce((a, n) => a + n, 0)}/${p.storageCapacity}\n\n*القطع:*\n${plotLines}\n\n*البذور:*\n${seedLines}\n\n*المحصول المخزن:*\n${cropLines}\n\nاكتب *.مزرعة مساعدة* لعرض الأوامر.`;
}
function help() {
  return `🌾 *دليل مزرعة آرثر PRO*\n\n• *.مزرعة* — حالة المزرعة والمحاصيل الناضجة وغير الناضجة\n• *.مزرعة شراء* — شراء أول مزرعة\n• *.بذور* — سوق البذور والأسعار\n• *.بذور شراء طماطم 3* — شراء 3 بذور من البنك\n• *.زراعة 1 طماطم* — زراعة بذرة في القطعة 1\n• *.سقي 1* — سقي القطعة 1 (تستهلك ماء)\n• *.سقي الكل* — سقي كل المزروعات الممكنة\n• *.حصاد 1* أو *.حصاد الكل* — حصاد المحصول الناضج\n• *.بيع طماطم 5* — بيع 5 من المخزن للبنك\n• *.بيع الكل* — بيع كل المحاصيل المخزنة\n• *.مخزن* — عرض المخزون والبذور\n• *.مزرعة توسعة* — شراء قطعة أرض إضافية\n• *.مزرعة ماء* — تعبئة الماء\n• *.مزرعة بئر* — تطوير البئر وزيادة السعة\n• *.سماد 1* — تسريع نمو القطعة 1\n• *.مزرعة مخزن* — ترقية سعة المخزن\n\n⏱️ أوقات النمو والأسعار قابلة للتعديل في data/مزرعة_آرثر.json.\n💰 جميع عمليات الشراء والبيع تستخدم اقتصاد ARTHUR الحالي، ولا توجد عملة منفصلة للمزرعة.`;
}
async function execute({ sock, msg, text: rawText, args }) {
  const jid = msg?.key?.remoteJid;
  const sender = playerId(msg);
  if (!jid || !sender) return;
  const input = String(rawText || args?.join(" ") || "").trim();
  const command = input.replace(/^[.!/#،]+/, "").trim();
  const cfg = config();
  const s = state();
  const p = getPlayer(s, sender);
  const send = async text => sock.sendMessage(jid, { text }, { quoted: msg });
  const words = command.split(/\s+/);
  const lower = words.map(x => x.toLowerCase());
  const is = (...names) => names.includes(lower[0]);
  const arg = words.slice(1);
  const saveState = () => persist(s);
  try {
    if (is("مزرعة", "farm")) {
      if (!arg.length || ["حالة", "status"].includes(arg[0])) return send(statusText(sender, p, cfg));
      const sub = arg[0];
      if (["مساعدة", "help"].includes(sub)) return send(help());
      if (["شراء", "buy"].includes(sub)) {
        if (p.farm) return send("✅ لديك مزرعة بالفعل.");
        changeGold(sender, -cfg.farmPrice);
        p.farm = true; p.waterCapacity = cfg.water.capacity; p.water = cfg.water.capacity;
        p.storageCapacity = cfg.storage.capacity;
        p.plots = Array.from({ length: cfg.startingPlots }, () => ({ crop: null, readyAt: 0, watered: false }));
        saveState(); return send(`🎉 اشتريت مزرعتك بنجاح مقابل ${fmt(cfg.farmPrice)} 🪙 من البنك!\nعدد القطع: ${p.plots.length}\nاستخدم *.بذور* ثم *.بذور شراء طماطم 2*.`);
      }
      if (!p.farm) return send(`🏚️ لم تشترِ مزرعة بعد. استخدم *.مزرعة شراء* مقابل ${fmt(cfg.farmPrice)} 🪙.`);
      if (["توسعة", "توسيع", "expand"].includes(sub)) {
        const price = Math.floor(cfg.plotPriceBase * (1 + p.plots.length * 0.35));
        changeGold(sender, -price); p.plots.push({ crop: null, readyAt: 0, watered: false });
        saveState(); return send(`🚜 تمت إضافة قطعة أرض جديدة مقابل ${fmt(price)} 🪙.\nإجمالي القطع: ${p.plots.length}`);
      }
      if (["ماء", "تعبئة", "water"].includes(sub)) {
        if (p.water >= p.waterCapacity) return send("💧 خزان الماء ممتلئ.");
        changeGold(sender, -cfg.water.refillCost); p.water = p.waterCapacity;
        saveState(); return send(`💧 تم ملء الخزان مقابل ${fmt(cfg.water.refillCost)} 🪙. الماء: ${p.water}/${p.waterCapacity}`);
      }
      if (["بئر", "well"].includes(sub)) {
        const cost = cfg.water.wellCost * (p.wellLevel + 1);
        changeGold(sender, -cost); p.wellLevel++; p.waterCapacity += cfg.water.wellBonus;
        p.water = p.waterCapacity; saveState();
        return send(`🪣 تم تطوير البئر إلى المستوى ${p.wellLevel}!\nالسعة الجديدة: ${p.waterCapacity} 💧\nالتكلفة: ${fmt(cost)} 🪙`);
      }
      if (["مخزن", "ترقية-مخزن", "storage"].includes(sub)) {
        const cost = cfg.storage.upgradeBase * (p.storageLevel + 1);
        changeGold(sender, -cost); p.storageLevel = (p.storageLevel || 0) + 1; p.storageCapacity += cfg.storage.upgradeBonus;
        saveState(); return send(`📦 تمت ترقية المخزن! السعة: ${p.storageCapacity}. التكلفة: ${fmt(cost)} 🪙`);
      }
      return send(help());
    }

    if (is("بذور", "seed", "seeds")) {
      if (!arg.length || ["سوق", "market"].includes(arg[0])) {
        return send("🌱 *سوق البذور*\n\n" + Object.entries(cfg.crops).map(([n, c]) => `${c.emoji} *${n}* — البذرة ${fmt(c.seedPrice)} 🪙 | النمو ${c.growMinutes} د | الحصاد ${c.yield} | بيع الوحدة ${fmt(c.sellPrice)} 🪙`).join("\n") + "\n\nللشراء: *.بذور شراء طماطم 3*");
      }
      if (!p.farm) return send("اشترِ المزرعة أولًا: *.مزرعة شراء*");
      if (["شراء", "buy"].includes(arg[0])) {
        const name = cropName(arg[1], cfg); const qty = Math.floor(Number(arg[2] || 1));
        if (!name || !Number.isInteger(qty) || qty < 1 || qty > 100) return send("الصيغة: *.بذور شراء طماطم 3* (العدد من 1 إلى 100).");
        const cost = cfg.crops[name].seedPrice * qty;
        changeGold(sender, -cost); p.seeds[name] = (p.seeds[name] || 0) + qty;
        saveState(); return send(`🛒 اشتريت ${qty} بذرة ${cfg.crops[name].emoji} ${name} مقابل ${fmt(cost)} 🪙.\nالموجود عندك: ${p.seeds[name]} بذرة.`);
      }
      return send("استخدم *.بذور* لعرض السوق أو *.بذور شراء طماطم 3*.");
    }

    if (is("زراعة", "ازرع", "plant")) {
      if (!p.farm) return send("اشترِ المزرعة أولًا: *.مزرعة شراء*");
      const plotNo = Number(arg[0]); const name = cropName(arg[1], cfg);
      if (!Number.isInteger(plotNo) || plotNo < 1 || plotNo > p.plots.length || !name) return send("الصيغة: *.زراعة 1 طماطم*.");
      const plot = p.plots[plotNo - 1];
      if (plot.crop) return send(`القطعة ${plotNo} مشغولة بمحصول ${plot.crop}. احصده أولًا إذا نضج.`);
      if ((p.seeds[name] || 0) < 1) return send(`ليس لديك بذور ${name}. اشترِ من *.بذور شراء ${name} 1*.`);
      p.seeds[name]--; plot.crop = name; plot.plantedAt = Date.now();
      plot.readyAt = Date.now() + cfg.crops[name].growMinutes * 60000; plot.watered = false;
      p.stats.planted++; saveState();
      return send(`🌱 زرعت ${cfg.crops[name].emoji} ${name} في القطعة ${plotNo}.\n⏳ وقت النمو الأساسي: ${cfg.crops[name].growMinutes} دقيقة.\n💧 اسقِها بالأمر *.سقي ${plotNo}* لتأكيد رعايتها.`);
    }

    if (is("سقي", "اسق", "ري", "water")) {
      if (!p.farm) return send("لا توجد مزرعة. استخدم *.مزرعة شراء*.");
      const targets = ["الكل", "كل", "all"].includes(arg[0]) ? p.plots.map((x, i) => i).filter(i => p.plots[i].crop && !p.plots[i].watered) : [Number(arg[0]) - 1];
      if (!targets.length || targets.some(i => !Number.isInteger(i) || i < 0 || i >= p.plots.length)) return send("استخدم *.سقي 1* أو *.سقي الكل*.");
      const valid = targets.filter(i => p.plots[i].crop && !p.plots[i].watered);
      if (!valid.length) return send("لا توجد مزروعات تحتاج إلى السقي.");
      const needed = valid.reduce((n, i) => n + (cfg.crops[p.plots[i].crop]?.water || 1), 0);
      if (p.water < needed) return send(`💧 الماء غير كافٍ. تحتاج ${needed} وحدة والموجود ${p.water}. استخدم *.مزرعة ماء*.`);
      p.water -= needed;
      for (const i of valid) {
        const plot = p.plots[i]; plot.watered = true;
        const c = cfg.crops[plot.crop];
        plot.readyAt = Math.max(Date.now(), plot.readyAt - Math.floor(c.growMinutes * 60000 * 0.10));
      }
      saveState(); return send(`💧 تم سقي ${valid.length} قطعة. استهلاك الماء: ${needed}.\nالمتبقي: ${p.water}/${p.waterCapacity}.`);
    }

    if (is("حصاد", "احصد", "harvest")) {
      if (!p.farm) return send("لا توجد مزرعة. استخدم *.مزرعة شراء*.");
      const targets = ["الكل", "كل", "all"].includes(arg[0]) ? p.plots.map((x, i) => i).filter(i => ready(p.plots[i])) : [Number(arg[0]) - 1];
      if (!targets.length || targets.some(i => !Number.isInteger(i) || i < 0 || i >= p.plots.length)) return send("استخدم *.حصاد 1* أو *.حصاد الكل*.");
      const readyTargets = targets.filter(i => ready(p.plots[i]));
      if (!readyTargets.length) {
        const growing = p.plots.map((x, i) => x.crop && !ready(x) ? `${i + 1}: ${x.crop} بعد ${remaining(x.readyAt - Date.now())}` : null).filter(Boolean);
        return send("⏳ لا يوجد محصول ناضج في القطع المحددة.\n" + (growing.join("\n") || "ازرع بذورًا أولًا."));
      }
      const currentStored = Object.values(p.crops).reduce((a, n) => a + n, 0);
      const potential = readyTargets.reduce((sum, i) => sum + cfg.crops[p.plots[i].crop].yield, 0);
      if (currentStored + potential > p.storageCapacity) return send(`📦 المخزن لا يتسع للحصاد. لديك ${currentStored}/${p.storageCapacity}. طوّر المخزن عبر *.مزرعة مخزن* أو بع بعض المحاصيل.`);
      const harvested = [];
      for (const i of readyTargets) {
        const plot = p.plots[i]; const name = plot.crop; const amount = cfg.crops[name].yield;
        p.crops[name] = (p.crops[name] || 0) + amount;
        harvested.push(`${cfg.crops[name].emoji} ${name} ×${amount} (قطعة ${i + 1})`);
        plot.crop = null; plot.readyAt = 0; plot.watered = false; plot.plantedAt = 0;
        p.stats.harvested += amount;
      }
      saveState(); return send(`🌾 *تم الحصاد بنجاح!*\n${harvested.join("\n")}\n\n📦 المخزن: ${Object.values(p.crops).reduce((a, n) => a + n, 0)}/${p.storageCapacity}`);
    }

    if (is("بيع", "بيع-محصول", "sell")) {
      if (!p.farm) return send("اشترِ المزرعة أولًا.");
      const all = ["الكل", "كل", "all"].includes(arg[0]);
      let sold = [], total = 0;
      const inventory = all ? Object.entries(p.crops).filter(([, n]) => n > 0) : [[cropName(arg[0], cfg), Math.floor(Number(arg[1] || 1))]];
      if (!inventory.length || inventory.some(([name, qty]) => !name || !Number.isInteger(qty) || qty < 1 || (p.crops[name] || 0) < qty)) {
        return send("الصيغة: *.بيع طماطم 5* أو *.بيع الكل*. تأكد من وجود الكمية في المخزن.");
      }
      for (const [name, qty] of inventory) {
        const price = cfg.crops[name].sellPrice;
        const value = price * qty; p.crops[name] -= qty; total += value;
        sold.push(`${cfg.crops[name].emoji} ${name} ×${qty} = ${fmt(value)} 🪙`);
      }
      // Credit through the same shared ARTHUR economy API.
      addProgress(sender, { gold: total }); save();
      p.stats.sold += inventory.reduce((n, [, qty]) => n + qty, 0); p.stats.earned += total;
      saveState();
      return send(`🧺 *تم البيع إلى السوق!*\n${sold.join("\n")}\n\n💰 أضيف إلى رصيد البنك: +${fmt(total)} 🪙\n🏦 الرصيد الحالي: ${wallet(sender) === null ? "تحقق من البنك" : fmt(wallet(sender)) + " 🪙"}`);
    }

    if (is("مخزن", "المخزن", "inventory")) {
      return send(statusText(sender, p, cfg));
    }

    if (is("سماد", "fertilizer")) {
      if (!p.farm) return send("اشترِ المزرعة أولًا.");
      const n = Number(arg[0]);
      if (!Number.isInteger(n) || n < 1 || n > p.plots.length || !p.plots[n - 1].crop) return send("الصيغة: *.سماد 1* على قطعة مزروعة.");
      const plot = p.plots[n - 1]; const cost = cfg.fertilizer.price;
      changeGold(sender, -cost);
      const shorten = Math.floor(cfg.crops[plot.crop].growMinutes * 60000 * cfg.fertilizer.speedPercent / 100);
      plot.readyAt = Math.max(Date.now(), plot.readyAt - shorten);
      saveState(); return send(`🌿 استخدمت السماد في القطعة ${n}. تم تقليل وقت النمو بنسبة ${cfg.fertilizer.speedPercent}% مقابل ${fmt(cost)} 🪙.`);
    }

    if (is("تحدي-حصاد", "تحدي", "challenge")) {
      return send("🏆 تحديات الرهان الافتراضي بين اللاعبين غير مفعّلة في هذه النسخة؛ أفضّل عدم تشغيلها قبل تأكيد آلية حجز الرصيد في البنك. يمكن تطويرها لاحقًا دون التأثير على الزراعة.");
    }
  } catch (e) {
    console.error("[FARM] command error:", e?.stack || e);
    return send(`⚠️ لم تُنفذ العملية: ${e?.message || "خطأ غير معروف"}\nلم أغيّر ملفات الهاندلر.`);
  }
  return false;
}

export default {
  name: "مزرعة آرثر PRO",
  command: /^(مزرعة|farm|بذور|seed|seeds|زراعة|ازرع|plant|سقي|اسق|ري|water|حصاد|احصد|harvest|بيع|بيع-محصول|sell|مخزن|المخزن|inventory|سماد|fertilizer|تحدي-حصاد|تحدي|challenge)$/i,
  category: "ألعاب",
  description: "مزرعة متكاملة متصلة باقتصاد ARTHUR",
  execute
};