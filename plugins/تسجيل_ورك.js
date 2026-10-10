import fs from "fs";
import path from "path";

const baseDir = process.cwd();
const externalBaseDir = path.resolve(baseDir, "../");

const dataDir = path.join(baseDir, "data");
const stateFile = path.join(dataDir, "workRegistration.json");
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

function getCurrentDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

let listenerStarted = false;

export function initWorkListener(sock) {
    if (listenerStarted) return;
    listenerStarted = true;

    setInterval(async () => {
        try {
            const db = loadState();
            const activeGroups = Object.keys(db).filter(jid => db[jid]?.active);
            if (activeGroups.length === 0) return;

            if (!fs.existsSync(استقبالFolder)) return;
            const folders = fs.readdirSync(استقبالFolder, { withFileTypes: true });
            const todayKey = getCurrentDateKey();

            for (const folder of folders) {
                if (folder.isDirectory()) {
                    const folderName = folder.name;
                    const folderPath = path.join(استقبالFolder, folderName);

                    for (const jid of activeGroups) {
                        if (!db[jid].dateKey || db[jid].dateKey !== todayKey) {
                            db[jid].dateKey = todayKey;
                            db[jid].counter = 0;
                            db[jid].inviterCounters = {};
                            db[jid].processed = [];
                            db[jid].inviterDetails = {};
                        }

                        if (!db[jid].processed) {
                            db[jid].processed = [];
                        }

                        if (db[jid].processed.includes(folderName)) {
                            continue;
                        }

                        const files = fs.readdirSync(folderPath);
                        let userJid = null;
                        let userPhone = null;
                        let invitedBy = "موطن فلوريا";

                        for (const file of files) {
                            if (file.endsWith(".txt")) {
                                try {
                                    const content = fs.readFileSync(path.join(folderPath, file), "utf8");
                                    const match = content.match(/(\d{10,15})/);
                                    if (match) {
                                        userPhone = match[1];
                                        userJid = `${userPhone}@s.whatsapp.net`;
                                    }
                                    if (content.includes("من طرف")) {
                                        const parts = content.split("من طرف");
                                        if (parts[1]) invitedBy = parts[1].trim().split("\n")[0];
                                    }
                                } catch (err) {}
                            }
                        }

                        if (!db[jid].inviterCounters) {
                            db[jid].inviterCounters = {};
                        }
                        if (!db[jid].inviterCounters[invitedBy]) {
                            db[jid].inviterCounters[invitedBy] = 0;
                        }

                        if (!db[jid].inviterDetails) {
                            db[jid].inviterDetails = {};
                        }
                        if (!db[jid].inviterDetails[invitedBy]) {
                            db[jid].inviterDetails[invitedBy] = [];
                        }

                        db[jid].inviterCounters[invitedBy]++;
                        const inviterCount = db[jid].inviterCounters[invitedBy];

                        db[jid].counter = (db[jid].counter || 0) + 1;
                        const totalReceptionCount = db[jid].counter;

                        db[jid].inviterDetails[invitedBy].push({
                            character: folderName,
                            count: inviterCount,
                            total: totalReceptionCount
                        });

                        db[jid].processed.push(folderName);
                        saveState(db);

                        if (userPhone) {
                            try {
                                await sock.sendMessage(jid, {
                                    contacts: {
                                        displayName: folderName,
                                        contacts: [{
                                            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${folderName}\nTEL;type=CELL;type=VOICE;waid=${userPhone}:+${userPhone}\nEND:VCARD`
                                        }]
                                    }
                                });
                            } catch (contactErr) {}
                        }

                        const currentDate = new Date().toLocaleDateString('ar-EG');

                        const registrationForm = 
`اسـتـمـارة تـسـجـيـل 
❉━═━╄━❪🪶❫━╃━═━❉

📜 مـعـلـومـات الـتـسـجـيـل ↶

الـقـب ↜〘 ${folderName} 〙⃤🪶

مـن طـرف ↜〘 ${invitedBy} 〙⃤👤 ( ${inviterCount} )

الـتـاريـخ ↜〘 ${currentDate} 〙⃤📅

الـعـدد ↜〘 ${inviterCount} 〙⃤🔢

الـمـسـؤول ↜〘 الـبـوت 〙⃤🤖

عـدد الاسـتـقـبـال ↜〘 ${totalReceptionCount} 〙⃤🌿

❉━═━╄━❪🪶❫━╃━═━❉
 
❖ 𝐅𝐋𝐎𝐑𝐈𝐀 𝐊𝐈𝐍𝐆𝐃𝐎𝐌 ❖`;

                        await sock.sendMessage(jid, {
                            text: registrationForm,
                            mentions: userJid ? [userJid] : []
                        });
                    }
                }
            }
        } catch (e) {}
    }, 5000);
};

export default {
    command: "ورك",
    category: "الإدارة",
    description: "مراقبة مجلد الاستقبال وتحويل العضو لجهة اتصال وإرسال استمارة التسجيل تلقائياً وحساب الإحصائيات (خاص بالمشرفين)",

    initWorkListener: initWorkListener,

    onMessage: async (sock, msg) => {
        initWorkListener(sock);
    },

    execute: async (sock, msg, data) => {
        const jid = data.jid;
        const sender = data.sender || msg.key.participant || msg.participant;

        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(jid, { text: "❌ الأمر للمجموعات فقط" }, { quoted: msg });
        }

        try {
            const groupMetadata = await sock.groupMetadata(jid);
            const participants = groupMetadata.participants || [];
            const participantInfo = participants.find(p => p.id === sender);
            const isAdmin = participantInfo && (participantInfo.admin === "admin" || participantInfo.admin === "superadmin");

            if (!isAdmin) {
                return sock.sendMessage(jid, { text: "❌ هذا الأمر مخصص للمشرفين فقط!" }, { quoted: msg });
            }
        } catch (err) {
            return sock.sendMessage(jid, { text: "❌ تعذر التحقق من صلاحيات المشرفين في المجموعة." }, { quoted: msg });
        }

        initWorkListener(sock);

        const fullText = data.text ? data.text.trim() : "";
        const cleanText = fullText.replace(/^\./, "").trim();
        const db = loadState();
        const todayKey = getCurrentDateKey();

        if (db[jid] && (!db[jid].dateKey || db[jid].dateKey !== todayKey)) {
            db[jid].dateKey = todayKey;
            db[jid].counter = 0;
            db[jid].inviterCounters = {};
            db[jid].inviterDetails = {};
            saveState(db);
        }

        if (cleanText.includes("حسبه") || cleanText === "ورك حسبه") {
            const groupData = db[jid] || { counter: 0, inviterCounters: {}, inviterDetails: {} };
            const totalPub = groupData.counter || 0;
            const currentDate = new Date().toLocaleDateString('ar-EG');

            let guildName = "موطن فلوريا";
            if (groupData.inviterCounters) {
                const keys = Object.keys(groupData.inviterCounters);
                if (keys.length > 0) {
                    guildName = keys[0];
                }
            }

            let rowsText = "";
            if (groupData.inviterDetails) {
                for (const [inviter, details] of Object.entries(groupData.inviterDetails)) {
                    for (const item of details) {
                        rowsText += `> *〘 ${item.character} 〙「${item.count}」「${item.total}*` + "\n";
                    }
                }
            }

            if (!rowsText) {
                rowsText = `> *〘 لا توجد تسجيلات بعد 〙「0」「0*`;
            }

            const reportForm = 
`❉⫸⫷═╄━❪ 🪶 ❫━╅═⫸⫷❉
*￤🪶⊰ مـمـلـكـة فـلـوريـا ⊱🪶￤*
*「✧|─────✦❯🪶❮✦─────|✧」*
> *╼֪⃟🏰∫اسم النقابه↜「${guildName}」*
> *╼֪⃟🪶∫شعار النقابه↜「⚡」*
> *╼֪⃟🗣️∫عدد النشر↜「${totalPub}」*
> *╼֪⃟🗓️∫التاريخ↜「${currentDate}」*
> *「✧|─────✦❯🪶❮✦─────|✧」*
> *اللقب￤النشر￤الاستقبال*
${rowsText}
> *الــــمـســـــــــؤل 〘 الـبـوت 〙*
> ❉⫸⫷═╄━❪ 🪶 ❫━╅═⫸⫷❉
> *￤⇡ 𝙁𝙇O𝑹𝐈🇦  فــلوريـا ⇡￤*`;

            return sock.sendMessage(jid, { text: reportForm }, { quoted: msg });
        }

        if (cleanText === "ورك" || !cleanText) {
            const isActive = db[jid]?.active;
            return sock.sendMessage(
                jid,
                {
                    text: 
`🪶 حـالـة نـظـام ورك تـسـجـيـل

${isActive ? "✅ الـحـالـة: مـفـعـل" : "⛔ الـحـالـة: مـتـوقـف"}

طـريـقـة الاسـتـخـدام ↶
.ورك تسجيل
.ورك حسبه
.ورك توقف عن التسجيل`
                },
                { quoted: msg }
            );
        }

        if (cleanText.includes("توقف عن التسجيل")) {
            if (!db[jid]?.active) {
                return sock.sendMessage(jid, { text: "⚠️ نظام ورك تسجيل متوقف بالفعل في هذه المجموعة" }, { quoted: msg });
            }

            delete db[jid];
            saveState(db);

            return sock.sendMessage(
                jid,
                { text: "⛔ تم إيقاف ورك تسجيل بنجاح في هذه المجموعة" },
                { quoted: msg }
            );
        }

        const isRegisterCommand = cleanText.includes("تسجيل") && !cleanText.includes("توقف");

        if (isRegisterCommand || cleanText === "ورك تسجيل") {
            db[jid] = {
                active: true,
                dateKey: todayKey,
                counter: db[jid]?.dateKey === todayKey ? (db[jid]?.counter || 0) : 0,
                inviterCounters: db[jid]?.dateKey === todayKey ? (db[jid]?.inviterCounters || {}) : {},
                inviterDetails: db[jid]?.dateKey === todayKey ? (db[jid]?.inviterDetails || {}) : {},
                processed: db[jid]?.dateKey === todayKey ? (db[jid]?.processed || []) : []
            };

            saveState(db);

            return sock.sendMessage(
                jid,
                {
                    text: 
`━━━╼╃⌬〔 🪶 𝐅𝐋𝐎𝐑𝐈𝐀 🪶 〕⌬╄━━━

✅ تـم تـفـعـيـل نـظـام الـتـسـجـيـل بـنـجـاح

🪶 سيتم مراقبة مجلد الاستقبال وإرسال جهة اتصال العضو يليه استمارة التسجيل تلقائياً

⚜️ 𝐅𝐋𝐎𝐑𝐈𝐀 𝐁𝐎𝐓`
                },
                { quoted: msg }
            );
        }
    }
};
