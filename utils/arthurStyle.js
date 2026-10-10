import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const styleFile = path.join(__dirname, "../data/زخرفة.json");

export const PRESETS = {
  دم_آرثر: { brand: "*🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸*", top: "*◇❐ ═━━━╾ 🩸 ╼━━━═ ❐◇*", bottom: "*◇❐ ═━━━╾ 🩸 ╼━━━═ ❐◇*" },
  التاج_الملكي: { brand: "*👑 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 👑*", top: "*♛━━━༺ 👑 ༻━━━♛*", bottom: "*♛━━━༺ 👑 ༻━━━♛*" },
  الظلال: { brand: "*🌑 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌑*", top: "*╔══════ ◈ ══════╗*", bottom: "*╚══════ ◈ ══════╝*" },
  الفخامة: { brand: "*✦ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ✦*", top: "*╭━━━ ⋆⋅✧⋅⋆ ━━━╮*", bottom: "*╰━━━ ⋆⋅✧⋅⋆ ━━━╯*" },
  النيون: { brand: "*⚡ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⚡*", top: "*╔═⚡══════⚡═╗*", bottom: "*╚═⚡══════⚡═╝*" },
  الساموراي: { brand: "*⚔️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⚔️*", top: "*⚔━━━〔 武 〕━━━⚔*", bottom: "*⚔━━━━━━━━━━⚔*" },
  الجليد: { brand: "*❄️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ❄️*", top: "*❄═══༺ ❄ ༻═══❄*", bottom: "*❄════════════❄*" },
  النار: { brand: "*🔥 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🔥*", top: "*🔥━━━༺ ♨ ༻━━━🔥*", bottom: "*🔥━━━━━━━━━━━━🔥*" },
  الزمرد: { brand: "*💚 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 💚*", top: "*❖━━━〔 ✧ 〕━━━❖*", bottom: "*❖━━━━━━━━━━━━❖*" },
  المجرة: { brand: "*🌌 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌌*", top: "*✧･ﾟ: *✧･ﾟ:* 🌌 *:･ﾟ✧*:･ﾟ✧*", bottom: "*✧･ﾟ: *✧･ﾟ:* 🌌 *:･ﾟ✧*:･ﾟ✧*" },
  البرق: { brand: "*🌩️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌩️*", top: "*━━━⚡⟪ ⚡ ⟫⚡━━━*", bottom: "*━━━⚡⟪ ⚡ ⟫⚡━━━*" },
  الوردة: { brand: "*🌹 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌹*", top: "*❀━━━━༺ 🌹 ༻━━━━❀*", bottom: "*❀━━━━━━━━━━━━❀*" },
  الظبي: { brand: "*𓆩 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 𓆪*", top: "*༺━━━━━━━━━━━━༻*", bottom: "*༺━━━━━━━━━━━━༻*" },
  الماسي: { brand: "*💎 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 💎*", top: "*◇◆◇━━━━ 💎 ━━━━◇◆◇*", bottom: "*◇◆◇━━━━━━━━━━━━◇◆◇*" },
  الكلاسيكي: { brand: "*『 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 』*", top: "*╔══════════════╗*", bottom: "*╚══════════════╝*" }
};

export const DEFAULT_DECORATION = { ...PRESETS.دم_آرثر };

function safeLine(value, fallback) {
  if (typeof value !== "string") return fallback;
  const line = value.replace(/[\r\n]/g, " ").trim();
  return line ? line.slice(0, 180) : fallback;
}

function readDecoration() {
  try {
    if (!fs.existsSync(styleFile)) return { ...DEFAULT_DECORATION };
    const saved = JSON.parse(fs.readFileSync(styleFile, "utf8"));
    return {
      brand: safeLine(saved.brand, DEFAULT_DECORATION.brand),
      top: safeLine(saved.top, DEFAULT_DECORATION.top),
      bottom: safeLine(saved.bottom, DEFAULT_DECORATION.bottom),
      preset: typeof saved.preset === "string" ? saved.preset : "دم_آرثر"
    };
  } catch {
    return { ...DEFAULT_DECORATION };
  }
}

function removeOldFrames(value, decoration) {
  const known = new Set([decoration.brand, decoration.top, decoration.bottom, ...Object.values(PRESETS).flatMap(p => [p.brand, p.top, p.bottom])]);
  return String(value ?? "").split("\n").filter(line => {
    const trimmed = line.trim();
    if (known.has(trimmed)) return false;
    if (/^\*?◇❐.*❐◇\*?$/.test(trimmed)) return false;
    if (/^\*?🩸\s*𝐀𝐑𝐓𝐇𝐔𝐑(?:\s+𝐁𝐎𝐓)?\s*🩸\*?$/.test(trimmed)) return false;
    if (/^\*?👑\s*ARTHUR\s+LEYWIN\*?$/.test(trimmed)) return false;
    return true;
  }).join("\n").trim();
}

export function getDecoration() { return readDecoration(); }
export function arthurHead() { const s = readDecoration(); return `${s.brand}\n${s.top}`; }
export function arthurBox(content = "") {
  const s = readDecoration();
  const body = Array.isArray(content) ? content.map(v => String(v ?? "")).join("\n") : String(content ?? "");
  const clean = removeOldFrames(body, s);
  return clean ? `${s.brand}\n${s.top}\n\n${clean}\n\n${s.bottom}` : `${s.brand}\n${s.top}\n\n${s.bottom}`;
}
export function arthurEliteBox(content = "") {
  const s = readDecoration();
  const brand = s.brand.replace(/[🩸🔥⚡🌩️🌹💚❄️🌑🌌💎👑✦]/gu, "👑");
  const top = s.top.replace(/[🩸🔥⚡🌩️🌹💚❄️🌑🌌💎]/gu, "👑");
  const bottom = s.bottom.replace(/[🩸🔥⚡🌩️🌹💚❄️🌑🌌💎]/gu, "👑");
  const body = Array.isArray(content) ? content.map(v => String(v ?? "")).join("\n") : String(content ?? "");
  const clean = removeOldFrames(body, s);
  return clean ? `${brand}\n${top}\n\n${clean}\n\n${bottom}` : `${brand}\n${top}\n\n${bottom}`;
}
export function arthurFooter() { return readDecoration().bottom; }
export function isArthurDecorated(value) { const t = String(value ?? "").trim(); const s = readDecoration(); return t.startsWith(s.brand) && t.endsWith(s.bottom); }
export default { arthurHead, arthurBox, arthurEliteBox, arthurFooter, isArthurDecorated, getDecoration };
