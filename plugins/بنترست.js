import axios from 'axios';
import {
  proto,
  generateWAMessageContent,
  generateWAMessageFromContent
} from '@whiskeysockets/baileys';

const BASE_URL = 'https://www.pinterest.com';
const SEARCH_URL = `${BASE_URL}/resource/BaseSearchResource/get/`;
const MAX_IMAGES = 30;
const CARDS_PER_CAROUSEL = 10;

const HEADERS = {
  accept: 'application/json, text/javascript, */*, q=0.01',
  referer: `${BASE_URL}/`,
  origin: BASE_URL,
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
  'x-pinterest-appstate': 'active',
  'x-pinterest-pws-handler': 'www/[username]/[slug].js'
};

const http = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  validateStatus: status => status >= 200 && status < 300
});

function getJid(msg, data) {
  return (
    data?.jid ||
    data?.chat ||
    msg?.key?.remoteJid ||
    msg?.chat ||
    null
  );
}

function getQuery(data = {}) {
  if (Array.isArray(data.args) && data.args.length) {
    const args = [...data.args];

    if (/^(بنترست|بينترست|بينتر|pinterest)$/i.test(String(args[0]))) {
      args.shift();
    }

    if (args.length) return args.join(' ').trim();
  }

  for (const key of ['query', 'noPrefixText', 'text']) {
    let value = data[key];

    if (Array.isArray(value)) value = value.join(' ');
    if (typeof value !== 'string') continue;

    value = value.trim();
    if (!value) continue;

    value = value.replace(
      /^(?:[.!/#،]\s*)?(?:بنترست|بينترست|بينتر|pinterest)\b\s*/i,
      ''
    ).trim();

    if (value) return value;
  }

  return '';
}

async function getCookies() {
  const response = await http.get(BASE_URL, {
    headers: HEADERS
  });

  const setCookie = response.headers['set-cookie'];

  if (!Array.isArray(setCookie) || !setCookie.length) {
    throw new Error('Pinterest did not provide session cookies');
  }

  return setCookie.map(cookie => cookie.split(';')[0]).join('; ');
}

function extractImageUrls(response) {
  const results = response?.resource_response?.data?.results;

  if (!Array.isArray(results)) return [];

  const urls = [];

  for (const pin of results) {
    const images = pin?.images || {};

    const url =
      images.orig?.url ||
      images['1200x']?.url ||
      images['736x']?.url ||
      images['564x']?.url ||
      images['474x']?.url ||
      images['236x']?.url;

    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      urls.push(url);
    }
  }

  return [...new Set(urls)];
}

async function searchPinterest(query, limit = MAX_IMAGES) {
  const cookies = await getCookies();
  const found = new Set();

  let bookmark = '';
  let page = 0;

  while (found.size < limit && page < 8) {
    page++;

    const params = {
      source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
      data: JSON.stringify({
        options: {
          query,
          scope: 'pins',
          bookmarks: bookmark ? [bookmark] : [''],
          page_size: 50,
          isPrefetch: false
        },
        context: {}
      }),
      _: Date.now()
    };

    const response = await http.get(SEARCH_URL, {
      headers: {
        ...HEADERS,
        cookie: cookies
      },
      params
    });

    const resource = response.data?.resource_response;

    if (resource?.status && resource.status !== 'success') {
      throw new Error(
        `Pinterest search failed: ${resource.message || resource.status}`
      );
    }

    const urls = extractImageUrls(response.data);

    for (const url of urls) {
      found.add(url);
      if (found.size >= limit) break;
    }

    const next = resource?.bookmark;

    if (!next || next === '-end-' || next === bookmark || !urls.length) {
      break;
    }

    bookmark = next;
  }

  return [...found].slice(0, limit);
}

async function downloadImage(url) {
  const response = await http.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'user-agent': HEADERS['user-agent'],
      referer: `${BASE_URL}/`
    }
  });

  const contentType = String(
    response.headers['content-type'] || ''
  ).toLowerCase();

  if (!contentType.startsWith('image/')) {
    throw new Error(`URL did not return an image: ${contentType}`);
  }

  const buffer = Buffer.from(response.data);

  if (buffer.length < 1000) {
    throw new Error('Image is empty or too small');
  }

  return buffer;
}

async function makeCard(sock, url, index, query) {
  const buffer = await downloadImage(url);

  if (typeof sock.waUploadToServer !== 'function') {
    throw new Error('Socket waUploadToServer is unavailable');
  }

  const { imageMessage } = await generateWAMessageContent(
    { image: buffer },
    { upload: sock.waUploadToServer }
  );

  if (!imageMessage) {
    throw new Error('Baileys could not prepare the image');
  }

  return proto.Message.InteractiveMessage.Card.fromObject({
    body: proto.Message.InteractiveMessage.Body.fromObject({
      text: `📸 صورة ${index} | 🔎 ${query}`
    }),

    header: proto.Message.InteractiveMessage.Header.fromObject({
      hasMediaAttachment: true,
      imageMessage
    }),

    nativeFlowMessage:
      proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '📌 فتح Pinterest',
              url: `${BASE_URL}/search/pins/?q=${encodeURIComponent(query)}`
            })
          }
        ]
      })
  });
}

async function sendCarousel(sock, jid, quoted, cards, query, batch, total) {
  const interactiveMessage =
    proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.create({
        text:
          `📌 نتائج Pinterest: ${query}\n` +
          `🖼️ صور هذه المجموعة: ${cards.length}\n` +
          `📚 المجموعة ${batch} | إجمالي الصور: ${total}`
      }),

      footer: proto.Message.InteractiveMessage.Footer.create({
        text: globalThis.watermark || '🩸 ARTHUR BOT 🩸'
      }),

      carouselMessage:
        proto.Message.InteractiveMessage.CarouselMessage.fromObject({
          cards
        })
    });

  const message = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: { interactiveMessage }
      }
    },
    { quoted }
  );

  await sock.relayMessage(jid, message.message, {
    messageId: message.key.id
  });
}

export default {
  name: 'بنترست',
  command: ['بنترست', 'بينترست', 'بينتر', 'pinterest'],
  aliases: ['pin'],
  category: 'media',
  description: 'البحث عن صور Pinterest وإرسالها في Carousel',
  usage: '.بنترست anime',

  async execute(sock, msg, data = {}) {
    const jid = getJid(msg, data);

    if (!jid) {
      console.error('[ARTHUR PINTEREST] Could not determine chat JID');
      return;
    }

    const query = getQuery(data);
    let stage = 'قراءة أمر البحث';
    let progress;

    const react = async emoji => {
      try {
        if (msg?.key) {
          await sock.sendMessage(jid, {
            react: { text: emoji, key: msg.key }
          });
        }
      } catch {}
    };

    if (!query) {
      await sock.sendMessage(
        jid,
        { text: '📌 أرسل كلمة البحث.\nمثال: .بنترست anime' },
        { quoted: msg }
      );
      return;
    }

    try {
      stage = 'إضافة تفاعل البحث';
      await react('🔎');

      stage = 'إرسال رسالة الانتظار';
      progress = await sock.sendMessage(
        jid,
        {
          text: `🔎 يبحث ARTHUR BOT عن صور Pinterest لـ: ${query}\nيرجى الانتظار...`
        },
        { quoted: msg }
      );

      stage = 'الاتصال بـ Pinterest واستخراج النتائج';
      const imageUrls = await searchPinterest(query, MAX_IMAGES);

      console.log(
        `[ARTHUR PINTEREST] Search returned ${imageUrls.length} images`
      );

      if (!imageUrls.length) {
        stage = 'لا توجد نتائج صور';
        throw new Error(
          'Pinterest returned no usable image URLs for this query'
        );
      }

      stage = 'تجهيز الصور';
      const cards = [];

      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const card = await makeCard(
            sock,
            imageUrls[i],
            cards.length + 1,
            query
          );

          cards.push(card);
        } catch (error) {
          console.error('[ARTHUR PINTEREST IMAGE ERROR]', {
            imageNumber: i + 1,
            message: error?.message || String(error)
          });
        }
      }

      if (!cards.length) {
        stage = 'فشل تجهيز جميع الصور';
        throw new Error(
          'Search returned image URLs, but no image could be prepared'
        );
      }

      stage = 'حذف رسالة الانتظار';

      if (progress?.key) {
        try {
          await sock.sendMessage(jid, {
            delete: progress.key
          });
        } catch (error) {
          console.error(
            '[ARTHUR PINTEREST] Could not delete progress message:',
            error?.message || error
          );
        }
      }

      stage = 'إرسال Carousel إلى واتساب';

      for (
        let start = 0, batch = 1;
        start < cards.length;
        start += CARDS_PER_CAROUSEL, batch++
      ) {
        const group = cards.slice(start, start + CARDS_PER_CAROUSEL);

        stage = `إرسال Carousel رقم ${batch}`;

        await sendCarousel(
          sock,
          jid,
          msg,
          group,
          query,
          batch,
          cards.length
        );
      }

      stage = 'إنهاء الأمر';
      await react('✅');

      console.log(
        `[ARTHUR PINTEREST] Success: query="${query}", images=${cards.length}`
      );
    } catch (error) {
      console.error('[ARTHUR PINTEREST ERROR]', {
        stage,
        query,
        status: error?.response?.status,
        response: error?.response?.data,
        message: error?.message || String(error),
        stack: error?.stack
      });

      await react('❌');

      try {
        if (progress?.key) {
          await sock.sendMessage(jid, {
            delete: progress.key
          });
        }
      } catch {}

      try {
        await sock.sendMessage(
          jid,
          {
            text:
              `❌ تعذر تنفيذ أمر Pinterest.\n` +
              `📍 المرحلة: ${stage}\n` +
              `⚠️ السبب: ${error?.message || 'خطأ غير معروف'}\n` +
              'راجع سجل تشغيل البوت لمعرفة التفاصيل.'
          },
          { quoted: msg }
        );
      } catch (sendError) {
        console.error(
          '[ARTHUR PINTEREST ERROR MESSAGE FAILED]',
          sendError?.stack || sendError
        );
      }
    }
  }
};