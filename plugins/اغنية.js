import fs from "fs";
import path from "path";
import axios from "axios";

const API_KEY = "1d2522dd7ba811e1f189ddce12156dffa21eadea457188aa8c97829990ade12f";
const API_BASE = "https://tiktokapi.store/api/v1";

if (!globalThis.tiktokAudioSelections) {
    globalThis.tiktokAudioSelections = new Map();
}

const CACHE_TIME = 7 * 24 * 60 * 60 * 1000; // أسبوع كامل

function cleanName(name) {
    return String(name || "TikTok Audio")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
}

async function apiGet(endpoint, params = {}) {
    const response = await axios.get(`${API_BASE}${endpoint}`, {
        params,
        timeout: 30000,
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Linux; Android 12)"
        }
    });

    if (response.data?.code !== undefined && response.data.code !== 0) {
        throw new Error(response.data?.msg || `TikTok API Error ${response.data.code}`);
    }

    return response.data;
}

function getPlayUrl(video) {
    return video.play || video.play_url || video.playUrl || video.wmplay || video.wm_play || null;
}

function createID() {
    return "tk_audio_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export default {
    command: ["اغنيه", "أغنية", "اغنية"],
    category: "التحميل",
    description: "البحث عن صوتيات TikTok وإرسالها",

    execute: async (sock, m, { noPrefixText, jid }) => {
        let file = null;

        try {
            const raw = String(noPrefixText || "").trim();

            const isButtonAction = raw.includes("tk_audio_") || raw.includes("تحميل_الكل");

            let input = "";
            if (!isButtonAction) {
                const parts = raw.split(/\s+/);
                parts.shift(); // إزالة اسم الأمر الأساسي فقط عند البحث الجديد
                input = parts.join(" ").trim();
            } else {
                input = raw;
            }

            if (!input && !isButtonAction) {
                return await sock.sendMessage(
                    jid,
                    { text: "🎵 يرجى كتابة اسم الأغنية\n📌 مثال: .اغنيه احبك موت" },
                    { quoted: m }
                );
            }

            if (isButtonAction) {
                const targetKey = raw.includes("تحميل_الكل") ? "تحميل_الكل" : raw.split(" ").find(x => x.startsWith("tk_audio_"));

                if (targetKey === "تحميل_الكل") {
                    const allItems = Array.from(globalThis.tiktokAudioSelections.values());
                    if (!allItems.length) {
                        return await sock.sendMessage(
                            jid,
                            { text: "⚠️ عذراً، انتهت الذاكرة المؤقتة. يرجى إعادة البحث من جديد." },
                            { quoted: m }
                        );
                    }

                    try {
                        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
                    } catch {}

                    const batch = allItems.slice(-5);
                    for (let i = 0; i < batch.length; i++) {
                        const item = batch[i];
                        if (!item.play) continue;

                        const filePath = path.join(process.cwd(), `tiktok_audio_${Date.now()}_${i}.mp4`);
                        await downloadMedia(item.play, filePath);

                        await sock.sendMessage(
                            jid,
                            {
                                audio: { url: filePath },
                                mimetype: "audio/mp4",
                                fileName: `${item.title}.mp4`,
                                ptt: false
                            },
                            { quoted: m }
                        );

                        try {
                            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        } catch {}
                    }

                    try {
                        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
                    } catch {}
                    return;
                }

                let selected = globalThis.tiktokAudioSelections.get(targetKey);

                if (!selected) {
                    try {
                        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
                    } catch {}

                    const fallbackResult = await apiGet("/search/video", {
                        search_term: "اغاني تريند",
                        count: 1,
                        cursor: 0
                    });
                    const fallbackVideo = fallbackResult?.data?.videos?.[0];
                    if (fallbackVideo && getPlayUrl(fallbackVideo)) {
                        selected = {
                            play: getPlayUrl(fallbackVideo),
                            title: cleanName(fallbackVideo.title || "صوت جديد")
                        };
                    } else {
                        throw new Error("عذراً، لم يتم العثور على الملف.");
                    }
                } else {
                    try {
                        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
                    } catch {}
                }

                file = path.join(process.cwd(), `tiktok_audio_${Date.now()}.mp4`);
                await downloadMedia(selected.play, file);

                await sock.sendMessage(
                    jid,
                    {
                        audio: { url: file },
                        mimetype: "audio/mp4",
                        fileName: `${selected.title}.mp4`,
                        ptt: false
                    },
                    { quoted: m }
                );

                try {
                    await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
                } catch {}

                return;
            }

            const result = await apiGet("/search/video", {
                search_term: input,
                count: 10,
                cursor: 0
            });

            const videos = Array.isArray(result?.data?.videos) ? result.data.videos : [];

            if (!videos.length) {
                return await sock.sendMessage(
                    jid,
                    { text: `❌ لم أجد نتائج لـ: ${input}` },
                    { quoted: m }
                );
            }

            const selectedVideos = videos.filter(video => getPlayUrl(video)).slice(0, 5);

            if (!selectedVideos.length) {
                throw new Error("لا توجد روابط تشغيل مباشرة.");
            }

            const results = [];

            for (const video of selectedVideos) {
                const id = createID();
                const rawText = video.title || video.desc || "صوت";
                const title = cleanName(rawText.split(/\s+/).slice(0, 3).join(" "));
                const author = cleanName(video.author?.nickname || "مجهول");

                const item = {
                    time: Date.now(),
                    title,
                    author,
                    play: getPlayUrl(video)
                };

                globalThis.tiktokAudioSelections.set(id, item);

                results.push({
                    id,
                    ...item
                });
            }

            const buttons = results.map((item, index) => {
                let title = item.title;
                if (title.length > 28) {
                    title = title.slice(0, 25) + "...";
                }
                return {
                    displayText: `🎵 [ ${index + 1} ] ${title}`,
                    id: `.اغنيه ${item.id}`
                };
            });

            buttons.push({
                displayText: "📥 تحميل الكل (5)",
                id: `.اغنيه تحميل_الكل`
            });

            let menu = `🎵 النتائج لـ: ${input}\n\n`;

            results.forEach((item, index) => {
                menu += `${index + 1} • ${item.title} (${item.author})\n`;
            });

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "ARTHUR MUSIC",
                        buttons
                    );
                } catch {}
            }

            let fallback = menu + "\nاختر الرقم بالرد:";
            return await sock.sendMessage(
                jid,
                { text: fallback },
                { quoted: m }
            );

        } catch (error) {
            console.error("Audio Command Error:", error);
            try {
                await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            } catch {}

            await sock.sendMessage(
                jid,
                { text: "❌ حدث خطأ أثناء المعالجة." },
                { quoted: m }
            );

        } finally {
            if (file) {
                setTimeout(() => {
                    try {
                        if (fs.existsSync(file)) {
                            fs.unlinkSync(file);
                        }
                    } catch {}
                }, 20000);
            }
        }
    }
};

async function downloadMedia(url, output) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 60000,
        maxRedirects: 5,
        headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            Accept: "audio/*,video/*,*/*"
        }
    });

    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
        throw new Error("رابط TikTok لم يرجع ملف وسائط مباشر.");
    }

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
    });

    if (!fs.existsSync(output)) {
        throw new Error("لم يتم إنشاء الملف.");
    }

    const stats = fs.statSync(output);
    if (stats.size <= 0) {
        throw new Error("الملف الناتج فارغ.");
    }

    return stats;
}
