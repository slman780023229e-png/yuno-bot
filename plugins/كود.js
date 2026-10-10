import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { arthurBox, arthurEliteBox } from "../utils/arthurStyle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسار ملف النخبة الموحد
const eliteFile = path.join(
    process.cwd(),
    "data/النخبة.json"
);

function getElite() {
    try {
        if (!fs.existsSync(eliteFile)) {
            const dir = path.dirname(eliteFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                eliteFile,
                JSON.stringify([], null, 2)
            );
        }
        return JSON.parse(
            fs.readFileSync(
                eliteFile,
                "utf-8"
            )
        );
    } catch {
        return [];
    }
}

const checkElitePermission = (senderJid) => {
    if (!senderJid) return false;
    const cleanSender = senderJid.replace(/[^0-9]/g, "");
    const eliteUsers = getElite();
    return eliteUsers.some(num => num.replace(/[^0-9]/g, "") === cleanSender);
};

const getAllSystemFiles = () => {
    const rootDir = path.join(__dirname, "..");
    const roots = [
        { dir: path.join(rootDir, "plugins"), category: "Plugins" },
        { dir: path.join(rootDir, "utils"), category: "Utils" },
        { dir: path.join(rootDir, "data"), category: "Data" }
    ];
    const fileList = [];
    const excluded = new Set(["node_modules", ".git", "ملف_الاتصال", "session", "sessions"]);
    const walk = (dir, category) => {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (excluded.has(entry.name) || entry.name.startsWith(".")) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, category);
            } else if (entry.isFile()) {
                if (category === "Data" && !/\.(json|txt|ya?ml|md)$/i.test(entry.name)) continue;
                if (category !== "Data" && !entry.name.endsWith(".js")) continue;
                fileList.push({ name: path.relative(rootDir, fullPath), path: fullPath, category });
            }
        }
    };
    for (const root of roots) walk(root.dir, root.category);
    let rootFiles = [];
    try { rootFiles = fs.readdirSync(rootDir, { withFileTypes: true }); } catch {}
    for (const entry of rootFiles) {
        if (entry.isFile() && (entry.name.endsWith(".js") || entry.name === "package.json")) {
            fileList.push({ name: entry.name, path: path.join(rootDir, entry.name), category: "Root" });
        }
    }
    return fileList.sort((a, b) => a.name.localeCompare(b.name, "ar"));
};

export default {
    command: ["كود", "عرض_الكود"],
    category: "النخبة",
    description: "جلب وحذف أكواد النظام والبلجنات بالاسم أو الرقم لأعضاء النخبة حصرياً",

    execute: async (sock, msg, data) => {
        const chatId = data.jid;
        const senderJid = data.sender || msg.key.participant || msg.key.remoteJid;

        if (!checkElitePermission(senderJid)) {
            return await sock.sendMessage(chatId, {
                text: arthurEliteBox("❌ هذا الأمر مخصص لأعضاء النخبة.")
            }, { quoted: msg });
        }

        // تفاعل بالدم 🩸 على رسالة العضو فوراً
        await sock.sendMessage(chatId, {
            react: { text: "🩸", key: msg.key }
        }).catch(() => {});

        let rawText = data.text ? data.text.trim() : "";
        const parts = rawText.split(/\s+/);
        parts.shift(); // إزالة اسم الأمر الرئيسي
        
        const subCommand = parts[0] ? parts[0].toLowerCase() : "";
        parts.shift(); // إزالة الكلمة الفرعية (عرض أو حذف)
        const queryArg = parts.join(" ").trim();

        const allFiles = getAllSystemFiles();

        // 1. أمر العرض بالتصميم الأسطوري المتناسق
        if (subCommand === "عرض" || subCommand === "الكل" || (!subCommand && !queryArg)) {
            let listText = `⚡ *قائمة ملفات النظام المتاحة:*\n`;
            allFiles.forEach((file, index) => {
                listText += `❖ [${index + 1}] \`${file.name}\`\n`;
            });
            listText += `\n💡 *طريقة الاستخدام:*\n• لجلب الكود: .كود [الرقم أو الاسم]\n• لحذف ملف: .كود حذف [الرقم أو الاسم]`;
            listText = arthurEliteBox(listText);

            return await sock.sendMessage(chatId, { text: listText }, { quoted: msg });
        }

        // 2. أمر الحذف
        if (subCommand === "حذف") {
            if (!queryArg) {
                return await sock.sendMessage(chatId, {
                    text: "*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *يرجى تحديد اسم أو رقم الملف المراد حذفه.*\n💡 *مثال:* \`.كود حذف plugin.js\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*"
                }, { quoted: msg });
            }

            let targetFile = null;

            if (!isNaN(queryArg)) {
                const index = parseInt(queryArg) - 1;
                if (index >= 0 && index < allFiles.length) {
                    targetFile = allFiles[index];
                }
            } else {
                targetFile = allFiles.find(f => f.name.toLowerCase().includes(queryArg.toLowerCase()));
            }

            if (!targetFile || !fs.existsSync(targetFile.path)) {
                return await sock.sendMessage(chatId, {
                    text: arthurEliteBox(`❌ لم يتم العثور على أي ملف مطابق لـ: ${queryArg}`)
                }, { quoted: msg });
            }

            // حماية المجلدات والملفات الأساسية الحساسة جداً من الحذف الخاطئ
            const criticalFiles = ["package.json", "index.js", "main.js"];
            if (criticalFiles.includes(targetFile.name.toLowerCase()) || targetFile.category === "Root") {
                return await sock.sendMessage(chatId, {
                    text: arthurEliteBox("❌ لا يمكن حذف ملفات النظام الأساسية من هذا الأمر.")
                }, { quoted: msg });
            }

            try {
                fs.unlinkSync(targetFile.path);
                return await sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n✅ *تم حذف الملف بنجاح تام:*\n📁 \`${targetFile.name}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            } catch (err) {
                return await sock.sendMessage(chatId, {
                    text: arthurEliteBox("❌ فشل حذف الملف. تحقق من الصلاحيات ثم حاول مجددًا.")
                }, { quoted: msg });
            }
        }

        // معالجة البحث المباشر
        const directQuery = subCommand ? `${subCommand} ${queryArg}`.trim() : queryArg;
        let targetFile = null;

        if (!isNaN(directQuery)) {
            const index = parseInt(directQuery) - 1;
            if (index >= 0 && index < allFiles.length) {
                targetFile = allFiles[index];
            }
        } else {
            targetFile = allFiles.find(f => f.name.toLowerCase().includes(directQuery.toLowerCase()));
        }

        if (!targetFile || !fs.existsSync(targetFile.path)) {
            return await sock.sendMessage(chatId, {
                text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *لم يتم العثور على أي ملف مطابق لـ:* \`${directQuery}\`\n\n*اكتب:* \`.كود عرض\` لمعرفة الأسماء المتاحة.\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });
        }

        try {
            // جلب محتوى الملف كاملاً بدون أي اقتصاص
            const fileContent = fs.readFileSync(targetFile.path, "utf8");
            if (!fileContent.length) {
                return await sock.sendMessage(chatId, { text: arthurEliteBox(`⚠️ الملف ${targetFile.name} فارغ فعلًا ولا يحتوي على كود.`) }, { quoted: msg });
            }

            const interactiveMessage = {
                body: { text: arthurEliteBox(`📁 *الملف:* ${targetFile.name}`) },
                footer: { text: "✦ 𝚫𝚪𝚻𝚮𝚼𝚪 𝕰𝖑𝖎𝖙𝖊 2026 ✦" },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_copy",
                            buttonParamsJson: JSON.stringify({
                                display_text: `📋 نسخ كود ${targetFile.name}`,
                                copy_code: fileContent
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

            return await sock.relayMessage(chatId, msgEnv.message, {
                messageId: msgEnv.key.id,
                additionalNodes: [{ tag: "biz",
                    attrs: {},
                    content: [{ tag: "interactive",
                    attrs: { type: "native_flow",
                    v: "1" },
                    content: [{ tag: "native_flow",
                    attrs: { name: "quick_reply" } }] }] }]
            });

        } catch (err) {
            try {
                const fallbackName = typeof targetFile?.name === "string" ? targetFile.name : "الملف";
                const fallbackCode = targetFile?.path && fs.existsSync(targetFile.path)
                    ? fs.readFileSync(targetFile.path, "utf8")
                    : "";
                if (fallbackCode) {
                    const chunks = fallbackCode.match(/[\s\S]{1,3000}/g) || [];
                    await sock.sendMessage(chatId, { text: arthurEliteBox(`📄 *محتوى الملف:* ${fallbackName}\nعدد الأجزاء: ${chunks.length}`) }, { quoted: msg });
                    for (let i = 0; i < chunks.length; i++) {
                        await sock.sendMessage(chatId, { text: arthurEliteBox(`📄 *${fallbackName} — الجزء ${i + 1}/${chunks.length}*\n\`\`\`javascript\n${chunks[i]}\n\`\`\``) }, { quoted: msg });
                    }
                    return;
                }
            } catch {}
            return await sock.sendMessage(chatId, {
                text: arthurEliteBox("❌ تعذر جلب الملف. تحقق من صلاحيات القراءة وحاول مجددًا.")
            }, { quoted: msg });
        }
    }
};
