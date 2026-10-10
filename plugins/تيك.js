import fs from "fs";
import path from "path";
import axios from "axios";

const API_KEY =
    "1d2522dd7ba811e1f189ddce12156dffa21eadea457188aa8c97829990ade12f";

const API_BASE =
    "https://tiktokapi.store/api/v1";

/*
 * التخزين يكون على مستوى العملية نفسها
 * ولا يعتمد على البحث مرة ثانية.
 */
if (!globalThis.tiktokSelections) {
    globalThis.tiktokSelections = new Map();
}

const CACHE_TIME = 10 * 60 * 1000;

function cleanName(name) {
    return String(name || "TikTok")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 70);
}

async function apiGet(endpoint, params = {}) {
    const response = await axios.get(
        `${API_BASE}${endpoint}`,
        {
            params,
            timeout: 60000,
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: "application/json",
                "User-Agent":
                    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Safari/537.36"
            }
        }
    );

    if (
        response.data?.code !== undefined &&
        response.data.code !== 0
    ) {
        throw new Error(
            response.data?.msg ||
            `TikTok API Error ${response.data.code}`
        );
    }

    return response.data;
}

function getTikTokUrl(video) {
    if (video.url) return video.url;
    if (video.share_url) return video.share_url;
    if (video.shareUrl) return video.shareUrl;

    const id =
        video.id ||
        video.video_id ||
        video.videoId;

    const username =
        video.author?.unique_id ||
        video.author?.uniqueId ||
        video.author?.username;

    if (id && username) {
        return `https://www.tiktok.com/@${username}/video/${id}`;
    }

    return null;
}

function getPlayUrl(video) {
    return (
        video.play ||
        video.play_url ||
        video.playUrl ||
        video.wmplay ||
        video.wm_play ||
        null
    );
}

async function downloadVideo(url, output) {
    const response = await axios.get(
        url,
        {
            responseType: "stream",
            timeout: 120000,
            maxRedirects: 10,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Safari/537.36",
                Accept: "video/mp4,video/*,*/*"
            }
        }
    );

    const type =
        String(
            response.headers["content-type"] || ""
        ).toLowerCase();

    if (
        type.includes("text/html") ||
        type.includes("application/json")
    ) {
        throw new Error(
            "رابط التحميل لم يرجع ملف فيديو مباشر."
        );
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

    if (stats.size > 50 * 1024 * 1024) {
        throw new Error("حجم الفيديو أكبر من 50MB.");
    }

    return stats;
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

export default {

    command: [
        "تيك",
        "tiktok",
        "تيكتوك",
        "تحميلتيك"
    ],

    category: "التحميل",

    description:
        "البحث عن فيديوهات TikTok وتحميلها",

    execute: async (
        sock,
        m,
        { noPrefixText, jid }
    ) => {

        let file = null;

        try {

            cleanupSelections();

            const raw =
                String(noPrefixText || "").trim();

            const parts =
                raw.split(/\s+/);

            const command =
                String(parts.shift() || "")
                    .replace(/^\./, "")
                    .toLowerCase();

            const input =
                parts.join(" ").trim();

            if (!input) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⚠️ اكتب اسم الفيديو.\n\n" +
                            "📌 مثال:\n" +
                            ".تيك ملاعين"
                    },
                    { quoted: m }
                );
            }

            /*
             * =====================================
             * تحميل فيديو تم اختياره من الأزرار
             * =====================================
             */

            if (
                command === "تحميلتيك" ||
                input.startsWith("tk_")
            ) {

                const selected =
                    globalThis.tiktokSelections.get(
                        input
                    );

                if (!selected) {
                    return await sock.sendMessage(
                        jid,
                        {
                            text:
                                "❌ انتهت صلاحية هذا الزر.\n\n" +
                                "🔄 ابحث عن الفيديو مرة أخرى."
                        },
                        { quoted: m }
                    );
                }

                await sock.sendMessage(
                    jid,
                    {
                        text:
                            "⬇️ جاري تحميل الفيديو...\n\n" +
                            `🎬 ${selected.title}`
                    },
                    { quoted: m }
                );

                let play =
                    selected.play;

                /*
                 * إذا لم يوجد رابط مباشر
                 * نحاول جلب التفاصيل من API.
                 */

                if (
                    !play &&
                    selected.url
                ) {

                    try {

                        const info =
                            await apiGet(
                                "/video/detail",
                                {
                                    url:
                                        selected.url
                                }
                            );

                        const data =
                            info?.data || {};

                        play =
                            data.play ||
                            data.play_url ||
                            data.playUrl ||
                            data.wmplay ||
                            data.video?.play ||
                            null;

                    } catch {}
                }

                if (!play) {
                    throw new Error(
                        "لم يتم العثور على رابط تحميل الفيديو."
                    );
                }

                file = path.join(
                    process.cwd(),
                    `tiktok_${Date.now()}.mp4`
                );

                await downloadVideo(
                    play,
                    file
                );

                await sock.sendMessage(
                    jid,
                    {
                        video: {
                            url: file
                        },
                        mimetype: "video/mp4",
                        fileName:
                            `${cleanName(selected.title)}.mp4`,
                        caption:
                            `🎬 ${selected.title}\n` +
                            `👤 ${selected.author}\n\n` +
                            `📱 TikTok`
                    },
                    { quoted: m }
                );

                /*
                 * حذف الاختيار بعد نجاح التحميل
                 */
                globalThis.tiktokSelections.delete(
                    input
                );

                return;
            }

            /*
             * =====================================
             * بحث جديد
             * =====================================
             */

            await sock.sendMessage(
                jid,
                {
                    text:
                        "🔎 جاري البحث في TikTok...\n\n" +
                        `🎵 ${input}`
                },
                { quoted: m }
            );

            const result =
                await apiGet(
                    "/search/video",
                    {
                        search_term: input,
                        count: 10,
                        cursor: 0
                    }
                );

            const videos =
                Array.isArray(
                    result?.data?.videos
                )
                    ? result.data.videos
                    : [];

            if (!videos.length) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            "❌ لم أجد فيديوهات.\n\n" +
                            `🔎 البحث: ${input}`
                    },
                    { quoted: m }
                );
            }

            const results =
                videos
                    .slice(0, 5)
                    .map(video => {

                        const id =
                            createID();

                        const title =
                            cleanName(
                                video.title ||
                                video.desc ||
                                "بدون عنوان"
                            );

                        const author =
                            cleanName(
                                video.author?.nickname ||
                                video.author?.unique_id ||
                                "غير معروف"
                            );

                        const item = {
                            time: Date.now(),
                            title,
                            author,
                            url:
                                getTikTokUrl(video),
                            play:
                                getPlayUrl(video)
                        };

                        /*
                         * نخزن الفيديو تحت الـID
                         */
                        globalThis.tiktokSelections.set(
                            id,
                            item
                        );

                        return {
                            id,
                            ...item
                        };
                    });

            /*
             * =====================================
             * إنشاء الأزرار
             * =====================================
             */

            const buttons =
                results.map(
                    (item, index) => {

                        let title =
                            item.title;

                        if (
                            title.length > 28
                        ) {
                            title =
                                title.slice(
                                    0,
                                    25
                                ) + "...";
                        }

                        /*
                         * مهم:
                         * نستخدم أمر مختلف للتحميل
                         */
                        return {
                            displayText:
                                `🎬 ${index + 1} | ${title}`,

                            id:
                                `.تحميلتيك ${item.id}`
                        };
                    }
                );

            const menu =
                `🎬 *نتائج TikTok*\n\n` +
                `🔎 البحث: *${input}*\n` +
                `📊 النتائج: ${results.length}\n\n` +
                `👇 اختر الفيديو الذي تريد تحميله:`;

            /*
             * الأزرار الحقيقية
             */

            if (
                typeof sock.sendRealButtons ===
                "function"
            ) {

                try {

                    return await sock.sendRealButtons(
                        jid,
                        menu,
                        "YUNO TIKTOK",
                        buttons
                    );

                } catch {}
            }

            /*
             * بديل إذا الأزرار غير مدعومة
             */

            let fallback =
                menu + "\n\n";

            results.forEach(
                (item, index) => {

                    fallback +=
                        `*${index + 1}.* ` +
                        `${item.title}\n` +
                        `👤 ${item.author}\n` +
                        `🔗 ${item.url || "غير متوفر"}\n\n`;
                }
            );

            return await sock.sendMessage(
                jid,
                {
                    text: fallback
                },
                { quoted: m }
            );

        } catch (error) {

            let errorText;

            if (error?.response?.data) {
                try {
                    errorText =
                        JSON.stringify(
                            error.response.data,
                            null,
                            2
                        );
                } catch {
                    errorText =
                        String(
                            error.response.data
                        );
                }
            } else {
                errorText =
                    error?.message ||
                    String(error);
            }

            return await sock.sendMessage(
                jid,
                {
                    text:
                        "❌ فشل تحميل فيديو TikTok.\n\n" +
                        "━━━━━━━━━━━━━━━━━━\n" +
                        "📋 الخطأ:\n\n" +
                        String(errorText)
                            .slice(0, 5000) +
                        "\n━━━━━━━━━━━━━━━━━━"
                },
                { quoted: m }
            );

        } finally {

            if (file) {

                setTimeout(() => {

                    try {
                        if (
                            fs.existsSync(file)
                        ) {
                            fs.unlinkSync(file);
                        }
                    } catch {}

                }, 20000);
            }
        }
    }
};
