import fs from "fs";
import { arthurHead, arthurEliteBox } from "../utils/arthurStyle.js";
import path from "path";

// مسارات الملفات الأساسية
const dataFolder = path.join(process.cwd(), "data");
const modeFile = path.join(dataFolder, "مود.json");
const eliteFile = path.join(dataFolder, "النخبة.json");

// دالة قراءة النخبة بدقة تامة
function getEliteList() {
    try {
        if (!fs.existsSync(eliteFile)) {
            fs.writeFileSync(eliteFile, JSON.stringify([], null, 2));
            return [];
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

// دالة فحص النخبة الفائقة
function isUserElite(senderNumber, sockBotNumber) {
    const cleanSender = String(senderNumber || "").replace(/\D/g, "");
    const cleanBot = String(sockBotNumber || "").replace(/\D/g, "");

    if (cleanBot && cleanSender === cleanBot) return true;

    const eliteList = getEliteList();
    return eliteList.some(el => {
        const cleanEl = String(el).replace(/\D/g, "");
        return cleanSender === cleanEl || cleanSender.endsWith(cleanEl) || cleanEl.endsWith(cleanSender);
    });
}

// دالة قراءة الحالة الحالية بأمان
function getCurrentMode() {
    try {
        if (!fs.existsSync(modeFile)) {
            if (!fs.existsSync(dataFolder)) {
                fs.mkdirSync(dataFolder, { recursive: true });
            }
            fs.writeFileSync(modeFile, JSON.stringify({ elite: false }, null, 2));
            return false;
        }
        const data = JSON.parse(fs.readFileSync(modeFile, "utf-8"));
        return !!data.elite;
    } catch {
        return false;
    }
}

export default {
    command: "مود",
    category: "النخبة",
    description: "التحكم المطلق في نظام النخبة العام أو عرض حالته الحالية مع قفل صامت 👑",
    aliases: ["elite-mode"],
    eliteOnly: true,

    execute: async (sock, msg, data) => {
        const jid = data.jid;

        // رأس الزخرفة الأسطوري الملكي الفخم
        const head = arthurHead("⚔️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐄𝐋𝐈𝐓𝐄 𝐌𝐎𝐃𝐄");

        // استخراج وتنظيف رقم البوت والمرسل بدقة تامة
        const botJid = sock.user?.id || "";
        const currentBotNumber = botJid.split(":")[0].replace(/\D/g, "");
        const senderNumber = (data.sender || msg.key.participant || msg.key.remoteJid || "").split("@")[0].replace(/\D/g, "");

        // التحقق القاطع والنهائي من النخبة أو البوت
        const authorized = isUserElite(senderNumber, currentBotNumber) || data.isElite;

        if (!authorized) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 🛡️ تنبيه الصلاحية*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ⚡ عذراً يا سيدي، هذا الأمر*
*┃ مخصص حصراً لأعضاء النخبة*
*┃ والبوت فقط لا غير.*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        const args = (data.text || "").trim().split(/\s+/).slice(1);
        const mode = args[0]?.toLowerCase();

        // قراءة الحالة الحالية مباشرة
        const currentStatus = getCurrentMode();

        // إذا كتب المستخدم ".مود" فقط بدون تحديد on أو off، يتم عرض الحالة الحالية
        if (!mode) {
            const statusText = currentStatus ? "🛡️ مفعل (حصري للنخبة)" : "🌐 معطل (متاح للعامة)";
            const stateWord = currentStatus ? "SECURE [⚡]" : "OPEN [🔓]";

            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ 👑 حالة نظام النخبة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📊 الحالة الحالية:*
*┃ ┠ ${statusText}*
*┃*
*┃ ⚡ بروتوكول التشغيل:*
*┃ ┠ ${stateWord}*
*┃*
*┃ 📌 أوامر التحكم السريع:*
*┃ ┠ .مود on (للتفعيل)*
*┃ ┗ .مود off (للتعطيل)*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        if (mode !== "on" && mode !== "off") {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ⚙️ خطأ في المعاملات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📌 الصيغة الصحيحة للاستخدام:*
*┃ ┠ .مود on  ➔ للتفعيل*
*┃ ┗ .مود off ➔ للتعطيل*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        const isOn = mode === "on";

        // التحقق الذكي: هل الحالة المطلوبة مطابقة للحالة الحالية بالفعل؟
        if (currentStatus === isOn) {
            const alreadyMsg = isOn ? "🛡️ نظام النخبة مفعل بالفعل!" : "🌐 نظام النخبة معطل بالفعل!";
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ⚠️ تنبيه الحالة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❖ عذراً يا سيدي:*
*┃ ┠ ${alreadyMsg}*
*┃ ┗ لا يوجد تغيير جديد لتنفيذه.*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        if (!fs.existsSync(dataFolder)) {
            fs.mkdirSync(dataFolder, { recursive: true });
        }

        // كتابة الحالة الجديدة في الملف
        fs.writeFileSync(
            modeFile,
            JSON.stringify(
                {
                    elite: isOn,
                    silent: isOn,
                    updatedAt: new Date().toISOString(),
                    updatedBy: senderNumber
                },
                null,
                2
            )
        );

        const statusMsg = isOn ? "⚔️ تم تأمين النظام وتفعيل النخبة" : "🌐 تم إلغاء التقييد وفتح الأوامر";
        const stateWord = isOn ? "SECURE [⚡]" : "OPEN [🌐]";

        await sock.sendMessage(
            jid,
            {
                text:
`${head}
*┃ 👑 تحديث البروتوكول*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❖ النتيجة:*
*┃ ┠ ${statusMsg}*
*┃*
*┃ ❖ الحالة الجديدة:*
*┃ ┠ ${stateWord}*
*┃ ┗ بواسطة : @${senderNumber}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                mentions: [data.sender || msg.key.participant || msg.key.remoteJid]
            },
            { quoted: msg }
        );

        // تسجيل الحدث في الكونسول بزخرفة دموية فخمة
        console.log(
`\x1b[38;5;220m
╔══════════════════════════════════════════════════╗
║ ⚔️ [ ARTHUR ELITE PROTOCOL UPDATED ] ⚔️
╠──────────────────────────────────────────────────╣
║ ⚡ الحالة الجديدة : ${mode.toUpperCase()}
║ 👤 بواسطة الرقم : ${senderNumber}
║ 🕒 الوقت       : ${new Date().toLocaleTimeString("ar-SA")}
╚══════════════════════════════════════════════════╝
\x1b[0m`
        );
    }
};
