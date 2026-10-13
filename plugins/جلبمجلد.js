import fs from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسار ملف النخبة الموحد تماماً مثل الكود الشغال
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

export default {
  command: 'جلبمجلد',
  description: 'جلب المجلدات عبر كتابة اسمها أو الرقم الترتيبي في المشروع (خاص بالنخبة فقط)',
  category: 'المطور',
  ownerOnly: true,

  execute: async (sock, msg, data) => {
    try {
      const jid = data?.jid || msg.key.remoteJid;
      // تصحيح جلب معرف المرسل تماماً مثل الكود الشغال
      const senderJid = data.sender || msg.key.participant || msg.key.remoteJid;

      // التحقق من صلاحيات النخبة بالدالة الصحيحة
      const isElite = checkElitePermission(senderJid);
      if (!isElite) {
        return await sock.sendMessage(jid, {
            text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *هذا الأمر مخصص لأعضاء النخبة فقط.*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
            quoted: msg
        });
      }

      const input = data?.text ? data.text.trim() : "";
      const args = input.replace(/^\.جلبمجلد/, "").trim().split(/\s+/);
      const query = args[0] ? args[0].toLowerCase() : "";

      if (!query) {
        await sock.sendMessage(jid, {
          react: {
              text: "📁",
              key: msg.key
          }
        }).catch(() => {});
      }

      // جلب جميع المجلدات الموجودة في المسار الحالي
      const items = fs.readdirSync(process.cwd(), { withFileTypes: true });
      const folders = items.filter(item => item.isDirectory() && !item.name.startsWith('.'));

      if (!query) {
        let listText = `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
        listText += `       *𝚫𝚪𝚻𝚮𝚼𝚪 • 𝚩𝚯𝚻 2026*\n`;
        listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
        listText += `📂 *قائمة المجلدات المتاحة:*\n\n`;
        
        folders.forEach((folder, index) => {
          listText += `*${index + 1}-* 📁 \`${folder.name}\`\n`;
        });

        listText += `\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
        listText += `💡 *طريقة الاستخدام:*\n`;
        listText += `\`.جلبمجلد [الاسم أو الرقم]\`\n`;
        listText += `*مثال:* \`.جلبمجلد 1\` أو \`.جلبمجلد data\`\n`;
        listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        return sock.sendMessage(jid, { text: listText }, { quoted: msg });
      }

      const inputArg = args.join(' ').trim();
      let targetFolderName = '';

      // التحقق مما إذا كان المدخل رقماً أم نصاً
      if (!isNaN(inputArg)) {
        const index = parseInt(inputArg) - 1;
        if (index >= 0 && index < folders.length) {
          targetFolderName = folders[index].name;
        }
      } else {
        // البحث بالاسم المباشر
        const found = folders.find(f => f.name.toLowerCase() === inputArg.toLowerCase());
        if (found) {
          targetFolderName = found.name;
        }
      }

      if (!targetFolderName) {
        return sock.sendMessage(
          jid,
          { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *لم يتم العثور على المجلد المطلوب.*\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
          { quoted: msg }
        );
      }

      const targetPath = path.join(process.cwd(), targetFolderName);

      await sock.sendMessage(jid,
          { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n⏳ *جاري ضغط وجلب المجلد:* \`${targetFolderName}\`...\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
          { quoted: msg });

      const zipName = `${targetFolderName}_backup.zip`;
      const outputPath = path.join(process.cwd(), zipName);

      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        output.on('close', async () => {
          try {
            await sock.sendMessage(
              jid,
              {
                document: fs.readFileSync(outputPath),
                mimetype: 'application/zip',
                fileName: zipName,
                caption: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n✅ *تم جلب المجلد بنجاح:* \`${targetFolderName}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
              },
              { quoted: msg }
            );

            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
            resolve();
          } catch (err) {
            console.error('Send zip error:', err);
            reject(err);
          }
        });

        archive.on('error', (err) => {
          console.error('Archive error:', err);
          reject(err);
        });

        archive.pipe(output);
        archive.directory(targetPath, false);
        archive.finalize();
      });

    } catch (e) {
      console.error("أمر جلبمجلد خطأ:", e);
      return sock.sendMessage(
        data?.jid || msg.key.remoteJid,
        { text: '*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ حدث خطأ أثناء تنفيذ الأمر.' },
        { quoted: msg }
      );
    }
  }
};