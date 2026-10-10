import fs from "fs";
import path from "path";

const baseDir = process.cwd();
const استقبالFolder = path.join(baseDir, "استقبال_الألقاب");

if (!fs.existsSync(استقبالFolder)) {
    fs.mkdirSync(استقبالFolder, { recursive: true });
}

export default {
    command: "القاب",
    category: "الإدارة",
    description: "إدارة وعرض الألقاب وصور الشخصيات المسجلة",

    execute: async (sock, msg, data) => {
        const jid = data.jid;
        const textBody = data.text || (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "");
        const args = textBody.trim().split(/\s+/);
        const subCommand = args[1]; // مثل: صور، حذف

        try {
            // التحقق من وجود المجلد
            if (!fs.existsSync(استقبالFolder)) {
                return sock.sendMessage(jid, { text: "❌ لا يوجد أي ألقاب مسجلة حالياً." }, { quoted: msg });
            }

            const folders = fs.readdirSync(استقبالFolder, { withFileTypes: true });
            const registeredCharacters = [];

            for (const folder of folders) {
                if (folder.isDirectory()) {
                    const characterName = folder.name;
                    const folderPath = path.join(استقبالFolder, characterName);
                    const infoFilePath = path.join(folderPath, "معلومات_اللقب.txt");

                    let userInfo = {
                        character: characterName,
                        inviter: "غير محدد",
                        userJid: "غير محدد",
                        imagePath: null
                    };

                    // البحث عن الصورة وملف المعلومات
                    if (fs.existsSync(folderPath)) {
                        const files = fs.readdirSync(folderPath);
                        for (const file of files) {
                            const filePath = path.join(folderPath, file);
                            if (file.endsWith(".txt") && file === "معلومات_اللقب.txt") {
                                try {
                                    const content = fs.readFileSync(filePath, "utf8");
                                    const lines = content.split("\n");
                                    for (const line of lines) {
                                        if (line.includes("من طرف:")) {
                                            userInfo.inviter = line.replace("من طرف:", "").trim();
                                        }
                                        if (line.includes("رقم المستخدم:")) {
                                            userInfo.userJid = line.replace("رقم المستخدم:", "").trim();
                                        }
                                    }
                                } catch (e) {}
                            } else if (file.endsWith(".jpg") || file.endsWith(".png") || file.endsWith(".jpeg")) {
                                userInfo.imagePath = filePath;
                            }
                        }
                    }
                    registeredCharacters.push(userInfo);
                }
            }

            if (registeredCharacters.length === 0) {
                return sock.sendMessage(jid, { text: "🪶 لا توجد أي ألقاب أو شخصيات مسجلة في مجلد الاستقبال حتى الآن." }, { quoted: msg });
            }

            // ==========================================
            // 1. أمر العرض العادي: .القاب
            // ==========================================
            if (!subCommand) {
                let listText = `🪶 *قـائـمـة الألـقـاب والـشـخـصـيـات المسجلة* 🪶\n*❉━═━╄━❪🪶❫━╃━═━❉*\n\n`;
                
                registeredCharacters.forEach((item, index) => {
                    const cleanPhone = item.userJid !== "غير محدد" ? item.userJid.split("@")[0] : "غير متوفر";
                    listText += `${index + 1} ↜ اللقب: **${item.character}**\n`;
                    listText += `   👤 العضو: @${cleanPhone}\n`;
                    listText += `   👥 من طرف: ${item.inviter}\n`;
                    listText += `-----------------------------------\n`;
                });

                listText += `\n💡 لعرض الألقاب مع الصور استخدم: *.القاب صور*\n💡 لحذف لقب استخدم: *.القاب حذف [الاسم أو الرقم]*`;

                const mentionsList = registeredCharacters
                    .filter(i => i.userJid !== "غير محدد")
                    .map(i => i.userJid);

                return sock.sendMessage(jid, {
                    text: listText,
                    mentions: mentionsList
                }, { quoted: msg });
            }

            // ==========================================
            // 2. أمر عرض الصور: .القاب صور
            // ==========================================
            if (subCommand === "صور") {
                await sock.sendMessage(jid, { text: `📷 جاري إرسال صور جميع الألقاب المسجلة (${registeredCharacters.length}):` }, { quoted: msg });

                for (const item of registeredCharacters) {
                    if (item.imagePath && fs.existsSync(item.imagePath)) {
                        const cleanPhone = item.userJid !== "غير محدد" ? item.userJid.split("@")[0] : "غير متوفر";
                        const caption = `🪶 *بيانات الشخصية* 🪶\n` +
                                        `🔸 اللقب: **${item.character}**\n` +
                                        `🔹 العضو: @${cleanPhone}\n` +
                                        `🔹 من طرف: ${item.inviter}`;

                        await sock.sendMessage(jid, {
                            image: { url: item.imagePath },
                            caption: caption,
                            mentions: item.userJid !== "غير محدد" ? [item.userJid] : []
                        });
                        
                        // فاصل زمني قصير بين كل صورة وأخرى لتفادي الحظر أو الضغط
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }
                return;
            }

            // ==========================================
            // 3. أمر الحذف: .القاب حذف [الاسم أو الرقم]
            // ==========================================
            if (subCommand === "حذف") {
                const targetQuery = args.slice(2).join(" ").trim();
                if (!targetQuery) {
                    return sock.sendMessage(jid, {
                        text: `❌ يرجى كتابة اسم اللقب أو رقم العضو المراد حذف ملفه وصورته.\nمثال: *.القاب حذف ارثر* أو *.القاب حذف 9677xxxxxxxx*`
                    }, { quoted: msg });
                }

                let deletedCount = 0;
                const foldersList = fs.readdirSync(استقبالFolder, { withFileTypes: true });

                for (const folder of foldersList) {
                    if (folder.isDirectory()) {
                        const folderName = folder.name;
                        const folderPath = path.join(استقبالFolder, folderName);
                        const infoFilePath = path.join(folderPath, "معلومات_اللقب.txt");

                        let shouldDelete = false;

                        // مطابقة بالاسم الشخصي أو اللقب
                        if (folderName.toLowerCase() === targetQuery.toLowerCase()) {
                            shouldDelete = true;
                        }

                        // مطابقة برقم الهاتف داخل ملف المعلومات
                        if (fs.existsSync(infoFilePath)) {
                            try {
                                const infoContent = fs.readFileSync(infoFilePath, "utf8");
                                if (infoContent.includes(targetQuery)) {
                                    shouldDelete = true;
                                }
                            } catch (e) {}
                        }

                        if (shouldDelete) {
                            try {
                                fs.rmSync(folderPath, { recursive: true, force: true });
                                deletedCount++;
                            } catch (err) {
                                console.log("Error deleting folder:", err.message);
                            }
                        }
                    }
                }

                if (deletedCount > 0) {
                    return sock.sendMessage(jid, {
                        text: `✅ تم بنجاح حذف مجلد وملف وصورة اللقب المطابق لـ (${targetQuery}) وتفريغ بياناته.`
                    }, { quoted: msg });
                } else {
                    return sock.sendMessage(jid, {
                        text: `❌ لم يتم العثور على أي لقب أو رقم مطابق لـ (${targetQuery}) في السجلات.`
                    }, { quoted: msg });
                }
            }

            // إذا كتب أمر فرعي غير صحيح
            return sock.sendMessage(jid, {
                text: `❌ أمر غير معروف.\n\nالأوامر المتاحة:\n🔹 .القاب (لعرض القائمة)\n🔹 .القاب صور (لعرض الألقاب مع الصور)\n🔹 .القاب حذف [الاسم/الرقم] (لحذف اللقب وصورته)`
            }, { quoted: msg });

        } catch (e) {
            console.log("Qab Cmd Error:", e.message);
            return sock.sendMessage(jid, { text: "❌ حدث خطأ أثناء تنفيذ أمر الألقاب." }, { quoted: msg });
        }
    }
};
