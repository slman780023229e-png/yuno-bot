import axios from "axios";

/* ═══════════════════════════════════════
   🌐 GOOGLE & WEB ULTIMATE SYSTEM (NEWS, AI & VISION)
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";

// نقاط النهاية من apidirect.io
const WEB_SEARCH_API = "https://apidirect.io/v1/web/search";
const AI_MODE_API = "https://apidirect.io/v1/web/ai-mode";
const NEWS_API = "https://apidirect.io/v1/news/articles";

const MAX_RESULTS = 5; 
const CACHE_TIME = 30 * 60 * 1000; // 30 دقيقة

if (!globalThis.webSelections) {
    globalThis.webSelections = new Map();
}

function cleanText(text) {
    return String(text || "")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function createID() {
    return (
        "web_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function cleanupSelections() {
    const now = Date.now();
    for (const [id, item] of globalThis.webSelections) {
        if (now - item.time > CACHE_TIME) {
            globalThis.webSelections.delete(id);
        }
    }
}

// دالة جلب البيانات من الـ API
async function fetchApiData(endpoint, params) {
    try {
        const response = await axios.get(endpoint, {
            params: { ...params, sort_by: "most_recent" },
            timeout: 30000,
            headers: {
                "X-API-Key": API_KEY,
                Accept: "application/json",
                "User-Agent": "YUNO-BOT/1.0"
            }
        });
        return response.data;
    } catch (error) {
        console.error("API Request Error:", error?.response?.data || error.message);
        return null;
    }
}

export default {
    command: ["بحث", "جوجل", "ai", "أخبار", "اخبار", "صورة", "صوره", "تفاصيلبحث"],
    category: "الخدمات والبحث",
    description: "البحث عن أخبار اليوم، الذكاء الاصطناعي، وتحليل الصور والشخصيات",

    execute: async (sock, m, { noPrefixText, jid }) => {
        try {
            cleanupSelections();

            const rawText = String(noPrefixText || "").trim();
            const args = rawText ? rawText.split(/\s+/) : [];
            const command = String(args.shift() || "").replace(/^\./, "").toLowerCase();
            const query = args.join(" ").trim();

            // 1. معالجة زر/أمر عرض التفاصيل
            if (command === "تفاصيلبحث") {
                const selected = globalThis.webSelections.get(query);
                if (!selected) {
                    return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية هذا الاختيار. يرجى البحث من جديد." }, { quoted: m });
                }

                await sock.sendMessage(
                    jid,
                    {
                        text: `📌 *${selected.title}*\n\n📝 ${selected.snippet || "لا توجد تفاصيل إضافية."}\n\n🔗 الرابط / المصدر:\n${selected.url}`
                    },
                    { quoted: m }
                );
                globalThis.webSelections.delete(query);
                return;
            }

            // 2. معالجة البحث عن الصورة (إما عند إرسال صورة مع كلمة "صورة" أو الرد على صورة)
            const isImageSearch = command === "صورة" || command === "صوره";
            const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const hasImage = m.message?.imageMessage || quotedMsg?.imageMessage;

            if (isImageSearch || (hasImage && (command === "بحث" || command === "جوجل"))) {
                try { await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } }); } catch {}

                const searchQuery = query || "شخصيات ومشاهد متطابقة";
                
                // البحث الذكي عبر الويب عن تفاصيل ومصادر الصور
                const data = await fetchApiData(WEB_SEARCH_API, { query: searchQuery, page: 1 });
                const results = data?.results || data?.posts || data?.data || [];

                if (!results.length) {
                    try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                    return await sock.sendMessage(
                        jid,
                        { text: `🖼️ *تحليل وتفاصيل الصورة:*\n\nتعذر العثور على تطابق مباشر دقيق للشخصية أو الموقع حالياً. جرب كتابة اسم الشخصية أو المكان مع الأمر مثل:\n.صورة اسم الشخصية` },
                        { quoted: m }
                    );
                }

                let imgResponse = `🖼️ *تفاصيل الصورة والتطابقات المشابهة:*\n\n`;
                results.slice(0, 3).forEach((item, idx) => {
                    const title = cleanText(item.title || "تطابق صورة / شخصية");
                    const desc = cleanText(item.snippet || item.description || "معلومات إضافية عن الشخصية أو الموقع");
                    const url = item.url || item.link || "غير متوفر";
                    imgResponse += `*${idx + 1}. ${title}*\n📝 ${desc}\n🌐 *الموقع/المصدر:* ${url}\n\n`;
                });

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: imgResponse }, { quoted: m });
            }

            // 3. معالجة وضع الذكاء الاصطناعي (AI Mode)
            if (command === "ai" || command === "جوجل") {
                if (!query) {
                    return await sock.sendMessage(jid, { text: "⚠️ اكتب سؤالك أو الاستفسار للذكاء الاصطناعي.\n\n📌 مثال:\n.ai من هو مخترع الكهرباء؟" }, { quoted: m });
                }

                try { await sock.sendMessage(jid, { react: { text: "🤖", key: m.key } }); } catch {}

                const aiData = await fetchApiData(AI_MODE_API, { query });
                const aiAnswer = aiData?.answer || aiData?.results || aiData?.data || aiData?.content;

                if (aiAnswer && typeof aiAnswer === "string") {
                    try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                    return await sock.sendMessage(
                        jid,
                        { text: `🤖 *إجابة الذكاء الاصطناعي (Google AI):*\n\n${aiAnswer}` },
                        { quoted: m }
                    );
                }
            }

            // 4. معالجة الأخبار اليومية (News)
            const isNewsCmd = command === "أخبار" || command === "اخبار";
            if (isNewsCmd) {
                const newsQuery = query || "أخبار اليوم العاجلة";

                try { await sock.sendMessage(jid, { react: { text: "📰", key: m.key } }); } catch {}

                const newsData = await fetchApiData(NEWS_API, { query: newsQuery, page: 1 });
                const articles = newsData?.articles || newsData?.results || newsData?.posts || newsData?.data || [];

                if (!articles.length) {
                    try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                    return await sock.sendMessage(jid, { text: `❌ لم يتم العثور على مقالات إخبارية حديثة لـ: ${newsQuery}` }, { quoted: m });
                }

                let newsText = `📰 *أخبار اليوم العاجلة (${newsQuery})*\n\n`;
                articles.slice(0, MAX_RESULTS).forEach((art, idx) => {
                    const title = cleanText(art.title || art.headline || "خبر عاجل");
                    const snippet = cleanText(art.snippet || art.description || "");
                    const url = art.url || art.link || "";
                    
                    newsText += `*${idx + 1}.* ${title}\n📝 ${snippet.slice(0, 100)}...\n🔗 ${url}\n\n`;
                });

                try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: newsText }, { quoted: m });
            }

            // 5. معالجة البحث العام في الويب (Web Search)
            const searchInput = query || rawText;
            if (!searchInput) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⚠️ يرجى تحديد نوع البحث.\n\n" +
                            "📌 *الأوامر المتاحة:*\n" +
                            "• `.أخبار` : لجلب أخبار اليوم العاجلة\n" +
                            "• `.ai` : للبحث والاستفسار بالذكاء الاصطناعي\n" +
                            "• `.صورة` : للبحث عن الشخصيات والأماكن في الصور\n" +
                            "• `.بحث [نص]` : للبحث العام عبر الويب"
                    },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const searchData = await fetchApiData(WEB_SEARCH_API, { query: searchInput, page: 1 });
            const searchResults = searchData?.results || searchData?.posts || searchData?.data || [];

            if (!searchResults.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: `❌ لم أجد نتائج مطابقة لـ: ${searchInput}` }, { quoted: m });
            }

            const formattedResults = searchResults.slice(0, MAX_RESULTS).map(item => {
                const id = createID();
                const title = cleanText(item.title || item.name || "نتيجة بحث");
                const snippet = cleanText(item.snippet || item.description || "");
                const url = item.url || item.link || "";

                return { id, time: Date.now(), title, snippet, url };
            }).filter(x => x.url || x.title);

            formattedResults.forEach(item => {
                globalThis.webSelections.set(item.id, item);
            });

            const buttons = formattedResults.map((item, index) => {
                let btnTitle = item.title;
                if (btnTitle.length > 25) {
                    btnTitle = btnTitle.slice(0, 22) + "...";
                }
                return {
                    displayText: `🌐 ${index + 1} | ${btnTitle}`,
                    id: `.تفاصيلبحث ${item.id}`
                };
            });

            const menu =
                `🌐 *نتائج البحث (Google & Web)*\n\n` +
                `🔎 البحث: *${searchInput}*\n` +
                `📊 النتائج: ${formattedResults.length}\n\n` +
                `👇 اختر النتيجة للوصول إلى التفاصيل والرابط:`;

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            if (typeof sock.sendRealButtons === "function") {
                try {
                    return await sock.sendRealButtons(jid, menu, "YUNO SEARCH", buttons);
                } catch {}
            }

            let fallback = menu + "\n\n";
            formattedResults.forEach((item, index) => {
                fallback += `*${index + 1}.* ${item.title}\n🔗 .تفاصيلبحث ${item.id}\n\n`;
            });

            return await sock.sendMessage(jid, { text: fallback }, { quoted: m });

        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            return await sock.sendMessage(
                jid,
                { text: `❌ حدث خطأ:\n${String(error?.message || error).slice(0, 500)}` },
                { quoted: m }
            );
        }
    }
};