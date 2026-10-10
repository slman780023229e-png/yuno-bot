import axios from 'axios';
import { Jimp } from 'jimp';

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

// الـ 7 أنواع للتطقيم الثنائي (ولد وبنت)
const categoriesDouble = {
  "1": { name: "إمساك يد / تلامس 🤝", query: "matching pfp holding hands couple half anime", desc: "صورتك وأنت تمسك يدها أو تتلامس الأيدي بشكل متصل" },
  "2": { name: "مشهد رومانسي متصل 💞", query: "matching pfp couple kissing hug aesthetic anime", desc: "صورة معانقة أو قبلة مقسومة بين البروفايلين بدقة" },
  "3": { name: "نظرات عيون متبادلة 👀", query: "matching pfp looking at each other anime", desc: "أنت تنظر في جهة وهي تنظر في جهتك وكأنكم تتبادلان النظرات" },
  "4": { name: "كتف بكتف / ابيض وأسود 🖤", query: "matching pfp couple monochrome aesthetic", desc: "تطقيم فخم يجمعكما بجو هادئ وراقي" },
  "5": { name: "قتال وحماس (أكشن) ⚡", query: "matching pfp epic anime fight duo", desc: "تطقيم لشخصيات أنمي بوضعيات قتالية وحماسية مذهلة" },
  "6": { name: "لطيف ومشاكس (كواي) ✨", query: "matching pfp cute chibi couple anime", desc: "تطقيم لطيف وكيوت يعبر عن اللطافة والمزاح بينكم" },
  "7": { name: "عشوائي فخم وخاص 👑", query: "matching icons couple half half anime aesthetic", desc: "تطقيم فخم ومتجدد يختار تلقائياً بأعلى جودة" }
};

// الـ 7 أنواع للتطقيم الثلاثي (3 أشخاص / أصدقاء أو شلة)
const categoriesTriple = {
  "1": { name: "شلة الأصدقاء الثلاثة ⚡", query: "matching pfp trio anime squad", desc: "تطقيم ثلاثي فخم يجمع 3 أصدقاء بوضعيات مذهلة" },
  "2": { name: "ثلاثي أبطال الأكشن ⚔️", query: "matching icons trio anime epic fight", desc: "تطقيم ثلاثي حماسي وقتالي لشخصيات أنمي شهيرة" },
  "3": { name: "فريق الكيوت واللطافة ✨", query: "matching pfp trio cute anime chibi", desc: "تطقيم ثلاثي لطيف وكيوت يضفي جمالاً على المجموعات" },
  "4": { name: "نظرات وتواصل ثلاثي 👀", query: "matching trio avatar aesthetic anime", desc: "أيقونات ثلاثية متناسقة ومتصلة ببعضها بدقة عالية" },
  "5": { name: "ثلاثي المافيا والغموض 🖤", query: "matching pfp trio dark aesthetic anime", desc: "تطقيم ثلاثي فخم وفيه هيبة وغموض عالي" },
  "6": { name: "عصابة النينجا أو القوى الخارقة 🌀", query: "matching icons trio ninja anime", desc: "تطقيم ثلاثي مستوحى من قوى وعوالم الأنشطة الأسطورية" },
  "7": { name: "عشوائي ثلاثي فخم 👑", query: "matching trio anime icons aesthetic", desc: "تطقيم ثلاثي منوع وفخم يتم اختياره تلقائياً" }
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

async function searchPinterest(searchQuery) {
  try {
    const cookies = await getCookies();
    if (!cookies) return { status: false, message: "فشل جلب الكوكيز." };

    const params = {
      source_url: `/search/pins/?q=${encodeURIComponent(searchQuery)}`,
      data: JSON.stringify({
        options: {
          isPrefetch: false,
          query: searchQuery,
          scope: "pins",
          bookmarks: [""],
          page_size: 40,
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
      return { status: false, message: "لم يتم العثور على نتائج تطقيم." };

    const shuffled = results.sort(() => 0.5 - Math.random());
    return { status: true, pins: shuffled.map(v => v.images.orig.url) };
  } catch (e) {
    return { status: false, message: "حدث خطأ في البحث عن التطقيم." };
  }
}

// دالة لقص الصورة إلى نصفين متساويين (للتطقيم الثنائي)
async function splitImageDouble(imageUrl) {
  try {
    const image = await Jimp.read(imageUrl);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const halfWidth = Math.floor(width / 2);

    const leftPart = image.clone().crop({ x: 0, y: 0, w: halfWidth, h: height });
    const leftBuffer = await leftPart.getBuffer("image/jpeg");

    const rightPart = image.clone().crop({ x: halfWidth, y: 0, w: width - halfWidth, h: height });
    const rightBuffer = await rightPart.getBuffer("image/jpeg");

    return { status: true, buffers: [leftBuffer, rightBuffer] };
  } catch (e) {
    return { status: false, message: e.message };
  }
}

// دالة لقص الصورة إلى 3 أجزاء متساوية (للتطقيم الثلاثي)
async function splitImageTriple(imageUrl) {
  try {
    const image = await Jimp.read(imageUrl);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const thirdWidth = Math.floor(width / 3);

    const part1 = image.clone().crop({ x: 0, y: 0, w: thirdWidth, h: height });
    const buf1 = await part1.getBuffer("image/jpeg");

    const part2 = image.clone().crop({ x: thirdWidth, y: 0, w: thirdWidth, h: height });
    const buf2 = await part2.getBuffer("image/jpeg");

    const part3 = image.clone().crop({ x: thirdWidth * 2, y: 0, w: width - (thirdWidth * 2), h: height });
    const buf3 = await part3.getBuffer("image/jpeg");

    return { status: true, buffers: [buf1, buf2, buf3] };
  } catch (e) {
    return { status: false, message: e.message };
  }
}

export default {
    command: "تطقيم",
    category: "تحميل",
    description: "جلب تطقيمات مزدوجة والثلاثية بالبحث المباشر عن الشخصيات أو عبر الأقسام مع أزرار تفاعلية",

    execute: async (sock, msg, data) => {
        const input = data.text ? data.text.trim() : "";
        const rawArgs = input.replace(/^\.تطقيم/, "").trim().split(/\s+/);
        
        let mode = ""; // "double" أو "triple"
        let selectedKey = "";
        let cleanWords = [];

        for (const arg of rawArgs) {
            if (arg.toLowerCase() === "ثلاثي") {
                mode = "triple";
            } else if (arg.toLowerCase() === "ثنائي") {
                mode = "double";
            } else if ((categoriesDouble[arg] || categoriesTriple[arg]) && !selectedKey) {
                selectedKey = arg;
            } else {
                cleanWords.push(arg);
            }
        }

        const query = cleanWords.join(" ");

        try {
            await sock.sendMessage(data.jid, { react: { text: '⏳', key: msg.key } });
        } catch {}

        // 💡 دعم البحث المباشر بالاسم (مثال: .تطقيم ناروتو أو .تطقيم ثلاثي ساسكي) دون الحاجة لاختيار رقم القائمة
        if (query && (mode || selectedKey)) {
            const isTriple = mode === "triple";
            const catMap = isTriple ? categoriesTriple : categoriesDouble;
            const chosenCategory = catMap[selectedKey] || catMap["7"];
            const finalSearchQuery = `${query} ${chosenCategory.query}`;

            let searchResult = await searchPinterest(finalSearchQuery);
            if (!searchResult.status || searchResult.pins.length === 0) {
                searchResult = await searchPinterest(`${query} matching pfp`);
                if (!searchResult.status || searchResult.pins.length === 0) {
                    return await sock.sendMessage(data.jid, { text: `[❌] لم يتم العثور على تطقيم باسم: "${query}".` }, { quoted: msg });
                }
            }

            let targetPin = searchResult.pins[0];
            let displayTitle = `${query} (${chosenCategory.name})`;

            if (isTriple) {
                let splitRes = await splitImageTriple(targetPin);
                if (!splitRes.status) return await sock.sendMessage(data.jid, { text: `❌ فشل قص صورة التطقيم الثلاثي.` }, { quoted: msg });

                for (let i = 0; i < 3; i++) {
                    await sock.sendMessage(data.jid, {
                        image: splitRes.buffers[i],
                        caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ البحث : ${displayTitle}*\n*┤ البروفايل (${i + 1} / 3) 👤*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    }, { quoted: msg });
                }
                return await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
            } else {
                let splitRes = await splitImageDouble(targetPin);
                if (!splitRes.status) return await sock.sendMessage(data.jid, { text: `❌ فشل قص صورة التطقيم الثنائي.` }, { quoted: msg });

                await sock.sendMessage(data.jid, {
                    image: splitRes.buffers[0],
                    caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ البحث : ${displayTitle}*\n*┤ النصف الأول (صورتك / اليمين) 👤*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });

                await sock.sendMessage(data.jid, {
                    image: splitRes.buffers[1],
                    caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ البحث : ${displayTitle}*\n*┤ النصف الثاني (صورتها / اليسار) 👥*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });

                return await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
            }
        }

        // 1. إذا كتب المستخدم اسم الشخصية مباشرة بدون تحديد ثنائي أو ثلاثي (مثال: .تطقيم غوجو) -> نعتبرها ثنائي افتراضياً أو نبحث عنها مباشرة
        if (query && !mode && !selectedKey) {
            let searchResult = await searchPinterest(`${query} matching pfp couple anime`);
            if (!searchResult.status || searchResult.pins.length === 0) {
                searchResult = await searchPinterest(`${query} matching icons`);
                if (!searchResult.status || searchResult.pins.length === 0) {
                    return await sock.sendMessage(data.jid, { text: `[❌] لم يتم العثور على تطقيم بالاسم: "${query}".` }, { quoted: msg });
                }
            }

            let targetPin = searchResult.pins[0];
            let splitRes = await splitImageDouble(targetPin);
            if (!splitRes.status) return await sock.sendMessage(data.jid, { text: `❌ فشل قص صورة التطقيم.` }, { quoted: msg });

            await sock.sendMessage(data.jid, {
                image: splitRes.buffers[0],
                caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ بحث مباشر : ${query}*\n*┤ النصف الأول (يمين) 👤*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });

            await sock.sendMessage(data.jid, {
                image: splitRes.buffers[1],
                caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ بحث مباشر : ${query}*\n*┤ النصف الثاني (يسار) 👥*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });

            return await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
        }

        // 2. القائمة الرئيسية (ولم يحدد ثنائي أو ثلاثي أو نوع معين)
        if (!mode && !selectedKey) {
            let menuText = 
`*╔═══════════════════════════╗*
*👑 𝐀𝐑𝐓𝐇𝐔𝐑 | مركز خيارات التطقيم 👑*
*╚═══════════════════════════╝*

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📌 يرجى اختيار نظام التطقيم المطلوب:*
*┃*
*┃ 👥 .تطقيم ثنائي*
*┃    (تطقيم خاص بولد وبنت / بروفايلين متصلين)*
*┃*
*┃ 👨‍👦‍👦 .تطقيم ثلاثي*
*┃    (تطقيم لثلاثة أصدقاء / شلة / 3 صور متصلة)*
*┃*
*┃ 🔍 يمكنك البحث بالاسم مباشرة مثل:*
*┃    • .تطقيم ناروتو*
*┃    • .تطقيم ثلاثي ساسكي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            const buttonsArray = [
                { displayText: "👥 تطقيم ثنائي (ولد وبنت)", id: ".تطقيم ثنائي" },
                { displayText: "👨‍👦‍👦 تطقيم ثلاثي (شلة أصدقاء)", id: ".تطقيم ثلاثي" }
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

            let fallbackMenu = `${menuText}\n\n*📌 أو اكتب مباشرة:\n• .تطقيم ثنائي\n• .تطقيم ثلاثي\n• .تطقيم [اسم الشخصية]*`;
            return await sock.sendMessage(data.jid, { text: fallbackMenu }, { quoted: msg });
        }

        // 3. إذا اختار المستخدم "تطقيم ثلاثي" بدون تحديد الرقم
        if (mode === "triple" && !selectedKey) {
            let menuText = 
`*╔═══════════════════════════╗*
*👑 𝐀𝐑𝐓𝐇𝐔𝐑 | أنواع التطقيم الثلاثي 👑*
*╚═══════════════════════════╝*

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📌 اختر نوع التطقيم الثلاثي للشلة:*
*┃*
*┃ 1️⃣ شلة الأصدقاء الثلاثة ⚡*
*┃ 2️⃣ ثلاثي أبطال الأكشن ⚔️*
*┃ 3️⃣ فريق الكيوت واللطافة ✨*
*┃ 4️⃣ نظرات وتواصل ثلاثي 👀*
*┃ 5️⃣ ثلاثي المافيا والغموض 🖤*
*┃ 6️⃣ عصابة النينجا أو القوى 🌀*
*┃ 7️⃣ عشوائي ثلاثي فخم 👑*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            const buttonsArray = [
                { displayText: "1️⃣ شلة الأصدقاء", id: ".تطقيم ثلاثي 1" },
                { displayText: "2️⃣ ثلاثي الأكشن", id: ".تطقيم ثلاثي 2" },
                { displayText: "3️⃣ فريق اللطافة", id: ".تطقيم ثلاثي 3" },
                { displayText: "4️⃣ نظرات ثلاثية", id: ".تطقيم ثلاثي 4" },
                { displayText: "5️⃣ مافيا وغموض", id: ".تطقيم ثلاثي 5" },
                { displayText: "6️⃣ عصابة ونينجا", id: ".تطقيم ثلاثي 6" },
                { displayText: "7️⃣ عشوائي ثلاثي", id: ".تطقيم ثلاثي 7" }
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

            let fallbackMenu = `${menuText}\n\n*📌 أو اكتب الرقم مباشرة:\n• .تطقيم ثلاثي [1-7]*`;
            return await sock.sendMessage(data.jid, { text: fallbackMenu }, { quoted: msg });
        }

        // 4. إذا اختار المستخدم "تطقيم ثنائي" بدون تحديد الرقم
        if (mode === "double" && !selectedKey) {
            let menuText = 
`*╔═══════════════════════════╗*
*👑 𝐀𝐑𝐓𝐇𝐔𝐑 | أنواع التطقيم الثنائي 👑*
*╚═══════════════════════════╝*

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
*┃ 📌 اختر نوع التطقيم الثنائي:*
*┃*
*┃ 1️⃣ إمساك يد / تلامس 🤝*
*┃ 2️⃣ مشهد رومانسي متصل 💞*
*┃ 3️⃣ نظرات عيون متبادلة 👀*
*┃ 4️⃣ كتف بكتف / فخم 🖤*
*┃ 5️⃣ قتال وحماس (أكشن) ⚡*
*┃ 6️⃣ لطيف ومشاكس (كواي) ✨*
*┃ 7️⃣ عشوائي فخم وخاص 👑*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            const buttonsArray = [
                { displayText: "1️⃣ إمساك يد", id: ".تطقيم ثنائي 1" },
                { displayText: "2️⃣ مشهد رومانسي", id: ".تطقيم ثنائي 2" },
                { displayText: "3️⃣ نظرات متبادلة", id: ".تطقيم ثنائي 3" },
                { displayText: "4️⃣ كتف بكتف", id: ".تطقيم ثنائي 4" },
                { displayText: "5️⃣ أكشن وحماس", id: ".تطقيم ثنائي 5" },
                { displayText: "6️⃣ لطيف ومشاكس", id: ".تطقيم ثنائي 6" },
                { displayText: "7️⃣ عشوائي فخم", id: ".تطقيم ثنائي 7" }
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

            let fallbackMenu = `${menuText}\n\n*📌 أو اكتب الرقم مباشرة:\n• .تطقيم ثنائي [1-7]*`;
            return await sock.sendMessage(data.jid, { text: fallbackMenu }, { quoted: msg });
        }

        // 5. التنفيذ الاقتصادي واختيار القالب برقم التصنيف المحدد
        const isTriple = mode === "triple";
        const catMap = isTriple ? categoriesTriple : categoriesDouble;
        const chosenCategory = catMap[selectedKey] || catMap["7"];
        const finalSearchQuery = query ? `${query} ${chosenCategory.query}` : chosenCategory.query;

        let searchResult = await searchPinterest(finalSearchQuery);
        if (!searchResult.status || searchResult.pins.length === 0) {
            searchResult = await searchPinterest(chosenCategory.query);
            if (!searchResult.status || searchResult.pins.length === 0) {
                return await sock.sendMessage(data.jid, { text: `[❌] لم يتم العثور على صور تطقيم مطابقة.` }, { quoted: msg });
            }
        }

        let targetPin = searchResult.pins[0];
        let displayTitle = query ? `${query} (${chosenCategory.name})` : chosenCategory.name;

        if (isTriple) {
            let splitRes = await splitImageTriple(targetPin);
            if (!splitRes.status) {
                return await sock.sendMessage(data.jid, { text: `❌ فشل قص صورة التطقيم الثلاثي.` }, { quoted: msg });
            }

            try {
                for (let i = 0; i < 3; i++) {
                    await sock.sendMessage(
                        data.jid,
                        {
                            image: splitRes.buffers[i],
                            caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ التصنيف الثلاثي : ${displayTitle}*\n*┤ الشرح : ${chosenCategory.desc}*\n*┤ البروفايل (${i + 1} / 3) 👤*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                        },
                        { quoted: msg }
                    );
                }
                await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
            } catch (e) {
                return await sock.sendMessage(data.jid, { text: `❌ حدث خطأ أثناء إرسال صور التطقيم الثلاثي.` }, { quoted: msg });
            }

        } else {
            let splitRes = await splitImageDouble(targetPin);
            if (!splitRes.status) {
                return await sock.sendMessage(data.jid, { text: `❌ فشل قص صورة التطقيم الثنائي.` }, { quoted: msg });
            }

            try {
                await sock.sendMessage(
                    data.jid,
                    {
                        image: splitRes.buffers[0],
                        caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ التصنيف الثنائي : ${displayTitle}*\n*┤ الشرح : ${chosenCategory.desc}*\n*┤ النصف الأول (صورتك / اليمين) 👤*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );

                await sock.sendMessage(
                    data.jid,
                    {
                        image: splitRes.buffers[1],
                        caption: `*╭━━〔 👑 ARTHUR BOT HD ⚡ 〕━━╮*\n*┤ التصنيف الثنائي : ${displayTitle}*\n*┤ الشرح : ${chosenCategory.desc}*\n*┤ النصف الثاني (صورتها / اليسار) 👥*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    },
                    { quoted: msg }
                );

                await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });
            } catch (e) {
                return await sock.sendMessage(data.jid, { text: `❌ حدث خطأ أثناء إرسال صور التطقيم الثنائي.` }, { quoted: msg });
            }
        }
    }
};
