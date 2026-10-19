import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════
//             ARTHUR BOT • ULTIMATE STYLE ENGINE
//   Royal • Gothic • Geometric • Elite • Custom Branding
// ═══════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");
const styleFile = path.join(dataDir, "زخرفة.json");

const DEFAULT_PRESET = "دم_آرثر";

export const PRESETS = {
  دم_آرثر: {
    brand: "*🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸*",
    top: "*◇❖ ═━━━╾ 🩸 ╼━━━═ ❖◇*",
    bottom: "*◇❖ ═━━━╾ 🩸 ╼━━━═ ❖◇*"
  },

  التاج_الملكي: {
    brand: "*👑 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 👑*",
    top: "*♛━━━༺ 👑 ༻━━━♛*",
    bottom: "*♛━━━━━━━━━━━━♛*"
  },

  الظلال: {
    brand: "*🌑 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌑*",
    top: "*╔══════ ◈ ══════╗*",
    bottom: "*╚══════ ◈ ══════╝*"
  },

  الفخامة: {
    brand: "*✦ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ✦*",
    top: "*╭━━━ ⋆⋅✧⋅⋆ ━━━╮*",
    bottom: "*╰━━━ ⋆⋅✧⋅⋆ ━━━╯*"
  },

  النيون: {
    brand: "*⚡ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⚡*",
    top: "*╔═⚡══════⚡═╗*",
    bottom: "*╚═⚡══════⚡═╝*"
  },

  الساموراي: {
    brand: "*⚔️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⚔️*",
    top: "*⚔━━━〔 武 〕━━━⚔*",
    bottom: "*⚔━━━━━━━━━━━━⚔*"
  },

  الجليد: {
    brand: "*❄️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ❄️*",
    top: "*❄═══༺ ❄ ༻═══❄*",
    bottom: "*❄════════════❄*"
  },

  النار: {
    brand: "*🔥 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🔥*",
    top: "*🔥━━━༺ ♨ ༻━━━🔥*",
    bottom: "*🔥━━━━━━━━━━━━🔥*"
  },

  الزمرد: {
    brand: "*💚 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 💚*",
    top: "*❖━━━〔 ✧ 〕━━━❖*",
    bottom: "*❖━━━━━━━━━━━━❖*"
  },

  المجرة: {
    brand: "*🌌 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌌*",
    top: "*✧━━━━━ 🌌 ━━━━━✧*",
    bottom: "*✧━━━━━━━━━━━━✧*"
  },

  البرق: {
    brand: "*🌩️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌩️*",
    top: "*━━━⚡⟪ ⚡ ⟫⚡━━━*",
    bottom: "*━━━⚡━━━━━━━━⚡━━━*"
  },

  الوردة: {
    brand: "*🌹 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🌹*",
    top: "*❀━━━━༺ 🌹 ༻━━━━❀*",
    bottom: "*❀━━━━━━━━━━━━❀*"
  },

  الماسي: {
    brand: "*💎 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 💎*",
    top: "*◇◆◇━━━━ 💎 ━━━━◇◆◇*",
    bottom: "*◇◆◇━━━━━━━━━━━━◇◆◇*"
  },

  الكلاسيكي: {
    brand: "*『 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 』*",
    top: "*╔══════════════╗*",
    bottom: "*╚══════════════╝*"
  },

  الهندسي: {
    brand: "*◈ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ◈*",
    top: "*⫷◆━━━━╾ ◈ ╼━━━━◆⫸*",
    bottom: "*⫷◆━━━━━━━━━━━━◆⫸*"
  },

  الهندسي_النادر: {
    brand: "*⟡ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⟡*",
    top: "*⟡❐ ═━━━╾ ◆ ╼━━━═ ❐⟡*",
    bottom: "*⟡❐ ═━━━━━━━━━━━━═ ❐⟡*"
  },

  الهندسي_الحاد: {
    brand: "*◢ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ◣*",
    top: "*◢◆◣━━━╾ 🩸 ╼━━━◢◆◣*",
    bottom: "*◢◆◣━━━━━━━━━━━━◢◆◣*"
  },

  الإمبراطوري: {
    brand: "*♛ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ♛*",
    top: "*♛❖══════ ◈ ══════❖♛*",
    bottom: "*♛❖══════════════❖♛*"
  },

  الذهبي: {
    brand: "*✨ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ✨*",
    top: "*✦━━━━━━ ✨ ━━━━━━✦*",
    bottom: "*✦━━━━━━━━━━━━━━✦*"
  },

  القرمزي: {
    brand: "*🔴 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🔴*",
    top: "*◆❖ ═━━━╾ 🔴 ╼━━━═ ❖◆*",
    bottom: "*◆❖ ═━━━━━━━━━━━━═ ❖◆*"
  },

  الشبح: {
    brand: "*𓆩 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 𓆪*",
    top: "*༺⫷━━━━ ◈ ━━━━⫸༻*",
    bottom: "*༺⫷━━━━━━━━━━━━⫸༻*"
  },

  المثلثات: {
    brand: "*▲ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ▲*",
    top: "*◢━━━━━━━━━━━━◣*",
    bottom: "*◥━━━━━━━━━━━━◤*"
  },

  البلاتيني: {
    brand: "*◇ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ◇*",
    top: "*╔═◇◆━━━━◆◇═╗*",
    bottom: "*╚═◇◆━━━━◆◇═╝*"
  },

  البسيط: {
    brand: "*𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓*",
    top: "*━━━━━━━━━━━━━━*",
    bottom: "*━━━━━━━━━━━━━━*"
  }
};

export const ELITE_PRESET = {
  brand: "*♛ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐄𝐋𝐈𝐓𝐄 ♛*",
  top: "*⫷♛━━━━━━ ◈ ━━━━━━♛⫸*",
  bottom: "*⫷♛━━━━━━━━━━━━♛⫸*"
};

export const DEFAULT_DECORATION = {
  ...PRESETS[DEFAULT_PRESET],
  preset: DEFAULT_PRESET
};

function safeLine(value, fallback, max = 180) {
  if (typeof value !== "string") return fallback;

  const line = value
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, max);

  return line || fallback;
}

function normalizeSettings(saved = {}) {
  const presetName =
    typeof saved.preset === "string" && PRESETS[saved.preset]
      ? saved.preset
      : DEFAULT_PRESET;

  const base = PRESETS[presetName];

  return {
    preset: presetName,
    brand: safeLine(saved.brand, base.brand),
    top: safeLine(saved.top, base.top),
    bottom: safeLine(saved.bottom, base.bottom),
    eliteBrand: safeLine(saved.eliteBrand, ELITE_PRESET.brand),
    eliteTop: safeLine(saved.eliteTop, ELITE_PRESET.top),
    eliteBottom: safeLine(saved.eliteBottom, ELITE_PRESET.bottom)
  };
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function saveSettings(settings) {
  ensureDataDir();

  const normalized = normalizeSettings(settings);
  const tempFile = `${styleFile}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(normalized, null, 2) + "\n",
    "utf8"
  );

  fs.renameSync(tempFile, styleFile);
  return normalized;
}

function readDecoration() {
  try {
    if (!fs.existsSync(styleFile)) {
      return { ...DEFAULT_DECORATION, ...ELITE_PRESET };
    }

    const saved = JSON.parse(fs.readFileSync(styleFile, "utf8"));
    return normalizeSettings(saved);
  } catch (error) {
    console.error("[ARTHUR STYLE] Failed to read settings:", error.message);
    return normalizeSettings({});
  }
}

function removeOldFrames(value, decoration) {
  const allPresets = Object.values(PRESETS).flatMap(p => [
    p.brand, p.top, p.bottom
  ]);

  const eliteFrames = [
    ELITE_PRESET.brand,
    ELITE_PRESET.top,
    ELITE_PRESET.bottom
  ];

  const known = new Set([
    decoration.brand,
    decoration.top,
    decoration.bottom,
    decoration.eliteBrand,
    decoration.eliteTop,
    decoration.eliteBottom,
    ...allPresets,
    ...eliteFrames
  ]);

  return String(value ?? "")
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();

      if (!trimmed) return true;
      if (known.has(trimmed)) return false;

      // Known legacy ARTHUR frames.
      if (/^\*?◇❐.*❐◇\*?$/.test(trimmed)) return false;
      if (/^\*?🩸\s*𝐀𝐑𝐓𝐇𝐔𝐑(?:\s+𝐁𝐎𝐓)?\s*🩸\*?$/.test(trimmed)) return false;
      if (/^\*?👑\s*ARTHUR\s+LEYWIN\*?$/.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

// Read current decoration.
export function getDecoration() {
  return readDecoration();
}

// List all preset names.
export function getPresetNames() {
  return Object.keys(PRESETS);
}

// Change the complete preset and persist it.
export function setDecorationPreset(name) {
  if (typeof name !== "string" || !PRESETS[name]) {
    return {
      success: false,
      message: "الزخرفة غير موجودة",
      presets: getPresetNames()
    };
  }

  const selected = PRESETS[name];
  const current = readDecoration();

  const saved = saveSettings({
    ...current,
    ...selected,
    preset: name
  });

  return { success: true, decoration: saved };
}

// Change only the bot logo/brand.
export function setArthurLogo(logo) {
  if (typeof logo !== "string" || !logo.trim()) {
    return { success: false, message: "الشعار غير صالح" };
  }

  const current = readDecoration();

  const saved = saveSettings({
    ...current,
    brand: safeLine(logo, current.brand)
  });

  return { success: true, decoration: saved };
}

// Change only the normal message header and footer.
export function setArthurFrames(top, bottom) {
  const current = readDecoration();

  const saved = saveSettings({
    ...current,
    top: safeLine(top, current.top),
    bottom: safeLine(bottom, current.bottom)
  });

  return { success: true, decoration: saved };
}

// Customize the elite header/footer separately.
export function setArthurEliteStyle(brand, top, bottom) {
  const current = readDecoration();

  const saved = saveSettings({
    ...current,
    eliteBrand: safeLine(brand, current.eliteBrand),
    eliteTop: safeLine(top, current.eliteTop),
    eliteBottom: safeLine(bottom, current.eliteBottom)
  });

  return { success: true, decoration: saved };
}

// Reset normal logo and frames to the selected preset.
export function resetArthurStyle() {
  const current = readDecoration();
  const base = PRESETS[current.preset] || PRESETS[DEFAULT_PRESET];

  const saved = saveSettings({
    ...current,
    ...base,
    preset: current.preset
  });

  return { success: true, decoration: saved };
}

// Reset everything, including the selected preset.
export function resetAllArthurStyles() {
  const saved = saveSettings({
    ...PRESETS[DEFAULT_PRESET],
    preset: DEFAULT_PRESET,
    ...{
      eliteBrand: ELITE_PRESET.brand,
      eliteTop: ELITE_PRESET.top,
      eliteBottom: ELITE_PRESET.bottom
    }
  });

  return { success: true, decoration: saved };
}

export function arthurHead() {
  const s = readDecoration();
  return `${s.brand}\n${s.top}`;
}

export function arthurBox(content = "") {
  const s = readDecoration();

  const body = Array.isArray(content)
    ? content.map(v => String(v ?? "")).join("\n")
    : String(content ?? "");

  const clean = removeOldFrames(body, s);

  return clean
    ? `${s.brand}\n${s.top}\n\n${clean}\n\n${s.bottom}`
    : `${s.brand}\n${s.top}\n\n${s.bottom}`;
}

export function arthurEliteBox(content = "") {
  const s = readDecoration();

  const body = Array.isArray(content)
    ? content.map(v => String(v ?? "")).join("\n")
    : String(content ?? "");

  const clean = removeOldFrames(body, s);

  return clean
    ? `${s.eliteBrand}\n${s.eliteTop}\n\n${clean}\n\n${s.eliteBottom}`
    : `${s.eliteBrand}\n${s.eliteTop}\n\n${s.eliteBottom}`;
}

export function arthurFooter() {
  return readDecoration().bottom;
}

export function isArthurDecorated(value) {
  const t = String(value ?? "").trim();
  const s = readDecoration();

  return (
    t.startsWith(s.brand) &&
    t.endsWith(s.bottom)
  );
}

export default {
  PRESETS,
  ELITE_PRESET,
  DEFAULT_DECORATION,
  getDecoration,
  getPresetNames,
  setDecorationPreset,
  setArthurLogo,
  setArthurFrames,
  setArthurEliteStyle,
  resetArthurStyle,
  resetAllArthurStyles,
  arthurHead,
  arthurBox,
  arthurEliteBox,
  arthurFooter,
  isArthurDecorated
};