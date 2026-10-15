import axios from 'axios';
import { Carousel } from '../utils/nixcode.js';

const BASE_URL = 'https://www.pinterest.com';
const SEARCH_URL = "${BASE_URL}/resource/BaseSearchResource/get/";

const HEADERS = {
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
'Accept': 'application/json, text/javascript, /; q=0.01',
'X-Requested-With': 'XMLHttpRequest',
'Referer': 'https://www.pinterest.com/',
};

const MODIFIERS = [
'', 'aesthetic', 'wallpaper', 'hd 4k',
'art', 'cool', 'epic', 'Vibes',
];

function shuffle(array) {
const result = [...array];

for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
}

return result;

}

function extractImages(data) {
const pins = data?.resource_response?.data?.results || [];
const seen = new Set();
const images = [];

for (const pin of pins) {
    const image =
        pin?.images?.orig?.url ||
        pin?.images?.['736x']?.url ||
        pin?.images?.['474x']?.url;

    if (!image || !/^https?:\/\//i.test(image) || seen.has(image)) {
        continue;
    }

    seen.add(image);
    images.push({
        url: image,
        title: String(pin?.grid_title || pin?.title || 'Pinterest').slice(0, 80),
    });
}

return images;

}

async function searchPinterest(query) {
const modifier = MODIFIERS[
Math.floor(Math.random() * MODIFIERS.length)
];

const searchQuery = [query, modifier].filter(Boolean).join(' ');
const params = {
    source_url: `/search/pins/?q=${encodeURIComponent(searchQuery)}`,
    data: JSON.stringify({
        options: {
            query: searchQuery,
            scope: 'pins',
            page_size: 50,
            bookmarks: [],
        },
        context: {},
    }),
};

const response = await axios.get(SEARCH_URL, {
    params,
    headers: HEADERS,
    timeout: 20000,
});

return shuffle(extractImages(response.data)).slice(0, 30);

}

export default {
name: 'بنترست',
command: ['بنترست'],
category: 'تحميل',
description: 'البحث عن 30 صورة من Pinterest وعرضها في شريط أفقي',
usage: '.بنترست اسم الصورة',

execute: async (sock, msg, data) => {
    const jid = data?.jid || msg?.key?.remoteJid;
    const query = String(data?.text || '').trim();

    if (!jid) return;

    if (!query) {
        await sock.sendMessage(
            jid,
            { text: '🩸 اكتب ما تريد البحث عنه.\n\nمثال:\n.بنترست anime wallpaper' },
            { quoted: msg }
        );
        return;
    }

    try {
        await sock.sendMessage(
            jid,
            { text: `🔎 جارٍ البحث عن: ${query}\n⏳ انتظر تجهيز الصور...` },
            { quoted: msg }
        );

        const images = await searchPinterest(query);

        if (!images.length) {
            await sock.sendMessage(
                jid,
                { text: '❌ لم أجد صورًا. جرّب عبارة بحث أخرى.' },
                { quoted: msg }
            );
            return;
        }

        const carousel = new Carousel(sock);

        carousel
            .setBody(`🩸 نتائج Pinterest: ${query}\nعدد الصور: ${images.length}`)
            .setFooter('◇❐ ═━━━╾ 🩸 ╼━━━═ ❐◇');

        // تجهيز كل صورة كبطاقة مستقلة داخل الشريط.
        const cards = images.map((item, index) => ({
            image: item.url,
            body: {
                text: `الصورة ${index + 1} من ${images.length}`,
            },
            footer: {
                text: item.title || 'Pinterest',
            },
            header: {
                title: `Pinterest ${index + 1}`,
                subtitle: item.title || query,
                hasMediaAttachment: true,
            },
            nativeFlowMessage: {
                messageParamsJson: JSON.stringify({}),
                buttons: [],
            },
        }));

        await carousel.addCard(cards);
        await carousel.send(jid);

    } catch (error) {
        console.error('[بنترست] Error:', error?.response?.status || error?.message || error);

        await sock.sendMessage(
            jid,
            {
                text: '❌ تعذر جلب صور Pinterest أو إنشاء الشريط.\nجرّب مرة أخرى بعد قليل.',
            },
            { quoted: msg }
        );
    }
},

};