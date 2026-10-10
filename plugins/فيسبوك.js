import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   📘 FACEBOOK SEARCH & DOWNLOAD API
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_API = "https://apidirect.io/v1/facebook/videos";
const DOWNLOAD_API = "https://fdown.isuru.eu.org/download";

const MAX_RESULTS = 10;
const cache = new Map();
const CACHE_TIME = 15 * 60 * 1000;

function cleanName(name) {
    return String(name || "Facebook")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function makeID() {
    return "fb_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function cleanCache() {
    const now = Date.now();
    for (const [jid, data] of cache) {
        if (!data || now - data.time > CACHE_TIME) {
            cache.delete(jid);
        }
    }
}

async function searchFacebook(query) {
    let allVideos = [];
    
    for (let page = 1; page <= 3; page++) {
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
            const videos = data?.videos || data?.results || data?.data || [];
            if (Array.isArray(videos) && videos.length > 0) {
                allVideos.push(...videos);
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    if (allVideos.length === 0) {
        const response = await axios.get(SEARCH_API, {
            params: { query, page: 1 },
            timeout: 30000,
            headers: {
                "X-API-Key": API_KEY,
                Accept: "application/json",
                "User-Agent": "YUNO-BOT/1.0"
            }
        });
        const data = response.data;
        allVideos = data?.videos || data?.results || data?.data || [];
    }

    return Array.isArray(allVideos) ? allVideos : [];
}

function extractResults(videos) {
    return Array.isArray(videos) ? videos : [];
}

function getFacebookURL(video) {
    return video.url || video.video_url || video.videoUrl || video.link || video.permalink || video.permalink_url || null;
}

function getTitle(video) {
    return video.title || video.name || video.description || video.caption || "فيديو Facebook";
}

function getAuthor(video) {
    return video.author?.name || video.author?.username || video.author || video.page_name || video.publisher || "Facebook";
}

async function getAvailableQualities(url) {
    try {
        const response = await axios.post(DOWNLOAD_API, { url }, {
            timeout: 120000,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "User-Agent": "YUNO-BOT/1.0"
            }
        });

        const data = response.data;
        if (data?.status === "error") return null;

        const qualities = [];

        const links = data?.links;
        if (links && typeof links === "object") {
            for (const [key, val] of Object.entries(links)) {
                if (val && typeof val === "string") {
                    let k = String(key).toLowerCase();
                    let qName = String(key).replace("Download ", "").replace(" Quality", "").trim();
                    
                    let priority = 10;
                    if (k.includes("low") || k.includes("360") || k.includes("sd") || k.includes("normal") || k.includes("240") || k.includes("144")) {
                        priority = 1; // الأولوية القصوى للجودات الخفيفة والصغيرة
                    } else if (k.includes("hd") || k.includes("720") || k.includes("1080")) {
                        priority = 5;
                    }

                    qualities.push({
                        name: qName,
                        url: val,
                        priority: priority
                    });
                }
            }
        }

        const formats = data?.formats || data?.qualities || data?.video_qualities;
        if (Array.isArray(formats)) {
            for (const fmt of formats) {
                const fUrl = fmt.url || fmt.download_url;
                const fName = fmt.quality || fmt.resolution || fmt.name || "جودة متوفرة";
                if (fUrl && !qualities.some(q => q.url === fUrl)) {
                    qualities.push({ name: String(fName), url: fUrl, priority: 3 });
                }
            }
        }

        const mainUrl = data?.download_url || data?.downloadUrl || data?.url || data?.video_url;
        if (mainUrl && !qualities.some(q => q.url === mainUrl)) {
            qualities.push({ name: "جودة خفيفة (عادية)", url: mainUrl, priority: 2 });
        }

        qualities.sort((a, b) => a.priority - b.priority);

        return qualities.length > 0 ? qualities : null;
    } catch {
        return null;
    }
}

async function downloadVideo(url, file) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 300000,
        maxRedirects: 10,
        headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            Accept: "video/mp4,video/*,*/*"
        }
    });

    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (type.includes("text/html") || type.includes("application/json")) {
        throw new Error("الرابط لم يرجع ملف فيديو.");
    }

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(file);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
    });

    if (!fs.existsSync(file)) {
        throw new Error("لم يتم إنشاء ملف الفيديو.");
    }

    const stats = fs.statSync(file);
    if (stats.size <= 0) {
        throw new Error("الفيديو فارغ.");
    }

    return stats;
}

function removeFile(file) {
    try {
        if (file && fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    } catch {}
}

export default {
    command: ["فيس", "facebook", "fb"],
    category: "التحميل",
    description: "البحث الشامل عن فيديوهات Facebook وعرض الجودات مرتبة من الأخف حجماً للأثقل",

    execute: async (sock, m, { noPrefixText, jid }) => {
        let file = null;

        try {
            cleanCache();
            const input = noPrefixText.split(/\s+/).slice(1).join(" ").trim();

            if (!input) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⚠️ *طريقة الاستخدام*\n\n" +
                            "🎬 .فيس ناروتو\n" +
                            "🎬 .فيس ون بيس"
                    },
                    { quoted: m }
                );
            }

            const old = cache.get(jid);

            if (old && old.step === "select_video" && old.results) {
                const selected = old.results.find(x => x.id === input);

                if (selected) {
                    if (!selected.url) {
                        return await sock.sendMessage(jid, { text: "❌ رابط غير صالح." }, { quoted: m });
                    }

                    try { await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } }); } catch {}

                    const qualities = await getAvailableQualities(selected.url);

                    if (!qualities || qualities.length === 0) {
                        try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                        return await sock.sendMessage(jid, { text: "❌ عذراً، لم يتم العثور على جودات متاحة لهذا الفيديو." }, { quoted: m });
                    }

                    const qMap = qualities.map((q, idx) => ({
                        qId: `q_${Date.now()}_${idx}`,
                        name: q.name,
                        url: q.url,
                        videoTitle: selected.title,
                        videoAuthor: selected.author
                    }));

                    cache.set(jid, {
                        time: Date.now(),
                        step: "select_quality",
                        qualities: qMap
                    });

                    const qButtons = qMap.map((item) => ({
                        displayText: `📥 ${item.name}`,
                        id: `.فيس ${item.qId}`
                    }));

                    const qMenu =
                        `*╭━〔⚡𝐀𝐑𝐓𝐇𝐔𝐑 𝐒𝐘𝐒𝐓𝐄𝐌〕━╮*\n` +
                        `*┃*\n` +
                        `*┃ 🎬 ${selected.title}*\n` +
                        `*┃ 👤 ${selected.author}*\n` +
                        `*┃*\n` +
                        `*┃ الجودات المتاحة (تبدأ بالأخف حجماً):\n` +
                        `*┃*\n` +
                        `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

                    try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

                    if (typeof sock.sendRealButtons === "function") {
                        try {
                            return await sock.sendRealButtons(jid, qMenu, "ARTHUR SYSTEM - QUALITIES", qButtons);
                        } catch {}
                    }

                    return await sock.sendMessage(jid, {
                        text: qMenu + "\n\n" + qMap.map((q, i) => `${i + 1}. ${q.name}`).join("\n")
                    }, { quoted: m });
                }
            }

            if (old && old.step === "select_quality" && old.qualities) {
                const selectedQ = old.qualities.find(x => x.qId === input);

                if (selectedQ) {
                    try { await sock.sendMessage(jid, { react: { text: "📥", key: m.key } }); } catch {}

                    file = path.join(process.cwd(), `facebook_${Date.now()}.mp4`);

                    try {
                        await downloadVideo(selectedQ.url, file);
                    } catch (error) {
                        try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                        return await sock.sendMessage(jid, { text: "❌ فشل تحميل الملف بهذه الجودة." }, { quoted: m });
                    }

                    await sock.sendMessage(
                        jid,
                        {
                            video: { url: file },
                            mimetype: "video/mp4",
                            fileName: `${cleanName(selectedQ.videoTitle)}.mp4`,
                            caption:
                                `*╭━〔⚡𝐀𝐑𝐓𝐇𝐔𝐑 𝐒𝐘𝐒𝐓𝐄𝐌〕━╮*\n` +
                                `*┃*\n` +
                                `*┃ 🎬 العنوان :* ${selectedQ.videoTitle}\n` +
                                `*┃ 👤 الناشر :* ${selectedQ.videoAuthor}\n` +
                                `*┃ 📦 الجودة :* ${selectedQ.name}\n` +
                                `*┃*\n` +
                                `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                        },
                        { quoted: m }
                    );

                    try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

                    cache.delete(jid);
                    removeFile(file);
                    file = null;

                    return;
                }
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            let videos;
            try {
                videos = await searchFacebook(input);
            } catch (error) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: "❌ فشل البحث في Facebook." }, { quoted: m });
            }

            const extracted = extractResults(videos);
            if (!extracted.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: `❌ لم أجد فيديوهات لهذا البحث: ${input}` }, { quoted: m });
            }

            const results = extracted.slice(0, MAX_RESULTS).map((video) => ({
                id: makeID(),
                title: cleanName(getTitle(video)),
                author: cleanName(getAuthor(video)),
                url: getFacebookURL(video)
            })).filter(x => x.url);

            if (!results.length) {
                return await sock.sendMessage(jid, { text: "❌ لم أجد روابط فيديو قابلة للتحميل." }, { quoted: m });
            }

            cache.set(jid, {
                time: Date.now(),
                step: "select_video",
                results
            });

            const buttons = results.map((item, index) => {
                let title = item.title;
                if (title.length > 25) {
                    title = title.slice(0, 22) + "...";
                }
                return {
                    displayText: `🎬 ${index + 1} | ${title}`,
                    id: `.فيس ${item.id}`
                };
            });

            const menu =
                `*╭━〔⚡𝐀𝐑𝐓𝐇𝐔𝐑 𝐒𝐘𝐒𝐓𝐄𝐌〕━╮*\n` +
                `*┃*\n` +
                `*┃ 🔎 البحث :* ${input}\n` +
                `*┃ 📊 النتائج :* ${results.length}\n` +
                `*┃*\n` +
                `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n\n` +
                results.map((item, index) => `*${index + 1}.* ${item.title}\n👤 ${item.author}`).join("\n\n") +
                `\n\n👇 *اختر الفيديو لعرض الجودات:*`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(jid, menu, "ARTHUR SYSTEM", buttons);
                } catch {}
            }

            return await sock.sendMessage(jid, {
                text: menu + "\n\n" + results.map((x, i) => `${i + 1}. ${x.title}\n👤 ${x.author}\n🔗 ${x.url}`).join("\n\n")
            }, { quoted: m });

        } catch (error) {
            console.error("FACEBOOK ERROR:", error);
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            try {
                await sock.sendMessage(jid, { text: `❌ حدث خطأ:\n${String(error?.message || error).slice(0, 1000)}` }, { quoted: m });
            } catch {}
        } finally {
            if (file) {
                removeFile(file);
            }
        }
    }
};
