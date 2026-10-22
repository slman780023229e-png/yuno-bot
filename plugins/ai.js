import axios from "axios";

/* ═══════════════════════════════════════
   🤖 GOOGLE AI MODE (FIXED PARAMETER)
═══════════════════════════════════════ */

const API_KEY = "ak_live_SRXV4CfsgQtwnkjI0OhicCphe6MVOoan9sySwz-PyrM";
const AI_MODE_API = "https://apidirect.io/v1/web/ai-mode";

export default {
    command: ["ai", "جوجل", "ذكاء"],
    category: "الذكاء الاصطناعي",
    description: "إجابة ذكية ومباشرة باستخدام وضع الذكاء الاصطناعي من Google",

    execute: async (sock, m, { noPrefixText, jid }) => {
        try {
            const rawText = String(noPrefixText || "").trim();
            const args = rawText ? rawText.split(/\s+/) : [];
            const command = String(args.shift() || "").replace(/^\./, "").toLowerCase();
            const query = args.join(" ").trim();

            const searchInput = (command === "ai" || command === "جوجل" || command === "ذكاء") 
                ? (query ? query : args.join(" ")) 
                : (command + " " + query).trim();

            if (!searchInput) {
                return await sock.sendMessage(
                    jid,
                    {
                        text: "⚠️ يرجى كتابة السؤال أو الاستفسار بعد الأمر.\n\n📌 مثال:\n.ai من هو مخترع الكهرباء؟"
                    },
                    { quoted: m }
                );
            }

            try { await sock.sendMessage(jid, { react: { text: "🤖", key: m.key } }); } catch {}

            // تم تغيير المعامل من query إلى prompt بناءً على استجابة السيرفر
            const response = await axios.get(AI_MODE_API, {
                params: { prompt: searchInput },
                timeout: 45000,
                headers: {
                    "X-API-Key": API_KEY,
                    Accept: "application/json",
                    "User-Agent": "YUNO-BOT/1.0"
                }
            });

            const data = response.data;
            
            const answer = 
                data?.answer || 
                data?.result || 
                data?.content || 
                data?.response || 
                data?.results || 
                (typeof data === "string" ? data : null);

            if (!answer) {
                try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
                return await sock.sendMessage(jid, { text: "❌ لم يتمكن الذكاء الاصطناعي من الرد. حاول طرح السؤال بطريقة أخرى." }, { quoted: m });
            }

            const formattedAnswer = typeof answer === "string" ? answer : JSON.stringify(answer, null, 2);

            try { await sock.sendMessage(jid, { react: { text: "✅", key: m.key } }); } catch {}

            return await sock.sendMessage(
                jid,
                {
                    text: `🤖 *Google AI Assistant*\n\n📌 *السؤال:* ${searchInput}\n\n━━━━━━━━━━━━━━━━━━\n${formattedAnswer}`
                },
                { quoted: m }
            );

        } catch (error) {
            try { await sock.sendMessage(jid, { react: { text: "❌", key: m.key } }); } catch {}
            
            const errorMsg = error?.response?.data ? JSON.stringify(error.response.data) : (error?.message || String(error));

            return await sock.sendMessage(
                jid,
                { text: `❌ حدث خطأ في معالجة طلب الذكاء الاصطناعي:\n${errorMsg.slice(0, 500)}` },
                { quoted: m }
            );
        }
    }
};