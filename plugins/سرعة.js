import process from "process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getHandlerStats, getLoadedPlugins } from "../utils/handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    command: "سرعة",
    category: "النظام",
    description: "فحص سرعة النظام وتفاصيل أداء البوت",

    execute: async (sock, msg, data) => {
        const start = process.hrtime();
        
        // إرسال رسالة أولية للقياس الفوري
        const sentMsg = await sock.sendMessage(data.jid, { text: "*⚡ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐏𝐈𝐍𝐆...*" });

        const diff = process.hrtime(start);
        const ping = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

        // Count loaded plugins recursively through the actual plugin loader.
        let cmdCount = 0;
        try {
            const plugins = await getLoadedPlugins(sock);
            cmdCount = plugins.length;
        } catch {}

        const queue = getHandlerStats();

        // معلومات النظام
        const uptime = (process.uptime() / 60).toFixed(1);
        const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const platform = process.platform;
        const nodeVersion = process.version;

        const text = 
`*╭━〔 📊 𝐀𝐍𝐀𝐋𝐘𝐓𝐈𝐂𝐒 〕━╮*
*┃ 🚀 السرعة : ${ping}ms*
*┃ ⏱ التشغيل : ${uptime} دقيقة*
*┃ 💾 الذاكرة : ${memory} MB*
*┃ 📜 الإضافات : ${cmdCount}*
*┃ 📥 الرسائل المنتظرة : ${queue.pendingMessages}*
*┃ ⚙️ المعالجة الآن : ${queue.activeWorkers}/${queue.maxConcurrentWorkers}*
*┃ 💻 النظام : ${platform}*
*┃ ⚙️ الإصدار : ${nodeVersion}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*

*╭━━〔 👑 𝐒𝐓𝐀𝐓𝐔𝐒 〕━━╮*
*┃ ${ping < 500 && queue.pendingMessages < 20 ? "✅ الأداء مستقر" : "⚠️ يوجد ضغط أو تأخير" }*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*

*┇ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 𝟐𝟎𝟐𝟔 👑*`;

        // تعديل الرسالة لضمان سرعة العرض
        return await sock.sendMessage(data.jid, {
            text: text,
            edit: sentMsg.key
        });
    }
};
