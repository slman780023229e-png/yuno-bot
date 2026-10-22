import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   🎵 TIKTOK MUSIC / AUDIO SYSTEM
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_API = "https://apidirect.io/v1/tiktok/videos";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000; // 30 دقيقة

if (!globalThis.tiktokAudioSelections) {
    globalThis.tiktokAudioSelections = new Map();
}

function cleanName(name) {
    return String(name || "TikTok_Audio")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function createID() {
    return (
        "tka_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.tiktokAudioSelections) {
        if (now - item.time > CACHE_TIME) {
            globalThis.tiktokAudioSelections.delete(id);
        }
    }
}

async function searchTikTok(query) {
    let allVideos = [];
    try {
        const response = await axios.get(SEARCH_API, {
            params: { query, sort_by: "most_recent", page: 1 },
            timeout: 30000,
            headers: {
                "X-API-Key": API_KEY,
                Accept: "application/json",
                "User-Agent": "YUNO-BOT/1.0"
            }
        });
        const data = response.data;
        const videos = data?.videos || data?.posts || data?.results || data?.data || [];
        if (Array.isArray(videos)) {
            allVideos = videos;
        }
    } catch (error) {
        console.error("TikTok Audio Search Error:", error?.message);
    }
    return allVideos;
}

// دالة جلب رابط الصوت الصافي المباشر
async function fetchDirectAudioUrl(tiktokUrl) {
    try {
        const res = await axios.post("https://www.tikwm.com/api/", null, {
            params: { url: tiktokUrl },
            timeout: 15000
        });
        if (res.data && res.data.data) {
            // جلب رابط الصوت الخاص بالمنشور
            return res.data.data.music || res.data.data.play; 
        }
    } catch (e) {
        console.error("Failed to fetch audio link:", e.message);
    }
    return tiktokUrl;
}

function getTikTokURL(post) {
    if (post.url) return post.url;
    if (post.link) return post.link;
    const id = post.id || post.video_id || post.videoId;
    const username = post.author?.unique_id || post.author?.username || post.author || "user";
    if (id) {
        return `https://www.tiktok.com/@${username}/video/${id}`;
    }
    return null;
}

async function downloadAudio(targetUrl, output) {
    let audioUrl = await fetchDirectAudioUrl(targetUrl);

    const response = await axios.get(audioUrl, {
        responseType: "stream",
        timeout: 120000,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "*/*"
        }
    });

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
    });

    if (!fs.existsSync(output) || fs.statSync(output).size <= 0) {
        throw new Error("فشل تحميل الملف الصوتي.");
    }

    return fs.statSync(output);
}

export default {
    command: ["اغنيه", "أغنية", "صوتتيك", "تحميلصوتتيك"],
    category: "التحميل",
    description: "البحث عن الصوتيات والأغاني من TikTok وتحميلها كملف صوتي",

    execute: async (sock, m, { noPrefixText, jid }) => {
        let file = null;

        try {
            cleanupSelections();

            const rawText = String(noPrefixText || "").trim();
            const args = rawText ? rawText.split(/\s+/) : [];
            const command = String(args.shift() || "").replace(/^\./, "").toLowerCase();
            const query = args.join(" ").trim();

            if (!command && !query) {
                return await sock.sendMessage(
                    jid,
                    { text: "⚠️ اكتب اسم الأغنية أو الصوت المطلوب.\n\n📌 مثال:\n.اغنيه شيلات" },
                    { quoted: m }
                );
            }

            // 1. معالجة تحميل الصوت الفردي
            if (command === "تحميلصوتتيك") {
                const targetId = query;
                const selected = globalThis.tiktokAudioSelections.get(targetId);

                if (!selected) {
                    try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                    return await sock.sendMessage(
                        jid,
                        { text: "❌ انتهت صلاحية هذا الزر. يرجى البحث مرة أخرى." },
                        { quoted: m }
                    );
                }

                try { await sock.sendMessage(jid, { react: { text: "🎵", key: m.key } }); } catch {}

                file = path.join(process.cwd(), `audio_${Date.now()}.mp3`);
                await downloadAudio(selected.url, file);

                await sock.sendMessage(
                    jid,
                    {
                        audio: { url: file },
                        mimetype: "audio/mp4",
                        ptt: false, // اجعلها true إذا أردت إرسالها كبصمة صوتية
                        fileName: `${cleanName(selected.title)}.mp3`,
                        caption: `🎵 ${selected.title}\n👤 ${selected.author}\n📱 TikTok Audio`
                    },
                    { quoted: m }
                );

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                globalThis.tiktokAudioSelections.delete(targetId);
                return;
            }

            // 2. معالجة البحث الجديد
            const isAudioCmd = command === "اغنيه" || command === "أغنية" || command === "صوتتيك";
            const searchInput = isAudioCmd ? (query ? query : args.join(" ")) : (command + " " + query).trim();

            if (!searchInput) {
                return await sock.sendMessage(
                    jid,
                    { text: "⚠️ اكتب اسم الأغنية المطلوب البحث عنها." },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const videos = await searchTikTok(searchInput);

            if (!videos.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(
                    jid,
                    { text: `❌ لم أجد أغانٍ أو صوتيات لـ: ${searchInput}` },
                    { quoted: m }
                );
            }

            const results = videos
                .slice(0, MAX_RESULTS)
                .map(post => {
                    const id = createID();
                    const title = cleanName(post.title || post.caption || "صوت TikTok");
                    const author = cleanName(post.author?.name || post.author?.nickname || "TikTok");
                    const url = getTikTokURL(post);

                    return { id, time: Date.now(), title, author, url };
                })
                .filter(x => x.url);

            results.forEach(item => {
                globalThis.tiktokAudioSelections.set(item.id, item);
            });

            const buttons = results.map((item, index) => {
                let title = item.title;
                if (title.length > 25) {
                    title = title.slice(0, 22) + "...";
                }
                return {
                    displayText: `🎵 ${index + 1} | ${title}`,
                    id: `.تحميلصوتتيك ${item.id}`
                };
            });

            const menu =
                `🎵 *نتائج أغاني وصوتيات TikTok*\n\n` +
                `🔎 البحث: *${searchInput}*\n` +
                `📊 النتائج: ${results.length}\n\n` +
                `👇 اختر الصوت الذي تريد تحميله:`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "YUNO MUSIC",
                        buttons
                    );
                } catch {}
            }

            let fallback = menu + "\n\n";
            results.forEach((item, index) => {
                fallback += `*${index + 1}.* ${item.title}\n🔗 .تحميلصوتتيك ${item.id}\n\n`;
            });

            return await sock.sendMessage(jid, { text: fallback }, { quoted: m });

        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            return await sock.sendMessage(
                jid,
                { text: `❌ حدث خطأ أثناء جلب الصوت:\n${error.message}` },
                { quoted: m }
            );
        } finally {
            if (file) {
                setTimeout(() => {
                    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
                }, 20000);
            }
        }
    }
};