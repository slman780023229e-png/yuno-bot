import fs from "fs";
import path from "path";
import axios from "axios";

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_API = "https://apidirect.io/v1/youtube/posts";

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
    let allVideos = [];
    for (let page = 1; page <= 2; page++) {
        try {
            const response = await axios.get(SEARCH_API, {
                params: { query, page },
                timeout: 30000,
                headers: {
                    "X-API-Key": API_KEY,
                    Accept: "application/json",
                    "User-Agent": "YUNO-BOT/1.0"
                }
            });
            const data = response.data;
            const videos = data?.posts || data?.results || data?.data || data?.videos || [];
            if (Array.isArray(videos) && videos.length > 0) allVideos.push(...videos);
            else break;
        } catch { break; }
    }
    return allVideos;
}

function getYoutubeURL(post) {
    return post.video_url || post.videoUrl || (post.url && post.url.includes(".mp4") ? post.url : null) || post.url || post.link || null;
}
function getTitle(post) {
    return post.title || post.caption || post.description || "فيديو YouTube";
}
function getAuthor(post) {
    return post.author?.name || post.channel?.name || post.author || "YouTube";
}

async function downloadVideo(url, output) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 120000,
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (type.includes("text/html") || type.includes("application/json")) throw new Error("الرابط ليس فيديو مباشر.");
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
    return fs.statSync(output);
}

export default {
    command: ["يوتيوب", "تحميليوتيوب", "تحميلالكليوتيوب"],
    category: "التحميل",
    description: "البحث عن فيديوهات YouTube",

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
                setImmediate(async () => {
                    for (let i = 0; i < itemsList.length; i++) {
                        const item = itemsList[i];
                        let tempFile = path.join(process.cwd(), `yt_all_${Date.now()}_${i}.mp4`);
                        try {
                            await downloadVideo(item.url, tempFile);
                            await sock.sendMessage(jid, { video: { url: tempFile }, mimetype: "video/mp4", fileName: `${cleanName(item.title)}.mp4`, caption: `🎬 ${item.title} (${i+1}/${itemsList.length})` }, { quoted: m });
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
                file = path.join(process.cwd(), `youtube_${Date.now()}.mp4`);
                await downloadVideo(selected.url, file);
                await sock.sendMessage(jid, { video: { url: file }, mimetype: "video/mp4", fileName: `${cleanName(selected.title)}.mp4`, caption: `🎬 ${selected.title}\n👤 ${selected.author}` }, { quoted: m });
                globalThis.youtubeSelections.delete(query);
                return;
            }

            const finalQuery = query || rawText;
            if (!finalQuery) return await sock.sendMessage(jid, { text: "⚠️ مثال:\n.يوتيوب ناروتو" }, { quoted: m });

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}
            const posts = await searchYoutube(finalQuery);
            if (!posts.length) return await sock.sendMessage(jid, { text: `❌ لم أجد نتائج لـ: ${finalQuery}` }, { quoted: m });

            const results = posts.slice(0, MAX_RESULTS).map(post => ({ id: createID(), time: Date.now(), title: cleanName(getTitle(post)), author: cleanName(getAuthor(post)), url: getYoutubeURL(post) })).filter(x => x.url);
            const batchId = "all_" + Date.now().toString(36);
            globalThis.youtubeSelections.set(batchId, results);
            results.forEach(item => globalThis.youtubeSelections.set(item.id, item));

            const buttons = [
                ...results.map((item, i) => ({ displayText: `🎬 ${i+1} | ${item.title.slice(0,22)}`, id: `.تحميليوتيوب ${item.id}` })),
                { displayText: `📥 تحميل الكل (${results.length})`, id: `.تحميلالكليوتيوب ${batchId}` }
            ];

            const menu = `🎬 *نتائج YouTube*\n\n🔎 البحث: *${finalQuery}*\n📊 النتائج: ${results.length}\n\n👇 اختر:`;
            if (typeof sock.sendRealButtons === "function") {
                try { return await sock.sendRealButtons(jid, menu, "YUNO YOUTUBE", buttons); } catch {}
            }
            let fallback = menu + "\n\n";
            results.forEach((item, i) => { fallback += `*${i+1}.* ${item.title}\n🔗 .تحميليوتيوب ${item.id}\n\n`; });
            return await sock.sendMessage(jid, { text: fallback }, { quoted: m });

        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ خطأ: ${e.message}` }, { quoted: m });
        } finally {
            if (file) setTimeout(() => { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {} }, 20000);
        }
    }
};