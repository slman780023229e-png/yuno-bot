import fs from "fs";
import path from "path";

const baseDir = process.cwd();
const externalBaseDir = path.resolve(baseDir, "../");

const dataDir =
path.join(baseDir, "data");

const stateFile =
path.join(dataDir, "welcomeState.json");

const jsonFile =
path.join(dataDir, "استقبال.json");

const استقبالFolder =
path.join(externalBaseDir, "استقبال_الألقاب_الخارجي");

if(!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir, { recursive: true });
}

if(!fs.existsSync(استقبالFolder)){
    fs.mkdirSync(استقبالFolder, { recursive: true });
}

if(!fs.existsSync(stateFile)){
    fs.writeFileSync(
        stateFile,
        JSON.stringify({}, null, 2)
    );
}

if(!fs.existsSync(jsonFile)){
    fs.writeFileSync(
        jsonFile,
        JSON.stringify({}, null, 2)
    );
}

function loadState(){
    try{
        return JSON.parse(
            fs.readFileSync(
                stateFile,
                "utf8"
            )
        );
    }catch{
        return {};
    }
}

function saveState(data){
    fs.writeFileSync(
        stateFile,
        JSON.stringify(data, null, 2)
    );
}

function loadData(){
    try{
        return JSON.parse(
            fs.readFileSync(
                jsonFile,
                "utf8"
            )
        );
    }catch{
        return {};
    }
}

function saveData(data){
    fs.writeFileSync(
        jsonFile,
        JSON.stringify(data, null, 2)
    );
}

const mainParties = ["أيزن", "ارثر", "الوكا", "هينا", "روبين", "نامي", "اسكانور", "ليانا", "لينا", "لايت", "ايزن نوت", "هيناتا"];

function smartNormalize(str) {
    return str
        .toLowerCase()
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[^أ-يa-z0-9]/g, "");
}

function detectParty(text) {
    const cleanText = smartNormalize(text);
    
    const targets = [
        { name: "أيزن", keys: ["ايزن", "ازن", "ايسن"] },
        { name: "ارثر", keys: ["ارثر", "ارتور", "ارتر", "اثر"] },
        { name: "الوكا", keys: ["الوكا", "لوكا", "الوكه"] },
        { name: "هينا", keys: ["هينا", "هينه"] },
        { name: "روبين", keys: ["روبين", "روبن"] },
        { name: "نامي", keys: ["نامي", "نامه"] },
        { name: "اسكانور", keys: ["اسكانور", "سكانور", "اسكنور"] },
        { name: "ليانا", keys: ["ليانا", "ليانه"] },
        { name: "لينا", keys: ["لينا", "لينه"] },
        { name: "لايت", keys: ["لايت", "ليت"] },
        { name: "ايزن نوت", keys: ["ايزن نوت", "ايزنوت", "نوت"] },
        { name: "هيناتا", keys: ["هيناتا", "هناتا", "هينه"] }
    ];

    for (const item of targets) {
        for (const key of item.keys) {
            if (cleanText.includes(smartNormalize(key))) {
                return item.name;
            }
        }
    }
    
    const randomIndex = Math.floor(Math.random() * mainParties.length);
    return mainParties[randomIndex];
}

function isUserRegisteredInFolder(sender){
    try{
        const userNumber =
        sender.split("@")[0];

        if(!fs.existsSync(استقبالFolder)) return null;

        const folders =
        fs.readdirSync(
            استقبالFolder,
            {
                withFileTypes: true
            }
        );

        for(const folder of folders){
            if(!folder.isDirectory())
            continue;

            const info =
            path.join(
                استقبالFolder,
                folder.name,
                "معلومات_اللقب.txt"
            );

            if(fs.existsSync(info)){
                const text =
                fs.readFileSync(
                    info,
                    "utf8"
                );

                if(
                    text.includes(sender) ||
                    text.includes(userNumber)
                ){
                    return folder.name;
                }
            }
        }
    }catch(e){}

    return null;
}

function isCharacterTaken(characterName){
    try{
        const safeName = characterName.replace(/[\/\\?%*:|"<>]/g, "_");
        const userFolder = path.join(استقبالFolder, safeName);
        return fs.existsSync(userFolder);
    }catch(e){
        return false;
    }
}

function deleteMessageAfterDelay(
    sock,
    jid,
    key,
    delay = 60000
){
    setTimeout(async() => {
        try{
            await sock.sendMessage(
                jid,
                {
                    delete: key
                }
            );
        }catch{}
    }, delay);
}

const pendingUsers = new Map();
const waitingForPartyUsers = new Map();
const waitingForImageUsers = new Map();
const notifiedUsers = new Map();

const newGroupLink = "https://chat.whatsapp.com/KMpfXPMiWF4JAkR2o5ze0m?s=cl&p=a&ilr=1&amv=3";

export default {

command: "استقبال",
category: "الحماية",
description: "نظام استقبال الأعضاء وتخزين الألقاب في مجلد خارجي",

onMessage: async(sock, msg, data) => {

    const jid =
    msg.key.remoteJid;

    if(
        !jid ||
        !jid.endsWith("@g.us")
    )
    return;

    const db =
    loadState();

    if(!db[jid]?.active)
    return;

    const sender =
    msg.key.participant || msg.participant;

    if(!sender)
    return;
    if(msg.key.fromMe) return;

    const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    data?.text ||
    "";

    const registeredUserCheck = isUserRegisteredInFolder(sender);

    if (registeredUserCheck) {
        if(text.trim() === "الرابط"){
            const linkMsg = await sock.sendMessage(
                jid,
                {
                    text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

🔗 رابط دخولك للقروب الأساسي:
${newGroupLink}

اضغط الرابط وادخل بسرعة 🤍

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                    mentions: [sender]
                },
                { quoted: msg }
            );

            const warnMsg = await sock.sendMessage(
                jid,
                {
                    text: `*(ملاحظة: سيتم حذف هذا الرابط خلال دقيقة لحماية المجموعة)*`,
                    mentions: [sender]
                },
                { quoted: linkMsg }
            );

            if(linkMsg && linkMsg.key){
                deleteMessageAfterDelay(sock, jid, linkMsg.key, 60000);
            }
        }
        return;
    }

    if (!waitingForPartyUsers.has(sender) && !pendingUsers.has(sender) && !waitingForImageUsers.has(sender)) {
        if (text && !text.startsWith(".")) {
            waitingForPartyUsers.set(sender, true);
            return await sock.sendMessage(
                jid,
                {
                    text: `منورنا يا هلا بك @${sender.split("@")[0]} 🤍\nمن طرف مين دخلت؟`,
                    mentions: [sender]
                },
                { quoted: msg }
            );
        }
    }

    if(waitingForPartyUsers.has(sender)){
        let rawText = text.trim();
        let partyName = detectParty(rawText);

        pendingUsers.set(
            sender,
            {
                inviter: partyName
            }
        );
        waitingForPartyUsers.delete(sender);

        await sock.sendMessage(
            jid,
            {
                text:
`📸 **التعليمات:**
أرسل لقبك الآن بين أقواس \`[ ]\` (مثال: \`[ايزن]\`) وارسل معها صورتك الشخصية التي اخترتها، أو أرسل اللقب لوحده ولو ما عندك نت اكتب: **ما عندي** أو **مفيش**`,
                mentions: [sender]
            },
            { quoted: msg }
        );

        return;
    }

    let characterName = "";
    const brackets =
    [...text.matchAll(
    /[\(\[【「『《（](.*?)[\)\]】»』》（]/g
    )];

    if(brackets.length){
        characterName =
        brackets[0][1].trim();
    }

    if (waitingForImageUsers.has(sender)) {
        const userInfo = waitingForImageUsers.get(sender);
        const lowerText = text.trim().toLowerCase();

        if (lowerText === "ما عندي" || lowerText === "ما معي نت" || lowerText === "مفيش" || lowerText === "مامعي نت" || lowerText === "ماعندي") {
            waitingForImageUsers.delete(sender);
            
            const safeName = userInfo.characterName.replace(/[\/\\?%*:|"<>]/g, "_");
            const userFolder = path.join(استقبالFolder, safeName);
            if (!fs.existsSync(userFolder)) {
                fs.mkdirSync(userFolder, { recursive: true });
            }

            const infoPath = path.join(userFolder, "معلومات_اللقب.txt");
            fs.writeFileSync(
                infoPath,
                `مسار الصورة: بدون صورة (عذر: ${text})\nاللقب: ${userInfo.characterName}\nمن طرف: ${userInfo.inviterName}\nرقم المستخدم: ${sender}\nالتاريخ: ${new Date().toISOString()}`
            );

            const groupData = loadData();
            if (!groupData[jid]) groupData[jid] = {};
            groupData[jid][sender] = {
                user: sender,
                character: userInfo.characterName,
                inviter: userInfo.inviterName,
                image: "بدون صورة",
                time: new Date().toISOString()
            };
            saveData(groupData);

            const sentMsg = await sock.sendMessage(
                jid,
                {
                    text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

✅ تم تسجيل لقبك بنجاح!

🎭 لقبك: **${userInfo.characterName}**
👤 من طرف: **${userInfo.inviterName}**

🔗 رابط الدخول للقروب الأساسي:
${newGroupLink}

اضغط الرابط وادخل بسرعة!

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                    mentions: [sender]
                },
                { quoted: msg }
            );

            const warnMsgReg = await sock.sendMessage(
                jid,
                {
                    text: `*(ملاحظة: سيتم حذف هذا الرابط خلال دقيقة لحماية المجموعة)*`,
                    mentions: [sender]
                },
                { quoted: sentMsg }
            );

            if (sentMsg && sentMsg.key) {
                deleteMessageAfterDelay(sock, jid, sentMsg.key, 60000);
            }
            return;
        }

        const imageMessage = msg.message?.imageMessage;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (imageMessage || quoted?.imageMessage) {
            let targetMsg = imageMessage ? msg : { message: quoted };
            let buffer;
            try {
                const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
                let type = Object.keys(targetMsg.message)[0];
                let content = targetMsg.message[type];

                const stream = await downloadContentFromMessage(content, "image");
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
            } catch (e) {
                return sock.sendMessage(jid, { text: "❌ حدث خطأ في تحميل الصورة، حاول إرسالها مرة أخرى" }, { quoted: msg });
            }

            waitingForImageUsers.delete(sender);

            const safeName = userInfo.characterName.replace(/[\/\\?%*:|"<>]/g, "_");
            const userFolder = path.join(استقبالFolder, safeName);
            if (!fs.existsSync(userFolder)) {
                fs.mkdirSync(userFolder, { recursive: true });
            }

            const imagePath = path.join(userFolder, `${safeName}.jpg`);
            fs.writeFileSync(imagePath, buffer);

            const infoPath = path.join(userFolder, "معلومات_اللقب.txt");
            fs.writeFileSync(
                infoPath,
                `مسار الصورة: ${imagePath}\nاللقب: ${userInfo.characterName}\nمن طرف: ${userInfo.inviterName}\nرقم المستخدم: ${sender}\nالتاريخ: ${new Date().toISOString()}`
            );

            const groupData = loadData();
            if (!groupData[jid]) groupData[jid] = {};
            groupData[jid][sender] = {
                user: sender,
                character: userInfo.characterName,
                inviter: userInfo.inviterName,
                image: imagePath,
                time: new Date().toISOString()
            };
            saveData(groupData);

            const sentMsg = await sock.sendMessage(
                jid,
                {
                    text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

✅ تم تسجيل لقبك وصورتك بنجاح يا وحش!

🎭 لقبك: **${userInfo.characterName}**
👤 من طرف: **${userInfo.inviterName}**

🔗 رابط الدخول للقروب الأساسي:
${newGroupLink}

اضغط الرابط وادخل بسرعة!

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                    mentions: [sender]
                },
                { quoted: msg }
            );

            const warnMsgReg = await sock.sendMessage(
                jid,
                {
                    text: `*(ملاحظة: سيتم حذف هذا الرابط خلال دقيقة لحماية المجموعة)*`,
                    mentions: [sender]
                },
                { quoted: sentMsg }
            );

            if (sentMsg && sentMsg.key) {
                deleteMessageAfterDelay(sock, jid, sentMsg.key, 60000);
            }
            return;
        }
    }

    if(characterName && characterName !== "اللقب" && characterName !== "[ ]"){
        if(isCharacterTaken(characterName)){
            return sock.sendMessage(
                jid,
                {
                    text: `⚠️ عذراً، هذا اللقب (**${characterName}**) مأخوذ ومسجل مسبقاً من قبل عضو آخر! اختر لقباً غيره ❌`
                },
                { quoted: msg }
            );
        }

        const pending = pendingUsers.get(sender);
        const inviterName = pending ? pending.inviter : "غير معروف";

        const imageMessage = msg.message?.imageMessage;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if(imageMessage || quoted?.imageMessage){
            let targetMsg = imageMessage ? msg : { message: quoted };
            let buffer;

            try{
                const {
                    downloadContentFromMessage
                } =
                await import("@whiskeysockets/baileys");

                let type =
                Object.keys(targetMsg.message)[0];

                let content =
                targetMsg.message[type];

                const stream =
                await downloadContentFromMessage(
                    content,
                    "image"
                );

                buffer =
                Buffer.from([]);

                for await(const chunk of stream){
                    buffer =
                    Buffer.concat(
                        [
                            buffer,
                            chunk
                        ]
                    );
                }

            }catch(e){
                return sock.sendMessage(
                    jid,
                    { text: "❌ حدث خطأ في تحميل الصورة، حاول إرسالها مرة أخرى" },
                    { quoted: msg }
                );
            }

            pendingUsers.delete(sender);

            const safeName =
            characterName
            .replace(/[\/\\?%*:|"<>]/g, "_");

            const userFolder =
            path.join(
                استقبالFolder,
                safeName
            );

            if(!fs.existsSync(userFolder)){
                fs.mkdirSync(
                    userFolder,
                    {
                        recursive: true
                    }
                );
            }

            const imagePath =
            path.join(
                userFolder,
                `${safeName}.jpg`
            );

            fs.writeFileSync(
                imagePath,
                buffer
            );

            const infoPath =
            path.join(
                userFolder,
                "معلومات_اللقب.txt"
            );

            fs.writeFileSync(
                infoPath,
                `مسار الصورة: ${imagePath}\nاللقب: ${characterName}\nمن طرف: ${inviterName}\nرقم المستخدم: ${sender}\nالتاريخ: ${new Date().toISOString()}`
            );

            const groupData =
            loadData();

            if(!groupData[jid])
            groupData[jid] = {};

            groupData[jid][sender] = {
                user: sender,
                character: characterName,
                inviter: inviterName,
                image: imagePath,
                time: new Date().toISOString()
            };

            saveData(groupData);

            const sentMsg = await sock.sendMessage(
                jid,
                {
                    text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

✅ تم تسجيل لقبك وصورتك بنجاح يا وحش!

🎭 لقبك: **${characterName}**
👤 من طرف: **${inviterName}**

🔗 رابط الدخول للقروب الأساسي:
${newGroupLink}

اضغط الرابط وادخل بسرعة!

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                    mentions: [sender]
                },
                {
                    quoted: msg
                }
            );

            const warnMsgReg = await sock.sendMessage(
                jid,
                {
                    text: `*(ملاحظة: سيتم حذف هذا الرابط خلال دقيقة لحماية المجموعة)*`,
                    mentions: [sender]
                },
                {
                    quoted: sentMsg
                }
            );

            if(sentMsg && sentMsg.key){
                deleteMessageAfterDelay(sock, jid, sentMsg.key, 60000);
            }
            return;
        } else {
            waitingForImageUsers.set(sender, {
                characterName: characterName,
                inviterName: inviterName
            });
            pendingUsers.delete(sender);

            return await sock.sendMessage(
                jid,
                {
                    text: `📸 تم استقبال لقبك (**${characterName}**).\nالآن أرسل صورة شخصيتك التي اخترتها، ولو ما عندك نت أو صورة اكتب: **ما عندي** أو **مفيش** لإعطائك الرابط!`,
                    mentions: [sender]
                },
                { quoted: msg }
            );
        }
    }

},

execute: async(sock, msg, data) => {

    const jid =
    msg.key.remoteJid || data.jid;

    if(
        !jid.endsWith("@g.us")
    ){
        return sock.sendMessage(
            jid,
            { text: "❌ هذا الأمر يشتغل داخل المجموعات فقط" },
            { quoted: msg }
        );
    }

    const text =
    data?.text ||
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    "";

    const clean =
    text.trim().replace(/^\./, "").trim();

    const args =
    clean.split(/\s+/);

    const action =
    args[1] || args[0];

    const db =
    loadState();

    if(
        action !== "تفعيل" &&
        action !== "تعطيل"
    ){
        return sock.sendMessage(
            jid,
            {
                text:
`🪶 حالة نظام الاستقبال

${db[jid]?.active ? "✅ النظام شغال ومفعل" : "⛔ النظام مطفي حالياً"}

طريقة الاستخدام:
.استقبال تفعيل
.استقبال تعطيل`
            },
            { quoted: msg }
        );
    }

    if(action === "تفعيل"){
        db[jid] = {
            active: true
        };

        saveState(db);

        return sock.sendMessage(
            jid,
            {
                text:
`━━━╼╃⌬〔 🪶 𝐅𝐋𝐎𝐑𝐈𝐀 🪶 〕⌬╄━━━

✅ تم تفعيل نظام الاستقبال بنجاح

🪶 𝐅𝐋𝐎𝐑𝐈𝐀 𝐁𝐎𝐓`
            },
            { quoted: msg }
        );
    }

    if(action === "تعطيل"){
        delete db[jid];
        saveState(db);

        return sock.sendMessage(
            jid,
            {
                text:
`⛔ تم تعطيل نظام الاستقبال بنجاح

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`
            },
            { quoted: msg }
        );
    }

},

onGroupParticipantsUpdate: async(sock, update) => {

    const jid = update.id;
    const db = loadState();

    if(!db[jid]?.active)
    return;

    if(update.action === "add"){
        for(const user of update.participants){

            notifiedUsers.delete(user);

            const registered =
            isUserRegisteredInFolder(user);

            if(registered){
                notifiedUsers.set(
                    `${user}_notified`,
                    true
                );

                await sock.sendMessage(
                    jid,
                    {
                        text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

⚠️ يا هلا، أنت مسجل عندنا من قبل!
👤 @${user.split("@")[0]}

🎭 لقبك المسجل: **${registered}**
لو ضاع عليك الرابط، اكتب كلمة: **الرابط**

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                        mentions: [user]
                    }
                );

                continue;
            }

            waitingForPartyUsers.set(
                user,
                true
            );

            await sock.sendMessage(
                jid,
                {
                    text:
`منورنا يا هلا بك @${user.split("@")[0]} 🤍
من طرف مين دخلت؟`,
                    mentions: [user]
                }
            );

        }
    }

    if(update.action === "remove"){
        for(const user of update.participants){

            waitingForPartyUsers.delete(user);
            pendingUsers.delete(user);
            waitingForImageUsers.delete(user);
            notifiedUsers.delete(user);

            const oldChar =
            isUserRegisteredInFolder(user) ||
            "بدون لقب";

            await sock.sendMessage(
                jid,
                {
                    text:
`🪶 𝐅𝐋𝐎𝐑𝐈𝐀

👋 مع السلامة، الله يحفظه العضو:
@${user.split("@")[0]}

🎭 شخصيته كانت: **${oldChar}**

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`,
                    mentions: [user]
                }
            );

        }
    }

}

};
