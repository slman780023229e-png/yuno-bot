let sharp = null;
try { const m = await import('sharp'); sharp = m.default || m; } catch {}
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
    command: "جودة",
    category: "أدوات",
    description: "رفع وتحسين وتغيير ألوان الملابس والجودة بدقة فائقة مع خيارات احترافية جديدة",

    execute: async (sock, msg, data) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const inputArgs = data.text ? data.text.replace(/^\.جودة/, "").trim().toLowerCase() : "";

        if (!quoted || !quoted.imageMessage) {
            let menuText = 
`*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*
*┤ نظام تحسين وتعديل الصور الاحترافي*
*┤ الرد على أي صورة واكتب أحد الأوامر:*
*┃*
*┃ 🌟 .جودة اسطوريه*
*┃    (جودة خرافية ووضوح ناصع وجمال تام بدون تخريب)*
*┃*
*┃ 🔴 .جودة البس*
*┃    (تغيير لون الملابس وتنسيقها بألوان جذابة كالأحمر)*
*┃*
*┃ ⚡ .جودة فائقة*
*┃    (وضوح عالي جداً وتوسيع الصور الطويلة لعريضة)*
*┃*
*┃ 🔥 .جودة عاليه*
*┃    (حدة قوية وتفتيح بارز للألوان)*
*┃*
*┃ ⚠️ .جودة ضعيفه*
*┃    (تقليل الجودة وجعلها ضعيفة وغير واضحة تماماً)*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            return await sock.sendMessage(data.jid, { text: menuText }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⏳', key: msg.key } });
        } catch {}

        try {
            const pseudoMessage = {
                key: {
                    remoteJid: data.jid,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant
                },
                message: quoted
            };

            const imageBuffer = await downloadMediaMessage(
                pseudoMessage,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            if (!sharp) {
                return await sock.sendMessage(data.jid,
                    { text: "⚠️ ميزة جودة الصور تحتاج sharp متوافقًا مع بيئتك. باقي البوت يعمل بشكل طبيعي." },
                    { quoted: msg });
            }

            let sharpImage = sharp(imageBuffer);
            let metadata = await sharpImage.metadata();
            let processedBuffer;
            let titleType = "";

            const isPortrait = metadata.height && metadata.width && metadata.height > metadata.width;

            // 1. جودة اسطوريه (وضوح خارق وناصع وجمال تام دون تخريب)
            if (inputArgs.includes("اسطوريه") || inputArgs.includes("أسطورية")) {
                titleType = "جودة اسطورية خارقة (Legendary HD)";
                let basePipeline = sharpImage;
                
                if (isPortrait) {
                    const newWidth = Math.round(metadata.height * 1.3);
                    basePipeline = basePipeline.extend({
                        top: 0, bottom: 0,
                        left: Math.round((newWidth - metadata.width) / 2),
                        right: Math.round((newWidth - metadata.width) / 2),
                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                    });
                }

                const targetWidth = metadata.width ? Math.round(metadata.width * 2.5) : 2560;
                processedBuffer = await basePipeline
                    .resize(targetWidth, null, { fit: 'inside' })
                    .median(1)
                    .sharpen({ sigma: 3.8, m1: 2.2, m2: 1.5 })
                    .modulate({ brightness: 1.18, saturation: 1.25 })
                    .normalize()
                    .jpeg({ quality: 100, mozjpeg: true })
                    .toBuffer();
            } 
            // 2. جودة البس (تغيير لون الملابس وتنسيقها باللون الأحمر الجذاب وتعزيز الجمال)
            else if (inputArgs.includes("البس") || inputArgs.includes("الملابس")) {
                titleType = "تنسيق وتغيير لون الملابس (Outfit Stylist & Red Tint)";
                processedBuffer = await sharpImage
                    .sharpen({ sigma: 2.0 })
                    // تعديل طفيف للصبغة والتشبع لإعطاء طابع ملابس جديد وأنيق (مع تركيز درجات الأحمر والتناسق)
                    .modulate({ 
                        brightness: 1.08, 
                        saturation: 1.4, // تشبع قوي لإبراز لون الملابس الجديد
                        hue: -15         // انحراف طفيف في درجات الألوان لتميل للأحمر والأناقة
                    })
                    .normalize()
                    .jpeg({ quality: 98 })
                    .toBuffer();
            }
            // 3. جودة فائقة
            else if (inputArgs.includes("فائقة")) {
                titleType = "فائقة الوضوح والاتساع (Ultra HD)";
                let basePipeline = sharpImage;
                if (isPortrait) {
                    const newWidth = Math.round(metadata.height * 1.2);
                    basePipeline = basePipeline.extend({
                        top: 0, bottom: 0,
                        left: Math.round((newWidth - metadata.width) / 2),
                        right: Math.round((newWidth - metadata.width) / 2),
                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                    });
                }
                const targetWidth = metadata.width ? Math.round(metadata.width * 2.0) : 1920;
                processedBuffer = await basePipeline
                    .resize(targetWidth, null, { fit: 'inside' })
                    .sharpen({ sigma: 2.8, m1: 1.6, m2: 1.1 })
                    .modulate({ brightness: 1.12, saturation: 1.15 })
                    .normalize()
                    .jpeg({ quality: 100, mozjpeg: true })
                    .toBuffer();
            } 
            // 4. جودة عاليه
            else if (inputArgs.includes("عاليه") || inputArgs.includes("عالية")) {
                titleType = "عالية الوضوح (High HD)";
                const targetWidth = metadata.width ? Math.round(metadata.width * 1.4) : 1280;
                processedBuffer = await sharpImage
                    .resize(targetWidth, null, { fit: 'inside' })
                    .sharpen({ sigma: 2.0, m1: 1.3 })
                    .modulate({ brightness: 1.08, saturation: 1.1 })
                    .normalize()
                    .jpeg({ quality: 95 })
                    .toBuffer();
            } 
            // 5. جودة ضعيفه (ضعيفة جداً وغير واضحة كما طلبت)
            else if (inputArgs.includes("ضعيفه") || inputArgs.includes("ضعيفة")) {
                titleType = "منخفضة جداً وغامشة (Low Quality)";
                processedBuffer = await sharpImage
                    .resize(300, null, { fit: 'inside' }) // تصغير الحجم بشدة لزيادة التشويش
                    .blur(2.5) // تغبيش قوي لتفقد الوضوح تماماً
                    .jpeg({ quality: 15 }) // ضغط قاسي جداً لتقليل الجودة
                    .toBuffer();
            } 
            // الوضع الافتراضي (عادية ومحسنة)
            else {
                titleType = "جودة متوازنة ونقية (Standard Pro)";
                processedBuffer = await sharpImage
                    .sharpen({ sigma: 1.5 })
                    .modulate({ brightness: 1.05, saturation: 1.05 })
                    .normalize()
                    .jpeg({ quality: 90 })
                    .toBuffer();
            }

            await sock.sendMessage(data.jid, {
                image: processedBuffer,
                caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ الحالة : تمت المعالجة بنجاح*✨\n*┤ النمط : ${titleType}*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });

            await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });

        } catch (error) {
            return await sock.sendMessage(data.jid, { 
                text: `❌ *حدث خطأ أثناء معالجة الصورة:* ${error.message}` 
            }, { quoted: msg });
        }
    }
};
