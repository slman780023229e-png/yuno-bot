import fs from "fs";
import path from "path";
import { jidDecode } from '@whiskeysockets/baileys';

// دالة جلب أعضاء النخبة (متوافقة تماماً مع أمر مسح)
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

// دالة الصوت المزيفة
function fakeQuoted(chatId) {
    return {
        key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: chatId, id: "NOTE_audio_" + Date.now() },
        message: { audioMessage: { mimetype: 'audio/mpeg', seconds: 5, fileLength: 12345 } }
    };
}

const zarfData = {
    reaction: "❄",
    reaction_status: "on",
    group: {
        status: "on",
        newSubject: "مـزروف 𝐍𝐎𝐓𝐄  𝐁𝐎𝐓",
        newDescription: `> ━ ╼╃ ⌬〔 𝐍𝐎𝐓𝐄  𝐁𝐎𝐓❄ 〕⌬ ╄╾ ━\n> *┤ تذكر أن السب والشتم لا يرفع قدراً ولا يغير واقعاً..*\n> *┤────────────···*\n> *┤ 💡 نصيحة أخوية:*\n> *┤ اجعل لسانك طيباً، فالكلمة الطيبة صدقة وخير للبشر.*`
    },
    messages: {
        status: "on",
        mention: "> *┤ 𝐍𝐎𝐓𝐄  𝐁𝐎𝐓 ❄*",
        final: `> ━ ╼╃ ⌬〔 *زرفناكم* 〕⌬ ╄╾ ━\n> *┤ اتق الله في لسانك وتجنب السب والشتم، احترم الآخرين لتستحق الاحترام.*`
    },
    audio: {
        status: "on",
        file: "songs/Note.mp3" // المسار الصحيح للملف
    }
};

export default {
    command: 'سفك',
    description: 'يزرف القروب ويرسل الصوت ويطبق النظام (خاص بالنخبة)',
    usage: '.سفك',
    category: 'الزرف',

    async execute(sock, msg) {
        try {
            const chatId = msg.key.remoteJid;
            const sender =
                msg.key.participant ||
                msg.participant ||
                chatId;

            const senderNumber = sender.split("@")[0].replace(/\D/g, "");
            const eliteUsers = getElite();

            if (!chatId.endsWith('@g.us')) return;

            // التحقق من صلاحية النخبة نفس طريقة أمر مسح
            if (!eliteUsers.includes(senderNumber)) {
                return sock.sendMessage(chatId, {
                    text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
❌ *هذا الأمر مخصص لقسم (النخبة) فقط*
*لست مسجلاً في قائمة النخبة لتنفيذ أمر السفك*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            const groupMetadata = await sock.groupMetadata(chatId);
            const botNumber = decode(sock.user.id);

            const newsletterConfig = {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363410672713016@newsletter',
                    newsletterName: '𝐍𝐎𝐓𝐄  𝐁𝐎𝐓',
                    serverMessageId: -1
                }
            };

            if (zarfData.reaction_status === "on") await sock.sendMessage(chatId, { react: { text: zarfData.reaction, key: msg.key } }).catch(() => {});

            if (zarfData.group?.status === "on") {
                await sock.groupUpdateSubject(chatId, zarfData.group.newSubject).catch(() => {});
                await sock.groupUpdateDescription(chatId, zarfData.group.newDescription).catch(() => {});
            }

            if (zarfData.messages?.status === "on") {
                await sock.sendMessage(chatId, { text: zarfData.messages.mention, contextInfo: newsletterConfig }).catch(() => {});
                await sleep(500);
                await sock.sendMessage(chatId, { text: zarfData.messages.final, contextInfo: newsletterConfig }).catch(() => {});
            }

            if (zarfData.audio?.status === "on") {
                const audioPath = path.join(process.cwd(), zarfData.audio.file);
                if (fs.existsSync(audioPath)) {
                    await sock.sendMessage(chatId, {
                        audio: fs.readFileSync(audioPath),
                        mimetype: 'audio/mpeg',
                        fileName: 'Note.mp3',
                        ptt: false
                    }, { quoted: fakeQuoted(chatId) });
                }
            }

            const toKick = groupMetadata.participants
                .filter(p => p.id !== botNumber && !eliteUsers.includes(decode(p.id).split('@')[0]))
                .map(p => p.id);

            if (toKick.length > 0) {
                await sock.groupParticipantsUpdate(chatId, toKick, 'remove').catch(() => {});
            }

        } catch (error) {
            console.error('❌ خطأ في أمر سفك:', error);
        }
    }
};