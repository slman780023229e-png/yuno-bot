import fs from "fs";
import path from "path";
import axios from "axios";

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_API = "https://apidirect.io/v1/tiktok/posts";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000;

if (!globalThis.tiktokMusicSelections) {
    globalThis.tiktokMusicSelections = new Map();
}

function cleanName(name) {
    return String(name || "TikTok").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
function createID() {
    return "tk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}
function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.tiktokMusicSelections) {
        if (now - item.time > CACHE_TIME) globalThis.tiktokMusicSelections.delete(id);
    }
}

async function searchTiktok(query) {
    let all = [];
    for (let page = 1; page <= 2; page++) {
        try {
            const res = await axios.get(SEARCH_API, {
                params: { query, page },
                timeout: 30000,
                headers: {
                    "X-API-Key": API_KEY,
                    Accept: "application/json",
                }
            });
            const data = res.data;
            const posts = data?.posts || data?.results || data?.data || [];
            if (posts.length > 0) all.push(...posts);
            else break;
        } catch { break; }
    }
    return all;
}

function getURL(post) {
    return post.music_url || post.audio_url || post.video_url || post.url || post.download_url || null;
}
function getTitle(post) {
    return post.title || post.music?.title || post.description || post.caption || "اغنية TikTok";
}
function getAuthor(post) {
    return post.author?.name || post.music?.author || post.author || "TikTok";
}

async function downloadFile(url, output) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 120000,
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
    return fs.statSync(output);
}

export default {
    command: ["اغنية", "تحميلاغنية", "تحميلالكلاغنية"],
    category: "التحميل",
    description: "البحث عن اغاني التيك توك",

    execute: async (sock, m, { noPrefixText, jid }) => {
        let file = null;
        try {
            cleanupSelections();
            const rawText = String(noPrefixText || "").trim();
            const args = rawText ? rawText.split(/\s+/) : [];
            const command = String(args.shift() || "").replace(/^\./, "").toLowerCase();
            const query = args.join(" ").trim();

            if (command === "تحميلالكلاغنية") {
                const list = globalThis.tiktokMusicSelections.get(query);
                if (!list) return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية الأزرار." }, { quoted: m });
                setImmediate(async () => {
                    for (let i = 0; i < list.length; i++) {
                        let tempFile = path.join(process.cwd(), `tk_all_${Date.now()}_${i}.mp3`);
                        try {
                            await downloadFile(list[i].url, tempFile);
                            await sock.sendMessage(jid, { audio: { url: tempFile }, mimetype: "audio/mpeg", fileName: `${cleanName(list[i].title)}.mp3` }, { quoted: m });
                        } catch {}
                        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                    }
                });
                return;
            }

            if (command === "تحميلاغنية") {
                const selected = globalThis.tiktokMusicSelections.get(query);
                if (!selected) return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية الزر." }, { quoted: m });
                file = path.join(process.cwd(), `tiktok_${Date.now()}.mp3`);
                await downloadFile(selected.url, file);
                await sock.sendMessage(jid, { audio: { url: file }, mimetype: "audio/mpeg", fileName: `${cleanName(selected.title)}.mp3`, ptt: false }, { quoted: m });
                return;
            }

            const finalQuery = query || rawText;
            if (!finalQuery) return await sock.sendMessage(jid, { text: "⚠️ اكتب اسم الأغنية.\n\n📌 مثال:\n.اغنية راشد الماجد" }, { quoted: m });

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}
            const posts = await searchTiktok(finalQuery);
            if (!posts.length) return await sock.sendMessage(jid, { text: `❌ لم أجد اغاني لـ: ${finalQuery}` }, { quoted: m });

            const results = posts.slice(0, MAX_RESULTS).map(p => ({
                id: createID(),
                time: Date.now(),
                title: cleanName(getTitle(p)),
                author: cleanName(getAuthor(p)),
                url: getURL(p)
            })).filter(x => x.url);

            if (!results.length) return await sock.sendMessage(jid, { text: "❌ بدون روابط صالحة." }, { quoted: m });

            const batchId = "all_" + Date.now().toString(36);
            globalThis.tiktokMusicSelections.set(batchId, results);
            results.forEach(item => globalThis.tiktokMusicSelections.set(item.id, item));

            const buttons = [
                ...results.map((item, i) => ({ displayText: `🎵 ${i+1} | ${item.title.slice(0,22)}`, id: `.تحميلاغنية ${item.id}` })),
                { displayText: `📥 تحميل الكل (${results.length})`, id: `.تحميلالكلاغنية ${batchId}` }
            ];

            const menu = `🎵 *نتائج الأغاني - TikTok*\n\n🔎 البحث: *${finalQuery}*\n📊 النتائج: ${results.length}\n\n👇 اختر الأغنية:`;

            if (typeof sock.sendRealButtons === "function") {
                try { return await sock.sendRealButtons(jid, menu, "YUNO MUSIC", buttons); } catch {}
            }

            let fallback = menu + "\n\n";
            results.forEach((item, i) => { fallback += `*${i+1}.* ${item.title} - ${item.author}\n🔗 .تحميلاغنية ${item.id}\n\n`; });
            return await sock.sendMessage(jid, { text: fallback }, { quoted: m });

        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ خطأ: ${e.message}` }, { quoted: m });
        } finally {
            if (file) setTimeout(() => { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {} }, 20000);
        }
    }
};