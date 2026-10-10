export default {
    command: 'حذف',
    description: 'حذف الرسالة المردود عليها ورسالة الأمر',
    usage: '.حذف',
    category: 'المجموعات',

    async execute(sock, msg, data) {
        try {
            const jid = data?.jid || msg.key.remoteJid;
            if (!jid.endsWith("@g.us")) {
                return sock.sendMessage(jid, { text: "❌ الأمر للمجموعات فقط" }, { quoted: msg });
            }

            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedKey = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

            if (!quoted || !quotedKey) {
                return sock.sendMessage(jid, { text: "❌ رد على الرسالة التي تريد حذفها" }, { quoted: msg });
            }

            // حذف الرسالة المستهدفة (المردود عليها)
            await sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    id: quotedKey,
                    participant: quotedParticipant
                }
            });

            // حذف رسالة الأمر نفسها (التي كتب فيها حذف)
            await sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    id: msg.key.id,
                    participant: msg.key.participant || msg.key.remoteJid
                }
            });

        } catch (e) {
            console.error("خطأ في أمر الحذف:", e);
        }
    }
};
