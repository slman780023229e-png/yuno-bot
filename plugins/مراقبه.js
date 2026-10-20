import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), 'data');
const monitorFile = path.join(dataDir, 'monitorState.json');
const eliteFile = path.join(process.cwd(), 'data/النخبة.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(monitorFile)) fs.writeFileSync(monitorFile, JSON.stringify({}));

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(monitorFile, 'utf8'));
  } catch {
    return {};
  }
};

const saveState = (data) =>
  fs.writeFileSync(monitorFile, JSON.stringify(data, null, 2), 'utf8');

function isElite(userJid) {
  if (!fs.existsSync(eliteFile)) return false;

  try {
    const eliteUsers = JSON.parse(fs.readFileSync(eliteFile, 'utf8'));
    const userNumber = String(userJid).split('@')[0].replace(/\D/g, '');

    return eliteUsers
      .map(x => String(x).replace(/\D/g, ''))
      .includes(userNumber);

  } catch {
    return false;
  }
}

let listenersInitialized = false;

// منع تكرار الرسائل لنفس الحدث
const cooldown = new Map();

export function initMonitorListener(sock) {
  if (listenersInitialized) return;

  listenersInitialized = true;

  sock.ev.on('group-participants.update', async (update) => {

    const st = loadState();

    if (!st[update.id]?.active) return;

    if (!['promote', 'demote'].includes(update.action)) return;

    // منع تكرار نفس الحدث
    const key =
      `${update.id}-${update.action}-${(update.participants || []).join(",")}`;

    if (cooldown.has(key)) return;

    cooldown.set(key, true);

    setTimeout(() => {
      cooldown.delete(key);
    }, 5000);

    try {
//هناااا
const meta = await sock.groupMetadata(update.id);

      const botId =
        sock.user.id.includes(':')
          ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
          : sock.user.id;


      const elites =
        meta.participants
        .filter(p => isElite(p.id))
        .map(p => p.id);


      const nonEliteAdmins =
        meta.participants
        .filter(
          p =>
          p.admin &&
          !isElite(p.id) &&
          p.id !== botId
        )
        .map(p => p.id);



      const actor =
        update.author ||
        update.by ||
        '';


      const targetUser =
        update.participants &&
        update.participants[0]
        ?
        update.participants[0]
        :
        '';



      if(nonEliteAdmins.length){

        await sock.groupParticipantsUpdate(
          update.id,
          nonEliteAdmins,
          'demote'
        );

      }



      if(elites.length){

        await sock.groupParticipantsUpdate(
          update.id,
          elites,
          'promote'
        );

      }



      st[update.id].waitingChoice = true;

      saveState(st);



      let alertText =
`🚨 تم اكتشاف متلاعب!

المتلاعب: @${actor.split('@')[0]}
الضحية: @${targetUser.split('@')[0]}

🛡️ تم ضبط الإشراف.

خيارات النخبة:
1. تصفية غير النخبة.
2. إلغاء العملية.

⚠️ انتبه من الخيانة
𝐀𝐑𝐓𝐇𝐔𝐑 يراقبك تاج`;



      const mentionsList = [];

      if(actor)
        mentionsList.push(actor);

      if(targetUser)
        mentionsList.push(targetUser);



      await sock.sendMessage(
        update.id,
        {
          text: alertText,
          mentions: mentionsList
        }
      );



    } catch(err){

      console.error(
        'Monitor error:',
        err
      );

    }

  });



  sock.ev.on(
    'messages.upsert',
    async ({messages})=>{

      const m = messages[0];

      if(!m?.message || m.key.fromMe)
        return;



      const jid =
        m.key.remoteJid;



      const senderJid =
        m.key.participant ||
        m.key.remoteJid;



      const body =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        '';



      const st =
        loadState();



      if(!st[jid]?.waitingChoice)
        return;



      if(!isElite(senderJid))
        return;



      if(body.trim()==='1'){

        st[jid].waitingChoice = false;

        saveState(st);

        await executeClean(
          sock,
          jid
        );

      }



      if(body.trim()==='2'){

        delete st[jid];

        saveState(st);


        await sock.sendMessage(
          jid,
          {
            text:
            '⚠️ تم إلغاء العملية.'
          }
        );

      }


    }
  );

}
export default {

  command: 'مراقبه',

  description:
  'تشغيل/إيقاف المراقب: يراقب أي تغيير في الإشرافات ويعيد التوازن في القروب',

  category: 'الحماية',



  execute: async (sock, msg, data)=>{

    try{


      initMonitorListener(sock);



      const jid =
        data?.jid ||
        msg.key.remoteJid;



      if(!jid.endsWith('@g.us')){

        return sock.sendMessage(
          jid,
          {
            text:
            '❌ الأمر للمجموعات فقط.'
          },
          {
            quoted: msg
          }
        );

      }



      const args =
        data?.text
        ?
        data.text.trim().split(/\s+/).slice(1)
        :
        [];



      const state =
        loadState();



      if(!args[0]){

        const isRunning =
          state[jid]?.active === true;


        return sock.sendMessage(
          jid,
          {
            text:
            `📝 ${
              isRunning
              ?
              'مفعل المراقب'
              :
              'المراقب متوقف'
            }

صيغة الأمر:
.مراقبه شغل
.مراقبه طفي`
          },
          {
            quoted: msg
          }
        );

      }



      const action =
        args[0].toLowerCase();



      if(action === 'طفي'){

        state[jid] =
        {
          active:false,
          waitingChoice:false
        };


        saveState(state);


        return sock.sendMessage(
          jid,
          {
            text:
            '⛔ تم إيقاف المراقب.'
          },
          {
            quoted: msg
          }
        );

      }



      if(action === 'شغل'){


        if(state[jid]?.active){

          return sock.sendMessage(
            jid,
            {
              text:
              '⚠️ المراقب مفعل مسبقاً.'
            },
            {
              quoted: msg
            }
          );

        }



        state[jid] =
        {
          active:true,
          waitingChoice:false
        };


        saveState(state);



        await sock.sendMessage(
          jid,
          {
            text:
`✅ تم تشغيل المراقب بنجاح.

🛡️ 𝐀𝐑𝐓𝐇𝐔𝐑 𝐆𝐔𝐀𝐑𝐃
⚠️ انتبه من الخيانة`
          },
          {
            quoted:msg
          }
        );

      }


    }catch(e){

      console.error(
        "مراقبه خطأ:",
        e
      );

    }

  }

};



async function executeClean(sock, groupId){

  try{


    const meta =
      await sock.groupMetadata(groupId);



    const botId =
      sock.user.id.includes(':')
      ?
      sock.user.id.split(':')[0] + '@s.whatsapp.net'
      :
      sock.user.id;



    const owner =
      meta.owner;



    const toRemove =
      meta.participants
      .filter(
        p =>
        !isElite(p.id) &&
        p.id !== botId &&
        p.id !== owner
      )
      .map(p=>p.id);



    if(toRemove.length){

      await sock.groupParticipantsUpdate(
        groupId,
        toRemove,
        'remove'
      );

    }



    await sock.sendMessage(
      groupId,
      {
        text:
        '✅ تمت التصفية بنجاح.'
      }
    );


  }catch(err){

    console.error(
      'Clean error:',
      err
    );

  }

}