import axios from "axios";

/* ═══════════════════════════════════════
   🌐 WEB & GOOGLE ULTIMATE SYSTEM
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const WEB_SEARCH_API = "https://apidirect.io/v1/web/search";

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

async function searchWeb(query) {
    try {
        const response = await axios.get(WEB_SEARCH_API, {
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
        return data?.results || data?.posts || data?.data || data?.articles || [];
    } catch (error) {
        console.error("Web Search Error:", error?.response?.data || error.message);
        return [];
    }
}

export default {
    command: ["بحث", "جوجل", "web", "تفاصيلبحث"],
    category: "الخدمات والبحث",
    description: "البحث عبر الإنترنت باستخدام نقاط النهاية المباشرة",

    execute: async (sock, m, { noPrefixText, jid }) => {
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
                        text: "⚠️ اكتب ما تريد البحث عنه.\n\n📌 مثال:\n.بحث الذكاء الاصطناعي\n.جوجل برمجة"
                    },
                    { quoted: m }
                );
            }

            // 1. معالجة عرض التفاصيل عند اختيار النتيجة
            if (command === "تفاصيلبحث") {
                const selected = globalThis.webSelections.get(query);
                if (!selected) {
                    return await sock.sendMessage(jid, { text: "❌ انتهت صلاحية هذا الاختيار. يرجى البحث من جديد." }, { quoted: m });
                }

                await sock.sendMessage(
                    jid,
                    {
                        text: `📌 *${selected.title}*\n\n📝 ${selected.snippet || "لا توجد تفاصيل إضافية."}\n\n🔗 الرابط:\n${selected.url}`
                    },
                    { quoted: m }
                );
                globalThis.webSelections.delete(query);
                return;
            }

            const searchInput = (["بحث", "جوجل", "web"].includes(command)) ? (query ? query : args.join(" ")) : (command + " " + query).trim();
            
            if (!searchInput) {
                return await sock.sendMessage(jid, { text: "⚠️ يرجى كتابة نص الاستعلام بجانب الأمر." }, { quoted: m });
            }

            try { await sock.sendMessage(jid, { react: { text: "🔎", key: m.key } }); } catch {}

            const resultsData = await searchWeb(searchInput);

            if (!Array.isArray(resultsData) || resultsData.length === 0) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: `❌ لم أجد نتائج مطابقة لـ: ${searchInput}` }, { quoted: m });
            }

            const formattedResults = resultsData.slice(0, MAX_RESULTS).map(item => {
                const id = createID();
                const title = cleanText(item.title || item.name || "نتيجة بحث");
                const snippet = cleanText(item.snippet || item.description || item.content || "");
                const url = item.url || item.link || "";

                return { id, time: Date.now(), title, snippet, url };
            }).filter(x => x.url || x.title);

            if (!formattedResults.length) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: "❌ تعذر جلب النتائج بشكل صحيح." }, { quoted: m });
            }

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
                `🌐 *نتائج البحث (Web)*\n\n` +
                `🔎 الاستعلام: *${searchInput}*\n` +
                `📊 النتائج: ${formattedResults.length}\n\n` +
                `👇 اضغط على الزر لعرض التفاصيل والرابط:`;

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