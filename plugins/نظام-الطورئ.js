import fs from "fs";
import path from "path";


const dataDir =
path.join(process.cwd(),"data");


const stateFile =
path.join(
    dataDir,
    "emergencyState.json"
);


const eliteFile =
path.join(
    dataDir,
    "النخبة.json"
);



if(!fs.existsSync(dataDir)){

    fs.mkdirSync(
        dataDir,
        {
            recursive:true
        }
    );

}



if(!fs.existsSync(stateFile)){

    fs.writeFileSync(
        stateFile,
        "{}"
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
        JSON.stringify(
            data,
            null,
            2
        )
    );

}




function isElite(jid){

    if(!fs.existsSync(eliteFile))
        return false;


    try{

        const elite =
        JSON.parse(
            fs.readFileSync(
                eliteFile,
                "utf8"
            )
        );


        const number =
        String(jid)
        .split("@")[0]
        .replace(/\D/g,"");


        return elite
        .map(
            x =>
            String(x)
            .replace(/\D/g,"")
        )
        .includes(number);


    }catch{

        return false;

    }

}




const actions =
new Map();



let listenerStarted =
false;




export function initEmergencyListener(sock){


    if(listenerStarted)
        return;


    listenerStarted = true;



    sock.ev.on(
        "group-participants.update",
        async(update)=>{


            const db =
            loadState();



            if(!db[update.id]?.active)
                return;



            const actor =
            update.author ||
            update.by ||
            "";



            // تجاهل النخبة

            if(actor && isElite(actor))
                return;



            const now =
            Date.now();



            if(!actions.has(update.id)){

                actions.set(
                    update.id,
                    []
                );

            }



            let list =
            actions.get(update.id);



            list.push({
                time:now,
                action:update.action
            });



            list =
            list.filter(
                x =>
                now - x.time < 60000
            );



            actions.set(
                update.id,
                list
            );



            // بداية اكتشاف التخريب

            if(list.length >= 5){


                await startEmergency(
                    sock,
                    update.id,
                    actor
                );


            }



        }
    );

}
async function startEmergency(sock, jid, actor){


    const db =
    loadState();



    if(db[jid]?.locked)
        return;



    db[jid] =
    {
        active:true,
        locked:true
    };



    saveState(db);



    try{


        const meta =
        await sock.groupMetadata(jid);



        const botId =
        sock.user.id.includes(":")
        ?
        sock.user.id.split(":")[0] + "@s.whatsapp.net"
        :
        sock.user.id;



        // إزالة إشراف غير النخبة

        const removeAdmins =
        meta.participants
        .filter(
            p =>
            p.admin &&
            !isElite(p.id) &&
            p.id !== botId
        )
        .map(
            p=>p.id
        );



        if(removeAdmins.length){

            await sock.groupParticipantsUpdate(
                jid,
                removeAdmins,
                "demote"
            );

        }



        // قفل المجموعة

        await sock.groupSettingUpdate(
            jid,
            "announcement"
        );



        const mentions = [];

        if(actor)
            mentions.push(actor);



        await sock.sendMessage(
            jid,
            {
                text:
`🚨 𝐀𝐑𝐓𝐇𝐔𝐑 𝐄𝐌𝐄𝐑𝐆𝐄𝐍𝐂𝐘 🚨

⚠️ تم اكتشاف تخريب بالمجموعة

👤 الفاعل:
${actor ? "@"+actor.split("@")[0] : "غير معروف"}

🛡️ تم تفعيل وضع الطوارئ

🔒 تم قفل المجموعة
👑 بقيت صلاحيات النخبة فقط`,
                mentions
            }
        );



    }catch(e){

        console.log(
            "Emergency error:",
            e.message
        );

    }


}





export default {


command:"طوارئ",


category:"الحماية",


description:"نظام الطوارئ ضد التخريب",



execute:async(sock,msg,data)=>{


const jid =
data.jid;



if(!jid.endsWith("@g.us")){

return sock.sendMessage(
jid,
{
text:
"❌ الأمر للمجموعات فقط"
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
text:
"❌ الأمر للمشرفين فقط"
}
);

}



const db =
loadState();



if(data.text.includes("شغل")){


if(db[jid]?.active){

return sock.sendMessage(
jid,
{
text:
"⚠️ وضع الطوارئ شغال بالفعل"
}
);

}



db[jid]=
{
active:true,
locked:false
};



saveState(db);



return sock.sendMessage(
jid,
{
text:
`🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐄𝐌𝐄𝐑𝐆𝐄𝐍𝐂𝐘

✅ تم تشغيل مراقبة الطوارئ

⚠️ لن يتم قفل المجموعة إلا عند اكتشاف تخريب`
}
);



}





if(data.text.includes("طفي")){


if(!db[jid]?.active){

return sock.sendMessage(
jid,
{
text:
"⚠️ وضع الطوارئ غير شغال"
}
);

}



delete db[jid];

saveState(db);



await sock.groupSettingUpdate(
jid,
"not_announcement"
);



return sock.sendMessage(
jid,
{
text:
"✅ تم إيقاف وضع الطوارئ وفتح المجموعة"
}
);



}



return sock.sendMessage(
jid,
{
text:
`🚨 وضع الطوارئ

.طوارئ شغل
.طوارئ طفي`
}
);



}



};
