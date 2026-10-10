import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config.js";

const genAI = new GoogleGenerativeAI(config.GEMINI_KEY);

export default {
    command: "رسم",
    category: "الأدوات",
    description: "رسم صورة بالذكاء الاصطناعي",

    execute: async (sock, msg, data) => {
        const text = data.text.replace(".رسم", "").trim();

        if (!text) {
            return sock.sendMessage(data.jid, {
                text: `🎨 𝐘𝐔𝐍𝐎 𝐀𝐈\n\nاكتب وصف الصورة\nمثال:\n.رسم ايزن من بليتش`
            });
        }

        await sock.sendMessage(data.jid, { text: `⏳ جاري معالجة الطلب...` });

        let prompt = text;

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
            const result = await model.generateContent(`Convert to professional anime prompt: ${text}. Return only the prompt.`);
            prompt = result.response.text().trim();
        } catch (e) {
            console.log("Gemini Error (Quota/API): Using raw prompt.");
            prompt = `${text}, anime style, 4k, high quality`;
        }

        try {
            // تحسين الرابط: تقليل الأبعاد قليلاً لزيادة سرعة الاستجابة ومنع الـ Timeout
            const seed = Math.floor(Math.random() * 100000);
            const encodedPrompt = encodeURIComponent(prompt + ", masterpiece, high quality, ultra-detailed");
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&seed=${seed}&nologo=true`;

            // استخدام timeout في axios لمنع التعليق
            const image = await axios.get(imageUrl, { 
                responseType: "arraybuffer",
                timeout: 30000 
            });

            await sock.sendMessage(data.jid, {
                image: Buffer.from(image.data),
                caption: `✅ تم إنشاء الصورة بنجاح\n\n*𝐘𝐔𝐍𝐎 𝐀𝐈*`
            });
        } catch (e) {
            console.log("IMAGE ERROR:", e.message);
            // حل إضافي: إذا فشل axios، سنرسل الرابط مباشرة للمستخدم ليفتحه بنفسه
            await sock.sendMessage(data.jid, {
                text: `❌ تعذر تحميل الصورة مباشرة، إليك رابط النتيجة:\n\nhttps://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
            });
        }
    }
};
