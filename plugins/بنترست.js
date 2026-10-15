import axios from 'axios';
import { Carousel } from '../utils/nixcode.js';

const MAX_IMAGES = 30;
const CARDS_PER_CAROUSEL = 10;
const TIMEOUT = 20000;

const DECORATION =
    '*⚔️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 ⚔️*\n' +
    '*⚔━━━〔 武 〕━━━⚔*';

const FOOTER = '*⚔━━━━━━━━━━⚔*';

function getJid(msg, data) {
    return (
        data?.jid ||
        msg?.key?.remoteJid ||
        msg?.chat ||
        null
    );
}

function extractImages(response) {
    const data = response?.data;
    const results = [];

    function addImage(item) {
        if (!item || typeof item !== 'object') return;

        const images = item.images || {};
        const url =
            images.orig?.url ||
            images['736x']?.url ||
            images['474x']?.url ||
            item.image?.url ||
            item.image_url ||
            item.url;

        if (typeof url !== 'string') return;
        if (!/^https?:\/\//i.test(url)) return;

        results.push({
            url,
            title: String(
                item.title ||
                item.grid_title ||
                item.description ||
                'Pinterest'
            ).slice(0, 100)
        });
    }

    function walk(value, depth = 0) {
        if (!value || depth > 7) return;

        if (Array.isArray(value)) {
            for (const item of value) {
                if (item && typeof item === 'object') {
                    addImage(item);
                    walk(item, depth + 1);
                }
            }
            return;
        }

        if (typeof value !== 'object') return;

        if (Array.isArray(value.results)) {
            walk(value.results, depth + 1);
        }

        if (Array.isArray(value.data)) {
            walk(value.data, depth + 1);
        }

        if (Array.isArray(value.items)) {
            walk(value.items, depth + 1);
        }

        if (Array.isArray(value.pin)) {
            walk(value.pin, depth + 1);
        }

        for (const [key, child] of Object.entries(value)) {
            if (
                key === 'results' ||
                key === 'data' ||
                key === 'items' ||
                key === 'pin'
            ) continue;

            if (child && typeof child === 'object') {
                walk(child, depth + 1);
            }
        }
    }

    walk(data);

    const seen = new Set();

    return results.filter(item => {
        const normalized = item.url.split('?')[0];

        if (seen.has(normalized)) return false;

        seen.add(normalized);
        return true;
    });
}

async function searchPinterest(query) {
    const url =
        'https://www.pinterest.com/resource/BaseSearchResource/get/';

    const params = {
        source_url:
            `/search/pins/?q=${encodeURIComponent(query)}`,
        data: JSON.stringify({
            options: {
                query,
                scope: 'pins',
                bookmarks: [],
                page_size: MAX_IMAGES
            },
            context: {}
        })
    };

    const response = await axios.get(url, {
        params,
        timeout: TIMEOUT,
        maxRedirects: 5,
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                'Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.pinterest.com/',
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    const images = extractImages(response);

    if (!images.length) {
        throw new Error(
            'Pinterest لم يُرجع صورًا قابلة للاستخراج.'
        );
    }

    return images.slice(0, MAX_IMAGES);
}

async function sendCarousel(sock, jid, query, images, msg) {
    const totalGroups = Math.ceil(
        images.length / CARDS_PER_CAROUSEL
    );

    for (let group = 0; group < totalGroups; group++) {
        const batch = images.slice(
            group * CARDS_PER_CAROUSEL,
            (group + 1) * CARDS_PER_CAROUSEL
        );

        const carousel = new Carousel(sock);

        carousel
            .setBody(
                `نتائج Pinterest عن: ${query}\n` +
                `الشريط ${group + 1} من ${totalGroups}`
            )
            .setFooter('ARTHUR BOT • Pinterest');

        const cards = batch.map((item, index) => ({
            image: item.url,
            header: {
                title: `الصورة ${group * CARDS_PER_CAROUSEL + index + 1}`,
                subtitle: item.title || query,
                hasMediaAttachment: true
            },
            body: {
                text: item.title || query
            },
            footer: {
                text: 'Pinterest'
            },
            nativeFlowMessage: {
                messageParamsJson: '{}',
                buttons: []
            }
        }));

        await carousel.addCard(cards);
        await carousel.send(jid);
    }
}

export default {
    name: 'بنترست',
    command: ['بنترست', 'pinterest', 'بنتر'],
    category: 'الصور',
    description: 'البحث عن صور Pinterest',

    async execute(sock, msg, data) {
        const jid = getJid(msg, data);

        const query = String(
            data?.text ||
            data?.args?.join?.(' ') ||
            ''
        ).trim();

        if (!jid) return;

        if (!query) {
            return sock.sendMessage(
                jid,
                {
                    text:
                        `${DECORATION}\n\n` +
                        '⚠️ اكتب ما تريد البحث عنه.\n\n' +
                        'مثال: .بنترست anime wallpaper\n\n' +
                        `${FOOTER}`
                },
                { quoted: msg }
            );
        }

        if (query.length > 150) {
            return sock.sendMessage(
                jid,
                {
                    text:
                        `${DECORATION}\n\n` +
                        '⚠️ عبارة البحث طويلة جدًا.\n\n' +
                        `${FOOTER}`
                },
                { quoted: msg }
            );
        }

        await sock.sendMessage(
            jid,
            {
                text:
                    `${DECORATION}\n\n` +
                    '🔎 جارٍ البحث عن الصور...\n\n' +
                    `${FOOTER}`
            },
            { quoted: msg }
        );

        try {
            const images = await searchPinterest(query);

            await sendCarousel(
                sock,
                jid,
                query,
                images,
                msg
            );
        } catch (error) {
            console.error(
                '[ARTHUR PINTEREST ERROR]',
                error?.response?.status || '',
                error?.message || error,
                error?.stack || ''
            );

            await sock.sendMessage(jid, {
                text:
                    `${DECORATION}\n\n` +
                    '❌ تعذر البحث أو إرسال الصور.\n' +
                    'قد يكون Pinterest قد رفض الطلب، أو تعذر تجهيز إحدى الصور.\n' +
                    'راجع سجل تشغيل البوت لمعرفة السبب.\n\n' +
                    `${FOOTER}`
            }).catch(sendError => {
                console.error(
                    '[ARTHUR PINTEREST SEND ERROR]',
                    sendError?.message || sendError
                );
            });
        }
    }
};