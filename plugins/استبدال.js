import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isEliteMember } from "../utils/eliteAccess.js";
import { arthurEliteBox } from "../utils/arthurStyle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checkElitePermission = (msg, data) => isEliteMember(msg, data);

function collectFiles(directory, type, results = []) {
    if (!fs.existsSync(directory)) return results;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectFiles(fullPath, type, results);
        } else if (/\.(js|json|env)$/i.test(entry.name)) {
            results.push({
                name: path.relative(path.join(__dirname, ".."), fullPath),
                fullPath,
                type
            });
        }
    }
    return results;
}

export default {
    command: "استبدال",
    category: "النخبة",
    eliteOnly: true,
    description: "عرض قائمة ملفات النظام، Utils، البلجنات وملف التشغيل أو استبدال أي ملف بالرد على الكود برقم أو اسم الملف (خاص بالنخبة فقط)",

    execute: async (sock, msg, data) => {
        const jid = data?.jid || msg.key.remoteJid;

        const input = data.text ? data.text.trim() : "";
        const args = input.replace(/^\.استبدال/, "").trim().split(/\s+/);
        const query = args[0] ? args[0].toLowerCase() : "";

        // التفاعل يظهر فقط عند كتابة .استبدال وحدها لجلب أوامر القائمة
        if (!query) {
            await sock.sendMessage(jid, {
                react: {
                    text: "🔄",
                    key: msg.key
                }
            }).catch(() => {});
        }

        // التحقق من صلاحيات النخبة
        const isElite = checkElitePermission(msg, data);
        if (!isElite) {
            return await sock.sendMessage(jid, {
                text: arthurEliteBox("❌ هذا الأمر مخصص لأعضاء النخبة فقط\nلست مسجلاً في قائمة النخبة لتنفيذ الاستبدال"),
                quoted: msg
            });
        }

        const rootPath = path.join(__dirname, "..");
        const pluginsPath = path.join(__dirname, "../plugins");
        const utilsPath = path.join(__dirname, "../utils");

        let allFiles = [];
        try {
            // 1. جلب ملفات الجذر الأساسية (مثل index.js ملف التشغيل الرئيسي، package.json ملف المكتبات والإصدار، وملفات الإعدادات)
            if (fs.existsSync(rootPath)) {
                const rootFiles = fs.readdirSync(rootPath)
                    .filter(file => {
                        const full = path.join(rootPath, file);
                        return fs.statSync(full).isFile() &&
                            /\.(js|json|env)$/i.test(file);
                    })
                    .map(file => ({
                        name: file,
                        fullPath: path.join(rootPath, file),
                        type: "System / Main"
                    }));
                allFiles.push(...rootFiles);
            }

            // 2. جلب ملفات مجلد utils (الهبلر، الهيدرا، وملفات المعالجة)
            if (fs.existsSync(utilsPath)) {
                const utilsFiles = collectFiles(utilsPath, "Utils / Handler");
                for (const file of utilsFiles) {
                    if (!allFiles.some(existing => existing.fullPath === file.fullPath)) {
                        allFiles.push(file);
                    }
                }
            }

            // 3. جلب ملفات البلجنات
            if (fs.existsSync(pluginsPath)) {
                const pluginFiles = collectFiles(pluginsPath, "Plugin");
                for (const file of pluginFiles) {
                    if (!allFiles.some(existing => existing.fullPath === file.fullPath)) {
                        allFiles.push(file);
                    }
                }
            }
        } catch (e) {}

        // إذا لم يتم كتابة رقم أو اسم، عرض قائمة الملفات الشاملة المتاحة
        if (!query) {
            let listText = "📂 *قائمة ملفات النظام الشاملة:*\n\n";
            
            allFiles.forEach((file, index) => {
                let icon = "📂";
                if (file.type === "System / Main") icon = "⚙️";
                else if (file.type === "Utils / Handler") icon = "⚡";
                else if (file.type === "Plugin") icon = "🧩";

                listText += `*${index + 1}-* ${icon} \`${file.name}\` (${file.type})\n`;
            });

            listText += `\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
            listText += `💡 *للاستبدال:* رد على رسالة الكود الجديد واكتب:\n\`.استبدال [الرقم أو الاسم]\`\n*مثال:* \`.استبدال 1\` أو \`.استبدال index.js\`\n`;
            listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            return await sock.sendMessage(jid, { text: listText }, { quoted: msg });
        }

        // التحقق من الرد على رسالة الكود
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return await sock.sendMessage(jid, {
                text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *يجب عليك الرد على رسالة تحتوي على الكود الجديد واستخدام الأمر مع رقم أو اسم الملف.*\n*مثال:* \`.استبدال 1\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                quoted: msg
            });
        }

        let newContent = quotedMsg.conversation || 
                         quotedMsg.extendedTextMessage?.text || 
                         quotedMsg.imageMessage?.caption || 
                         quotedMsg.documentMessage?.caption || "";

        // استخراج الكود الصافي إذا كان داخل كود بلوك
        if (newContent.includes("```")) {
            const match = newContent.match(/```(?:javascript|js|json|env)?\n([\s\S]*?)```/);
            if (match && match[1]) {
                newContent = match[1];
            }
        }

        if (!newContent.trim()) {
            return await sock.sendMessage(jid, {
                text: arthurEliteBox("❌ الرسالة التي رددت عليها لا تحتوي على كود صالح"),
                quoted: msg
            });
        }

        let targetFileObj = null;
        const parsedIndex = parseInt(query);

        if (!isNaN(parsedIndex) && parsedIndex >= 1 && parsedIndex <= allFiles.length) {
            targetFileObj = allFiles[parsedIndex - 1];
        } else {
            targetFileObj = allFiles.find(f => f.name.toLowerCase() === query || f.name.toLowerCase().replace(/\.(js|json|env)$/, "") === query);
        }

        if (!targetFileObj) {
            return await sock.sendMessage(jid, {
                text: arthurEliteBox("❌ الملف غير موجود. اكتب .استبدال لعرض الملفات"),
                quoted: msg
            });
        }

        try {
            fs.writeFileSync(targetFileObj.fullPath, newContent, "utf8");

            await sock.sendMessage(jid, {
                text: arthurEliteBox(`✅ تم استبدال الملف بنجاح\n📄 الملف: ${targetFileObj.name}\n🛡️ النوع: ${targetFileObj.type}`),
                quoted: msg
            });

        } catch (e) {
            await sock.sendMessage(jid, {
                text: arthurEliteBox(`❌ حدث خطأ أثناء الاستبدال: ${e.message}`),
                quoted: msg
            });
        }
    }
};
