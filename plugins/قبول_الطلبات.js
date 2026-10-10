import fs from "fs";
import path from "path";

const baseDir = process.cwd();
const externalBaseDir = path.resolve(baseDir, "../");

const dataDir = path.join(baseDir, "data");
const stateFile = path.join(dataDir, "autoJoinState.json");
const استقبالFolder = path.join(externalBaseDir, "استقبال_الألقاب_الخارجي");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(استقبالFolder)) {
    fs.mkdirSync(استقبالFolder, { recursive: true });
}

if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({}, null, 2));
}

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
        return {};
    }
}

function saveState(data) {
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
}

const processedRequests = new Set();

function deleteUserRegistrationData(userJid) {
    try {
        const userNumber = userJid.split("@")[0].trim();
        const fullFolderResolved = path.resolve(استقبالFolder);
        
        if (!fs.existsSync(fullFolderResolved)) return null;

        const folders = fs.readdirSync(fullFolderResolved, { withFileTypes: true });
        for (const folder of folders) {
            if (folder.isDirectory()) {
                const folderName = folder.name;
                const folderPath = path.join(fullFolderResolved, folderName);
                const infoFilePath = path.join(folderPath, "معلومات_اللقب.txt");

                let shouldDelete = false;

                if (fs.existsSync(infoFilePath)) {
                    try {
                        const content = fs.readFileSync(infoFilePath, "utf8");
                        if (
                            content.includes(userJid) || 
                            content.includes(userNumber) || 
                            content.includes(userJid.replace("@s.whatsapp.net", ""))
                        ) {
                            shouldDelete = true;
                        }
                    } catch (readErr) {}
                }

                if (shouldDelete) {
                    try {
                        fs.rmSync(folderPath, { recursive: true, force: true });
                        return folderName;
                    } catch (rmErr) {}
                }
            }
        }
    } catch (err) {}
    return null;
}

async function approveRequest(sock, jid, user) {
    try {
        await sock.groupRequestParticipantsUpdate(jid, [user], "approve");
        return true;
    } catch (e) {
        return false;
    }
}

async function notifyAdminsAboutUnregistered(sock, jid, user) {
    try {
        const metadata = await sock.groupMetadata(jid);
        const admins = metadata.participants
            .filter(p => p.admin === "admin" || p.admin === "superadmin")
            .map(p => p.id);

        const text =
`*🪶 رِيـش فـلـوريـا 🪶*

*⚠️ تنبيه للمشرفين:*
*طلب انضمام العضو معلق لعدم وجوده في مجلد الاستقبال (غير مسجل).*

*👤 العضو المعلق: @${user.split("@")[0]}*`;

        await sock.sendMessage(
            jid,
            {
                text: text,
                mentions: [...admins, user]
            }
        );
    } catch (e) {}
}

function getRegisteredUserData(userJid) {
    try {
        const userNumber = userJid.split("@")[0].trim();
        const fullFolderResolved = path.resolve(استقبالFolder);

        if (!fs.existsSync(fullFolderResolved)) return null;

        const folders = fs.readdirSync(fullFolderResolved, { withFileTypes: true });
        for (const folder of folders) {
            if (folder.isDirectory()) {
                const folderName = folder.name;
                const folderPath = path.join(fullFolderResolved, folderName);
                
                if (!fs.existsSync(folderPath)) continue;

                const files = fs.readdirSync(folderPath);
                let matched = false;
                let imagePath = null;

                for (const file of files) {
                    const filePath = path.join(folderPath, file);
                    if (file.endsWith(".txt")) {
                        try {
                            const content = fs.readFileSync(filePath, "utf8");
                            if (
                                content.includes(userJid) || 
                                content.includes(userNumber) || 
                                content.includes(userJid.replace("@s.whatsapp.net", ""))
                            ) {
                                matched = true;
                            }
                        } catch (txtErr) {}
                    } else if (file.endsWith(".jpg") || file.endsWith(".png") || file.endsWith(".jpeg")) {
                        imagePath = filePath;
                    }
                }

                if (matched) {
                    return {
                        character: folderName,
                        image: imagePath && fs.existsSync(imagePath) ? imagePath : null
                    };
                }
            }
        }
    } catch (err) {}
    return null;
}

async function sendGoodbye(sock, jid, user, characterName) {
    const text =
`*🪶 رِيـش فـلـوريـا تـودعـك 🪶*

*و تـسـود الـسـكـيـنـة بغـيـاب عـضـو/ۃ... 🪻*

*❉━═━╄━❪🪶❫━╃━═━❉*

*لـقـد غـادرنـا إلـى عـالـم آخـر*

*تـركـت خـلـفـك صـدى طـيـبـاً فـي مـوطـن فـلـوريـا ✨*

*❉━═━╄━❪🪶❫━╃━═━❉*

*الـلـقـب الـمـحـذوف ↜〘${characterName}〙⃤👤*

*المـنـشـن ↜〘@${user.split("@")[0]}〙⃤🔊*

*❉━═━╄━❪🪶❫━╃━═━❉*

*🪶 نـتـمـنـى لـك كـل الـتـوفـيـق 🪶*`;

    await sock.sendMessage(
        jid,
        {
            text: text,
            mentions: [user]
        }
    );
}

async function sendWelcome(sock, jid, user, registeredData) {
    const characterName = registeredData && registeredData.character ? registeredData.character : "عضو جديد";
    const imagePath = registeredData && registeredData.image ? registeredData.image : null;

    const text =
`*🪶 رِيـش فـلـوريـا تـحـيـيـك 🪶*

*و تــضـم إلــيـهـا عــضــو/ۃ جــديـد/ه... 🪻*

*❉━═━╄━❪🪶❫━╃━═━❉*

*نــرحــب بــك فــي مــوطــن فــلـوريـا*

*حــيـث تـكـتـب أجـمـل الـذكـريـات بـريـشـة الـمـجـد ✨*

*❉━═━╄━❪🪶❫━╃━═━❉*

*الـلـقـب ↜〘${characterName}〙⃤👤*

*المـنـشـن ↜〘@${user.split("@")[0]}〙⃤🔊*

*❉━═━╄━❪🪶❫━╃━═━❉*

*🍷 نـود مـنـك الـدخـول إلـى....*

*إعـلانـات فـلـوريـا ↶⛯*

*〘 https://chat.whatsapp.com/JEDfrV0zt4EDVf4v5CVi9e?s=cl&p=a&ilr=1&amv=3 〙*

*رابـط صـحـيـفـة فـلـوريـa ↶⛯*

*〘 https://chat.whatsapp.com/FS5oNFuvt341r00dIkLhVt?s=cl&p=a&ilr=1&amv=3 〙*

*🪶 أهـلاً بـك فـي فـلـوريـا 🪶*`;

    if (imagePath && fs.existsSync(imagePath)) {
        await sock.sendMessage(
            jid,
            {
                image: { url: imagePath },
                caption: text,
                mentions: [user]
            }
        );
    } else {
        await sock.sendMessage(
            jid,
            {
                text: text,
                mentions: [user]
            }
        );
    }
}

export default {
    command: "قبول",
    category: "الحماية",
    description: "قبول طلبات الانضمام تلقائياً للمسجلين وإبقاء غير المسجلين معلقين مع منشن المشرفين",

    onGroupJoinRequest: async (sock, update) => {
        try {
            const db = loadState();
            const jid = update.id;
            if (!db[jid]?.active) return;

            const user = update.participant || update.author;
            if (!user) return;

            const uniqueKey = `${jid}_${user}`;
            if (processedRequests.has(uniqueKey)) return;
            processedRequests.add(uniqueKey);
            setTimeout(() => processedRequests.delete(uniqueKey), 30000);

            const registeredData = getRegisteredUserData(user);

            if (registeredData) {
                await approveRequest(sock, jid, user);
                await sendWelcome(sock, jid, user, registeredData);
            } else {
                await notifyAdminsAboutUnregistered(sock, jid, user);
            }
        } catch (e) {}
    },

    onGroupParticipantsUpdate: async (sock, update) => {
        try {
            const db = loadState();
            const jid = update.id;
            if (!db[jid]?.active) return;

            if (update.action === "remove") {
                const leftUsers = update.participants;
                for (const user of leftUsers) {
                    const characterName = deleteUserRegistrationData(user);
                    if (characterName) {
                        await sendGoodbye(sock, jid, user, characterName);
                    }
                }
            }
        } catch (e) {}
    },

    execute: async (sock, msg, data) => {
        const jid = data.jid || msg.key.remoteJid;

        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(
                jid,
                { text: "❌ الأمر للمجموعات فقط" },
                { quoted: msg }
            );
        }

        const text =
        data.text ||
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

        const clean =
        text.trim().replace(/^\./, "").trim();

        const args =
        clean.split(/\s+/);

        const action =
        args[1] || args[0];

        const db = loadState();

        if (
            action !== "تفعيل" &&
            action !== "تعطيلق" &&
            action !== "تعطيل"
        ) {
            return sock.sendMessage(
                jid,
                {
                    text: 
`🪶 حالة نظام قبول الطلبات

${db[jid]?.active ? "✅ مفعل" : "⛔ متوقف"}

الاستخدام:

.قبول تفعيل
.قبول تعطيل`
                },
                { quoted: msg }
            );
        }

        if (action === "تفعيل") {
            db[jid] = { active: true };
            saveState(db);

            return sock.sendMessage(
                jid,
                {
                    text: 
`━━━╼╃⌬〔 🪶 𝐅𝐋𝐎𝐑𝐈𝐀 🪶 〕⌬╄━━━

✅ تم تفعيل نظام قبول الطلبات التلقائي

🪶 𝐅𝐋𝐎𝐑𝐈𝐀 𝐁𝐎𝐓`
                },
                { quoted: msg }
            );
        }

        if (action === "تعطيل" || action === "تعطيلق") {
            delete db[jid];
            saveState(db);

            return sock.sendMessage(
                jid,
                {
                    text: 
`⛔ تم تعطيل نظام قبول الطلبات

🪶 𝐅𝐋𝐎𝐑𝐈𝐀`
                },
                { quoted: msg }
            );
        }
    }
};
