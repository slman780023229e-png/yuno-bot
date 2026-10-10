import fs from "fs";
import path from "path";

// دالة جلب أعضاء النخبة
function getElite(){
    const dataPath = path.join(process.cwd(), "data");
    let elite = [];
    const files = ["النخبة.json", "النخبه.json", "النخبة", "النخبه"];

    for(const file of files){
        const filePath = path.join(dataPath, file);
        if(fs.existsSync(filePath)){
            try{
                elite = JSON.parse(fs.readFileSync(filePath, "utf8"));
                break;
            }catch(err){}
        }
    }
    return elite.map(x => String(x).replace(/\D/g, ""));
}

// دالة فحص المشرفين
async function isUserAdmin(sock, chatId, senderNumber) {
    if (!chatId.endsWith("@g.us")) return false;
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];
        const participant = participants.find(p => p.id.replace(/\D/g, "") === senderNumber);
        return participant && (participant.admin === "admin" || participant.admin === "superadmin");
    } catch (e) {
        return false;
    }
}

export default {

    command: "شات",

    aliases: ["قفل", "فتح"], // ليعمل أيضاً لو كتب المستخدم .قفل أو .فتح مباشرة

    category: "الإدارة",

    description: "فتح أو قفل الشات بشكل دائم أو مؤقت بالدقائق",

    execute: async (sock, msg, data) => {

        const jid = data.jid;

        // التأكد أن الأمر داخل مجموعة حصراً
        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(
                jid,
                { text: "❌ *هذا الأمر مخصص للمجموعات فقط*" }
            );
        }

        try {
            const sender =
            msg.key.participant ||
            msg.participant ||
            msg.key.remoteJid ||
            data.sender;

            const senderNumber = sender.split("@")[0].replace(/\D/g, "");
            const eliteUsers = getElite();
            const isAdmin = await isUserAdmin(sock, jid, senderNumber);
            const isElite = eliteUsers.includes(senderNumber);

            // التحقق من الصلاحية (مشرف أو نخبة)
            if(!isElite && !isAdmin){
                return sock.sendMessage(
                    jid,
                    { text: "❌ *عذراً، هذا الأمر للمشرفين وأعضاء النخبة فقط*" }
                );
            }

            const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            data.text ||
            "";

            const args = text.trim().split(/\s+/);
            const cmdUsed = args[0]?.toLowerCase().replace(".", ""); // شات، قفل، فتح
            let action = args[1]?.toLowerCase();
            let timeArg = args[2];

            // التعامل لو كتب المستخدم .قفل أو .فتح مباشرة
            if (cmdUsed === "قفل") {
                action = "قفل";
                timeArg = args[1]; // قد تكون مدة زمنية مثل .قفل 5
            } else if (cmdUsed === "فتح") {
                action = "فتح";
                timeArg = args[1]; // قد تكون مدة زمنية مثل .فتح 1
            }

            const head =
`╭━━〔🛡️𝐀𝐑𝐓𝐇𝐔𝐑〕━━╮`;

            // 🔒 حالة القفل
            if (action === "قفل" || action === "close") {
                const minutes = parseInt(timeArg);

                if (!isNaN(minutes) && minutes > 0) {
                    // قفل مؤقت بالدقائق
                    await sock.groupSettingUpdate(jid, "announcement");
                    
                    await sock.sendMessage(jid, {
                        text:
`${head}
🔒 *تم قفل الشات مؤقتاً*
⏳ المدة : ${minutes} دقيقة
╰━━━━━━━━━━━━━━╯`
                    });

                    setTimeout(async () => {
                        try {
                            await sock.groupSettingUpdate(jid, "not_announcement");
                            await sock.sendMessage(jid, {
                                text: `${head}\n🔓 *انتهى الوقت، تم فتح الشات تلقائياً*\n╰━━━━━━━━━━━━━━╯`
                            });
                        } catch (err) {
                            console.log("Error opening chat after timer:", err);
                        }
                    }, minutes * 60 * 1000);

                    return;
                }

                // قفل دائم
                await sock.groupSettingUpdate(jid, "announcement");
                return sock.sendMessage(jid, {
                    text:
`${head}
🔒 *تم إغلاق المجموعة بنجاح*
💬 *المشرفون فقط يمكنهم الإرسال الآن*
╰━━━━━━━━━━━━━━╯`
                });
            }

            // 🔓 حالة الفتح
            if (action === "فتح" || action === "open") {
                const minutes = parseInt(timeArg);

                if (!isNaN(minutes) && minutes > 0) {
                    // فتح مؤقت بالدقائق
                    await sock.groupSettingUpdate(jid, "not_announcement");
                    
                    await sock.sendMessage(jid, {
                        text:
`${head}
🔓 *تم فتح الشات مؤقتاً*
⏳ المدة : ${minutes} دقيقة
╰━━━━━━━━━━━━━━╯`
                    });

                    setTimeout(async () => {
                        try {
                            await sock.groupSettingUpdate(jid, "announcement");
                            await sock.sendMessage(jid, {
                                text: `${head}\n🔒 *انتهى الوقت، تم إغلاق الشات تلقائياً*\n╰━━━━━━━━━━━━━━╯`
                            });
                        } catch (err) {
                            console.log("Error closing chat after timer:", err);
                        }
                    }, minutes * 60 * 1000);

                    return;
                }

                // فتح دائم
                await sock.groupSettingUpdate(jid, "not_announcement");
                return sock.sendMessage(jid, {
                    text:
`${head}
🔓 *تم فتح المجموعة بنجاح*
💬 *الكل يمكنه الإرسال الآن*
╰━━━━━━━━━━━━━━╯`
                });
            }

            // رسالة التوجيه لو كتب الأمر خطأ
            return sock.sendMessage(
                jid,
                {
                    text:
`⚠️ *طريقة الاستخدام الصحيحة:*

🔹 للإغلاق:
• .شات قفل
• .شات قفل 5 (لمدة 5 دقائق)
🔹 للفتح:
• .شات فتح
• .شات فتح 1 (لمدة دقيقة واحدة)`
                },
                { quoted: msg }
            );

        } catch (error) {
            console.log("Error in .شات command:", error);
            await sock.sendMessage(
                jid,
                { text: `❌ *حدث خطأ أثناء تنفيذ الأمر:* ${error.message}` }
            );
        }

    }

};
