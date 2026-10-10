import axios from 'axios';

/* ========= إعدادات Pinterest ========= */
const base = "https://www.pinterest.com";
const search = "/resource/BaseSearchResource/get/";

const headers = {
  accept: "application/json, text/javascript, */*, q=0.01",
  referer: "https://www.pinterest.com/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  "x-app-version": "a9522f",
  "x-pinterest-appstate": "active",
  "x-pinterest-pws-handler": "www/[username]/[slug].js",
  "x-requested-with": "XMLHttpRequest",
};

async function getCookies() {
  try {
    const response = await axios.get(base);
    const setHeaders = response.headers["set-cookie"];
    if (setHeaders) {
      return setHeaders.map(v => v.split(";")[0]).join("; ");
    }
    return null;
  } catch {
    return null;
  }
}

async function searchPinterest(query) {
  try {
    const cookies = await getCookies();
    if (!cookies) return { status: false, message: "فشل جلب الكوكيز." };

    // خيارات عشوائية لضمان جلب صور جديدة ومختلفة تماماً في كل طلب لنفس الشخصية
    const modifiers = ["", "aesthetic", "wallpaper", "hd 4k", "poses", "art", "cool", "epic", "Vibes"];
    const randomMod = modifiers[Math.floor(Math.random() * modifiers.length)];
    const finalQuery = `${query} ${randomMod}`.trim();

    const params = {
      source_url: `/search/pins/?q=${encodeURIComponent(finalQuery)}`,
      data: JSON.stringify({
        options: {
          isPrefetch: false,
          query: finalQuery,
          scope: "pins",
          bookmarks: [""],
          page_size: 30, // زيادة عدد النتائج لضمان التنوع وعدم التكرار
        },
        context: {},
      }),
      _: Date.now(),
    };

    const { data } = await axios.get(`${base}${search}`, {
      headers: { ...headers, cookie: cookies },
      params,
    });

    const results = data.resource_response.data.results.filter(
      v => v.images?.orig
    );

    if (!results.length)
      return { status: false, message: "لم يتم العثور على نتائج." };

    // خلط النتائج عشوائياً لضمان صور مختلفة تماماً عن المرة السابقة
    const shuffled = results.sort(() => 0.5 - Math.random());

    return {
      status: true,
      pins: shuffled.map(v => v.images.orig.url),
    };
  } catch (e) {
    return { status: false, message: "حدث خطأ في البحث." };
  }
}

export default {
    command: "صور",
    category: "تحميل",
    description: "جلب صور فخمة ومتجددة لنفس الشخصية دون تكرار مع شريط تفاعلي مستقل",

    execute: async (sock, msg, data) => {
        const input = data.text ? data.text.trim() : "";
        
        // دعم البحث بالنصوص الطويلة والكلمات المتعددة بعد الأمر .صور
        const cleanedInput = input.replace(/^\.صور/, "").trim();
        const parts = cleanedInput.split(/\s+/);
        
        let query = "";
        let subAction = "";
        let indexArg = null;

        // التحقق مما إذا كانت الأجزاء الأخيرة تمثل عملية فرعية مثل get أو all
        if (parts.length >= 3 && parts[parts.length - 2].toLowerCase() === "get") {
            subAction = "get";
            indexArg = parseInt(parts[parts.length - 1]);
            query = parts.slice(0, parts.length - 2).join(" ");
        } else if (parts.length >= 2 && (parts[parts.length - 1].toLowerCase() === "all" || parts[parts.length - 1] === "الكل")) {
            subAction = "all";
            query = parts.slice(0, parts.length - 1).join(" ");
        } else {
            query = cleanedInput;
        }

        if (!query) {
            return await sock.sendMessage(data.jid, {
                text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(data.jid, { react: { text: '⏳', key: msg.key } });
        } catch {}

        // البحث الذكي المتجدد
        let result = await searchPinterest(query);
        if (!result.status) {
            return await sock.sendMessage(data.jid, { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` }, { quoted: msg });
        }

        let pins = result.pins;
        if (pins.length === 0) {
            return await sock.sendMessage(data.jid, { text: '*◇❐ ═━╾ 🩸 ╼━═ ❐◇*' }, { quoted: msg });
        }

        let top5Pins = pins.slice(0, 5);

        // الحالة الأولى: جلب صورة فردية عند النقر من الشريط
        if (subAction === "get" && indexArg !== null && !isNaN(indexArg)) {
            const targetIndex = indexArg - 1;
            if (targetIndex >= 0 && targetIndex < top5Pins.length) {
                try {
                    await sock.sendMessage(
                        data.jid,
                        {
                            image: { url: top5Pins[targetIndex] },
                            caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                        },
                        { quoted: msg }
                    );
                    await sock.sendMessage(data.jid, { react: { text: '✅', key: msg.key } });
                    return;
                } catch (e) {}
            }
        }

        // الحالة الثانية: تحميل الكل كصور منفصلة ومرتبة
        if (subAction === "all" || subAction === "الكل") {
            try {
                for (let i = 0; i < top5Pins.length; i++) {
                    await sock.sendMessage(
                        data.jid,
                        {
                            image: { url: top5Pins[i] },
                            caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                        },
                        { quoted: msg }
                    );
                }
                await sock.sendMessage(data.jid, { react: { text: '✅', key: msg.key } });
                return;
            } catch (e) {
                return await sock.sendMessage(data.jid,
                    { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
                    { quoted: msg });
            }
        }

        // الحالة الأساسية: إرسال الصورة الأولى وحدها بجودة خارقة، ثم إرسال الشريط المستقل وحدها
        try {
            await sock.sendMessage(
                data.jid,
                {
                    image: { url: top5Pins[0] },
                    caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );

            await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
        } catch (e) {}

        // رسالة الشريط المستقلة وحدها
        let menuText = 
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
       *𝚫𝚪𝚻𝚮𝚼𝚪 • 𝚩𝚯𝚻 2026*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
👑 *شريط التحكم والخيارات*

*👤 البحث : ${query}*
*📦 تم جلب 5 صور جديدة مختلفة*
*⚡ استخدم الأزرار أدناه للاختيار:*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        const buttonsArray = [
            { displayText: "🖼️ عرض الصورة (1)", id: `.صور ${query} get 1` },
            { displayText: "🖼️ عرض الصورة (2)", id: `.صور ${query} get 2` },
            { displayText: "🖼️ عرض الصورة (3)", id: `.صور ${query} get 3` },
            { displayText: "🖼️ عرض الصورة (4)", id: `.صور ${query} get 4` },
            { displayText: "🖼️ عرض الصورة (5)", id: `.صور ${query} get 5` },
            { displayText: "📥 تحميل الشريط كاملًا", id: `.صور ${query} all` }
        ];

        if (typeof sock.sendRealButtons === "function") {
            try {
                return await sock.sendRealButtons(
                    data.jid,
                    menuText,
                    "ARTHUR BOT SYSTEM 2026",
                    buttonsArray
                );
            } catch (e) {}
        }

        let fallbackMenu = `${menuText}\n\n*📌 أو اكتب الرقم مباشرة:\n• .صور ${query} get [1-5]\n• .صور ${query} all*`;
        return await sock.sendMessage(data.jid, { text: fallbackMenu }, { quoted: msg });
    }
};
