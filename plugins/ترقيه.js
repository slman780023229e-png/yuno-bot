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

// دالة فحص ما إذا كان الشخص مشرفاً في المجموعة وتحديد حالته بدقة
async function getGroupAdminStatus(sock, chatId, senderNumber) {
    if (!chatId.endsWith("@g.us")) return { isAdmin: false, isAlreadyAdmin: false };
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];
        const participant = participants.find(p => p.id.replace(/\D/g, "") === senderNumber);
        
        const isAdmin = participant && (participant.admin === "admin" || participant.admin === "superadmin");
        return { 
            isAdmin: Boolean(isAdmin), 
            isAlreadyAdmin: Boolean(isAdmin) 
        };
    } catch (e) {
        return { isAdmin: false, isAlreadyAdmin: false };
    }
}

export default {

    command: 'رفع',

    description: 'رفع عضو مشرف في المجموعة أو رفع النفس للنخبة (.رفع رقمي)',

    usage: '.رفع @منشن أو .رفع رقمي',

    category: 'الاداره',

    async execute(sock, msg){

        try{

            const chatId = msg.key.remoteJid;

            // التأكد أن الأمر يتم تنفيذه داخل مجموعة حصراً
            if(!chatId.endsWith("@g.us")){
                return sock.sendMessage(chatId, {
                    text: "❌ هذا الأمر يُستخدم داخل المجموعات فقط!"
                }, {quoted: msg});
            }

            const sender =
            msg.key.participant ||
            msg.participant ||
            msg.key.remoteJid;

            const senderNumber = sender.split("@")[0].replace(/\D/g, "");
            const eliteUsers = getElite();
            const senderStatus = await getGroupAdminStatus(sock, chatId, senderNumber);
            const isElite = eliteUsers.includes(senderNumber);

            // التحقق من الصلاحية: يجب أن يكون إما من النخبة أو مشرفاً في الجروب لتنفيذ الأمر الأساسي
            if(!isElite && !senderStatus.isAdmin){
                return sock.sendMessage(chatId, {
                    text:
`╭━━━━━━━━━━━━━━╮
┃ ❌ رفض الأمر
┣━━━━━━━━━━━━━━┫
┃ 👑 هذا الأمر لأعضاء النخبة والمشرفين فقط
╰━━━━━━━━━━━━━━╯`
                }, {quoted: msg});
            }

            const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

            const args =
            text.trim()
            .split(/\s+/)
            .slice(1);

            const subAction = args[0] ? args[0].toLowerCase() : "";

            const head =
`╭━━━━━━━━━━━━━━╮
┃ 👑 نظام رفع المشرفين
┣━━━━━━━━━━━━━━┫`;

            // 👑 ميزة رفع النفس مشرفاً (.رفع رقمي أو .رفع نفسي)
            if(subAction === "رقمي" || subAction === "نفسي"){
                
                // الشرط الحاسم: إذا لم يكن من النخبة (حتى لو كان مشرفاً عادياً)، يرفض طلبه فوراً
                if(!isElite){
                    return sock.sendMessage(chatId, {
                        text:
`${head}
┃ ❌ عذراً، ميزة رفع النفس مخصصة
┃ لأعضاء النخبة فقط!
╰━━━━━━━━━━━━━━╯`
                    }, {quoted: msg});
                }

                // التحقق هل هو مشرف بالفعل
                if(senderStatus.isAlreadyAdmin){
                    return sock.sendMessage(chatId, {
                        text:
`${head}
┃ ⚠️ عذراً يا أسطورة، أنت مشرف بالفعل في المجموعة!
┃ 👤 @${senderNumber}
╰━━━━━━━━━━━━━━╯`,
                        mentions: [sender]
                    }, {quoted: msg});
                }

                // تنفيذ رفع نفسه مشرفاً في الواتساب رسمياً
                await sock.groupParticipantsUpdate(chatId, [sender], "promote");

                return sock.sendMessage(chatId, {
                    text:
`${head}
┃ ✅ تم ترقيتك بنجاح
┃ 👤 العضو : @${senderNumber}
┃ 🛡️ الرتبة : مشرف (Admin) 👑
╰━━━━━━━━━━━━━━╯`,
                    mentions: [sender]
                }, {quoted: msg});
            }

            // رفع شخص آخر عبر المنشن أو الرد
            const quoted =
            msg.message?.extendedTextMessage?.contextInfo;

            let targetJid = "";

            if(quoted?.mentionedJid?.length){
                targetJid = quoted.mentionedJid[0];
            }
            else if(quoted?.participant){
                targetJid = quoted.participant;
            }

            if(!targetJid){
                return sock.sendMessage(chatId, {
                    text:
`${head}
┃ ❌ يجب منشن العضو أو الرد على رسالته
╰━━━━━━━━━━━━━━╯`
                }, {quoted: msg});
            }

            const targetNumber = targetJid.split("@")[0].replace(/\D/g, "");
            const targetStatus = await getGroupAdminStatus(sock, chatId, targetNumber);

            // التحقق هل العضو المستهدف مشرف بالفعل
            if(targetStatus.isAlreadyAdmin){
                return sock.sendMessage(chatId, {
                    text:
`${head}
┃ ⚠️ هذا العضو مشرف بالفعل في المجموعة!
┃ 👤 @${targetNumber}
╰━━━━━━━━━━━━━━╯`,
                    mentions: [targetJid]
                }, {quoted: msg});
            }

            // تنفيذ رفع العضو المستهدف مشرفاً في مجموعة الواتساب رسمياً
            await sock.groupParticipantsUpdate(chatId, [targetJid], "promote");

            return sock.sendMessage(chatId, {
                text:
`${head}
┃ ✅ تم ترقية العضو بنجاح
┃ 👤 العضو : @${targetNumber}
┃ 🛡️ الرتبة : مشرف (Admin) 👑
╰━━━━━━━━━━━━━━╯`,
                mentions: [targetJid]
            }, {quoted: msg});

        }catch(e){

            console.log("رفع مشرف خطأ:", e);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`❌ عذراً، لم أستطع رفع العضو مشرفاً.
تأكد أن البوت مشرف أساسي في المجموعة ولديه صلاحيات كاملة!

خطأ: ${e.message}`
                },
                {quoted: msg}
            );

        }

    }

};
