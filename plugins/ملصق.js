import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker } from 'wa-sticker-formatter';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';

// ربط المسار الخاص بـ ffmpeg الموجود في ملفاتك
ffmpeg.setFfmpegPath(ffmpegInstaller);

export default {
    command: "لملصق",
    category: "التحميل",
    description: "تحويل الصورة أو الفيديو إلى ملصق عادي أو متحرك",

    execute: async (sock, msg, data) => {
        const bodyText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || data.text || "";
        const isAnimatedCmd = bodyText.includes("متحرك");

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        let targetMessage = quoted ? quoted : msg.message;
        if (targetMessage?.ephemeralMessage) targetMessage = targetMessage.ephemeralMessage.message;
        if (targetMessage?.viewOnceMessage) targetMessage = targetMessage.viewOnceMessage.message;
        if (targetMessage?.viewOnceMessageV2) targetMessage = targetMessage.viewOnceMessageV2.message;
        if (targetMessage?.documentWithCaptionMessage) targetMessage = targetMessage.documentWithCaptionMessage.message;

        const targetMsg = quoted ? {
            key: {
                remoteJid: data.jid,
                fromMe: false,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
            },
            message: targetMessage
        } : {
            key: msg.key,
            message: targetMessage
        };

        const mediaType = Object.keys(targetMsg.message)[0];
        const isMedia = ['imageMessage', 'videoMessage', 'documentMessage'].includes(mediaType);

        if (!isMedia) {
            return await sock.sendMessage(data.jid, {
                text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ⚠️ يرجى إرسال أو الرد على صورة/فيديو!*\n*┗━━━━━━━━━━━━━━━━━┛*`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⚡', key: msg.key } });

            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { 
                logger: undefined, 
                reuploadRequest: sock.updateMediaMessage 
            });
            
            if (!buffer) throw new Error('فشل تحميل الوسائط من واتساب.');

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
            console.error("Sticker Command Error:", e);
            await sock.sendMessage(data.jid, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(data.jid, {
                text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ ${e.message || 'حدث خطأ غير معروف'}*\n*┗━━━━━━━━━━━━━━┛*`
            }, { quoted: msg });
        }
    }
};