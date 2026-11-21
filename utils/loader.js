
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { randomUUID } from "crypto";

/* ╔══════════════════════════════════════════════════════╗
   ║                                                      ║
   ║       🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 — 𝐏𝐋𝐔𝐆𝐈𝐍 𝐄𝐍𝐆𝐈𝐍𝐄 🩸       ║
   ║                                                      ║
   ║          👑  ADVANCED PLUGIN SYSTEM  👑              ║
   ║                                                      ║
   ╚══════════════════════════════════════════════════════╝ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGINS_PATH = path.resolve(__dirname, "../plugins");

const CONFIG = Object.freeze({
    WATCH_DEBOUNCE: 800,
    MAX_ERROR_LENGTH: 1200,
    EXTENSION: ".js"
});

const C = Object.freeze({
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[38;5;196m",
    darkRed: "\x1b[38;5;124m",
    orange: "\x1b[38;5;208m",
    gold: "\x1b[38;5;220m",
    yellow: "\x1b[38;5;226m",
    green: "\x1b[38;5;46m",
    cyan: "\x1b[38;5;51m",
    blue: "\x1b[38;5;39m",
    purple: "\x1b[38;5;129m",
    gray: "\x1b[38;5;245m",
    white: "\x1b[38;5;255m"
});

let pluginsCache = null;
let loadingPromise = null;
let cacheVersion = 0;

let watchers = [];
let watchTimer = null;
let watchCallback = null;
let watcherStarted = false;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   👑 ARTHUR LOGGER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function log(type, message) {
    const styles = {
        info: C.cyan,
        success: C.green,
        warning: C.orange,
        error: C.red,
        title: C.gold
    };

    const symbols = {
        info: "◆",
        success: "✔",
        warning: "⚠",
        error: "✖",
        title: "👑"
    };

    const color = styles[type] || C.white;
    const symbol = symbols[type] || "•";

    console.log(
        `${C.darkRed}┃${C.reset} ${color}${symbol} ${message}${C.reset}`
    );
}

function printBanner() {
    console.log("");

    console.log(
        `${C.darkRed}╔══════════════════════════════════════════════════════╗${C.reset}`
    );
    console.log(
        `${C.darkRed}║${C.reset} ${C.gold}${C.bold}              🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸${C.reset}             ${C.darkRed}║${C.reset}`
    );
    console.log(
        `${C.darkRed}║${C.reset} ${C.white}                𝐏𝐋𝐔𝐆𝐈𝐍 𝐄𝐍𝐆𝐈𝐍𝐄${C.reset}                 ${C.darkRed}║${C.reset}`
    );
    console.log(
        `${C.darkRed}╠══════════════════════════════════════════════════════╣${C.reset}`
    );
    console.log(
        `${C.darkRed}║${C.reset} ${C.gray}             ADVANCED MODULE SYSTEM${C.reset}              ${C.darkRed}║${C.reset}`
    );
    console.log(
        `${C.darkRed}╚══════════════════════════════════════════════════════╝${C.reset}`
    );

    console.log("");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📁 DIRECTORY MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ensurePluginsDirectory() {
    try {
        fs.mkdirSync(PLUGINS_PATH, { recursive: true });
        return true;
    } catch (error) {
        log("error", `PLUGIN DIRECTORY: ${error.message}`);
        return false;
    }
}

function getPluginFiles() {
    if (!ensurePluginsDirectory()) return [];

    const files = [];

    function scan(directory) {
        let entries;

        try {
            entries = fs.readdirSync(directory, {
                withFileTypes: true
            });
        } catch (error) {
            log("warning", `Cannot scan: ${directory}`);
            return;
        }

        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;

            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                scan(fullPath);
                continue;
            }

            if (
                entry.isFile() &&
                entry.name.toLowerCase().endsWith(CONFIG.EXTENSION)
            ) {
                files.push(
                    path.relative(PLUGINS_PATH, fullPath)
                );
            }
        }
    }

    scan(PLUGINS_PATH);

    return files.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
    );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚙️ MODULE IMPORT SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

async function importPlugin(file) {
    const filePath = path.join(PLUGINS_PATH, file);

    try {
        const moduleURL = pathToFileURL(filePath);

        // Unique URL prevents stale ESM module cache reuse.
        moduleURL.searchParams.set("arthur", randomUUID());

        const module = await import(moduleURL.href);
        const plugin = module?.default;

        if (
            !plugin ||
            typeof plugin !== "object" ||
            Array.isArray(plugin)
        ) {
            log("warning", `INVALID MODULE: ${file}`);
            return null;
        }

        return plugin;

    } catch (error) {
        const details = String(
            error?.stack || error?.message || error
        ).slice(0, CONFIG.MAX_ERROR_LENGTH);

        log("error", `MODULE FAILED: ${file}`);
        console.error(`${C.gray}${details}${C.reset}`);

        return null;
    }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   👑 MAIN PLUGIN LOADER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function loadPlugins(sock) {
    if (pluginsCache !== null) {
        return pluginsCache;
    }

    if (loadingPromise) {
        return loadingPromise;
    }

    const versionAtStart = cacheVersion;

    loadingPromise = (async () => {
        const startedAt = Date.now();

        try {
            printBanner();

            const files = getPluginFiles();

            log("info", `DISCOVERED MODULES : ${files.length}`);

            if (files.length === 0) {
                log("warning", "NO PLUGIN FILES FOUND");
                return [];
            }

            log("info", "INITIALIZING MODULES...");

            const results = await Promise.all(
                files.map(async (file) => ({
                    file,
                    plugin: await importPlugin(file)
                }))
            );

            const loaded = results
                .filter(item => item.plugin !== null)
                .map(item => item.plugin);

            const failed = results.filter(
                item => item.plugin === null
            );

            console.log("");

            for (const item of results) {
                if (item.plugin) {
                    log("success", `LOADED  : ${item.file}`);
                } else {
                    log("error", `FAILED  : ${item.file}`);
                }
            }

            const elapsed = Date.now() - startedAt;

            console.log("");

            log("title", "ARTHUR ENGINE REPORT");
            log("success", `SUCCESSFUL MODULES : ${loaded.length}`);
            log("warning", `FAILED MODULES     : ${failed.length}`);
            log("info", `TOTAL MODULES      : ${files.length}`);
            log("info", `LOADING TIME       : ${elapsed}ms`);

            console.log("");
            console.log(
                `${C.darkRed}╔══════════════════════════════════════════════════════╗${C.reset}`
            );
            console.log(
                `${C.darkRed}║${C.reset} ${C.gold}${C.bold}             👑 ARTHUR SYSTEM READY 👑${C.reset}             ${C.darkRed}║${C.reset}`
            );
            console.log(
                `${C.darkRed}╚══════════════════════════════════════════════════════╝${C.reset}`
            );
            console.log("");

            // Do not cache results if invalidation happened mid-load.
            if (cacheVersion === versionAtStart) {
                pluginsCache = loaded;
            }

            return loaded;

        } catch (error) {
            log("error", "FATAL PLUGIN ENGINE ERROR");
            console.error(error?.stack || error);
            return [];

        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ♻️ CACHE CONTROL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function invalidatePluginCache() {
    cacheVersion++;
    pluginsCache = null;
}

export function clearPluginsCache() {
    invalidatePluginCache();
}

export async function reloadPlugins(sock) {
    invalidatePluginCache();
    return loadPlugins(sock);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   👁️ LIVE PLUGIN WATCHER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function closeWatchers() {
    for (const watcher of watchers) {
        try {
            watcher.close();
        } catch {}
    }

    watchers = [];
}

function watchDirectory(directory) {
    try {
        const watcher = fs.watch(
            directory,
            { persistent: false },
            (eventType, filename) => {
                if (!filename) return;

                if (watchTimer) {
                    clearTimeout(watchTimer);
                }

                watchTimer = setTimeout(async () => {
                    watchTimer = null;

                    invalidatePluginCache();

                    log("info", "PLUGIN CHANGE DETECTED");

                    if (typeof watchCallback === "function") {
                        try {
                            await watchCallback();
                        } catch (error) {
                            log("error", "AUTO RELOAD FAILED");
                            console.error(error?.stack || error);
                        }
                    }
                }, CONFIG.WATCH_DEBOUNCE);
            }
        );

        watcher.on("error", error => {
            log("warning", `WATCHER ERROR: ${error.message}`);
        });

        watchers.push(watcher);

    } catch (error) {
        log("warning", `WATCH UNAVAILABLE: ${directory}`);
        return;
    }

    let entries = [];

    try {
        entries = fs.readdirSync(directory, {
            withFileTypes: true
        });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (
            entry.isDirectory() &&
            !entry.name.startsWith(".")
        ) {
            watchDirectory(
                path.join(directory, entry.name)
            );
        }
    }
}

export function watchPlugins(onChangeCallback) {
    if (watcherStarted) return watchers;

    if (!ensurePluginsDirectory()) return [];

    watchCallback =
        typeof onChangeCallback === "function"
            ? onChangeCallback
            : null;

    watchDirectory(PLUGINS_PATH);

    watcherStarted = true;

    log("success", `WATCHER STARTED : ${watchers.length} DIRECTORIES`);

    return watchers;
}

export function stopPluginWatcher() {
    if (watchTimer) {
        clearTimeout(watchTimer);
        watchTimer = null;
    }

    closeWatchers();

    watchCallback = null;
    watcherStarted = false;

    log("warning", "PLUGIN WATCHER STOPPED");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📋 PUBLIC UTILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function getPluginFilesList() {
    return getPluginFiles();
}
