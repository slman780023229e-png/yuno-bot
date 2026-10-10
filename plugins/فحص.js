import process from "process";

export default {
    command: "فحص",
    category: "النظام",
    description: "فحص سرعة النظام وأداء البوت",

    execute: async (sock, msg, data) => {
        // قياس لحظة البدء بدقة النانو ثانية
        const start = process.hrtime();
        
        // إرسال رسالة "جاري الفحص"
        const sentMsg = await sock.sendMessage(data.jid, { text: "⚡" }, { quoted: msg });

        // قياس لحظة الوصول بدقة النانو ثانية
        const diff = process.hrtime(start);
        const ping = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

        // حساب وقت التشغيل
        const uptime = process.uptime().toFixed(0);
        
        // حساب استهلاك الذاكرة
        const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        const text = 
`*╭━〔⚡𝐀𝐑𝐓𝐇𝐔𝐑 𝐒𝐘𝐒𝐓𝐄𝐌〕━╮*
*┃*
*┃ 🚀 السرعة : ${ping}ms*
*┃ ⏱ التشغيل : ${uptime} ثانية*
*┃ 💾 الذاكرة : ${memory} MB*
*┃*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        // تعديل الرسالة فوراً (Edit) للسرعة
        return await sock.sendMessage(data.jid, {
            text: text,
            edit: sentMsg.key
        });
    }
};
