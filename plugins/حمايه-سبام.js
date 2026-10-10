import fs from "fs";
import path from "path";


const dataDir = path.join(process.cwd(),"data");

const spamFile =
path.join(dataDir,"antiSpam.json");

const eliteFile =
path.join(dataDir,"النخبة.json");


if(!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir,{recursive:true});
}


if(!fs.existsSync(spamFile)){
    fs.writeFileSync(
        spamFile,
        "{}"
    );
}



function load(){

    try{

        return JSON.parse(
            fs.readFileSync(spamFile,"utf8")
        );

    }catch{

        return {};

    }

}



function save(data){

    fs.writeFileSync(
        spamFile,
        JSON.stringify(data,null,2)
    );

}



function isElite(jid){

    if(!fs.existsSync(eliteFile))
        return false;


    try{

        const elite =
        JSON.parse(
            fs.readFileSync(eliteFile,"utf8")
        );


        const number =
        String(jid)
        .split("@")[0]
        .replace(/\D/g,"");


        return elite
        .map(x =>
            String(x)
            .replace(/\D/g,"")
        )
        .includes(number);


    }catch{

        return false;

    }

}



const spamCache = new Map();



export default {
    alwaysOn: true,


command:"سبام",


category:"الحماية",


description:"مضاد السبام",



execute:async(sock,msg,data)=>{


const jid =
data.jid;



if(!jid.endsWith("@g.us")){

return sock.sendMessage(
jid,
{
text:"❌ الأمر للمجموعات فقط"
}
);

}



const meta =
await sock.groupMetadata(jid);



const admin =
meta.participants.find(
p=>p.id===data.sender
);



if(!admin?.admin){

return sock.sendMessage(
jid,
{
text:"❌ الأمر للمشرفين فقط"
}
);

}



const db =
load();



if(data.text.includes("شغل")){


db[jid]={
active:true,
warns:{}
};


save(db);



return sock.sendMessage(
jid,
{
text:
`🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐀𝐍𝐓𝐈 𝐒𝐏𝐀𝐌

✅ تم تشغيل مضاد السبام

⚠️ 3 مخالفات = طرد`
}
);

}



if(data.text.includes("طفي")){


delete db[jid];

save(db);



return sock.sendMessage(
jid,
{
text:
"⛔ تم إيقاف مضاد السبام"
}
);

}



},




onMessage:async(sock,msg)=>{


const jid =
msg.key.remoteJid;



if(!jid?.endsWith("@g.us"))
return;



const db =
load();



if(!db[jid]?.active)
return;



const user =
msg.key.participant;



if(!user)
return;



// حماية النخبة

if(isElite(user))
return;



const now =
Date.now();



if(!spamCache.has(user)){

spamCache.set(
user,
[]
);

}



let times =
spamCache.get(user);



times.push(now);



times =
times.filter(
t=>now-t < 5000
);



spamCache.set(
user,
times
);



// أقل من 5 رسائل خلال 5 ثواني طبيعي

if(times.length < 5)
return;



if(!db[jid].warns)
db[jid].warns={};



if(!db[jid].warns[user])
db[jid].warns[user]=0;



db[jid].warns[user]++;


const warn =
db[jid].warns[user];



save(db);



try{


await sock.sendMessage(
jid,
{
delete:{
remoteJid:jid,
id:msg.key.id,
participant:user
}
}
);



}catch{}



if(warn===1){


await sock.sendMessage(
jid,
{
text:
`⚠️ إنذار أول

👤 العضو:
@${user.split("@")[0]}

🚫 لا تكرر الإرسال بسرعة`,
mentions:[user]
}
);


}else if(warn===2){


await sock.sendMessage(
jid,
{
text:
`⚠️ إنذار ثاني

👤 العضو:
@${user.split("@")[0]}

🚨 الإنذار الأخير`,
mentions:[user]
}
);


}else{


await sock.groupParticipantsUpdate(
jid,
[user],
"remove"
);



delete db[jid].warns[user];

save(db);



await sock.sendMessage(
jid,
{
text:
`🚫 تم طرد العضو بسبب السبام

👤 @${user.split("@")[0]}

🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑`,
mentions:[user]
}
);

}


}



};
