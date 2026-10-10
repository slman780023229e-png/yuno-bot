export default {
    command: "تحديث",
    category: "النظام",
    description: "إعادة تحميل أوامر البوت",

    execute: async (sock, msg, data) => {
        try {
            const fs = await import("fs");
            const path = await import("path");

            const elitePath = path.join(process.cwd(), "data", "النخبة.json");

            let eliteList = [];

            if (fs.existsSync(elitePath)) {
                const fileContent = fs.readFileSync(elitePath, "utf8");
                try {
                    // محاولة قراءة الملف كمصفوفة JSON
                    const parsed = JSON.parse(fileContent);
                    eliteList = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    // في حال فشل القراءة كـ JSON، تنظيف الملف من الأقواس وأي رموز غير رقمية
                    eliteList = fileContent.replace(/[\[\]"'\s]/g, "").split(",");
                }
            }

            // تنظيف قائمة النخبة من أي رموز غريبة
            const cleanElite = eliteList.map(x => String(x).replace(/\D/g, ""));

            // تنظيف رقم المرسل (إزالة @s.whatsapp.net وأي رموز أخرى)
            const senderNumber = data.sender.replace(/\D/g, "");

            // التحقق من وجود الرقم (المطابقة الدقيقة)
            if (!cleanElite.includes(senderNumber)) {
                return sock.sendMessage(data.jid, {
                    text: `╭━━━━━━━━━━━━━━╮
┃ ❌ رفض الأمر
┣━━━━━━━━━━━━━━┫
┃ 👑 للنخبة فقط
╰━━━━━━━━━━━━━━╯`
                });
            }

            await sock.sendMessage(data.jid, {
                text: `╭━━━━━━━━━━━━━━╮
┃ 🔄 𝐘𝐔𝐍𝐎 𝐔𝐏𝐃𝐀𝐓𝐄
┣━━━━━━━━━━━━━━┫
┃ ⏳ جاري تحديث الأوامر...
╰━━━━━━━━━━━━━━╯`
            });

            // إعادة تحميل البلجنات
            const { loadPlugins } = await import("../utils/loader.js");
            await loadPlugins(sock);

            await sock.sendMessage(data.jid, {
                text: `╭━━━━━━━━━━━━━━╮
┃ ✅ تم التحديث
┣━━━━━━━━━━━━━━┫
┃ 📦 تم إعادة تحميل البلجنات
┃ 👑 𝐘𝐔𝐍𝐎 𝐂𝐎𝐑𝐄
╰━━━━━━━━━━━━━━╯`
            });

        } catch (err) {
            await sock.sendMessage(data.jid, {
                text: `❌ خطأ التحديث:
${err.message}`
            });
        }
    }
};
