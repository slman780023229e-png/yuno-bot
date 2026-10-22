import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   📺 YOUTUBE ULTIMATE SYSTEM (WORKING DOWNLOAD)
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_VIDEOS_API = "https://apidirect.io/v1/youtube/posts";
const SEARCH_CHANNELS_API = "https://apidirect.io/v1/youtube/channels";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000; // 30 دقيقة

if (!globalThis.youtubeSelections) {
    globalThis.youtubeSelections = new Map();
}

function cleanName(name) {
    return String(name || "YouTube")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function createID() {
    return (
        "yt_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.youtubeSelections) {
        if (now - item.time > CACHE_TIME) {
            globalThis.youtubeSelections.delete(id);
        }
    }
}

async function searchYouTube(query, type = "videos") {
    let allItems = [];
    const apiEndpoint = type === "channels" ? SEARCH_CHANNELS_API : SEARCH_VIDEOS_API;
    
    try {
        const response = await axios.get(apiEndpoint, {
            params: { 
                query: query, 
                sort_by: "most_recent",
                page: 1 
            },
            timeout: 30000,
            headers: {
                "X-API-Key": API_KEY,
                Accept: "application/json",
                "User-Agent": "YUNO-BOT/1.0"
            }
        });
        const data = response.data;
        const items = data?.posts || data?.channels || data?.videos || data?.results || data?.data || [];
        if (Array.isArray(items)) {
            allItems = items;
        }
    } catch (error) {
        console.error("YouTube Search Error:", error?.response?.data || error.message);
    }

    return allItems;
}

function getYouTubeURL(post) {
    return post.url || post.link || post.permalink || (post.id ? `https://www.youtube.com/watch?v=${post.id}` : null);
}

function getTitle(post) {
    return post.title || post.name || post.snippet || "فيديو YouTube";
}

function getAuthor(post) {
    return post.author?.name || post.author?.username || post.channel_title || post.author || "YouTube";
}

// دالة جلب رابط التشغيل الصافي والمباشر للملف (MP4)
async function fetchDirectPlayUrl(targetUrl) {
    try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp4?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
        if (res.data && res.data.result && res.data.result.download_url) {
            return res.data.result.download_url;
        }
    } catch (e) {
        console.error("Failed to extract direct YouTube video URL:", e.message);
    }
    return targetUrl;
}

// دالة تنزيل الفيديو المباشر
async function downloadVideo(targetUrl, output) {
    let directUrl = targetUrl;
    
    // التكتيك الاحتياطي لجلب رابط الفيديو الصافي بدلاً من رابط الويب
    if (!directUrl.includes(".mp4") && !directUrl.includes("googlevideo.com")) {
        directUrl = await fetchDirectPlayUrl(targetUrl);
    }

    const response = await axios.get(directUrl, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 10,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "video/mp4,video/*,*/*"
        }
    });

    const type = String(response.headers["content-type"] || "").toLowerCase();
    
    if (type.includes("text/html") || type.includes("application/json")) {
        throw new Error("رابط التحميل لم يرجع ملف فيديو مباشر.");
    }

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(output);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
    });

    if (!fs.existsSync(output)) {
        throw new Error("لم يتم إنشاء ملف الفيديو.");
    }

    const stats = fs.statSync(output);
    if (stats.size <= 0) {
        throw new Error("ملف الفيديو فارغ.");
    }

    return stats;
}

export default {
    command: ["يوتيوب", "يوت", "بحثقناة", "تحميليوتيوب", "تحميلالكلبيوتيوب"],
    category: "التحميل",
    description: "البحث عن فيديوهات وقنوات YouTube وتحميلها مباشرة مع أزرار",

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
                    {
                        text: "⚠️ اكتب اسم الفيديو أو القناة المطلوبة.\n\n📌 أمثلة:\n.يوتيوب قرآن\n.بحثقناة أحمد العجمي"
                    },
                    { quoted: m }
                );
            }

            // 1. معالجة أمر "تحميل الكل"
            if (command === "تحميلالكلبيوتيوب") {
                const batchId = query;
                const itemsList = globalThis.youtubeSelections.get(batchId);

                if (!itemsList || !Array.isArray(itemsList)) {
                    try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                    return await sock.sendMessage(
                        jid,
                        { text: "❌ انتهت صلاحية الأزرار أو قائمة التحميل. يرجى البحث من جديد." },
                        { quoted: m }
                    );
                }

                try { await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } }); } catch {}

                setImmediate(async () => {
                    let successCount = 0;
                    for (let i = 0; i < itemsList.length; i++) {
                        const item = itemsList[i];
                        if (!item.url) continue;

                        let tempFile = path.join(process.cwd(), `yt_all_${Date.now()}_${i}.mp4`);
                        try {
                            await downloadVideo(item.url, tempFile);
                            await sock.sendMessage(
                                jid,
                                {
                                    video: { url: tempFile },
                                    mimetype: "video/mp4",
                                    fileName: `${cleanName(item.title)}.mp4`,
                                    caption: `📺 ${item.title}\n👤 ${item.author}\n\n📱 YouTube (${i + 1}/${itemsList.length})`
                                },
                                { quoted: m }
                            );
                            successCount++;
                        } catch {}

                        try {
                            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                        } catch {}

                        await new Promise(res => setTimeout(res, 1000));
                    }

                    try { await sock.sendMessage(jid, { react: { text: successCount > 0 ? "✅" : "❌", key: m.key } }); } catch {}
                });

                return;
            }

            // 2. معالجة أمر "تحميل فيديو فردي"
            if (command === "تحميليوتيوب") {
                const targetId = query;
                const selected = globalThis.youtubeSelections.get(targetId);

                if (!selected) {
                    try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                    return await sock.sendMessage(
                        jid,
                        { text: "❌ انتهت صلاحية هذا الزر. يرجى البحث مرة أخرى." },
                        { quoted: m }
                    );
                }

                try { await sock.sendMessage(jid, { react: { text: "📥", key: m.key } }); } catch {}

                if (!selected.url) {
                    throw new Error("لم يتم العثور على رابط فيديو قابل للتحميل.");
                }

                file = path.join(process.cwd(), `youtube_${Date.now()}.mp4`);
                await downloadVideo(selected.url, file);

                await sock.sendMessage(
                    jid,
                    {
                        video: { url: file },
                        mimetype: "video/mp4",
                        fileName: `${cleanName(selected.title)}.mp4`,
                        caption: `📺 ${selected.title}\n👤 ${selected.author}\n\n📱 YouTube`
                    },
                    { quoted: m }
                );

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                globalThis.youtubeSelections.delete(targetId);
                return;
            }

            // 3. معالجة البحث (فيديوهات أو قنوات)
            const isChannelSearch = command === "بحثقناة";
            const isVideoSearch = command === "يوتيوب" || command === "يوت";
            const searchInput = (isVideoSearch || isChannelSearch) ? (query ? query : args.join(" ")) : (command + " " + query).trim();
            
            if (!searchInput) {
                return await sock.sendMessage(
                    jid,
                    { text: "⚠️ اكتب ما تريد البحث عنه في يوتيوب." },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const searchType = isChannelSearch ? "channels" : "videos";
            const items = await searchYouTube(searchInput, searchType);

            if (!items.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(
                    jid,
                    { text: `❌ لم أجد نتائج لـ: ${searchInput}` },
                    { quoted: m }
                );
            }

            // إذا كان البحث عن قنوات
            if (isChannelSearch) {
                let channelText = `📺 *نتائج قنوات YouTube*\n\n🔎 البحث: *${searchInput}*\n\n`;
                items.slice(0, MAX_RESULTS).forEach((ch, idx) => {
                    const chName = cleanName(ch.name || ch.title || "قناة");
                    const chLink = ch.url || ch.link || `https://www.youtube.com/@${ch.username || ch.id}`;
                    channelText += `*${idx + 1}.* ${chName}\n🔗 ${chLink}\n\n`;
                });
                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: channelText }, { quoted: m });
            }

            // إذا كان البحث عن فيديوهات
            const results = items
                .slice(0, MAX_RESULTS)
                .map(post => {
                    const id = createID();
                    const title = cleanName(getTitle(post));
                    const author = cleanName(getAuthor(post));
                    const url = getYouTubeURL(post);

                    return {
                        id,
                        time: Date.now(),
                        title,
                        author,
                        url
                    };
                })
                .filter(x => x.url);

            if (!results.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(
                    jid,
                    { text: "❌ لم أجد روابط صالحة للتحميل." },
                    { quoted: m }
                );
            }

            const batchId = "all_" + Date.now().toString(36);
            globalThis.youtubeSelections.set(batchId, results);

            results.forEach(item => {
                globalThis.youtubeSelections.set(item.id, item);
            });

            const buttons = [
                ...results.map((item, index) => {
                    let title = item.title;
                    if (title.length > 25) {
                        title = title.slice(0, 22) + "...";
                    }
                    return {
                        displayText: `📺 ${index + 1} | ${title}`,
                        id: `.تحميليوتيوب ${item.id}`
                    };
                }),
                {
                    displayText: `📥 تحميل الكل (${results.length})`,
                    id: `.تحميلالكلبيوتيوب ${batchId}`
                }
            ];

            const menu =
                `📺 *نتائج YouTube*\n\n` +
                `🔎 البحث: *${searchInput}*\n` +
                `📊 النتائج: ${results.length}\n\n` +
                `👇 اختر ما تريد تحميله:`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "YUNO YOUTUBE",
                        buttons
                    );
                } catch {}
            }

            let fallback = menu + "\n\n";
            results.forEach((item, index) => {
                fallback += `*${index + 1}.* ${item.title}\n🔗 .تحميليوتيوب ${item.id}\n\n`;
            });
            fallback += `🔗 .تحميلالكلبيوتيوب ${batchId}\n`;

            return await sock.sendMessage(
                jid,
                { text: fallback },
                { quoted: m }
            );

        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            let errorText = error?.message || String(error);

            return await sock.sendMessage(
                jid,
                { text: `❌ حدث خطأ:\n${String(errorText).slice(0, 1000)}` },
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