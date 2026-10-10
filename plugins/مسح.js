import fs from "fs";
import path from "path";

// دالة جلب أعضاء النخبة
function getElite(){
    const dataPath = path.join(process.cwd(), "data");
    let elite = [];
    const files = ["النخبة.json", "النخبه.json", "النخبة", "النخبه"];

    for(const file of files){
        const filePath = path.join(dataPath, file);
        if(fs.existsSync(filePath)){
            try{
                elite = JSON.parse(fs.readFileSync(filePath, "utf8"));
                break;
            }catch(err){}
        }
    }
    return elite.map(x => String(x).replace(/\D/g, ""));
}

function getFolders(){
    return fs.readdirSync(process.cwd())
    .filter(file=>{
        const full = path.join(process.cwd(), file);
        return fs.statSync(full).isDirectory() && !file.startsWith('.');
    });
}

function getFiles(folder){
    const folderPath = path.join(process.cwd(), folder);
    return fs.readdirSync(folderPath)
    .filter(file=>{
        const full = path.join(folderPath, file);
        return fs.statSync(full).isFile();
    });
}

export default {

    command: 'مسح',

    description: 'حذف الملفات أو المجلدات من البوت (خاص بالنخبة)',

    usage: '.مسح [رقم المجلد] أو .مسح مجلد [الاسم أو الرقم]',

    category: 'النخبه',

    async execute(sock, msg, data){

        try{

            const chatId = data?.jid || msg.key.remoteJid;

            const sender =
            msg.key.participant ||
            msg.participant ||
            chatId;

            const senderNumber = sender.split("@")[0].replace(/\D/g, "");
            const eliteUsers = getElite();

            // التحقق من صلاحية النخبة
            if(!eliteUsers.includes(senderNumber)){
                return sock.sendMessage(chatId, {
                    text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
❌ *هذا الأمر مخصص لقسم (النخبة) فقط*
*لست مسجلاً في قائمة النخبة لتنفيذ أمر المسح*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, {quoted: msg});
            }

            const input = data?.text ? data.text.trim() : (
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                ""
            );

            const args = input.replace(/^\.مسح/, "").trim().split(/\s+/);
            const subCommand = args[0] ? args[0].toLowerCase() : "";

            const folders = getFolders();

            // التعامل مع أمر مسح مجلد كامل (.مسح مجلد [الاسم أو الرقم])
            if (subCommand === 'مجلد') {
                const folderQuery = args.slice(1).join(' ').trim();

                if (!folderQuery) {
                    let listText = `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
                    listText += `       *𝚫𝚪𝚻𝚮𝚼𝚪 • 𝚩𝚯𝚻 2026*\n`;
                    listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
                    listText += `🗑️ *قائمة المجلدات المتاحة للحذف:*\n\n`;

                    folders.forEach((folder, index) => {
                      listText += `*${index + 1}-* 📁 \`${folder}\`\n`;
                    });

                    listText += `\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n`;
                    listText += `💡 *طريقة الاستخدام:*\n`;
                    listText += `\`.مسح مجلد [الاسم أو الرقم]\`\n`;
                    listText += `*مثال:* \`.مسح مجلد 1\` أو \`.مسح مجلد temp\`\n`;
                    listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

                    return sock.sendMessage(chatId, { text: listText }, { quoted: msg });
                }

                let targetFolderName = '';

                if (!isNaN(folderQuery)) {
                    const index = parseInt(folderQuery) - 1;
                    if (index >= 0 && index < folders.length) {
                        targetFolderName = folders[index];
                    }
                } else {
                    const found = folders.find(f => f.toLowerCase() === folderQuery.toLowerCase());
                    if (found) {
                        targetFolderName = found;
                    }
                }

                if (!targetFolderName) {
                    return sock.sendMessage(chatId, {
                        text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    }, { quoted: msg });
                }

                // حماية المجلدات الأساسية
                const protectedFolders = ['data', 'node_modules', '.git'];
                if (protectedFolders.includes(targetFolderName.toLowerCase())) {
                    return sock.sendMessage(chatId, {
                        text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    }, { quoted: msg });
                }

                const targetPath = path.join(process.cwd(), targetFolderName);
                fs.rmSync(targetPath, { recursive: true, force: true });

                return sock.sendMessage(chatId, {
                    text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
✅ *تم مسح المجلد بنجاح*

📁 *المجلد المحذوف:*
\`${targetFolderName}\`

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝛸 𝚩𝚯𝚻 🩸`
                }, { quoted: msg });
            }

            // عرض المجلدات الأساسية
            if(!args[0]){

                let list =
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
       *𝚫𝚪𝚻𝚮𝚼𝚪 • 𝚩𝚯𝚻 2026*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
🗑️ *قائمة المجلدات المتاحة:*

`;

                folders.forEach((f, i)=>{
                    list += `*${i+1}-* 📁 \`${f}\`\n`;
                });

                list +=
`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
💡 *طريقة الاستخدام للملفات:*
\`.مسح رقم المجلد\` *(لعرض الملفات)*

💡 *طريقة الاستخدام للمجلدات:*
\`.مسح مجلد [الاسم أو الرقم]\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝛸 𝚩𝚯𝚻 🩸`;

                return sock.sendMessage(chatId, {
                    text: list
                }, {quoted: msg});

            }

            const folderIndex = parseInt(args[0]) - 1;

            if(!folders[folderIndex]){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, {quoted: msg});
            }

            const files = getFiles(folders[folderIndex]);

            if(!args[1]){

                let list =
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
📂 *المجلد:* \`${folders[folderIndex]}\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
`;

                if(files.length === 0){
                    list += `❌ *لا توجد ملفات داخل هذا المجلد*\n`;
                } else {
                    files.forEach((f, i)=>{
                        list += `*${i+1}-* 📄 \`${f}\`\n`;
                    });
                }

                list +=
`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
💡 *للحذف:*
\`.مسح ${folderIndex+1} [رقم الملف]\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝛸 𝚩𝚯𝚻 🩸`;

                return sock.sendMessage(chatId, {
                    text: list
                }, {quoted: msg});

            }

            const fileIndex = parseInt(args[1]) - 1;

            if(!files[fileIndex]){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, {quoted: msg});
            }

            const filePath = path.join(
                process.cwd(),
                folders[folderIndex],
                files[fileIndex]
            );

            fs.unlinkSync(filePath);

            await sock.sendMessage(chatId, {
                text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
✅ *تم حذف الملف بنجاح*

📂 *المجلد:* \`${folders[folderIndex]}\`
📄 *الملف:* \`${files[fileIndex]}\`

*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝛸 𝚩𝚯𝚻 🩸`,
            }, {quoted: msg});

        }catch(e){

            console.log("مسح خطأ:", e);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                },
                {quoted: msg}
            );

        }

    }

};
