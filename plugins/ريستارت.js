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
        const jid = data?.jid || msg?.key?.remoteJid;
        if (!jid) return;

        if (!isEliteMember(msg, data)) {
            return await sock.sendMessage(jid, {
                text: arthurEliteBox(
                    "❌ هذا الأمر مخصص لأعضاء النخبة فقط\n" +
                    "لست مسجلاً في قائمة النخبة لإعادة التشغيل"
                ),
                quoted: msg
            });
        }

        const dataPath = path.join(__dirname, "../data");
        const restartFile = path.join(dataPath, "restart.json");

        // ==========================
        // حفظ مكان الرسالة وقت الريستارت
        // ==========================
        try {
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }

            fs.writeFileSync(
                restartFile,
                JSON.stringify(
                    {
                        jid,
                        quotedKey: msg?.key || null,
                        time: Date.now()
                    },
                    null,
                    2
                ),
                "utf8"
            );
        } catch (err) {
            console.error("خطأ أثناء حفظ ملف restart.json:", err);
        }

        await sock.sendMessage(jid, {
            text: arthurEliteBox(
                "♻️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐑𝐄𝐁𝐎𝐎𝐓 🛡️\n" +
                "⚡ جاري إعادة تشغيل البوت الآن\n" +
                "🔄 يرجى الانتظار ثوانٍ معدودة"
            ),
            quoted: msg
        });

        // ==========================
        // إعادة التشغيل
        // ==========================
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
};