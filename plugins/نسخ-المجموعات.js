import fs from "fs";
import path from "path";
import axios from "axios";

// مسار المجلد الرئيسي للنسخ
const backupsDir = path.join(process.cwd(), "data", "backups");

// مسار ملف النخبة للتحقق من الصلاحيات
const eliteFile = path.join(process.cwd(), "data", "النخبة.json");

// التأكد من وجود مجلد النسخ الرئيسي
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

function getElite() {
    if (!fs.existsSync(eliteFile)) {
        fs.writeFileSync(eliteFile, JSON.stringify([], null, 2));
    }
    return JSON.parse(fs.readFileSync(eliteFile, "utf-8"));
}

export default {
    command: "نسخة",
    category: "المجموعات",
    description: "نسخ ولصق وحذف إعدادات المجموعات في مجلدات منفصلة (خاص بأعضاء النخبة) 👑",

    execute: async (sock, msg, data) => {
        const jid = data.jid;
        const isGroup = jid.endsWith("@g.us");

        const head =
`*╭━━━〔 👑 𝐀𝐑𝐓𝐇𝐔R LEYWIN 〕━━━╮*
*┃ 📂 نظام نسخ المجموعات والمجلدات*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        // التحقق من صلاحية أعضاء النخبة فقط
        const eliteUsers = getElite();
        const senderNumber = (data.sender || msg.key.participant || msg.key.remoteJid).split("@")[0];

        if (!eliteUsers.includes(senderNumber)) {
            return sock.sendMessage(
                jid,
                {
                    text:
`${head}

*┃ ❌ ليس لديك صلاحية*
*┃ 👑 الأمر خاص بأعضاء النخبه فقط*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                { quoted: msg }
            );
        }

        const args = data.text.trim().split(/\s+/);
        const action = args[1]; // نسخ، لصق، حذف، عرض
        const backupName = args[2]; // اسم النسخة

        const targetFolder = backupName ? path.join(backupsDir, backupName) : null;
        const infoPath = targetFolder ? path.join(targetFolder, "info.json") : null;
        const imagePath = targetFolder ? path.join(targetFolder, "profile.jpg") : null;

        // =================
        // 1. أمر النسخ (يفتح مجلد خاص ويحفظ داخله الملفات وصورة البروفيل)
        // =================
        if (action === "نسخ") {
            if (!isGroup) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ يجب استخدام أمر النسخ داخل المجموعة المستهدفة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            if (!backupName) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ يرجى كتابة اسم للنسخة*
*┃ 📌 مثال:*
*┃ .نسخة نسخ اساسي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            // التحقق إذا كانت النسخة ومجلدها موجودين مسبقاً
            if (fs.existsSync(targetFolder)) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ⚠️ عذراً، يوجد نسخة ومجلد بهذا الاسم مسبقاً*
*┃ 📁 اسم النسخة : ${backupName}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            try {
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

                const metadata = await sock.groupMetadata(jid);
                const groupName = metadata.subject;
                const groupDesc = metadata.desc || "";

                // إنشاء المجلد الخاص بالنسخة
                fs.mkdirSync(targetFolder, { recursive: true });

                // محاولة جلب وحفظ صورة البروفيل كملف داخل المجلد
                let hasImage = false;
                try {
                    const groupPicUrl = await sock.profilePictureUrl(jid, "image");
                    if (groupPicUrl) {
                        const response = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
                        fs.writeFileSync(imagePath, Buffer.from(response.data));
                        hasImage = true;
                    }
                } catch (e) {
                    hasImage = false;
                }

                // حفظ معلومات الاسم والوصف وتاريخ الإنشاء في ملف info.json داخل المجلد
                const backupInfo = {
                    name: groupName,
                    desc: groupDesc,
                    hasImage: hasImage,
                    date: new Date().toLocaleString()
                };
                fs.writeFileSync(infoPath, JSON.stringify(backupInfo, null, 2));

                await sock.sendMessage(jid, {
                    text:
`${head}

*┃ ✅ تم إنشاء المجلد ونسخ الإعدادات بنجاح*
*┃ 📁 اسم المجلد/النسخة : ${backupName}*
*┃ 📌 اسم المجموعة : ${groupName}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });

                await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

            } catch (err) {
                console.error("Backup Error:", err);
                await sock.sendMessage(jid, {
                    text: `${head}\n\n*┃ ❌ حدث خطأ أثناء إنشاء النسخة والمجلد*`
                }, { quoted: msg });
            }
            return;
        }

        // =================
        // 2. أمر اللصق (يقرأ البيانات من المجلد ويطبقها بالكامل)
        // =================
        if (action === "لصق") {
            if (!isGroup) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ يجب استخدام أمر اللصق داخل المجموعة الجديدة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            if (!backupName) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ يرجى كتابة اسم النسخة المراد لصقها*
*┃ 📌 مثال:*
*┃ .نسخة لصق اساسي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            if (!fs.existsSync(targetFolder) || !fs.existsSync(infoPath)) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ عذراً، لا توجد نسخة أو مجلد بهذا الاسم*
*┃ 📌 استخدم .نسخة عرض لرؤية النسخ المتاحة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            try {
                await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

                const backupInfo = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
                let successDetails = [];

                // 1. تطبيق الاسم
                if (backupInfo.name) {
                    await sock.groupUpdateSubject(jid, backupInfo.name);
                    successDetails.push("الاسم");
                }

                // 2. تطبيق الوصف
                if (backupInfo.desc !== undefined) {
                    try {
                        await sock.groupUpdateDescription(jid, backupInfo.desc);
                        successDetails.push("الوصف");
                    } catch (e) {}
                }

                // 3. تطبيق صورة البروفيل من الملف المحفوظ في المجلد
                if (backupInfo.hasImage && fs.existsSync(imagePath)) {
                    try {
                        const imageBuffer = fs.readFileSync(imagePath);
                        await sock.updateProfilePicture(jid, imageBuffer);
                        successDetails.push("البروفيل");
                    } catch (e) {
                        console.error("خطأ في تحديث البروفيل:", e.message);
                    }
                }

                await sock.sendMessage(jid, {
                    text:
`${head}

*┃ ✅ تم تطبيق محتوى المجلد بنجاح*
*┃ 📁 اسم النسخة : ${backupName}*
*┃ 📌 العناصر المطبقة : ${successDetails.join("، ")}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });

                await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

            } catch (err) {
                console.error("Paste Error:", err);
                await sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ حدث خطأ أثناء اللصق*
*┃ ⚠️ تأكد أن البوت مشرف (Admin) في المجموعة*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }
            return;
        }

        // =================
        // 3. أمر الحذف (يحذف مجلد النسخة بالكامل ومحتوياته)
        // =================
        if (action === "حذف") {
            if (!backupName) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ يرجى كتابة اسم النسخة المراد حذفها*
*┃ 📌 مثال:*
*┃ .نسخة حذف اساسي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            if (!fs.existsSync(targetFolder)) {
                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ❌ عذراً، لا يوجد مجلد أو نسخة بهذا الاسم للحذف*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            }

            try {
                // حذف المجلد ومحتوياته بالكامل
                fs.rmSync(targetFolder, { recursive: true, force: true });

                return sock.sendMessage(jid, {
                    text:
`${head}

*┃ ✅ تم حذف المجلد والنسخة بنجاح*
*┃ 🗑️ المجلد المحذوف : ${backupName}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(jid, {
                    text: `${head}\n\n*┃ ❌ حدث خطأ أثناء حذف المجلد*`
                }, { quoted: msg });
            }
        }

        // =================
        // 4. أمر العرض (عرض المجلدات/النسخ المحفوظة)
        // =================
        if (action === "عرض") {
            if (!fs.existsSync(backupsDir)) {
                return sock.sendMessage(jid, {
                    text: `${head}\n\n*┃ 📭 لا توجد أي مجلدات نسخ محفوظة حالياً*`
                }, { quoted: msg });
            }

            const folders = fs.readdirSync(backupsDir, { withFileTypes })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            if (folders.length === 0) {
                return sock.sendMessage(jid, {
                    text: `${head}\n\n*┃ 📭 لا توجد أي مجلدات نسخ محفوظة حالياً*`
                }, { quoted: msg });
            }

            let list = folders.map((folder, i) => {
                let groupName = "غيرที่ทราบ";
                try {
                    const infoData = JSON.parse(fs.readFileSync(path.join(backupsDir, folder, "info.json"), "utf-8"));
                    groupName = infoData.name || "مجموعة";
                } catch {}
                return `*┃ ${i+1} 📁 ${folder} (المجموعة: ${groupName})*`;
            }).join("\n");

            return sock.sendMessage(jid, {
                text:
`${head}

*┃ 📜 قائمة مجلدات النسخ المحفوظة*
*┣━━━━━━━━━━━━━━━━━━┃*
${list}
*┣━━━━━━━━━━━━━━━━━━┃*
*┃ 👥 العدد الكلي : ${folders.length}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
            }, { quoted: msg });
        }

        // تعليمات الاستخدام
        return sock.sendMessage(jid, {
            text:
`${head}

*┃ ⚜️ أوامر نظام النسخ والمجلدات (خاص بالنخبة):*
*┃*
*┃ 👑 .نسخة نسخ [اسم المجلد]*
*┃ 👑 .نسخة لصق [اسم المجلد]*
*┃ 👑 .نسخة حذف [اسم المجلد]*
*┃ 👑 .نسخة عرض*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
        }, { quoted: msg });

    }
};
