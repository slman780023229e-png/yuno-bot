import chalk from "chalk";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================================
// 🛡️ درع الحماية الفولاذي المطلق (محصن ضد أي مسح أو تلف للجلسة)
// ==========================================================
function protectAndCleanSession() {
    try {
        // حماية تامة ومطلقة لمجلدات الاتصال والجلسات من أي عبث أو فحص عشوائي
        const protectedDirs = [
            path.join(__dirname, "ملف_الاتصال"),
            path.join(__dirname, "session"),
            path.join(__dirname, "sessions")
        ];

        for (const sessionDir of protectedDirs) {
            if (fs.existsSync(sessionDir)) {
                // إعلان حصانة كاملة: ممنوع منعا باتا فحص أو لمس محتويات مجلد الاتصال
                console.log(chalk.green(`🛡️ [حماية فولاذية]: مجلد الجلسة محمي بالكامل ولن يتم لمسه: ${path.basename(sessionDir)}`));
                continue; 
            }
        }
    } catch (err) {
        console.log(chalk.yellow("⚠️ تنبيه الحماية: " + err.message));
    }
}

// =============================
// 🧹 تنظيف الملفات المؤقتة البعيدة عن الجلسة فقط
// =============================
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
        process.stdout.write(
            `\r${chalk.cyan(text)} [${bar(i)}] ${i}%`
        );
        await sleep(80);
    }

    console.log(
        chalk.green(" ✓")
    );
}

async function start() {
    // تفعيل درع الحماية الصارم للجلسات وتنظيف الكاش الآمن
    protectAndCleanSession();
    clearTempCache();

    console.clear();

    console.log(`
${chalk.yellow("╔══════════════════════════════════════════════════════════════════╗")}
${chalk.yellow("║")} ${chalk.red("█████╗ ██████╗ ████████╗██╗  ██╗██╗   ██╗██████╗     👑 𝐀𝐑𝐓𝐇𝐔𝐑 👑")} ${chalk.yellow("║")}
${chalk.yellow("║")} ${chalk.green("██╔══██╗██╔══██╗╚══██╔══╝██║  ██║██║   ██║██╔══██╗    🛡️ SYSTEM")}   ${chalk.yellow("║")}
${chalk.yellow("║")} ${chalk.cyan("███████║██████╔╝   ██║   ███████║██║   ██║██████╔╝    ⚡ ONLINE")}   ${chalk.yellow("║")}
${chalk.yellow("║")} ${chalk.magenta("██╔══██║██╔══██╗   ██║   ██╔══██║██║   ██║██╔══██╗                ")} ${chalk.yellow("║")}
${chalk.yellow("║")} ${chalk.blue("██║  ██║██║  ██║   ██║   ██║  ██║╚██████╔╝██║  ██║  v6.0 SECURE")} ${chalk.yellow("║")}
${chalk.yellow("╚══════════════════════════════════════════════════════════════════╝")}
`);

    await loading(
        "⚡ INITIALIZING ARTHUR KERNEL"
    );

    await loading(
        "🔧 LOADING MODULES & PLUGINS"
    );

    await loading(
        "🚀 STARTING ARTHUR BOT ENGINE"
    );

    console.log(
        chalk.green("\n[✓] Launching main.js successfully...\n")
    );

    const bot = spawn(
        "node",
        [path.join(__dirname, "main.js")],
        {
            stdio: "inherit",
            cwd: __dirname
        }
    );

    bot.on(
        "close",
        () => {
            console.log(
                chalk.yellow(
                    "\n[!] Arthur Bot stopped, restarting engine safely..."
                )
            );

            setTimeout(
                start,
                3000
            );
        }
    );
}

process.on("uncaughtException", (err) => {
    console.error(chalk.red("Arthur Start Error: " + err.message));
});

start();
