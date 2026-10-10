import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../data");
const file = path.join(dataDir, "contactGuard.json");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "{}");
}

function loadData() {
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
        return {};
    }
}

function saveData(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

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

// دالة فحص المشرفين بدقة
async function getGroupAdminStatus(sock, chatId, senderNumber) {
    if (!chatId.endsWith("@g.us")) return { isAdmin: false };
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];
        const participant = participants.find(p => String(p.id).replace(/\D/g, "") === senderNumber);
        
        const isAdmin = participant && (participant.admin === "admin" || participant.admin === "superadmin");
        return { isAdmin: Boolean(isAdmin) };
    } catch (e) {
        return { isAdmin: false };
    }
}

const cleanJid = (jid) => {
    if (!jid) return "";
    return jid.replace(/:[0-9]+@/, "@");
};

export default {
    alwaysOn: true,
    command: "حمايه",
    category: "الحماية",
    description: "حماية جهات الاتصال",

    execute: async (sock, msg, data) => {
        const jid = data.jid || msg.key.remoteJid;

        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(jid, {
                text: `*╭━━〔 ❌ خطأ 〕━━╮*\n*┤ الأمر للمجموعات فقط*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            });
        }

        // جلب رقم المرسل بدقة عالية
        const sender = data.sender || msg.key.participant || msg.participant || msg.key.remoteJid;
        const senderNumber = String(sender).split("@")[0].replace(/\D/g, "");
        const botNumber = cleanJid(sock.user?.id).split("@")[0].replace(/\D/g, "");

        try {
            // استثناء البوت أو إذا كان الشخص هو صاحب البوت / من النخبة / مشرفاً
            const eliteUsers = getElite();
            const isElite = eliteUsers.includes(senderNumber) || senderNumber === botNumber;
            const senderStatus = await getGroupAdminStatus(sock, jid, senderNumber);
            const isAdmin = senderStatus.isAdmin || msg.key.fromMe;

            if (!isAdmin && !isElite) {
                return sock.sendMessage(jid, {
                    text: `*╭━━〔 ❌ خطأ 〕━━╮*\n*┤ الأمر للمشرفين والنخبة فقط*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                });
            }

            const db = loadData();
            db[jid] = !db[jid];
            saveData(db);

            const statusText = db[jid]
                ? `*╔═══════════╗*\n  *✨ 🛡️ حماية جهات الاتصال ✨*\n*╚═══════════╝*\n\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                : `*╔═══════════╗*\n  *✨ 🛡️ حماية جهات الاتصال ✨*\n*╚═══════════╝*\n\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            await sock.sendMessage(jid, { text: statusText });

        } catch (e) {
            console.log("خطأ في التحقق من الصلاحيات:", e.message);
            await sock.sendMessage(jid, {
                text: `*╭━━〔 ❌ خطأ 〕━━╮*\n*┤ تعذر التحقق من الصلاحيات*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            });
        }
    },

    onMessage: async (sock, msg) => {
        const jid = msg.key.remoteJid;

        if (!jid || !jid.endsWith("@g.us")) return;

        const db = loadData();
        if (!db[jid]) return;

        const botNumber = cleanJid(sock.user?.id);
        const sender = cleanJid(msg.key.participant || msg.participant);
        if (msg.key.fromMe || (botNumber && sender === botNumber)) return;

        const message = msg.message;
        if (!message) return;

        let hasContact = false;
        let contactCount = 0;

        if (message.contactMessage) {
            hasContact = true;
            contactCount = 1;
        } else if (message.contactsArrayMessage) {
            hasContact = true;
            contactCount = message.contactsArrayMessage.contacts?.length || 1;
        }

        if (!hasContact) return;
        if (!sender) return;

        try {
            await Promise.all([
                sock.sendMessage(jid, {
                    delete: {
                        remoteJid: jid,
                        id: msg.key.id,
                        participant: msg.key.participant || msg.participant
                    }
                }),
                sock.groupParticipantsUpdate(jid, [msg.key.participant || msg.participant], "remove")
            ]);

            console.log(
`╭━━━━━━━━━━━━━━━━━━━━━━╮
┃ 🛡️ 𝐘𝐔𝐍𝐎 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ 🚫 تم منع جهة اتصال بسرعة قصوى
┃ 👤 ${sender}
┃ 📦 العدد : ${contactCount}
┃ ⚡ تم التنفيذ الفوري
╰━━━━━━━━━━━━━━━━━━━━━━╯`
            );

        } catch (e) {
            console.log("حماية جهات الاتصال:", e.message);
        }
    }
};
