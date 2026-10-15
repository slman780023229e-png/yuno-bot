import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../data");

// دالة جلب أعضاء النخبة
function getElite() {
    let elite = [];
    const files = ["النخبة.json", "النخبه.json", "النخبة", "النخبه"];

    for (const eliteFileName of files) {
        const filePath = path.join(dataDir, eliteFileName);
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = fs.readFileSync(filePath, "utf8");
                const parsed = JSON.parse(fileContent);
                if (Array.isArray(parsed)) {
                    elite = parsed;
                    break;
                } else if (typeof parsed === "object" && parsed !== null) {
                    elite = Object.values(parsed).flat();
                    break;
                }
            } catch (err) {}
        }
    }
    return elite.map(x => String(x).replace(/\D/g, ""));
}

const cleanJid = (jid) => {
    if (!jid) return "";
    return jid.replace(/:[0-9]+@/, "@");
};

export default {
    alwaysOn: false,
    command: "تنضيف_الجلسة",
    category: "الحماية",
    description: "تنظيف مجلد ملف_الاتصال من الملفات التالفة والتكرارات",

    execute: async (sock, msg, data) => {
        const jid = data.jid || msg.key.remoteJid;

        const sender = data.sender || msg.key.participant || msg.participant || msg.key.remoteJid;
        const senderNumber = String(sender).split("@")[0].replace(/\D/g, "");
        const botNumber = cleanJid(sock.user?.id).split("@")[0].replace(/\D/g, "");

        try {
            const eliteUsers = getElite();
            const isElite = eliteUsers.includes(senderNumber) || senderNumber === botNumber;
            const isOwner = msg.key.fromMe || isElite;

            if (!isOwner) {
                return sock.sendMessage(jid, {
                    text: `*╭━━〔 ❌ خطأ 〕━━╮*\n*┤ هذا الأمر لصاحب البوت والنخبة فقط*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                });
            }

            // مسار مجلد ملف_الاتصال بناءً على طلبك
            const sessionDir = path.join(__dirname, "../ملف_الاتصال");

            if (!fs.existsSync(sessionDir)) {
                return sock.sendMessage(jid, {
                    text: `*╭━━〔 ⚠️ تنبيه 〕━━╮*\n*┤ مجلد (ملف_الاتصال) غير موجود*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                });
            }

            await sock.sendMessage(jid, {
                text: `*╭━━〔 🔄 جاري التنظيف 〕━━╮*\n*┤ يتم فحص مجلد ملف_الاتصال وإزالة الملفات التالفة...*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            });

            const files = fs.readdirSync(sessionDir);
            let deletedCount = 0;
            let checkedCount = 0;

            for (const file of files) {
                // الحفاظ على ملف الاتصال الأساسي لتجنب تسجيل خروج البوت
                if (file === "creds.json") continue;

                const filePath = path.join(sessionDir, file);
                
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        checkedCount++;
                        const content = fs.readFileSync(filePath, "utf-8");

                        // حذف الملفات الفارغة أو التالفة
                        if (content.trim() === "" || content.trim() === "{}") {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                            continue;
                        }

                        // فحص سلامة ملفات الـ JSON والتكرارات التالفة
                        if (file.endsWith(".json")) {
                            try {
                                JSON.parse(content);
                            } catch (err) {
                                fs.unlinkSync(filePath);
                                deletedCount++;
                            }
                        }
                    }
                } catch (err) {}
            }

            const successText = `*╔═══════════╗*\n  *✨ 🧹 تم تنظيف الجلسة ✨*\n*╚═══════════╝*\n\n*📁 الملفات المفحوصة:* ${checkedCount}\n*🗑️ الملفات التالفة المحذوفة:* ${deletedCount}\n*🔒 تم الحفاظ على creds.json بأمان*\n\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            await sock.sendMessage(jid, { text: successText });

            console.log(
`╭━━━━━━━━━━━━━━━━━━━━━━╮
┃ 🧹 𝐘𝐔𝐍𝐎 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ ⚙️ تم تنظيف مجلد ملف_الاتصال
┃ 🗑️ الملفات المحذوفة : ${deletedCount}
┃ ⚡ الحالة : مستقر
╰━━━━━━━━━━━━━━━━━━━━━━╯`
            );

        } catch (e) {
            console.log("خطأ في تنظيف الجلسة:", e.message);
            await sock.sendMessage(jid, {
                text: `*╭━━〔 ❌ خطأ 〕━━╮*\n*┤ حدث خطأ أثناء تنظيف الجلسة*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            });
        }
    }
};