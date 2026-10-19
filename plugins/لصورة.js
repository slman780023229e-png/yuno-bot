import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

// ضبط مسار ffmpeg المدمج في مشروعك
ffmpeg.setFfmpegPath(ffmpegInstaller);

export default {
    command: "لملصق",
    category: "التحميل",
    description: "تحويل الصورة أو الفيديو إلى ملصق عادي أو متحرك",

    execute: async (sock, msg, data) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        // استخراج الرسالة المستهدفة
        const target = quoted ? {
            key: {
                remoteJid: data.jid,
                fromMe: false,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
            },
            message: quoted
        } : msg;

        // فك التغليف للرسائل إن وجدت
        let rawMsg = target.message;
        if (rawMsg?.ephemeralMessage) rawMsg = rawMsg.ephemeralMessage.message;
        if (rawMsg?.viewOnceMessage) rawMsg = rawMsg.viewOnceMessage.message;
        if (rawMsg?.viewOnceMessageV2) rawMsg = rawMsg.viewOnceMessageV2.message;

        const isImage = !!rawMsg?.imageMessage;
        const isVideo = !!rawMsg?.videoMessage;
        const isDocument = !!rawMsg?.documentMessage;

        if (!isImage && !isVideo && !isDocument) {
            return await sock.sendMessage(data.jid, { 
                text: `*┏━━━〔 ⚡ 𝗔𝗥𝗧𝗛𝗨𝗥 ⚡ 〕━━━┓*\n*┃ ⚠️ يرجى إرسال أو الرد على صورة/فيديو!*\n*┗━━━━━━━━━━━━━━━━━┛*` 
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⚡', key: msg.key } });

            // تنزيل الميديا بنفس الطريقة التي نجحت معك
            const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
            if (!buffer) throw new Error('فشل التحميل.');

            let stickerBuffer;

            if (isImage || (isDocument && rawMsg.documentMessage?.mimetype?.includes('image'))) {
                // تحويل الصورة المباشر باستخدام Sharp
                stickerBuffer = await sharp(buffer)
                    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .webp()
                    .toBuffer();

            } else if (isVideo || (isDocument && rawMsg.documentMessage?.mimetype?.includes('video'))) {
                // تحويل الفيديو إلى ملصق متحرك عبر FFmpeg
                const tmpIn = path.join(process.cwd(), `input_${Date.now()}.mp4`);
                const tmpOut = path.join(process.cwd(), `output_${Date.now()}.webp`);

                fs.writeFileSync(tmpIn, buffer);

                await new Promise((resolve, reject) => {
                    ffmpeg(tmpIn)
                        .outputOptions([
                            "-vcodec", "libwebp",
                            "-vf", "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=12,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000",
                            "-loop", "0",
                            "-ss", "00:00:00",
                            "-t", "00:00:07",
                            "-preset", "default",
                            "-an",
                            "-vsync", "0"
                        ])
                        .toFormat('webp')
                        .save(tmpOut)
                        .on('end', () => resolve(true))
                        .on('error', (err) => reject(err));
                });

                stickerBuffer = fs.readFileSync(tmpOut);

                // حذف الملفات المؤقتة
                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }

            // إرسال الملصق الجاهز
            await sock.sendMessage(data.jid, { sticker: stickerBuffer }, { quoted: msg });
            await sock.sendMessage(data.jid, { react: { text: '✨', key: msg.key } });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(data.jid, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(data.jid, { 
                text: `*┏━━━〔 ⚠️ خطأ 〕━━━┓*\n*┃ ❌ ${e.message}*\n*┗━━━━━━━━━━━━━━┛*` 
            }, { quoted: msg });
        }
    }
};