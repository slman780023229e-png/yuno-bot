// memory-cleaner.js
'use strict';

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const CONFIG = {
    checkIntervalMs: 60 * 1000,     // فحص هادئ كل دقيقة
    maxRamMB: 100,                  // الحد الأقصى الآمن للذاكرة (تم التعديل إلى 100 ميجابايت)
    targetCacheDirs: ['tmp', 'temp', 'cache', '.cache'],

    // 🛡️ درع الحماية الفولاذي المطلق: ممنوع منعاً باتاً الاقتراب منها أو لمسها
    protectedExtensions: ['.js', '.json', '.ts', '.env', '.sh', '.db'],
    protectedFolders: [
        'commands', 
        'events', 
        'plugins', 
        'src', 
        'lib', 
        'node_modules', 
        'session', 
        'sessions', 
        'ملف_الاتصال' // 🛑 محمي تماماً وضمن القائمة السوداء للمسح
    ],
    protectedFiles: ['creds.json', 'package.json', 'package-lock.json', 'index.js', 'main.js']
};

function getMB(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function cleanCacheFolder(dirPath) {
    try {
        const absolutePath = path.resolve(process.cwd(), dirPath);
        
        // 🛑 حماية إضافية تامة: تجاهل مجلدات الاتصال والجلسات نهائياً
        if (absolutePath.includes('ملف_الاتصال') || absolutePath.includes('session')) {
            return;
        }

        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) return;

        const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
        let deletedCount = 0;

        for (const entry of entries) {
            const fullPath = path.join(absolutePath, entry.name);

            // فحص الحماية الصارم
            if (CONFIG.protectedFiles.includes(entry.name)) continue;
            if (CONFIG.protectedFolders.includes(entry.name)) continue;

            try {
                if (entry.isDirectory()) {
                    const stat = fs.statSync(fullPath);
                    if (Date.now() - stat.mtimeMs > 15 * 60 * 1000) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        deletedCount++;
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (CONFIG.protectedExtensions.includes(ext)) continue;

                    const stat = fs.statSync(fullPath);
                    if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) {
                        fs.unlinkSync(fullPath);
                        deletedCount++;
                    }
                }
            } catch {}
        }

        if (deletedCount > 0) {
            console.log(chalk.yellow(`*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*\n[Memory Cleaner] 🗑️ Cleared ${deletedCount} cache files from /${dirPath}\n*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*`));
        }
    } catch {}
}

function runDeepClean() {
    for (const dir of CONFIG.targetCacheDirs) {
        cleanCacheFolder(dir);
    }

    if (global.gc) {
        try {
            global.gc();
        } catch {}
    }
}

// بدء تشغيل المراقب بلمسة آرثر المزخرفة والهادئة
function initMemoryCleaner() {
    console.log(chalk.magenta(`
*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*
║      🛡️ MEMORY CLEANER ACTIVE 🛡️     ║
║      Target Limit: ${CONFIG.maxRamMB}MB (Safe)   ║
*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*
`));

    setInterval(() => {
        try {
            const currentRamMB = getMB(process.memoryUsage().rss);

            if (currentRamMB >= CONFIG.maxRamMB) {
                runDeepClean();
            }
        } catch {}
    }, CONFIG.checkIntervalMs);
}

// التشغيل الفوري
initMemoryCleaner();

export { runDeepClean };
