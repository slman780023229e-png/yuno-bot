// plugins/add.js
import fs from "fs";
import path from "path";
import { downloadMediaMessage } from '@whiskeysockets/baileys';

// دالة جلب أعضاء النخبة مطابقة تماماً لكود الريستارت
function getElite(){
    const dataPath = path.join(process.cwd(), "data");
    let elite = [];
    const files = ["النخبة.json", "النخبه.json", "النخبة", "النخبه"];

    for(const file of files){
        const filePath = path.join(dataPath, file);
        if(fs.existsSync(filePath)){
            try{
                const fileContent = fs.readFileSync(filePath, "utf8");
                if (fileContent.includes("{") || fileContent.includes("[")) {
                    const rawData = JSON.parse(fileContent);
                    elite = Array.isArray(rawData) ? rawData : Object.values(rawData);
                } else {
                    elite = fileContent.split(/\r?\n/).filter(Boolean);
                }
                break;
            }catch(err){}
        }
    }
    return elite.map(x => String(x).replace(/\D/g, ""));
}

function getFolders(){
    const root = process.cwd();
    return fs.readdirSync(root).filter(file=>{
        const full = path.join(root, file);
        return fs.statSync(full).isDirectory();
    });
}

export default {

    command: 'اضف',

    description: 'إضافة ملفات، صور، فيديوهات ومجلدات (خاص بالنخبة)',

    usage: '.اضف رقم الاسم',

    category: 'النخبه',

    async execute(sock, msg, data){

        try{

            const chatId = data?.jid || msg.key.remoteJid;

            const sender =
            msg.key.participant ||
            msg.participant ||
            msg.key.remoteJid ||
            data?.sender || "";

            const senderNumber = String(sender).replace(/\D/g, "");
            const eliteUsers = getElite();

            // التحقق من صلاحية النخبة بنفس معيار الريستارت بدقة تامة
            const isElite = eliteUsers.some(el => {
                return senderNumber === el || 
                       (senderNumber.length > 8 && el.length > 8 && (senderNumber.endsWith(el) || el.endsWith(senderNumber)));
            });

            if(!isElite){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });
            }

            const text =
            data?.text ||
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

            const args =
            text.trim()
            .split(/\s+/)
            .slice(1);

            // عرض المجلدات
            if(!args[0]){

                const folders = getFolders();

                let list =
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
📁 *قائمة مجلدات البوت الأساسية*
`;

                folders.forEach((f, i)=>{
                    list += `📂 *[ ${i+1} ]* ⟵ ${f}\n`;
                });

                list +=
`*◇❐ ═━╾ 🩸 ╼━═ ❐◇*
⚡ *طريقة الاستخدام:*
> \`.اضف رقم_المجلد اسم_الملف\`

📌 *مثال لحفظ ملف JSON داخل مجلد data:*
> \`.اضف <رقم_مجلد_data> settings.json\`

📂 *لإنشاء مجلد جديد:*
> \`.اضف مجلد اسم_الملف\`
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

                return sock.sendMessage(chatId, {
                    text: list
                }, {quoted: msg});

            }

            // إنشاء مجلد
            if(args[0] === "مجلد"){

                if(!args[1])
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });

                fs.mkdirSync(
                    path.join(process.cwd(), args[1]),
                    {recursive: true}
                );

                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n📂 *تم إنشاء المجلد بنجاح!*\n📁 *الاسم:* \`${args[1]}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });

            }

            const folders = getFolders();
            const index = parseInt(args[0]) - 1;

            if(!folders[index]){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });
            }

            const fileName = args[1];

            if(!fileName){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });
            }

            const quoted =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if(!quoted){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });
            }

            const folderPath = path.join(process.cwd(), folders[index]);
            const isDataFolder = folders[index].toLowerCase() === "data";

            // حفظ صورة
            if(quoted.imageMessage){

                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {},
                    { logger: console }
                );

                const ext =
                quoted.imageMessage.mimetype?.includes('png')
                ? '.png'
                : '.jpg';

                fs.writeFileSync(
                    path.join(folderPath, fileName + ext),
                    buffer
                );

                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n🖼️ *تم حفظ الصورة بنجاح!*\n📂 *المجلد:* \`${folders[index]}\`\n📄 *الملف:* \`${fileName + ext}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });

            }

            // حفظ فيديو
            if(quoted.videoMessage){

                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {},
                    { logger: console }
                );

                const ext =
                quoted.videoMessage.mimetype?.includes('gif')
                ? '.gif'
                : '.mp4';

                fs.writeFileSync(
                    path.join(folderPath, fileName + ext),
                    buffer
                );

                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n🎥 *تم حفظ الفيديو بنجاح!*\n📂 *المجلد:* \`${folders[index]}\`\n📄 *الملف:* \`${fileName + ext}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });

            }

            // حفظ كود أو بيانات
            const code =
            quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            "";

            if(!code){
                return sock.sendMessage(chatId, {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                });
            }

            let saveName;
            let finalContent = code;

            // إذا كان المجلد المستهدف هو data، نتحقق ونضمن حفظه بصيغة وصلاحية JSON سليمة
            if (isDataFolder) {
                if (fileName.endsWith('.json')) {
                    saveName = fileName;
                } else if (fileName.endsWith('.js')) {
                    saveName = fileName.replace(/\.js$/, '.json');
                } else {
                    saveName = fileName + '.json';
                }

                // محاولة تنسيق النص وضبطه ككائن JSON سليم وصحيح تلقائياً إن أمكن
                try {
                    const parsed = JSON.parse(code);
                    finalContent = JSON.stringify(parsed, null, 2);
                } catch {
                    // إذا كان النص المنسوخ عبارة عن متغير JS أو يحتوي على أسطر غير كائن JSON بحت، نتحقق أو نحفظه كما هو كملف نصي بيانات
                    finalContent = code;
                }
            } else {
                // للمجلدات العادية (باقي المجلدات مثل plugins وغيرها)
                if (fileName.endsWith('.json') || fileName.endsWith('.js')) {
                    saveName = fileName;
                } else {
                    saveName = fileName + '.js';
                }
            }

            fs.writeFileSync(
                path.join(folderPath, saveName),
                finalContent,
                'utf8'
            );

            await sock.sendMessage(chatId, {
                text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n📄 *تم حفظ الملف بنجاح!*\n📂 *المجلد:* \`${folders[index]}\`\n📑 *الملف:* \`${saveName}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                quoted: msg
            });

        }catch(e){

            console.log("اضف خطأ:", e);

            await sock.sendMessage(
                data?.jid || msg.key.remoteJid,
                {
                    text: `*◇❐ ═━╾ 🩸 ╼━═ ❐◇*\n❌ *حدث خطأ أثناء تنفيذ الأمر:*\n\`${e.message}\`\n*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`,
                    quoted: msg
                }
            );

        }

    }

};
