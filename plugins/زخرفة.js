import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isEliteMember } from "../utils/eliteAccess.js";
import { arthurBox, arthurEliteBox, getDecoration, PRESETS, DEFAULT_DECORATION } from "../utils/arthurStyle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "../data/زخرفة.json");
function saveStyle(style) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(style, null, 2), "utf8");
}
function cleanArg(value) { return String(value ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 180); }
function nameKey(value) { return String(value ?? "").trim().replace(/[ -]+/g, "_").toLowerCase(); }
function findPreset(name) {
  const wanted = nameKey(name);
  return Object.entries(PRESETS).find(([key]) => nameKey(key) === wanted);
}
export default {
  command: "زخرفة",
  aliases: ["تغيير-الزخرفة", "زخرفات"],
  category: "النخبة",
  eliteOnly: true,
  description: "اختيار واحدة من 15 زخرفة وتغيير اسم البوت",
  execute: async (sock, msg, data) => {
    const jid = data?.jid || msg.key?.remoteJid;
    if (!isEliteMember(msg, data)) return sock.sendMessage(jid, { text: arthurEliteBox("❌ هذا الأمر مخصص للمالك وأعضاء النخبة."), quoted: msg });
    const input = String(data?.text || "").trim();
    const rest = input.replace(/^\.?زخرفة\s*/u, "").trim();
    const [actionRaw, ...tail] = rest.split(/\s+/u);
    const action = actionRaw || "مساعدة";
    const value = cleanArg(tail.join(" "));
    if (["مساعدة", "help", ""].includes(action)) {
      const list = Object.keys(PRESETS).map((name, i) => `${i + 1}. ${name}`).join("\n");
      return sock.sendMessage(jid, { text: arthurEliteBox([
        "👑 *إدارة زخارف ARTHUR*", "", 
        ".زخرفة قائمة — عرض أسماء الزخارف الـ15",
        ".زخرفة اسم_الزخرفة — تطبيق زخرفة باسمها",
        ".زخرفة عرض — عرض الزخرفة الحالية",
        ".زخرفة اسم-البوت الاسم الجديد — تغيير اسم البوت",
        ".زخرفة افتراضي — استعادة الزخرفة الأصلية", "", list
      ]), quoted: msg });
    }
    if (["قائمة", "الكل", "list"].includes(action)) {
      return sock.sendMessage(jid, { text: arthurEliteBox(["👑 *الزخارف المتاحة*", "", ...Object.keys(PRESETS).map((n, i) => `${i + 1}. ${n}`), "", "للتطبيق: .زخرفة التاج_الملكي"]), quoted: msg });
    }
    if (["عرض", "show"].includes(action)) {
      const s = getDecoration();
      return sock.sendMessage(jid, { text: arthurEliteBox(["الزخرفة الحالية: " + (s.preset || "مخصصة"), "", s.brand, s.top, "", "معاينة المحتوى", "", s.bottom]), quoted: msg });
    }
    if (["اسم-البوت", "اسم_البوت", "اسم"].includes(action)) {
      if (!value) return sock.sendMessage(jid, { text: arthurEliteBox("اكتب: .زخرفة اسم-البوت الاسم الجديد"), quoted: msg });
      const s = getDecoration(); s.brand = `*${value.replace(/^\*|\*$/g, "")}*`; s.preset = "مخصص"; saveStyle(s);
      return sock.sendMessage(jid, { text: arthurEliteBox(`✅ تم تغيير اسم البوت إلى:\n${s.brand}`), quoted: msg });
    }
    if (["افتراضي", "reset", "default"].includes(action)) {
      saveStyle({ ...DEFAULT_DECORATION, preset: "دم_آرثر" });
      return sock.sendMessage(jid, { text: arthurEliteBox("✅ تمت استعادة زخرفة دم_آرثر الأصلية."), quoted: msg });
    }
    const preset = findPreset(rest);
    if (preset) {
      const [presetName, design] = preset;
      saveStyle({ ...design, preset: presetName });
      return sock.sendMessage(jid, { text: arthurEliteBox([`✅ تم تفعيل زخرفة: ${presetName}`, "", design.brand, design.top, "", "محتوى الرسالة", "", design.bottom]), quoted: msg });
    }
    return sock.sendMessage(jid, { text: arthurEliteBox("❌ لم أتعرف على اسم الزخرفة. اكتب .زخرفة قائمة لعرض الأسماء المتاحة."), quoted: msg });
  }
};
