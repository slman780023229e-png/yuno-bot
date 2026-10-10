import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ButtonV2 } from "../utils/nixcode.js";
import { arthurBox, getDecoration } from "../utils/arthurStyle.js";
import {
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const startTime = Date.now();

// 🚀 نظام التخزين المؤقت الفائق لمنع أي تأخير في الاستجابة
let cachedPluginsData = null;
let lastCacheTime = 0;
const CACHE_TTL = 300000; // تخزين مؤقت لمدة 5 دقائق

const getCommandsImageBuffer = () => {
    const possibleFolders = [
        path.join(__dirname, "../صور"),
        path.join(__dirname, "صور"),
        path.join(process.cwd(), "صور"),
        path.join(process.cwd(), "images")
    ];

    const possibleNames = ["اوامر.jpg", "اوامر.jpeg", "اوامر.png", "اوامر.webp"];

    for (const folderPath of possibleFolders) {
        try {
            if (
                fs.existsSync(folderPath) &&
                fs.lstatSync(folderPath).isDirectory()
            ) {
                for (const imageName of possibleNames) {
                    const imagePath = path.join(folderPath, imageName);
                    if (fs.existsSync(imagePath)) {
                        return fs.readFileSync(imagePath);
                    }
                }
            }
        } catch {}
    }

    return null;
};

export default {
    command: "اوامر",
    category: "النظام",
    description: "عرض واجهة القائمة والأقسام التفاعلية",

    execute: async (sock, msg, data) => {

        sock.sendMessage(data.jid, {
            react: {
                text: "🩸",
                key: msg.key
            }
        }).catch(() => {});

        let input = data.text ? data.text.trim() : "";
        
        const listResponseMessage = msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (listResponseMessage) {
            try {
                const parsed = JSON.parse(listResponseMessage);
                if (parsed.id) {
                    input = parsed.id.trim();
                }
            } catch {}
        }

        if (!input && msg.message?.buttonsResponseMessage?.selectedButtonId) {
            input = msg.message.buttonsResponseMessage.selectedButtonId;
        }

        const chatId = data.jid;

        if (input === ".رابط_القناة" || input.includes("رابط القناة")) {
            return await sock.sendMessage(chatId, {
                text: arthurBox("❌ هذا الرابط غير متاح حاليًا.")
            });
        }

        if (input === ".رابط_المطور" || input.includes("رابط المطور") || input === ".المطور") {
            return await sock.sendMessage(chatId, {
                text: arthurBox("❌ تعذر فتح رابط المطور حاليًا.")
            });
        }

        const now = Date.now();
        let categories, order, totalCommandsCount;

        // ⚡ فحص الذاكرة المؤقتة لضمان السرعة الفورية
        if (cachedPluginsData && (now - lastCacheTime < CACHE_TTL)) {
            categories = cachedPluginsData.categories;
            order = cachedPluginsData.order;
            totalCommandsCount = cachedPluginsData.totalCommandsCount;
        } else {
            const pluginsPath = path.join(__dirname, "../plugins");
            let files = [];

            const scanPlugins = (dir, relative = "") => {
                let entries = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const entry of entries) {
                    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.join(relative, entry.name);
                    if (entry.isDirectory()) scanPlugins(fullPath, relPath);
                    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(relPath);
                }
            };
            try { if (fs.existsSync(pluginsPath)) scanPlugins(pluginsPath); } catch {}

            categories = Object.create(null);
            order = [];
            totalCommandsCount = 0;

            const normalizeCategoryName = (name) => {
                if (!name) return "أخرى";
                const clean = name.trim().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();

                if (/^(مطور|المطور|dev)$/.test(clean)) return "المطور";
                if (/^(الادوات|ادوات|tools?)$/.test(clean)) return "الادوات";
                if (/^(النخبه|نخبه|النخب|elite)$/.test(clean)) return "النخبة";
                if (/^(الادار|اداره|إدارة|admin)$/.test(clean)) return "الإدارة";
                if (/^(التحميل|تحميل|download)$/.test(clean)) return "التحميل";
                if (/^(اسلامي|دين|الدين|islamic)$/.test(clean)) return "الإسلامي";
                if (/^(حماية|الحماية|security)$/.test(clean)) return "الحماية";
                if (/^(الاعضاء|اعضاء|members?)$/.test(clean)) return "الأعضاء";

                return name.trim();
            };

            for (const file of files) {
                if (["قسم.js", "ق.js", "اوامر.js"].includes(path.basename(file))) continue;

                try {
                    const plugin = await import(`../plugins/${file.split(path.sep).join("/")}?t=${Date.now()}`);
                    const cmd = plugin.default;

                    if (!cmd || !cmd.command || !cmd.category) continue;

                    const formattedCategory = normalizeCategoryName(cmd.category);

                    if (!categories[formattedCategory]) {
                        categories[formattedCategory] = [];
                        order.push(formattedCategory);
                    }

                    let rawCommand = cmd.command;
                    let primaryCommand = "";

                    if (Array.isArray(rawCommand)) {
                        primaryCommand = rawCommand[0] ? rawCommand[0].trim() : "";
                    } else if (typeof rawCommand === "string") {
                        const parts = rawCommand.split(/[,،\s]+/);
                        primaryCommand = parts[0] ? parts[0].trim() : "";
                    }

                    if (!primaryCommand) continue;

                    const isDuplicate = categories[formattedCategory].some(c => c.command.toLowerCase() === primaryCommand.toLowerCase());
                    if (!isDuplicate) {
                        categories[formattedCategory].push({
                            command: primaryCommand,
                            description: cmd.description || "لا يوجد وصف"
                        });
                        totalCommandsCount++;
                    }
                } catch {}
            }

            cachedPluginsData = { categories, order, totalCommandsCount };
            lastCacheTime = now;
        }

        const args = input.replace(/^\.اوامر/, "").trim().split(/\s+/);
        const subCommand = args[0] ? args[0].toLowerCase() : "";

        const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const uptimeFormatted = `${hours}س ${minutes}د ${seconds}ث`;

        let botMode = "عام";
        try {
            const possibleModePaths = [
                path.join(__dirname, "../data/مود.json"),
                path.join(process.cwd(), "data/مود.json"),
                path.join(__dirname, "../data/مود")
            ];
            for (const modePath of possibleModePaths) {
                if (!fs.existsSync(modePath)) continue;
                try {
                    const raw = fs.readFileSync(modePath, "utf8");
                    const parsed = JSON.parse(raw || "{}");
                    if (parsed?.elite === true) botMode = "خاص";
                } catch {
                    if (fs.statSync(modePath).isDirectory()) {
                        botMode = "خاص";
                    }
                }
                if (botMode === "خاص") break;
            }
        } catch {}

        const getIcon = (name) => {
            const n = name.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, "");
            const icons = {
                "ادار": "⚙️", "المطور": "👑", "مطور": "👑", "dev": "👑",
                "ادوات": "🛠️", "tool": "🛠️", "النظام": "⭐",
                "تحميل": "📥", "download": "📥", "النخب": "👑", "elite": "👑",
                "الدين": "🕌", "اسلامي": "🕌",
                "حماية": "🛡️", "security": "🛡️", "الاعضاء": "👥", "members": "👥"
            };
            for (const key in icons) {
                if (n.includes(key)) return icons[key];
            }
            return "📂";
        };

        const getCategoryDescription = (name) => {
            const n = name.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, "");
            if (n.includes("نخب") || n.includes("elite")) return "✦ ⚡ أوامر حصرية وخاصة";
            if (n.includes("مطور") || n.includes("dev")) return "✦ ⚡ التحكم الكامل بالنظام";
            if (n.includes("ادار") || n.includes("admin")) return "✦ ⚡ أدوات ضبط الأمن وإدارة المجموعات";
            if (n.includes("حماي")) return "✦ ⚡ درع لحماية المجموعات من التخريب";
            if (n.includes("ادوات") || n.includes("tool")) return "✦ ⚡ ترسانة أدوات لتسهيل مهامك";
            if (n.includes("تحميل") || n.includes("download")) return "✦ ⚡ جلب وسائط ومقاطع من الويب";
            if (n.includes("دين") || n.includes("اسلامي")) return "✦ ⚡ آيات، أذكار، وخدمات إيمانية";
            if (n.includes("اعضاء") || n.includes("member")) return "✦ ⚡ أوامر تفاعلية لكافة الأعضاء";
            return "✦ ⚡ قسم مميز يضم أقوى الخدمات والأوامر";
        };

        const imageBuffer = getCommandsImageBuffer();

        if (!subCommand) {
            let media = null;
            if (imageBuffer) {
                try {
                    media = await prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer });
                } catch {}
            }

            const textBody = arthurBox(
`👑 المطور: *Salman*
⚡ الحالة: *${botMode}*
⏳ التشغيل: *${uptimeFormatted}*
🏰 الأقسام: *${order.length} قسمًا*
⚔️ الأوامر: *${totalCommandsCount} أمرًا*

🩸 *𝐓𝐇𝐄 𝐃𝐀𝐑𝐊 𝐊𝐈𝐍𝐆 𝐀𝐑𝐓𝐇𝐔𝐑* 🩸
_« على عرش الدم والسلطة المطلقة، حيث تتهاوي العوالم وتصمت العقول أمام سيادة الجبروت.. »_`);

            const rows = order.map((cat, index) => {
                const desc = getCategoryDescription(cat);
                const count = categories[cat].length;
                return {
                    header: getIcon(cat),
                    title: ` ⟨ ${cat} ⟩ `,
                    description: `⚡ ${desc} ⦓ ${count} أمر ⦔`,
                    id: `.اوامر ${index + 1}`
                };
            });

            const interactiveMessage = {
                body: { text: textBody },
                footer: { text: `✦ ${getDecoration().brand.replace(/\*/g, "")} ✦` },
                header: {
                    title: getDecoration().brand.replace(/\*/g, ""),
                    hasMediaAttachment: media ? true : false,
                    imageMessage: media ? media.imageMessage : null
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "📂 قـائـمـة الأقـسـام",
                                sections: [{ title: "⚡ اختر القسم المناسب لعرض أوامره", rows: rows }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "👑 المطور",
                                url: "https://wa.me/967780023229",
                                merchant_url: "https://wa.me/967780023229"
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "📢 القناة",
                                url: "https://whatsapp.com/channel/0029Vb8ejXH7oQhXeLW2Kd1H",
                                merchant_url: "https://whatsapp.com/channel/0029Vb8ejXH7oQhXeLW2Kd1H"
                            })
                        }
                    ],
                    messageParamsJson: ""
                }
            };

            const msgEnv = generateWAMessageFromContent(
                chatId,
                { viewOnceMessage: { message: { interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage) } } },
                { userJid: sock.user.jid, quoted: msg }
            );

            return await sock.relayMessage(
                chatId,
                msgEnv.message,
                {
                    messageId: msgEnv.key.id,
                    additionalNodes: [{
                        tag: "biz",
                        attrs: {},
                        content: [{
                            tag: "interactive",
                            attrs: { type: "native_flow", v: "1" },
                            content: [{ tag: "native_flow", attrs: { name: "quick_reply" } }]
                        }]
                    }]
                }
            );
        }

        const index = parseInt(subCommand) - 1;

        if (isNaN(index) || index < 0 || index >= order.length) {
            return await sock.sendMessage(chatId, {
                text: arthurBox("❌ رقم القسم غير صحيح. اكتب .اوامر لعرض الأقسام المتاحة.")
            });
        }

        const category = order[index];
        const cmdList = categories[category];

        let text = `*${getIcon(category)} [ ${category} ]* - _${getCategoryDescription(category)}_\n\n`;

        for (let i = 0; i < cmdList.length; i++) {
            text += `❖ .${cmdList[i].command}\n`;
            text += `└ 🏷️ _${cmdList[i].description}_\n\n`;
        }

        text += `💡 *إجمالي أوامر القسم:* ${cmdList.length}`;
        text = arthurBox(text);

        const buttonV2Instance = new ButtonV2(sock)
            .setBody(text)
            .setFooter('✦ 🩸 ARTHUR BOT 🩸 ✦');

        if (imageBuffer) {
            buttonV2Instance.setThumbnail(imageBuffer);
        }

        return await buttonV2Instance
            .addButton('📁 القائمة', '.اوامر')
            .addButton('👑 المطور', '.المطور')
            .send(chatId, { quoted: msg });
    }
};
