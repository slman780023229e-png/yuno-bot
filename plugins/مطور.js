import {
    generateWAMessageFromContent,
    proto
} from "@whiskeysockets/baileys";

export default {
    command: ["المطور", "مطور", "owner"],
    category: "المطور",
    ownerOnly: true,
    description: "عرض معلومات ورقم المطور مع أزرار تفاعلية",

    execute: async (sock, msg, data) => {
        const developerNumber = "967780023229";
        const developerName = "سلمان | YUNO";

        try {
            await sock.sendMessage(data.jid, { react: { text: '👑', key: msg.key } });

            // ═══════════════════════════════════
            // 🩸 تصميم الرسالة
            // ═══════════════════════════════════════════════════
            const textBody = 
`*╭━━〔 👑 ᴘᴇʀsᴏɴᴀʟ ɪɴғᴏ ⚡ 〕━━╮*
*┃ 👤 المطور :* ${developerName}
*┃ 📞 الرقم :* wa.me/${developerNumber}
*┃ 🤖 الحالة :* متاح للمساعدة والتطوير
*◇❐ ═━╾ 🩸 ╼━═ ❐◇*`;

            const interactiveMessage = {
                body: { text: textBody },
                footer: { text: "E7-BOT SYSTEM" },
                header: {
                    title: "👑 معلومات المطور",
                    hasMediaAttachment: false,
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "👑 المطور",
                                url: `https://wa.me/${developerNumber}`,
                                merchant_url: `https://wa.me/${developerNumber}`
                            })
                        },
                        {
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: "📁 القائمة",
                                id: ".اوامر"
                            })
                        }
                    ],
                    // تغيير نوع العرض إلى الصف لتظهر الأزرار بجانب بعضها أفقياً
                    messageParamsJson: JSON.stringify({
                        is_menu: true
                    })
                }
            };

            const msgEnv = generateWAMessageFromContent(
                data.jid,
                {
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage)
                },
                { quoted: msg }
            );

            await sock.relayMessage(
                data.jid,
                msgEnv.message,
                {
                    messageId: msgEnv.key.id,
                    additionalNodes: [
                        {
                            tag: "biz",
                            attrs: {},
                            content: [
                                {
                                    tag: "interactive",
                                    attrs: { type: "native_flow", v: "1" },
                                    content: [
                                        {
                                            tag: "native_flow",
                                            // تعيين الـ name إلى single_select أو quick_reply لضمان عرض الأزرار أفقياً دون قيود
                                            attrs: { name: "quick_reply" }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            );

        } catch (err) {
            console.log(err)
            // نظام بديل
            await sock.sendMessage(data.jid, {
                text: `*👑 معلومات المطور*\n*👤 الاسم:* ${developerName}\n*📞 الرقم:* wa.me/${developerNumber}`
            }, { quoted: msg });
        }
    }
};
