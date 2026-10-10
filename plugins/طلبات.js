import fs from "fs-extra";
import path from "path";

const eliteFile = path.join(
    process.cwd(),
    "data/النخبة.json"
);

function getElite(){
    if(!fs.existsSync(eliteFile)){
        fs.ensureDirSync(path.dirname(eliteFile));
        fs.writeFileSync(
            eliteFile,
            JSON.stringify([], null, 2)
        );
        return [];
    }
    try {
        const rawData = fs.readFileSync(eliteFile, "utf-8").trim();
        if (!rawData) return [];
        const parsed = JSON.parse(rawData);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

export default {

    command: "طلبات",

    category: "المجموعات",

    description: "قبول طلبات الانضمام المعلقة للمجموعة تلقائياً 📋",

    execute: async(sock, msg, data)=>{

        const jid = data.jid;

        const head =
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 👑 𝐀𝐑𝐓𝐇𝐔R LEYWIN*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📋 قَبُولُ اَلطَّلَبَات*
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

        // التحقق من صلاحية أعضاء النخبة أو المشرفين
        const eliteUsers = getElite();
        const sender = (data.sender || msg.key.participant || msg.key.remoteJid).split("@")[0].replace(/\D/g, "");

        const metadata = await sock.groupMetadata(jid);
        const participants = metadata.participants;
        const senderParticipant = participants.find(p => p.id.replace(/\D/g, "") === sender);
        const isSenderAdmin = senderParticipant?.admin === "admin" || senderParticipant?.admin === "superadmin";
        const isElite = eliteUsers.includes(sender);

        if(!isElite && !isSenderAdmin){
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ❌ تنبيه الصلاحية*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ ليس لديك صلاحية*
*┃ 👑 الأمر خاص بأعضاء النخبة والمشرفين فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        try {
            await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

            // جلب طلبات الانضمام المعلقة للمجموعة مباشرة من واتساب
            const pendingRequests = await sock.groupRequestParticipantsList(jid);

            if (!pendingRequests || pendingRequests.length === 0) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
`${head}
*┃ 📭 قائمة الطلبات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📭 لا توجد طلبات انضمام معلقة*
*┃ 👥 العدد : 0*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );
            }

            // استخراج معرفات الأعضاء الذين طلبوا الانضمام
            const userJids = pendingRequests.map(req => req.jid || req.id);

            // قبول جميع الطلبات المعلقة دفعة واحدة
            await sock.groupRequestParticipantsUpdate(jid, userJids, "approve");

            await sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ✅ نجاح العمليات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ✅ تم قبول جميع طلبات*
*┃ الانضمام المعلقة بنجاح*
*┃ 👥 العدد المقبول : ${userJids.length}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );

            await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

        } catch (err) {
            console.error("Approve Requests Error:", err);
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ❌ خطأ*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❌ حدث خطأ أثناء قبول الطلبات*
*┃ ⚠️ تأكد أن البوت مشرف وأن خاصية الموافقة مفعمة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

    }

};
