import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker } from 'wa-sticker-formatter';

export default {
    command: "لملصق",
    category: "التحميل",
    description: "تحويل الصورة أو الفيديو إلى ملصق عادي أو متحرك",

    execute: async (sock, msg, data) => {
        const bodyText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || data.text || "";
        const isAnimatedCmd = bodyText.includes("متحرك");

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted ? {
            key: {
                remoteJid: data.jid,
                fromMe: false,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
            },
            message: quoted
        } : msg;

        const mediaType = Object.keys(targetMsg.message)[0];
        const isMedia = ['imageMessage', 'videoMessage', 'documentMessage'].includes(mediaType);

        if (!isMedia) {
            return await sock.sendMessage(data.jid, {
                text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ⚠️ يرجى إرسال أو الرد على صورة/فيديو!*\n*┗━━━━━━━━━━━━━━━━━┛*`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⚡', key: msg.key } });

            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: undefined, reconnectRequest: sock });
            if (!buffer) throw new Error('فشل التحميل.');

            const isVideo = mediaType === 'videoMessage' || (mediaType === 'documentMessage' && targetMsg.message.documentMessage.mimetype?.includes('video'));

            const sticker = new Sticker(buffer, {
                pack: '𝗔𝗥𝗧𝗛𝗨𝗥 𝗕𝗢𝗧',
                author: '⚡',
                type: isVideo || isAnimatedCmd ? 'full' : 'crop',
                categories: [''],
                id: '12345',
                quality: 50,
                background: '#00000000'
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(data.jid, { sticker: stickerBuffer }, { quoted: msg });
            await sock.sendMessage(data.jid, { react: { text: '✨', key: msg.key } });

        } catch (e) {
            await sock.sendMessage(data.jid, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(data.jid, {
                text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ ${e.message}*\n*┗━━━━━━━━━━━━━━┛*`
            }, { quoted: msg });
        }
    }
};
