import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   🎵 TIKTOK ULTIMATE SYSTEM (APIDIRECT)
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
// تم تحديث المسار بناءً على لوحة التحكم الصحيحة
const SEARCH_API = "https://apidirect.io/v1/tiktok/videos";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000; // 30 دقيقة

if (!globalThis.tiktokSelections) {
    globalThis.tiktokSelections = new Map();
}

function cleanName(name) {
    return String(name || "TikTok")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function createID() {
    return (
        "tk_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.tiktokSelections) {
        if (now - item.time > CACHE_TIME) {
            globalThis.tiktokSelections.delete(id);
        }
    }
}

async function searchTikTok(query) {
    let allVideos = [];
    
    for (let page = 1; page <= 1; page++) {
        try {
            const response = await axios.get(SEARCH_API, {
                params: { 
                    query: query, 
                    sort_by: "most_recent",
                    page: page 
                },
                timeout: 30000,
                headers: {
                    "X-API-Key": API_KEY,
                    Accept: "application/json",
                    "User-Agent": "YUNO-BOT/1.0"
                }
            });
            const data = response.data;
            // فحص الاحتمالات المختلفة لهيكلة الرد (videos أو posts أو results)
            const videos = data?.videos || data?.posts || data?.results || data?.data || [];
            if (Array.isArray(videos) && videos.length > 0) {
                allVideos.push(...videos);
            } else {
                break;
            }
        } catch (error) {
            console.error("TikTok Search Error:", error?.response?.data || error.message);
            break;
        }
    }

    return Array.isArray(allVideos) ? allVideos : [];
}

function getTikTokURL(post) {
    return post.video_url || post.videoUrl || post.play || post.wmplay || post.url || post.link || post.permalink || null;
}

function getTitle(post) {
    return post.title || post.caption || post.description || post.snippet || "فيديو TikTok";
}

function getAuthor(post) {
    return post.author?.name || post.author?.unique_id || post.author?.username || post.author || "TikTok";
}

async function downloadVideo(url, output) {
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 10,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "video/mp4,video/*,*/*",
            "Referer": "https://www.tiktok.com/"
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
    command: ["تيكتوك", "تيك", "تحميلتيك", "تحميلالكلتيك"],
    category: "التحميل",
    description: "البحث عن فيديوهات TikTok وتحميلها مباشرة مع أزرار",

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
                        text: "⚠️ اكتب اسم الفيديو أو الكلمة المطلوبة.\n\n📌 مثال:\n.تيكتوك ناروتو"
                    },
                    { quoted: m }
                );
            }

            // 1. معالجة أمر "تحميل الكل"
            if (command === "تحميلالكلتيك") {
                const batchId = query;
                const itemsList = globalThis.tiktokSelections.get(batchId);

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

                        let tempFile = path.join(process.cwd(), `tiktok_all_${Date.now()}_${i}.mp4`);
                        try {
                            await downloadVideo(item.url, tempFile);
                            await sock.sendMessage(
                                jid,
                                {
                                    video: { url: tempFile },
                                    mimetype: "video/mp4",
                                    fileName: `${cleanName(item.title)}.mp4`,
                                    caption: `🎵 ${item.title}\n👤 ${item.author}\n\n📱 TikTok (${i + 1}/${itemsList.length})`
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
            if (command === "تحميلتيك") {
                const targetId = query;
                const selected = globalThis.tiktokSelections.get(targetId);

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
                    throw new Error("لم يتم العثور على رابط تحميل الفيديو.");
                }

                file = path.join(process.cwd(), `tiktok_${Date.now()}.mp4`);
                await downloadVideo(selected.url, file);

                await sock.sendMessage(
                    jid,
                    {
                        video: { url: file },
                        mimetype: "video/mp4",
                        fileName: `${cleanName(selected.title)}.mp4`,
                        caption: `🎵 ${selected.title}\n👤 ${selected.author}\n\n📱 TikTok`
                    },
                    { quoted: m }
                );

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                globalThis.tiktokSelections.delete(targetId);
                return;
            }

            // 3. عملية البحث الجديدة
            const isSearchCmd = command === "تيكتوك" || command === "تيك";
            const searchInput = isSearchCmd ? (query ? query : args.join(" ")) : (command + " " + query).trim();
            
            if (isSearchCmd && !searchInput) {
                return await sock.sendMessage(
                    jid,
                    {
                        text: "⚠️ اكتب اسم الفيديو.\n\n📌 مثال:\n.تيكتوك ناروتو"
                    },
                    { quoted: m }
                );
            }

            const finalQuery = searchInput || rawText;
            if (!finalQuery) {
                return await sock.sendMessage(
                    jid,
                    {
                        text: "⚠️ اكتب اسم الفيديو.\n\n📌 مثال:\n.تيكتوك ناروتو"
                    },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const posts = await searchTikTok(finalQuery);

            if (!posts.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(
                    jid,
                    { text: `❌ لم أجد فيديوهات تيك توك لـ: ${finalQuery}` },
                    { quoted: m }
                );
            }

            const results = posts
                .slice(0, MAX_RESULTS)
                .map(post => {
                    const id = createID();
                    const title = cleanName(getTitle(post));
                    const author = cleanName(getAuthor(post));
                    const url = getTikTokURL(post);

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
                    { text: "❌ لم أجد روابط فيديو صالحة للتحميل من النتائج." },
                    { quoted: m }
                );
            }

            const batchId = "all_" + Date.now().toString(36);
            globalThis.tiktokSelections.set(batchId, results);

            results.forEach(item => {
                globalThis.tiktokSelections.set(item.id, item);
            });

            const buttons = [
                ...results.map((item, index) => {
                    let title = item.title;
                    if (title.length > 25) {
                        title = title.slice(0, 22) + "...";
                    }
                    return {
                        displayText: `🎵 ${index + 1} | ${title}`,
                        id: `.تحميلتيك ${item.id}`
                    };
                }),
                {
                    displayText: `📥 تحميل الكل (${results.length})`,
                    id: `.تحميلالكلتيك ${batchId}`
                }
            ];

            const menu =
                `🎵 *نتائج TikTok*\n\n` +
                `🔎 البحث: *${finalQuery}*\n` +
                `📊 النتائج: ${results.length}\n\n` +
                `👇 اختر ما تريد تحميله:`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "YUNO TIKTOK",
                        buttons
                    );
                } catch {}
            }

            let fallback = menu + "\n\n";
            results.forEach((item, index) => {
                fallback += `*${index + 1}.* ${item.title}\n🔗 .تحميلتيك ${item.id}\n\n`;
            });
            fallback += `🔗 .تحميلالكلتيك ${batchId}\n`;

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