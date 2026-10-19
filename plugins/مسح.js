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

            // التعامل مع أمر مسح مجلد كامل (.مسح مجلد [الاسم أو الرقم] أو بالنطاق)
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
                    listText += `*مثال:* \`.مسح مجلد 1\` أو \`.مسح مجلد temp\` أو \`.مسح مجلد 2-5\`\n`;
                    listText += `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

                    return sock.sendMessage(chatId, { text: listText }, { quoted: msg });
                }

                const protectedFolders = ['data', 'node_modules', '.git'];
                let targetFolderNames = [];

                // التحقق مما إذا كان المدخل نطاق حذف جماعي للمجلدات (مثل 2-5 أو 2+5)
                const rangeMatch = folderQuery.match(/^(\d+)([-+]?)(\d*)$/);
                if (rangeMatch && rangeMatch[2]) {
                    const start = parseInt(rangeMatch[1]);
                    const end = rangeMatch[3] ? parseInt(rangeMatch[3]) : start;
                    const min = Math.min(start, end);
                    const max = Math.max(start, end);

                    for (let i = min; i <= max; i++) {
                        const idx = i - 1;
                        if (folders[idx]) {
                            const fName = folders[idx];
                            if (!protectedFolders.includes(fName.toLowerCase())) {
                                targetFolderNames.push(fName);
                            }
                        }
                    }
                } else if (!isNaN(folderQuery)) {
                    const index = parseInt(folderQuery) - 1;
                    if (index >= 0 && index < folders.length) {
                        const fName = folders[index];
                        if (!protectedFolders.includes(fName.toLowerCase())) {
                            targetFolderNames.push(fName);
                        }
                    }
                } else {
                    const found = folders.find(f => f.toLowerCase() === folderQuery.toLowerCase());
                    if (found && !protectedFolders.includes(found.toLowerCase())) {
                        targetFolderNames.push(found);
                    }
                }

                if (targetFolderNames.length === 0) {
                    return sock.sendMessage(chatId, {
                        text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                    }, { quoted: msg });
                }

                let deletedList = '';
                for (const targetFolderName of targetFolderNames) {
                    const targetPath = path.join(process.cwd(), targetFolderName);
                    fs.rmSync(targetPath, { recursive: true, force: true });
                    deletedList += `📁 \`${targetFolderName}\`\n`;
                }

                return sock.sendMessage(chatId, {
                    text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
✅ *تم مسح المجلدات بنجاح*

📂 *المجلدات المحذوفة:*
${deletedList}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝚸 𝚩𝚯𝚻 🩸`
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
\`.مسح مجلد [الاسم أو الرقم أو نطاق مثل 2-5]\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝚨𝚸 𝚩𝚯𝚻 🩸`;

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
💡 *للحذف الفردي أو بالجملة:*
\`.مسح ${folderIndex+1} [رقم الملف]\` أو \`.مسح ${folderIndex+1} 2-10\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝚸 𝚩𝚯𝚻 🩸`;

                return sock.sendMessage(chatId, {
                    text: list
                }, {quoted: msg});

            }

            const fileQuery = args.slice(1).join(" ").trim();
            let targetFileIndices = [];

            // التحقق من دعم النطاق (مثل 2-10 أو 2+10)
            const fileRangeMatch = fileQuery.match(/^(\d+)([-+]?)(\d*)$/);
            if (fileRangeMatch && fileRangeMatch[2]) {
                const start = parseInt(fileRangeMatch[1]);
                const end = fileRangeMatch[3] ? parseInt(fileRangeMatch[3]) : start;
                const min = Math.min(start, end);
                const max = Math.max(start, end);

                for (let i = min; i <= max; i++) {
                    const idx = i - 1;
                    if (files[idx]) {
                        targetFileIndices.push(idx);
                    }
                }
            } else if (!isNaN(fileQuery)) {
                const idx = parseInt(fileQuery) - 1;
                if (files[idx]) {
                    targetFileIndices.push(idx);
                }
            }

            if (targetFileIndices.length === 0) {
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`
                }, {quoted: msg});
            }

            let deletedFilesList = '';
            for (const fileIndex of targetFileIndices) {
                const filePath = path.join(
                    process.cwd(),
                    folders[folderIndex],
                    files[fileIndex]
                );
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedFilesList += `📄 \`${files[fileIndex]}\`\n`;
                }
            }

            await sock.sendMessage(chatId, {
                text:
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
✅ *تم حذف الملفات بنجاح*

📂 *المجلد:* \`${folders[folderIndex]}\`
${deletedFilesList}
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
┇ 𝐀𝛾𝚻𝛨𝚸 𝚩𝚯𝚻 🩸`,
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