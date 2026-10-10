import fs from "fs";
import path from "path";

// مسار ملف النخبة للتحقق من الصلاحيات
const eliteFile = path.join(
    process.cwd(),
    "data/النخبة.json"
);

function getElite(){
    if(!fs.existsSync(eliteFile)){
        fs.writeFileSync(
            eliteFile,
            JSON.stringify([], null, 2)
        );
    }
    return JSON.parse(
        fs.readFileSync(
            eliteFile,
            "utf-8"
        )
    );
}

export default {

    command: "ت",

    category: "المطور",
    ownerOnly: true,

    description: "إدارة وتنفيذ الأوامر في المجموعات (خاص بأعضاء النخبة) 👑",

    execute: async(sock, msg, data) => {

        const jid = data.jid;
        const isGroup = jid.endsWith("@g.us");

        const head =
`*╭━━━〔 👑 إدارة المجموعات 〕━━━╮*
*┃ 👑 نظام تحكم المجموعات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        // التحقق من صلاحية أعضاء النخبة فقط
        const eliteUsers = getElite();
        const senderNumber = (data.sender || msg.key.participant || msg.key.remoteJid).split("@")[0];

        if(!eliteUsers.includes(senderNumber)){
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ❌ ليس لديك صلاحية*
*┃ 👑 الأمر خاص بأعضاء النخبه فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }
            );
        }

        const input = data.text.trim();
        const args = input.replace(/^ت/, "ت ").trim().split(/\s+/);
        const action = args[1];

        // جلب جميع المجموعات المتصل بها البوت
        let participatingGroups = {};
        try {
            participatingGroups = await sock.groupFetchAllParticipating();
        } catch {}
        const allGroups = Object.values(participatingGroups);

        // =================
        // عرض المجموعات (لو كتب .ت فقط أو .ت عرض)
        // =================
        if (!action || action === "عرض") {

            if(allGroups.length === 0){
                return sock.sendMessage(
                    jid,
                    {
                        text:
`${head}

*┃ 📭 لا توجد مجموعات حالياً*
*┃ 👥 العدد : 0*`
                    }
                );
            }

            let list = allGroups.map((g, i) => 
                `*┃ ${i+1} 👥 ${g.subject}*`
            ).join("\n");

            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ 📜 قائمة المجموعات النشطة*
*┣━━━━━━━━━━━━━━━━━━┃*
${list}
*┣━━━━━━━━━━━━━━━━━━┃*
*┃ 👥 العدد الكلي : ${allGroups.length}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }
            );

        }

        // =================
        // معالجة الأوامر مثل: ت 1.فحص أو ت 1.ق أو ت 1 فحص
        // =================
        let targetIndex;
        let targetCommand = "";

        // فحص إذا كان الـ action يحتوي على رقم متصل بنقطة وأمر (مثل: 1.فحص أو 1.ق)
        const matchDot = action.match(/^(\d+)(\..+)$/);
        // أو رقم متصل مباشرة بحرف/أمر بدون نقطة (مثل: 1فحص)
        const matchDirect = action.match(/^(\d+)(.+)$/);

        if (matchDot) {
            targetIndex = parseInt(matchDot[1]) - 1;
            const attachedCmd = matchDot[2]; // يبدأ بالنقطة مثل .فحص
            const remainingArgs = args.slice(2).join(" ");
            targetCommand = remainingArgs ? `${attachedCmd} ${remainingArgs}` : attachedCmd;
        } else if (matchDirect) {
            targetIndex = parseInt(matchDirect[1]) - 1;
            const attachedCmd = "." + matchDirect[2]; // إضافة نقطة تلقائياً إذا نسيتها مثل 1فحص -> .فحص
            const remainingArgs = args.slice(2).join(" ");
            targetCommand = remainingArgs ? `${attachedCmd} ${remainingArgs}` : attachedCmd;
        } else {
            // الطريقة العادية بوجود مسافة (مثل: ت 1 .فحص)
            targetIndex = parseInt(action) - 1;
            targetCommand = args.slice(2).join(" ").trim();
            if (targetCommand && !targetCommand.startsWith(".")) {
                targetCommand = "." + targetCommand;
            }
        }

        if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= allGroups.length) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ❌ رقم المجموعة غير صحيح*
*┃ 📌 استخدم .ت عرض لرؤية الأرقام*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }
            );
        }

        if (!targetCommand) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ❌ يجب كتابة الأمر المطلوب*
*┃ 📌 مثال: ت 1.فحص أو ت 1.ق*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }
            );
        }

        const selectedGroup = allGroups[targetIndex];
        const groupJid = selectedGroup.id;
        const sender = data.sender || msg.key.participant || msg.key.remoteJid;

        try {
            // إرسال تفاعل نجاح بالعملية في مكان كتابة الأمر
            await sock.sendMessage(jid, {
                react: { text: "✅", key: msg.key }
            });

            // إرسال الأمر مباشرة للمجموعة المستهدفة لتنفيذه هناك
            await sock.sendMessage(groupJid, {
                text: targetCommand
            });

            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ✅ تم تنفيذ الأمر بنجاح*
*┃*
*┃ 👥 المجموعة : ${selectedGroup.subject}*
*┃ ⚡ الأمر : ${targetCommand}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [sender]
                }
            );

        } catch (err) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ❌ حدث خطأ أثناء التنفيذ*
*┃ ⚠️ ${err.message || "خطأ غير معروف"}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }
            );
        }

    }

};
