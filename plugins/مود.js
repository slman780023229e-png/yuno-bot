import fs from "fs";
import { arthurHead } from "../utils/arthurStyle.js";
import { readEliteNumbers, normalizeNumber } from "../utils/eliteAccess.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسارات الملفات الأساسية
const dataFolder = path.join(__dirname, "../data");
const modeFile = path.join(dataFolder, "مود.json");

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
    description: "التحكم المطلق في نظام النخبة العام أو عرض حالته الحالية 👑",
    aliases: ["elite-mode"],
    eliteOnly: true,

    execute: async (sock, msg, data) => {
        // 1. استخراج رقم المرسل وتنظيفه بدقة قاطعة
        const rawSender = data?.sender || msg.key?.participant || msg.key?.remoteJid || "";
        const senderNumber = normalizeNumber(rawSender);

        // 2. جلب أرقام النخبة المعتمدة مباشرة من الملف
        const eliteNumbers = readEliteNumbers().map(normalizeNumber);

        // 3. استخراج رقم البوت
        const botJid = sock.user?.id || "";
        const botNumber = normalizeNumber(botJid);

        // 4. التحقق القاطع: هل المرسل هو البوت نفسه أو موثق ضمن النخبة؟
        const isElite = (botNumber && senderNumber === botNumber) || eliteNumbers.includes(senderNumber);

        // 🚫 قفل صامت ومطلق: إذا لم يكن عضواً في النخبة، يتجاهل الأمر فوراً ودون أي رد
        if (!isElite) {
            return;
        }

        const jid = data?.jid || msg.key?.remoteJid;
        const head = arthurHead("⚔️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐄𝐋𝐈𝐓𝐄 𝐌𝐎𝐃𝐄");

        const input = data?.text ? data.text.trim() : "";
        const args = input.replace(/^\.مود/, "").trim().split(/\s+/);
        const mode = args[0]?.toLowerCase();

        // قراءة الحالة الحالية
        const currentStatus = getCurrentMode();

        // عند كتابة ".مود" فقط دون تحديد on/off
        if (!mode || mode === "") {
            const statusText = currentStatus ? "🛡️ مفعل (حصري للنخبة)" : "🌐 معطل (متاح للعامة)";
            const stateWord = currentStatus ? "SECURE [⚡]" : "OPEN [🔓]";

            return await sock.sendMessage(
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
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        // في حال إدخال خيار غير صحيح
        if (mode !== "on" && mode !== "off") {
            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ⚙️ خطأ في المعاملات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📌 الصيغة الصحيحة للاستخدام:*
*┃ ┠ .مود on  ➔ للتفعيل*
*┃ ┗ .مود off ➔ للتعطيل*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        const isOn = mode === "on";

        // التحقق الذكي: هل الحالة المطلوبة مطابقة للحالة الحالية؟
        if (currentStatus === isOn) {
            const alreadyMsg = isOn ? "🛡️ نظام النخبة مفعل بالفعل!" : "🌐 نظام النخبة معطل بالفعل!";
            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}
*┃ ⚠️ تنبيه الحالة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ ❖ عذراً يا سيدي:*
*┃ ┠ ${alreadyMsg}*
*┃ ┗ لا يوجد تغيير جديد لتنفيذه.*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        if (!fs.existsSync(dataFolder)) {
            fs.mkdirSync(dataFolder, { recursive: true });
        }

        // كتابة وتحديث الحالة الجديدة في ملف المود
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
            ),
            "utf8"
        );

        const statusMsg = isOn ? "⚔️ تم تأمين النظام وتفعيل النخبة" : "🌐 تم إلغاء التقييد وفتح الأوامر";
        const stateWord = isOn ? "SECURE [⚡]" : "OPEN [🌐]";

        const targetMention = rawSender.includes("@") ? rawSender : `${senderNumber}@s.whatsapp.net`;

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
                mentions: [targetMention],
                quoted: msg
            }
        );

        // تسجيل الحدث في الكونسول
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