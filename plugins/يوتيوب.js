import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   🎬 YOUTUBE ULTIMATE SYSTEM - FIXED
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000;

if (!globalThis.youtubeSelections) {
    globalThis.youtubeSelections = new Map();
}

function cleanName(name) {
    return String(name || "YouTube").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
function createID() {
    return "yt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}
function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.youtubeSelections) {
        if (now - item.time > CACHE_TIME) globalThis.youtubeSelections.delete(id);
    }
}

async function searchYoutube(query) {
    const endpoints = [
        { url: "https://apidirect.io/v1/youtube/search", params: { q: query, limit: 10 } },
        { url: "https://apidirect.io/v1/youtube/search", params: { query: query, limit: 10 } },
        { url: "https://apidirect.io/v1/youtube/videos", params: { query: query } },
        { url: "https://apidirect.io/v1/search", params: { platform: "youtube", query: query } },
    ];

    for (const ep of endpoints) {
        try {
            const response = await axios.get(ep.url, {
                params: ep.params,
                timeout: 30000,
                headers: {
                    "X-API-Key": API_KEY,
                    Accept: "application/json",
                    "User-Agent": "YUNO-BOT/1.0"
                }
            });
            const data = response.data;
            const videos = data?.videos || data?.results || data?.data || data?.posts || data?.items || [];
            if (Array.isArray(videos) && videos.length > 0) {
                console.log(`✅ نجح مع: ${ep.url}`);
                return videos;
            }
        } catch (err) {
            console.log(`❌ فشل ${ep.url}:`, err.response?.data || err.message);
        }
    }
    return [];
}

function getYoutubeURL(post) {
    return post.video_url || post.download_url || post.stream_url || post.url || post.link || (post.videoId ? `https://www.youtube.com/watch?v=${post.videoId}` : (post.id?.videoId ? `https://www.youtube.com/watch?v=${post.id.videoId}` : null));
}
function getTitle(post) {
    return post.title || post.snippet?.title || post.caption || "فيديو YouTube";
}
function getAuthor(post) {
    return post.author?.name || post.channel?.name || post.snippet?.channelTitle || post.channel || "YouTube";
}

async function downloadVideo(url, output) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 10,
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (type.includes("text/html") || type.includes("application/json")) {
        throw new Error("رابط التحميل لم يرجع فيديو مباشر.");
    }
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
    const stats = fs.statSync(output);
    if (stats.size <= 0) throw new Error("ملف فارغ.");
    return stats;
}

export default {
    command: ["يوتيوب", "تحميليوتيوب", "تحميلالكليوتيوب"],
    category: "التحميل",
    description: "البحث عن فيديوهات YouTube وتحميلها",

    execute: async (sock, m, { noPrefixText, jid }) => {
        let file = null;
        try {
            cleanupSelections();
            const rawText = String(noPrefixText || "").trim();
            const args = rawText ? rawText.split(/\s+/) : [];
            const command = String(args.shift() || "").replace(/^\./, "").toLowerCase();
            const query = args.join(" ").trim();

            if (command === "تحميلالكليوتيوب") {
                const itemsList = globalThis.youtubeSelections.get(query);
                if (!itemsList) return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية الأزرار." }, { quoted: m });
                try { await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } }); } catch {}
                setImmediate(async () => {
                    for (let i = 0; i < itemsList.length; i++) {
                        const item = itemsList[i];
                        let tempFile = path.join(process.cwd(), `yt_all_${Date.now()}_${i}.mp4`);
                        try {
                            await downloadVideo(item.url, tempFile);
                            await sock.sendMessage(jid, { video: { url: tempFile }, mimetype: "video/mp4", fileName: `${cleanName(item.title)}.mp4`, caption: `🎬 ${item.title}\n👤 ${item.author} (${i+1}/${itemsList.length})` }, { quoted: m });
                        } catch {}
                        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                        await new Promise(r => setTimeout(r, 1000));
                    }
                });
                return;
            }

            if (command === "تحميليوتيوب") {
                const selected = globalThis.youtubeSelections.get(query);
                if (!selected) return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية الزر." }, { quoted: m });
                try { await sock.sendMessage(jid, { react: { text: "📥", key: m.key } }); } catch {}
                file = path.join(process.cwd(), `youtube_${Date.now()}.mp4`);
                await downloadVideo(selected.url, file);
                await sock.sendMessage(jid, { video: { url: file }, mimetype: "video/mp4", fileName: `${cleanName(selected.title)}.mp4`, caption: `🎬 ${selected.title}\n👤 ${selected.author}` }, { quoted: m });
                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                globalThis.youtubeSelections.delete(query);
                return;
            }

            const finalQuery = query || rawText;
            if (!finalQuery) return await sock.sendMessage(jid, { text: "⚠️ اكتب اسم الفيديو.\n📌 مثال:\n.يوتيوب ناروتو" }, { quoted: m });

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}
            const posts = await searchYoutube(finalQuery);

            if (!posts.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: `❌ لم أجد نتائج لـ: ${finalQuery}\n\nافتح الكونسل شوف ايش كتب لك apidirect` }, { quoted: m });
            }

            const results = posts.slice(0, MAX_RESULTS).map(post => ({ id: createID(), time: Date.now(), title: cleanName(getTitle(post)), author: cleanName(getAuthor(post)), url: getYoutubeURL(post) })).filter(x => x.url);
            if (!results.length) return await sock.sendMessage(jid, { text: "❌ وجدت نتائج بس بدون روابط تحميل مباشرة." }, { quoted: m });

            const batchId = "all_" + Date.now().toString(36);
            globalThis.youtubeSelections.set(batchId, results);
            results.forEach(item => globalThis.youtubeSelections.set(item.id, item));

            const buttons = [
                ...results.map((item, i) => ({ displayText: `🎬 ${i+1} | ${item.title.slice(0,22)}`, id: `.تحميليوتيوب ${item.id}` })),
                { displayText: `📥 تحميل الكل (${results.length})`, id: `.تحميلالكليوتيوب ${batchId}` }
            ];

            const menu = `🎬 *نتائج YouTube*\n\n🔎 البحث: *${finalQuery}*\n📊 النتائج: ${results.length}\n\n👇 اختر ما تريد تحميله:`;
            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
            if (typeof sock.sendRealButtons === "function") {
                try { return await sock.sendRealButtons(jid, menu, "YUNO YOUTUBE", buttons); } catch {}
            }
            let fallback = menu + "\n\n";
            results.forEach((item, i) => { fallback += `*${i+1}.* ${item.title}\n🔗 .تحميليوتيوب ${item.id}\n\n`; });
            fallback += `🔗 .تحميلالكليوتيوب ${batchId}\n`;
            return await sock.sendMessage(jid, { text: fallback }, { quoted: m });

        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            return await sock.sendMessage(jid, { text: `❌ خطأ:\n${String(error?.message || error).slice(0, 1000)}` }, { quoted: m });
        } finally {
            if (file) setTimeout(() => { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {} }, 20000);
        }
    }
};