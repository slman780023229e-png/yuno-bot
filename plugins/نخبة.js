import fs from "fs";
import { arthurHead, arthurEliteBox } from "../utils/arthurStyle.js";
import { readEliteNumbers, isEliteMember, normalizeNumber } from "../utils/eliteAccess.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eliteFile = path.join(__dirname, "../data/النخبة.json");

function getElite() {
    return readEliteNumbers();
}

function saveElite(numbers) {
    const dataDir = path.dirname(eliteFile);
    fs.mkdirSync(dataDir, { recursive: true });
    const unique = [...new Set(numbers.map(normalizeNumber).filter(Boolean))];
    fs.writeFileSync(
        eliteFile,
        JSON.stringify(unique, null, 2),
        "utf8"
    );
}

function checkElitePermission(msg, data) {
    return isEliteMember(msg, data);
}

export default {

    command: "نخبة",

    category: "النخبة",
    eliteOnly: true,
    description: "إضافة أو إزالة أعضاء النخبة 👑",

    execute: async (sock, msg, data) => {
        const jid = data?.jid || msg.key?.remoteJid;

        const head = arthurHead("👑 نظام النخبة المطور");

        const isElite = checkElitePermission(msg, data);

        if (!isElite) {
            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

❌ *ليس لديك صلاحية*
👑 *الأمر خاص بأعضاء النخبة فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        const input = data?.text ? data.text.trim() : "";
        const args = input.replace(/^\.نخبة/, "").trim().split(/\s+/);
        const action = args[0] ? args[0].toLowerCase() : "";

        if (action === "عرض") {
            const elite = getElite();

            if (elite.length === 0) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
`${head}

📭 *لا يوجد أعضاء نخبة حالياً*
👥 *العدد : 0*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                        quoted: msg
                    }
                );
            }

            let list = elite.map(
                (n, i) => `*${i + 1}-* 👑 @${n}`
            ).join("\n");

            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

📜 *قائمة أعضاء النخبة:*

${list}

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
👥 *العدد الإجمالي : ${elite.length}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,

                    mentions: elite.map(
                        n => n.includes("@") ? n : n + "@s.whatsapp.net"
                    ),
                    quoted: msg
                }
            );
        }

        if (
            action !== "اضف" &&
            action !== "ازل"
        ) {
            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

⚜️ *أوامر النخبة المتاحة:*

👑 \`.نخبة اضف @العضو\`
👑 \`.نخبة ازل @العضو\`
👑 \`.نخبة عرض\`

📖 *الوصف:* إدارة أعضاء النخبة بكل سهولة عبر المنشن أو الرد.
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        const context =
            msg.message
            ?.extendedTextMessage
            ?.contextInfo;

        let target;

        if (context?.mentionedJid?.length) {
            target = context.mentionedJid[0];
        } else if (context?.participant) {
            target = context.participant;
        }

        if (!target) {
            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

❌ *يجب منشن العضو أو الرد على رسالته لتنفيذ الإجراء!*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );
        }

        const number = normalizeNumber(target);
        let elite = getElite();

        if (action === "اضف") {
            if (elite.includes(number)) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
`${head}

⚠️ *العضو موجود بالفعل في قائمة النخبة*
👤 @${number}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                        mentions: [target],
                        quoted: msg
                    }
                );
            }

            elite.push(number);
            saveElite(elite);

            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

✅ *تمت الإضافة بنجاح*

👤 *العضو :* @${number}
👑 *الحالة :* عضو نخبة معتمد
👥 *العدد الحالي :* ${elite.length}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [target],
                    quoted: msg
                }
            );
        }

        if (action === "ازل") {
            if (!elite.includes(number)) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
`${head}

⚠️ *العضو غير مسجل في قائمة النخبة أصلاً*
👤 @${number}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                        mentions: [target],
                        quoted: msg
                    }
                );
            }

            elite = elite.filter(n => String(n).replace(/[^0-9]/g, "") !== number);
            saveElite(elite);

            return await sock.sendMessage(
                jid,
                {
                    text:
`${head}

❌ *تمت الإزالة بنجاح*

👤 *العضو :* @${number}
👥 *العدد الحالي :* ${elite.length}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [target],
                    quoted: msg
                }
            );
        }
    }
};
