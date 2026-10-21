import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════
//          ARTHUR BOT • ULTIMATE STYLE ENGINE
//       Royal • Gothic • Elite • Safe • Optimized
// ═══════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");
const styleFile = path.join(dataDir, "زخرفة.json");
const tempFile = `${styleFile}.tmp`;
const backupFile = `${styleFile}.corrupt-backup`;

const DEFAULT_PRESET = "دم_آرثر";
const MAX_LINE_LENGTH = 180;

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

export const DEFAULT_DECORATION = Object.freeze({
  ...PRESETS[DEFAULT_PRESET],
  preset: DEFAULT_PRESET
});

// ═══════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════

let settingsCache = null;
let settingsCacheMtimeMs = -1;
let settingsCacheSize = -1;

// ═══════════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════════

function safeLine(value, fallback, max = MAX_LINE_LENGTH) {
  const source = typeof value === "string" ? value : fallback;

  const line = String(source ?? "")
    .replace(/[\r\n\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);

  return line || String(fallback ?? "").slice(0, max);
}

function normalizeSettings(saved = {}) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    saved = {};
  }

  const presetName =
    typeof saved.preset === "string" &&
    Object.prototype.hasOwnProperty.call(PRESETS, saved.preset)
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

function defaultSettings() {
  return normalizeSettings({
    ...DEFAULT_DECORATION,
    eliteBrand: ELITE_PRESET.brand,
    eliteTop: ELITE_PRESET.top,
    eliteBottom: ELITE_PRESET.bottom
  });
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function refreshCache(settings) {
  settingsCache = normalizeSettings(settings);

  try {
    if (fs.existsSync(styleFile)) {
      const stat = fs.statSync(styleFile);
      settingsCacheMtimeMs = stat.mtimeMs;
      settingsCacheSize = stat.size;
    } else {
      settingsCacheMtimeMs = -1;
      settingsCacheSize = -1;
    }
  } catch {
    settingsCacheMtimeMs = -1;
    settingsCacheSize = -1;
  }

  return { ...settingsCache };
}

// ═══════════════════════════════════════════════════════════
// SAFE PERSISTENCE
// ═══════════════════════════════════════════════════════════

function saveSettings(settings) {
  ensureDataDir();

  const normalized = normalizeSettings(settings);
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;

  try {
    fs.writeFileSync(tempFile, payload, {
      encoding: "utf8",
      mode: 0o600
    });

    fs.renameSync(tempFile, styleFile);

    refreshCache(normalized);
    return { ...normalized };
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Preserve the original error.
    }

    throw error;
  }
}

function readDecoration() {
  try {
    if (!fs.existsSync(styleFile)) {
      return refreshCache(defaultSettings());
    }

    const stat = fs.statSync(styleFile);

    if (
      settingsCache &&
      settingsCacheMtimeMs === stat.mtimeMs &&
      settingsCacheSize === stat.size
    ) {
      return { ...settingsCache };
    }

    const raw = fs.readFileSync(styleFile, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeSettings(parsed);
    const normalizedJson = `${JSON.stringify(normalized, null, 2)}\n`;

    if (raw !== normalizedJson) {
      try {
        fs.writeFileSync(tempFile, normalizedJson, "utf8");
        fs.renameSync(tempFile, styleFile);
      } catch (error) {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {
          // Ignore temporary-file cleanup errors.
        }

        console.error(
          "[ARTHUR STYLE] Could not normalize settings:",
          error.message
        );
      }
    }

    return refreshCache(normalized);
  } catch (error) {
    console.error(
      "[ARTHUR STYLE] Failed to read settings:",
      error.message
    );

    // Preserve corrupt settings for manual recovery.
    try {
      if (fs.existsSync(styleFile) && !fs.existsSync(backupFile)) {
        fs.copyFileSync(
          styleFile,
          backupFile,
          fs.constants.COPYFILE_EXCL
        );
      }
    } catch (backupError) {
      console.error(
        "[ARTHUR STYLE] Backup failed:",
        backupError.message
      );
    }

    settingsCache = defaultSettings();
    settingsCacheMtimeMs = -1;
    settingsCacheSize = -1;

    return { ...settingsCache };
  }
}

// ═══════════════════════════════════════════════════════════
// FRAME CLEANUP
// ═══════════════════════════════════════════════════════════

function allKnownFrames(decoration = readDecoration()) {
  const presetFrames = Object.values(PRESETS).flatMap(preset => [
    preset.brand,
    preset.top,
    preset.bottom
  ]);

  return new Set([
    decoration.brand,
    decoration.top,
    decoration.bottom,
    decoration.eliteBrand,
    decoration.eliteTop,
    decoration.eliteBottom,
    ...presetFrames,
    ELITE_PRESET.brand,
    ELITE_PRESET.top,
    ELITE_PRESET.bottom
  ].filter(Boolean));
}

function isLegacyFrame(line) {
  const trimmed = String(line ?? "").trim();

  if (!trimmed) return false;

  return (
    /^\*?◇❐.*❐◇\*?$/.test(trimmed) ||
    /^\*?🩸\s*𝐀𝐑𝐓𝐇𝐔𝐑(?:\s+𝐁𝐎𝐓)?\s*🩸\*?$/.test(trimmed) ||
    /^\*?👑\s*ARTHUR\s+LEYWIN\*?$/.test(trimmed)
  );
}

function removeOldFrames(value, decoration = readDecoration()) {
  const known = allKnownFrames(decoration);

  return String(value ?? "")
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();

      if (!trimmed) return true;

      return !known.has(trimmed) && !isLegacyFrame(trimmed);
    })
    .join("\n")
    .trim();
}

function normalizeBody(content) {
  return Array.isArray(content)
    ? content.map(value => String(value ?? "")).join("\n")
    : String(content ?? "");
}

function buildBox(content, brand, top, bottom, decoration) {
  const clean = removeOldFrames(
    normalizeBody(content),
    decoration
  );

  return clean
    ? `${brand}\n${top}\n\n${clean}\n\n${bottom}`
    : `${brand}\n${top}\n\n${bottom}`;
}

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════

function safeOperation(operation, successMessage) {
  try {
    const decoration = operation();

    return {
      success: true,
      message: successMessage,
      decoration
    };
  } catch (error) {
    console.error(
      "[ARTHUR STYLE] Save operation failed:",
      error.message
    );

    return {
      success: false,
      message: "تعذر حفظ إعدادات الزخرفة. تحقق من صلاحيات مجلد data ومساحة التخزين.",
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export function getDecoration() {
  return readDecoration();
}

export function getPresetNames() {
  return Object.keys(PRESETS);
}

export function setDecorationPreset(name) {
  if (
    typeof name !== "string" ||
    !Object.prototype.hasOwnProperty.call(PRESETS, name)
  ) {
    return {
      success: false,
      message: "الزخرفة غير موجودة",
      presets: getPresetNames()
    };
  }

  return safeOperation(() => {
    const current = readDecoration();

    return saveSettings({
      ...current,
      ...PRESETS[name],
      preset: name
    });
  }, "تم تغيير الزخرفة بنجاح");
}

export function setArthurLogo(logo) {
  if (typeof logo !== "string" || !logo.trim()) {
    return {
      success: false,
      message: "الشعار غير صالح"
    };
  }

  return safeOperation(() => {
    const current = readDecoration();

    return saveSettings({
      ...current,
      brand: safeLine(logo, current.brand)
    });
  }, "تم تغيير الشعار بنجاح");
}

export function setArthurFrames(top, bottom) {
  return safeOperation(() => {
    const current = readDecoration();

    return saveSettings({
      ...current,
      top: safeLine(top, current.top),
      bottom: safeLine(bottom, current.bottom)
    });
  }, "تم تغيير الإطارات بنجاح");
}

export function setArthurEliteStyle(brand, top, bottom) {
  return safeOperation(() => {
    const current = readDecoration();

    return saveSettings({
      ...current,
      eliteBrand: safeLine(brand, current.eliteBrand),
      eliteTop: safeLine(top, current.eliteTop),
      eliteBottom: safeLine(bottom, current.eliteBottom)
    });
  }, "تم تخصيص زخرفة النخبة بنجاح");
}

export function resetArthurStyle() {
  return safeOperation(() => {
    const current = readDecoration();
    const base = PRESETS[current.preset] || PRESETS[DEFAULT_PRESET];

    return saveSettings({
      ...current,
      ...base,
      preset: current.preset
    });
  }, "تمت إعادة الزخرفة العادية إلى القالب المحدد");
}

export function resetAllArthurStyles() {
  return safeOperation(() => {
    return saveSettings({
      ...PRESETS[DEFAULT_PRESET],
      preset: DEFAULT_PRESET,
      eliteBrand: ELITE_PRESET.brand,
      eliteTop: ELITE_PRESET.top,
      eliteBottom: ELITE_PRESET.bottom
    });
  }, "تمت إعادة جميع الزخارف إلى الإعدادات الافتراضية");
}

export function arthurHead() {
  const settings = readDecoration();

  return `${settings.brand}\n${settings.top}`;
}

export function arthurBox(content = "") {
  const settings = readDecoration();

  return buildBox(
    content,
    settings.brand,
    settings.top,
    settings.bottom,
    settings
  );
}

export function arthurEliteBox(content = "") {
  const settings = readDecoration();

  return buildBox(
    content,
    settings.eliteBrand,
    settings.eliteTop,
    settings.eliteBottom,
    settings
  );
}

export function arthurFooter() {
  return readDecoration().bottom;
}

export function isArthurDecorated(value) {
  const message = String(value ?? "").trim();

  if (!message) return false;

  const settings = readDecoration();

  const normalMatch =
    message.startsWith(`${settings.brand}\n${settings.top}`) &&
    message.endsWith(settings.bottom);

  const eliteMatch =
    message.startsWith(
      `${settings.eliteBrand}\n${settings.eliteTop}`
    ) &&
    message.endsWith(settings.eliteBottom);

  return normalMatch || eliteMatch;
}

// ═══════════════════════════════════════════════════════════
// DEFAULT EXPORT — KEEP API COMPATIBLE
// ═══════════════════════════════════════════════════════════

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