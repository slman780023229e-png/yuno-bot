import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
    command: "عرض",
    category: "الأدوات",
    description: "كشف وعرض الوسائط المخفية (View Once) للصورة والفيديو والصوت",

    execute: async (sock, msg, data) => {
        try {
            const jid = data.jid;
            const sender = msg.key.participant || msg.key.remoteJid;

            if (jid.endsWith('@g.us')) {
                try {
                    const groupMetadata = await sock.groupMetadata(jid);
                    const participants = groupMetadata.participants || [];
                    const senderObj = participants.find(p => p.id === sender);
                    const isAdmin = senderObj && (senderObj.admin === 'admin' || senderObj.admin === 'superadmin');

                    if (!isAdmin) {
                        return await sock.sendMessage(jid, {
                            text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ❌ هذا الأمر للمشرفين فقط!*\n*┗━━━━━━━━━━━━━━━━━┛*`
                        }, { quoted: msg });
                    }
                } catch (err) {}
            }

            const quotedMsgInfo = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsgInfo) {
                return await sock.sendMessage(jid, { 
                    text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ⚠️ يرجى الرد على رسالة وسائط!*\n*┗━━━━━━━━━━━━━━━━━┛*` 
                }, { quoted: msg });
            }

            await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });

            let targetMessage = quotedMsgInfo;
            if (quotedMsgInfo.viewOnceMessage) {
                targetMessage = quotedMsgInfo.viewOnceMessage.message;
            } else if (quotedMsgInfo.viewOnceMessageV2) {
                targetMessage = quotedMsgInfo.viewOnceMessageV2.message;
            }

            const mediaType = Object.keys(targetMessage)[0];
            if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(mediaType)) {
                await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
                return await sock.sendMessage(jid, { 
                    text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ الرسالة ليست وسائط صحيحة*\n*┗━━━━━━━━━━━━━━┛*` 
                }, { quoted: msg });
            }

            const fakeMessage = {
                key: {
                    remoteJid: jid,
                    fromMe: false,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant
                },
                message: quotedMsgInfo
            };

            const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {}, { logger: undefined, reconnectRequest: sock });
            if (!buffer) throw new Error('فشل التحميل.');

            if (mediaType === 'imageMessage') {
                await sock.sendMessage(jid,
                    { image: buffer,
                    caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
                    { quoted: msg });
            } else if (mediaType === 'videoMessage') {
                await sock.sendMessage(jid,
                    { video: buffer,
                    gifPlayback: true,
                    caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
                    { quoted: msg });
            } else if (mediaType === 'audioMessage') {
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
            }

            await sock.sendMessage(jid, { react: { text: '✨', key: msg.key } });

        } catch (e) {
            await sock.sendMessage(data.jid, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(data.jid, { 
                text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ ${e.message}*\n*┗━━━━━━━━━━━━━━┛*` 
            }, { quoted: msg });
        }
    }
};
