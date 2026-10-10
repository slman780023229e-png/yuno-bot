import axios from 'axios';
import https from 'https';

// إنشاء نسخة من axios تتجاهل أخطاء شهادة الأمان
const agent = new https.Agent({  
  rejectUnauthorized: false
});

// إضافة ذاكرة مؤقتة لحفظ الفيديوهات المرسلة لمنع التكرار
const sentVideos = new Set();

export default {
    command: "ايديت",
    category: "التحميل",
    description: "تحميل فيديو MP4 للأيديت عبر الاسم من تيك توك",

    execute: async (sock, msg, data) => {
        const jid = data.jid;
        const sender = data.sender || msg.key.participant || msg.key.remoteJid;

        const head =
`*╭━━〔 🎬 𝐘𝐔𝐍𝐎 𝐄𝐃𝐈𝐓𝐒 〕━╮*
*┃ 🔥 قسم الأيديت والحماس*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        const query = data.text.replace(/^ايديت\s*/i, '').trim();

        if (!query) {
            return await sock.sendMessage(jid, {
                text:
`${head}

*┃ ❌ يرجى كتابة اسم الايديت المطلوب*
*┃ 📌 مثال:*
*┃ .ايديت يونو*
*┃ .ايديت ناروتو*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

            const { data: resData } = await axios.get(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query + ' edit')}`,
                { httpsAgent: agent });
            
            if (!resData || !resData.data || !resData.data.videos || resData.data.videos.length === 0) {
                return await sock.sendMessage(jid, { 
                    text: 
`${head}

*┃ ❌ لم أجد نتائج بهذا الاسم*
*┃ ⚠️ جرب اسماً آخر*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` 
                }, { quoted: msg });
            }

            // تصفية الفيديوهات لاستبعاد التي تم إرسالها مسبقاً
            const availableVideos = resData.data.videos.filter(v => !sentVideos.has(v.play));
            
            if (availableVideos.length === 0) {
                // إذا نفدت الفيديوهات الجديدة، قم بتنظيف الذاكرة للسماح بالتكرار مجدداً
                sentVideos.clear();
                return await sock.sendMessage(jid, { 
                    text: 
`${head}

*┃ ⚠️ نفدت الفيديوهات الجديدة حالياً*
*┃ 🔄 تم إعادة ضبط الذاكرة، جرب مرة أخرى*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` 
                }, { quoted: msg });
            }

            const video = availableVideos[Math.floor(Math.random() * availableVideos.length)];
            
            // حفظ الرابط في الذاكرة لمنع تكراره
            sentVideos.add(video.play);

            await sock.sendMessage(
                jid,
                {
                    video: { url: video.play },
                    mimetype: 'video/mp4',
                    caption: 
`${head}
*┃ ✅ تم جلب الايديت بنجاح*
*┃ 🔎 البحث : ${query}*
*┃ 👑 الطلب : بواسطة YUNO BOT*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    mentions: [sender]
                },
                { quoted: msg }
            );

            await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

        } catch (err) {
            console.error('Error:', err.message);
            await sock.sendMessage(jid, {
                text: 
`${head}

*┃ ❌ تعذر الاتصال بالسيرفر*
*┃ ⚠️ حاول مرة أخرى لاحقاً*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });
        }
    }
};
