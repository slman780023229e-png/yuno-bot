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

// دالة فحص ما إذا كان الشخص مشرفاً في المجموعة
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

    command: "طرد",

    category: "الإدارة",

    description: "طرد عضو بالمنشن أو الرد مع حماية النخبة وتحديد السبب",

    execute: async (sock, msg, data) => {

        const jid = data.jid;

        // التأكد أن الأمر يتم تنفيذه داخل مجموعة حصراً
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

            // التحقق من الصلاحية (مشرف أو نخبة لتنفيذ الأمر)
            if(!isElite && !isAdmin){
                return sock.sendMessage(
                    jid,
                    { text: "❌ *عذراً، هذا الأمر للمشرفين وأعضاء النخبة فقط*" }
                );
            }

            // استخراج السبب المكتوب بعد الأمر (إن وجد)
            const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            data.text ||
            "";

            const args = text.trim().split(/\s+/).slice(1);
            const customReason = args.length > 0 ? args.join(" ") : "إجراء إداري";

            // جلب العضو المستهدف إما عن طريق المنشن أو الرد على رسالته
            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            let targetJid = "";

            if (quoted?.mentionedJid?.length > 0) {
                targetJid = quoted.mentionedJid[0];
            } else if (quoted?.participant) {
                targetJid = quoted.participant;
            }

            if (!targetJid) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
`⚠️ *طريقة الاستخدام الصحيحة:*

↩️ رد على رسالة الشخص أو قم بمنشنه واكتب:
*.طرد [السبب]*
مثال:
*.طرد سبام*`
                    },
                    { quoted: msg }
                );
            }

            const targetNumber = targetJid.split("@")[0].replace(/\D/g, "");

            // 🛡️ حماية النخبة: التحقق مما إذا كان العضو المستهدف من النخبة
            if (eliteUsers.includes(targetNumber)) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
`╭━━━〔 🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑 〕━━━╮

❌ *فشل الطرد*
👑 لا يمكنك طرد هذا الشخص لأنه من **أعضاء النخبة** المحميين!

╰━━━━━━━━━━━━━━╯`,
                        mentions: [targetJid]
                    },
                    { quoted: msg }
                );
            }

            // تنفيذ الطرد الرسمي فوراً
            await sock.groupParticipantsUpdate(
                jid,
                [targetJid],
                "remove"
            );

            // رسالة تأكيد الطرد الأسطورية مع السبب المخصص أو الافتراضي
            await sock.sendMessage(
                jid,
                {
                    text:
`╭━━〔🛡️𝐀𝐑𝐓𝐇𝐔𝐑〕━━╮

🚫 *تم طرد العضو بنجاح*

👤 العضو:
@${targetNumber}

⚡ السبب:
*${customReason}*

╰━━━━━━━━━━━━━━╯`,
                    mentions: [targetJid]
                }
            );

        } catch (error) {
            console.log("Error in .طرد command:", error);
            await sock.sendMessage(
                jid,
                { text: `❌ *عذراً، لم أستطع طرد العضو. تأكد أن البوت مشرف ولديه صلاحيات كاملة!*\n\nخطأ: ${error.message}` }
            );
        }

    }

};
