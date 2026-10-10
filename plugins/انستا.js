import fs from "fs";
import path from "path";
import axios from "axios";

/* ═══════════════════════════════════════
   📸 INSTAGRAM ULTIMATE SYSTEM (WORKING BUTTONS)
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const SEARCH_API = "https://apidirect.io/v1/instagram/posts";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000; // 30 دقيقة

if (!globalThis.instagramSelections) {
    globalThis.instagramSelections = new Map();
}

function cleanName(name) {
    return String(name || "Instagram")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function createID() {
    return (
        "ig_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.instagramSelections) {
        if (now - item.time > CACHE_TIME) {
            globalThis.instagramSelections.delete(id);
        }
    }
}

async function searchInstagram(query) {
    let allPosts = [];
    
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
            const posts = data?.posts || data?.results || data?.data || [];
            if (Array.isArray(posts) && posts.length > 0) {
                allPosts.push(...posts);
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    return Array.isArray(allPosts) ? allPosts : [];
}

function getInstagramURL(post) {
    return post.video_url || post.videoUrl || (post.url && post.url.includes(".mp4") ? post.url : null) || post.url || post.link || post.permalink || null;
}

function getTitle(post) {
    return post.title || post.caption || post.description || "منشور Instagram";
}

function getAuthor(post) {
    return post.author?.name || post.author?.unique_id || post.author?.username || post.author || "Instagram";
}

async function downloadVideo(url, output) {
    const response = await axios.get(url, {
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
    command: ["انستا", "تحميلانستا", "تحميلالكلانستا"],
    category: "التحميل",
    description: "البحث عن فيديوهات Instagram وتحميلها مباشرة مع 5 أزرار وزر تحميل الكل في الأسفل",

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
                        text:
                            "⚠️ اكتب اسم الفيديو.\n\n" +
                            "📌 مثال:\n" +
                            ".انستا ناروتو"
                    },
                    { quoted: m }
                );
            }

            // 1. معالجة أمر "تحميل الكل"
            if (command === "تحميلالكلانستا") {
                const batchId = query;
                const itemsList = globalThis.instagramSelections.get(batchId);

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

                        let tempFile = path.join(process.cwd(), `insta_all_${Date.now()}_${i}.mp4`);
                        try {
                            await downloadVideo(item.url, tempFile);
                            await sock.sendMessage(
                                jid,
                                {
                                    video: { url: tempFile },
                                    mimetype: "video/mp4",
                                    fileName: `${cleanName(item.title)}.mp4`,
                                    caption: `🎬 ${item.title}\n👤 ${item.author}\n\n📱 Instagram (${i + 1}/${itemsList.length})`
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
            if (command === "تحميلانستا") {
                const targetId = query;
                const selected = globalThis.instagramSelections.get(targetId);

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

                file = path.join(process.cwd(), `instagram_${Date.now()}.mp4`);
                await downloadVideo(selected.url, file);

                await sock.sendMessage(
                    jid,
                    {
                        video: { url: file },
                        mimetype: "video/mp4",
                        fileName: `${cleanName(selected.title)}.mp4`,
                        caption:
                            `🎬 ${selected.title}\n` +
                            `👤 ${selected.author}\n\n` +
                            `📱 Instagram`
                    },
                    { quoted: m }
                );

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                globalThis.instagramSelections.delete(targetId);
                return;
            }

            // 3. عملية البحث الجديدة
            const searchInput = command === "انستا" ? (query ? query : args.join(" ")) : (command + " " + query).trim();
            
            // إذا تم إرسال الأمر .انستا بدون نص بجانبه
            if (command === "انستا" && !searchInput) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⚠️ اكتب اسم الفيديو.\n\n" +
                            "📌 مثال:\n" +
                            ".انستا ناروتو"
                    },
                    { quoted: m }
                );
            }

            const finalQuery = searchInput || rawText;
            if (!finalQuery) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⚠️ اكتب اسم الفيديو.\n\n" +
                            "📌 مثال:\n" +
                            ".انستا ناروتو"
                    },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const posts = await searchInstagram(finalQuery);

            if (!posts.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(
                    jid,
                    { text: `❌ لم أجد منشورات لـ: ${finalQuery}` },
                    { quoted: m }
                );
            }

            const results = posts
                .slice(0, MAX_RESULTS)
                .map(post => {
                    const id = createID();
                    const title = cleanName(getTitle(post));
                    const author = cleanName(getAuthor(post));
                    const url = getInstagramURL(post);

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
                    { text: "❌ لم أجد روابط فيديو صالحة للتحميل." },
                    { quoted: m }
                );
            }

            const batchId = "all_" + Date.now().toString(36);
            globalThis.instagramSelections.set(batchId, results);

            results.forEach(item => {
                globalThis.instagramSelections.set(item.id, item);
            });

            const buttons = [
                ...results.map((item, index) => {
                    let title = item.title;
                    if (title.length > 25) {
                        title = title.slice(0, 22) + "...";
                    }
                    return {
                        displayText: `🎬 ${index + 1} | ${title}`,
                        id: `.تحميلانستا ${item.id}`
                    };
                }),
                {
                    displayText: `📥 تحميل الكل (${results.length})`,
                    id: `.تحميلالكلانستا ${batchId}`
                }
            ];

            const menu =
                `🎬 *نتائج Instagram*\n\n` +
                `🔎 البحث: *${finalQuery}*\n` +
                `📊 النتائج: ${results.length}\n\n` +
                `👇 اختر ما تريد تحميله:`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "YUNO INSTAGRAM",
                        buttons
                    );
                } catch {}
            }

            let fallback = menu + "\n\n";
            results.forEach((item, index) => {
                fallback += `*${index + 1}.* ${item.title}\n🔗 .تحميلانستا ${item.id}\n\n`;
            });
            fallback += `🔗 .تحميلالكلانستا ${batchId}\n`;

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
