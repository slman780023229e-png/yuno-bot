export default {

    command: "بروفايل",

    category: "الأعضاء",

    description: "عرض بروفايل ومعلومات وصورة العضو 👤",

    execute: async(sock, msg, data)=>{

        const jid = data.jid;

        const head =
`*╭━━━〔 👤 بْرُوفَايْلُ اَلْعُضْو 〕━━━╮*
*┃ 👤 معلومات الحساب الشخصي*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        // تحديد العضو من المنشن أو الرد
        const context =
        msg.message
        ?.extendedTextMessage
        ?.contextInfo;

        let target;

        if(context?.mentionedJid?.length){
            target = context.mentionedJid[0];
        }
        else if(context?.participant){
            target = context.participant;
        }

        // إذا لم يقم بمنشن أو رد، يستعرض بروفايل المرسل نفسه
        if(!target){
            target = data.sender || jid;
        }

        const number = target.split("@")[0];

        // جلب صورة البروفايل الشخصية
        let profilePic;
        try {
            profilePic = await sock.profilePictureUrl(target, "image");
        } catch {
            // صورة افتراضية أو أبيه إذا كانت الصورة خاصة
            profilePic = null; 
        }

        const textResponse = 
`${head}

*┃ 📱 الرقم : wa.me/${number}*
*┃ 🆔 الـ JID : @${number}*
*┃ 🌐 الرابط : https://wa.me/${number}*
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

        // إرسال الصورة إن وجدت مع النص، أو النص وحده إذا كانت الصورة مخفية بخصوصية الحساب
        if(profilePic){
            return sock.sendMessage(
                jid,
                {
                    image: { url: profilePic },
                    caption: textResponse,
                    mentions: [target]
                }
            );
        } else {
            return sock.sendMessage(
                jid,
                {
                    text: `${textResponse}\n\n*┃ ⚠️ صورة البروفايل مخفية أو غير متوفرة*`,
                    mentions: [target]
                }
            );
        }

    }

};
