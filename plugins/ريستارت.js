import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isEliteMember } from "../utils/eliteAccess.js";
import { arthurEliteBox } from "../utils/arthurStyle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    command: "ريستارت",
    category: "النخبة",
    eliteOnly: true,
    description: "إعادة تشغيل البوت (خاص بالنخبة فقط)",

    execute: async (sock, msg, data) => {
        const jid = data?.jid || msg.key.remoteJid;

        const dataPath = path.join(__dirname, "../data");
        if (!isEliteMember(msg, data)) {
            return await sock.sendMessage(jid, {
                text: arthurEliteBox(
                    "❌ هذا الأمر مخصص لأعضاء النخبة فقط\n" +
                    "لست مسجلاً في قائمة النخبة لإعادة التشغيل"
                ),
                quoted: msg
            });
        }

        // ==========================
        // حفظ مكان الرسالة وقت الريستارت
        // ==========================
        const restartFile = path.join(dataPath, "restart.json");
        try {
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }
            fs.writeFileSync(
                restartFile,
                JSON.stringify({
                    jid: jid,
                    time: Date.now()
                })
            );
        } catch (e) {}

        await sock.sendMessage(jid, {
            text: arthurEliteBox(
                "♻️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐑𝐄𝐁𝐎𝐎𝐓 🛡️\n" +
                "⚡ جاري إعادة تشغيل البوت الآن\n" +
                "🔄 يرجى الانتظار ثوانٍ معدودة"
            ),
            quoted: msg
        });

        // ==========================
        // إعادة التشغيل على Render
        // ==========================
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
};
