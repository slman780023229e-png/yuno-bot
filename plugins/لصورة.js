import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
    command: "لصورة",
    category: "التحميل",
    description: "تحويل الملصق إلى صورة أو متحركة",

    execute: async (sock, msg, data) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted?.stickerMessage && !msg.message?.stickerMessage) {
            return await sock.sendMessage(data.jid, { text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ⚠️ يرجى الرد على ملصق!*\n*┗━━━━━━━━━━━━━━━━━┛*` }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⚡', key: msg.key } });
            
            const target = quoted ? { key: { remoteJid: data.jid,
                fromMe: false,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant },
                message: quoted } : msg;
            const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined, reconnectRequest: sock });
            
            if (!buffer) throw new Error('فشل التحميل.');
            const isAnimated = quoted?.stickerMessage?.isAnimated || msg.message?.stickerMessage?.isAnimated;

            await sock.sendMessage(data.jid,
                isAnimated ? { video: buffer,
                gifPlayback: true,
                caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` } : { image: buffer,
                caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
                { quoted: msg });
            await sock.sendMessage(data.jid, { react: { text: '✨', key: msg.key } });
        } catch (e) {
            await sock.sendMessage(data.jid, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(data.jid, { text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ ${e.message}*\n*┗━━━━━━━━━━━━━━┛*` }, { quoted: msg });
        }
    }
};
