import chalk from "chalk";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================================
// 🛡️ حماية مجلدات الاتصال — محفوظة من الكود الأصلي
// ==========================================================
function protectAndCleanSession() {
    try {
        const protectedDirs = [
            path.join(__dirname, "ملف_الاتصال"),
            path.join(__dirname, "session"),
            path.join(__dirname, "sessions")
        ];

        for (const sessionDir of protectedDirs) {
            if (fs.existsSync(sessionDir)) {
                console.log(
                    chalk.green(
                        `🛡️ [حماية]: مجلد الجلسة محفوظ: ${path.basename(sessionDir)}`
                    )
                );
            }
        }
    } catch (err) {
        console.log(
            chalk.yellow("⚠️ تنبيه الحماية: " + err.message)
        );
    }
}

// ==========================================================
// 🧹 تنظيف الملفات المؤقتة — محفوظ من الكود الأصلي
// ==========================================================
function clearTempCache() {
    try {
        const cacheDirs = [
            path.join(__dirname, "tmp"),
            path.join(__dirname, "temp"),
            path.join(__dirname, "data/cache")
        ];

        for (const dir of cacheDirs) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);

                for (const file of files) {
                    const filePath = path.join(dir, file);

                    try {
                        const stats = fs.statSync(filePath);

                        if (stats.isFile()) {
                            fs.unlinkSync(filePath);
                        }
                    } catch {}
                }
            }
        }
    } catch {}
}

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================
// 🎨 ألوان الهوية الملكية
// ==========================================================
const gold = chalk.hex("#D4AF37");
const darkGold = chalk.hex("#947126");
const blood = chalk.hex("#C62828");
const white = chalk.hex("#F5F0E6");
const gray = chalk.hex("#777777");
const green = chalk.hex("#42D392");

// ==========================================================
// 📐 أدوات الإطار الهندسي
// ==========================================================
function line(char = "━", width = 58) {
    return char.repeat(width);
}

function border(text, width = 58) {
    const content = `  ${text}`;
    const visibleLength = [...content].length;
    const inside = Math.max(0, width - visibleLength - 1);

    return gold("║") + content + " ".repeat(inside) + gold("║");
}

// ==========================================================
// 👑 شاشة ARTHUR BOT — BLOODLINE ROYAL EDITION
// ==========================================================
function showBanner() {
    console.log(
        gold("╔" + line("═") + "╗")
    );

    console.log(
        gold("║") +
        blood("               ♛  🩸  ♛") +
        "                         " +
        gold("║")
    );

    console.log(
        gold("║") +
        "                 " +
        chalk.bold.hex("#D4AF37")("𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓") +
        "                  " +
        gold("║")
    );

    console.log(
        gold("║") +
        blood("          B L O O D L I N E   S Y S T E M") +
        "       " +
        gold("║")
    );

    console.log(
        gold("╠" + line("═") + "╣")
    );

    console.log(
        border("◈  ROYAL SECURITY  ◈  CORE ENGINE")
    );

    console.log(
        border("◇  SESSION GUARD   ◇  MODULE SYSTEM")
    );

    console.log(
        border("⬡  ARTHUR KERNEL   ⬡  AUTO RESTART")
    );

    console.log(
        gold("╠" + line("═") + "╣")
    );

    console.log(
        gold("║") +
        blood("       ◆  THE BLOODLINE NEVER FALLS  ◆") +
        "       " +
        gold("║")
    );

    console.log(
        gold("╚" + line("═") + "╝")
    );

    console.log(
        darkGold("          ◈ ━━━━━━━━━ ◆ ━━━━━━━━━ ◈")
    );

    console.log("");
}

// ==========================================================
// 📊 شريط التحميل — محفوظ من الكود الأصلي
// ==========================================================
function bar(percent, size = 30) {
    const filled = Math.floor(
        (percent / 100) * size
    );

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

async function loading(text) {
    for (let i = 0; i <= 100; i += 5) {
        const progress = bar(i);

        process.stdout.write(
            `\r${blood("◆")} ${white(text)} ` +
            gold(`[${progress}]`) +
            ` ${chalk.bold.hex("#D4AF37")(i + "%")}`
        );

        await sleep(80);
    }

    console.log(" " + green("✓ COMPLETE"));
}

// ==========================================================
// 🚀 تشغيل ARTHUR BOT
// ==========================================================
async function start() {
    console.clear();

    // إبقاء إجراءات الحماية والتنظيف الأصلية
    protectAndCleanSession();
    clearTempCache();

    console.clear();

    // عرض الهوية الجديدة
    showBanner();

    await loading(
        "INITIALIZING ARTHUR KERNEL"
    );

    await loading(
        "LOADING MODULES & PLUGINS"
    );

    await loading(
        "STARTING ARTHUR BOT ENGINE"
    );

    console.log("");

    console.log(
        gold("╔" + line("═") + "╗")
    );

    console.log(
        gold("║") +
        green("       ✓ ARTHUR BOT ENGINE IS STARTING") +
        "          " +
        gold("║")
    );

    console.log(
        gold("║") +
        gray("       TARGET: main.js") +
        "                                  " +
        gold("║")
    );

    console.log(
        gold("╚" + line("═") + "╝")
    );

    console.log("");

    // ======================================================
    // ⚙️ تشغيل main.js — نفس الطريقة الأصلية
    // ======================================================
    const bot = spawn(
        "node",
        [path.join(__dirname, "main.js")],
        {
            stdio: "inherit",
            cwd: __dirname
        }
    );

    bot.on("error", (err) => {
        console.error(
            blood("❌ Failed to launch main.js: " + err.message)
        );
    });

    // ======================================================
    // 🔄 إعادة التشغيل — نفس السلوك الأصلي
    // ======================================================
    bot.on("close", () => {
        console.log("");

        console.log(
            gold("╔" + line("═") + "╗")
        );

        console.log(
            gold("║") +
            blood("   ⚠ ARTHUR BOT STOPPED — RESTARTING") +
            "       " +
            gold("║")
        );

        console.log(
            gold("║") +
            white("   Restart scheduled in 3 seconds...") +
            "                 " +
            gold("║")
        );

        console.log(
            gold("╚" + line("═") + "╝")
        );

        setTimeout(start, 3000);
    });
}

// ==========================================================
// 🛡️ التقاط الأخطاء — محفوظ من الكود الأصلي
// ==========================================================
process.on("uncaughtException", (err) => {
    console.error(
        blood("Arthur Start Error: " + err.message)
    );
});

start();