
import fs from "fs";
import path from "path";
import archiver from "archiver";

// دالة للتحقق مما إذا كان المستخدم من النخبة
const checkElitePermission = (msg, data) => {
    try {
        const senderJid = msg.key.participant || data.jid || "";
        const senderNumber = senderJid.replace(/[^0-9]/g, "");
        const dataDir = path.join(process.cwd(), "data");

        if (!fs.existsSync(dataDir)) return false;

        const files = fs.readdirSync(dataDir);
        const eliteFile = files.find(f => /نخبة|elite/i.test(f));

        if (!eliteFile) return false;

        const filePath = path.join(dataDir, eliteFile);
        const fileContent = fs.readFileSync(filePath, "utf8");

        if (fileContent.includes("{") || fileContent.includes("[")) {
            const parsed = JSON.parse(fileContent);
            const stringified = JSON.stringify(parsed);
            return stringified.includes(senderNumber);
        } else {
            return fileContent.includes(senderNumber);
        }
    } catch (e) {
        return false;
    }
};

export default {
  command: 'جلبمجلد',
  description: 'جلب المجلدات عبر كتابة اسمها أو الرقم الترتيبي في المشروع (خاص بالنخبة فقط)',
  category: 'المطور',
    ownerOnly: true,

  execute: async (sock, msg, data) => {
    try {
      const jid = data?.jid || msg.key.remoteJid;
      
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

      // التحقق من صلاحيات النخبة
      const isElite = checkElitePermission(msg, data);
      if (!isElite) {
        return await sock.sendMessage(jid, {
            text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
            quoted: msg
        });
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
          { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
          { quoted: msg }
        );
      }

      const targetPath = path.join(process.cwd(), targetFolderName);

      await sock.sendMessage(jid,
          { text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*` },
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
        { text: '*◇❐ ═━╾ 🩸 ╼━═ ❐◇*' },
        { quoted: msg }
      );
    }
  }
};
