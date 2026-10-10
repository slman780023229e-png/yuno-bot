import fs from "fs";
import path from "path";

// مسار ملف النخبة للتحقق من الصلاحيات
const eliteFile = path.join(process.cwd(), "data", "النخبة.json");

function getElite() {
    try {
        if (!fs.existsSync(eliteFile)) {
            fs.writeFileSync(eliteFile, JSON.stringify([], null, 2));
        }
        const data = JSON.parse(fs.readFileSync(eliteFile, "utf-8"));
        if (Array.isArray(data)) {
            return data.map(n => String(n).replace(/\D/g, ""));
        }
        return [];
    } catch {
        return [];
    }
}

const cleanJid = (jid) => {
    if (!jid) return "";
    return jid.replace(/:[0-9]+@/, "@");
};

export default {
    command: "خفض",
    category: "المجموعات",
    description: "خفض مشرف إلى عضو أو خفض رقمك الشخصي (خاص بأعضاء النخبة والمشرفين) 👑",

    execute: async(sock, msg, data) => {
        const jid = data.jid || msg.key.remoteJid;

        const head =
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ❌ خطأ*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ الأمر للمجموعات فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        // استخراج وتنظيف رقم المرسل والبوت بدقة عالية جداً
        const senderJid = cleanJid(data.sender || msg.key.participant || msg.participant || msg.key.remoteJid);
        const sender = senderJid.split("@")[0].replace(/\D/g, "");
        
        const botJid = cleanJid(sock.user?.id || "");
        const currentBotNumber = botJid.split("@")[0].replace(/\D/g, "");

        // جلب معلومات المجموعة المحدثة
        const metadata = await sock.groupMetadata(jid);
        const participants = metadata.participants;

        const text = data.text || msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const args = text.trim().split(/\s+/);
        const subAction = args[1]; // التأكد مما إذا كتب "رقمي"

        // فحص صلاحيات النخبة والمشرفين بدقة تامة
        const eliteUsers = getElite();
        const senderParticipant = participants.find(p => cleanJid(p.id).split("@")[0].replace(/\D/g, "") === sender);
        const isSenderAdmin = senderParticipant?.admin === "admin" || senderParticipant?.admin === "superadmin";
        
        // الأولوية القصوى للنخبة أو البوت أو المشرف الحقيقي أو كون الرسالة من المالك (fromMe)
        const isUserElite = eliteUsers.includes(sender) || sender === currentBotNumber || data.isElite || msg.key.fromMe;
        const hasPermission = isUserElite || isSenderAdmin;

        // فحص ما إذا كان المستخدم يريد خفض رقمه الشخصي
        if (subAction === "رقمي") {
            if (!hasPermission) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
`${head}
*┃ 🚫 تنبيه الصلاحية*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ هذا الأمر مخصص*
*┃ لأعضاء النخبة والمشرفين فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );
            }

            // منع خفض البوت لنفسه
            if (sender === currentBotNumber) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
`${head}
*┃ 🤖 تنبيه*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 🤖 لا يمكن خفض البوت*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );
            }

            try {
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

                await sock.groupParticipantsUpdate(jid, [senderJid], "demote");

                await sock.sendMessage(
                    jid,
                    {
                        text:
`${head}
*┃ ✅ نجاح العمليات*
*┃ ⬇️ تم خفض رقمك الشخصي*
*┃ إلى عضو عادي بنجاح*
*┃ 👤 العضو : @${sender}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                        mentions: [senderJid]
                    },
                    { quoted: msg }
                );

                await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
                return;

            } catch (err) {
                console.error("Demote Self Error:", err);
                return sock.sendMessage(
                    jid,
                    {
                        text:
`${head}
*┃ ❌ خطأ*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ حدث خطأ أثناء خفض رقمك*
*┃ ⚠️ تأكد أن البوت مشرف*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );
            }
        }

        // الأوامر العادية لخفض عضو آخر بالرد أو المنشن
        if (!hasPermission) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 🚫 تنبيه الصلاحية*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ هذا الأمر للمشرفين*
*┃ فقط في المجموعة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        let target = contextInfo?.participant;

        if (!target && contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
            target = contextInfo.mentionedJid[0];
        }

        if (!target) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 📌 طريقة الاستخدام*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ قم بالرد على رسالة*
*┃ المشرف أو منشنه ثم اكتب:*
*┃ 📝 .خفض*
*┃ أو لخفض رقمك (لالنخبة):*
*┃ 📝 .خفض رقمي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        const targetCleanJid = cleanJid(target);
        const targetNumber = targetCleanJid.split("@")[0].replace(/\D/g, "");
        const targetParticipant = participants.find(p => {
            const pNum = cleanJid(p.id).split("@")[0].replace(/\D/g, "");
            return cleanJid(p.id) === targetCleanJid || pNum === targetNumber;
        });

        // التحقق أن المستهدف مشرف أساساً
        if (!targetParticipant || !targetParticipant.admin) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ⚠️ تنبيه*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ⚠️ العضو ليس مشرفاً*
*┃ 👤 العضو : @${targetNumber}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [targetParticipant?.id || target]
                },
                { quoted: msg }
            );
        }

        // منع خفض مالك المجموعة
        if (metadata.owner === targetParticipant.id || metadata.owner === targetCleanJid) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 👑 تنبيه*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 👑 لا يمكن خفض مالك المجموعة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        // منع خفض البوت
        if (targetNumber === currentBotNumber) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 🤖 تنبيه*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 🤖 لا يمكن خفض البوت*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        // منع خفض أعضاء النخبة (إلا إذا كان المُنَفِّذ هو نفس صاحب الرقم)
        if (eliteUsers.includes(targetNumber) && targetNumber !== sender) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 👑 حماية النخبة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 👑 لا يمكن خفض عضو من النخبة*
*┃ 👤 العضو : @${targetNumber}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [targetCleanJid]
                },
                { quoted: msg }
            );
        }

        try {
            await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

            await sock.groupParticipantsUpdate(jid, [targetCleanJid], "demote");

            await sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ✅ نجاح العمليات*
*┃ ⬇️ تم خفض المشرف*
*┃ إلى عضو عادي بنجاح*
*┃ 👤 العضو : @${targetNumber}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [targetCleanJid]
                },
                { quoted: msg }
            );

            await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

        } catch (err) {
            console.error("Demote Error:", err);
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ❌ خطأ*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ حدث خطأ أثناء خفض العضو*
*┃ ⚠️ تأكد أن البوت مشرف*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }
    }
};
