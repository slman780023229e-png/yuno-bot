import { proto, generateWAMessageFromContent, prepareWAMessageMedia, WA_DEFAULT_EPHEMERAL } from '@whiskeysockets/baileys';

export default function serialize(conn, m) {
    if (!m) return m;

    try {
        if (m.key) {
            m.id = m.key.id || '';
            m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
            m.chat = m.key.remoteJid || '';
            m.fromMe = !!m.key.fromMe;
            m.isGroup = m.chat.endsWith('@g.us');
            
            const botId = conn?.user?.id ? conn.user.id.split(':')[0] + '@s.whatsapp.net' : '';
            m.sender = m.fromMe ? botId : (m.key.participant || m.chat);
        }

        if (m.message) {
            m.mtype = Object.keys(m.message)[0] || '';
            m.msg = m.message[m.mtype] || {};

            if (m.mtype === 'ephemeralMessage') {
                m.message = m.msg.message || {};
                m.mtype = Object.keys(m.message)[0] || '';
                m.msg = m.message[m.mtype] || {};
            }

            const contextInfo = m.msg?.contextInfo;
            let quoted = contextInfo?.quotedMessage;
            
            if (quoted) {
                let type = Object.keys(quoted)[0] || '';
                let quotedMsg = quoted[type] || {};
                
                const botId = conn?.user?.id ? conn.user.id.split(':')[0] + '@s.whatsapp.net' : '';
                
                m.quoted = {
                    message: quotedMsg,
                    type: type,
                    id: contextInfo?.stanzaId || '',
                    sender: contextInfo?.participant || '',
                    fromMe: contextInfo?.participant === botId,
                    text: quotedMsg?.text || quotedMsg?.caption || ''
                }
            } else {
                m.quoted = null;
            }

            m.body = m.msg?.text || m.msg?.conversation || m.msg?.caption || '';
        }
    } catch (e) {
        // تجاهل أي خطأ بسيط في معالجة الرسائل لضمان عدم توقف البوت
    }

    // تعريف الأزرار التفاعلية الشاملة (الروابط، النسخ، الرد السريع، الأقسام)
    Object.defineProperty(m, 'ctaButton', {
        get() {
            class Button {
                constructor() {
                    this._title = ''
                    this._subtitle = ''
                    this._body = ''
                    this._footer = ''
                    this._buttons = []
                    this._data = null
                    this._contextInfo = {}
                    this._currentSelectionIndex = -1
                    this._currentSectionIndex = -1
                }
                setType(type) {
                    this._type = type
                    return this
                }
                contextInfo(info) {
                    this._contextInfo = info || {}
                    return this
                }
                setBody(body) {
                    this._body = body || ''
                    return this
                }
                setFooter(footer) {
                    this._footer = footer || ''
                    return this
                }
                makeRow(header = '', title = '', description = '', id = '') {
                    if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) {
                        throw new Error('You need to create a selection and a section first')
                    }
                    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson)
                    buttonParams.sections[this._currentSectionIndex].rows.push({
                        header: header,
                        title: title,
                        description: description,
                        id: id
                    })
                    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams)
                    return this
                }
                makeSection(title = '', selectionTitle = '') {
                    if (selectionTitle) {
                        const sel = this._buttons.find(b => b.name === 'single_select' && JSON.parse(b.buttonParamsJson).title === selectionTitle);
                        if (sel) {
                            const buttonParams = JSON.parse(sel.buttonParamsJson);
                            buttonParams.sections.push({ title: title, rows: [] });
                            sel.buttonParamsJson = JSON.stringify(buttonParams);
                            this._currentSectionIndex = buttonParams.sections.length - 1;
                            this._currentSelectionIndex = this._buttons.indexOf(sel);
                            return this;
                        }
                    }
                    if (this._currentSelectionIndex === -1) {
                        this.addSelection("الأقسام");
                    }
                    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson)
                    buttonParams.sections.push({
                        title: title,
                        rows: []
                    })
                    this._currentSectionIndex = buttonParams.sections.length - 1
                    return this
                }
                makeSections(title = '') {
                    return this.makeSection(title);
                }
                addSelection(title) {
                    this._buttons.push({
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: title || 'قائمة',
                            sections: []
                        })
                    })
                    this._currentSelectionIndex = this._buttons.length - 1
                    this._currentSectionIndex = -1
                    return this
                }
                addReply(display_text = '', id = '') {
                    this._buttons.push({
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: display_text,
                            id: id
                        })
                    })
                    return this
                }
                addCopy(display_text = '', id = '') {
                    this._buttons.push({
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: display_text,
                            copy_code: id
                        })
                    })
                    return this
                }
                addUrl(display_text = '', url = '') {
                    this._buttons.push({
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: display_text,
                            url: url,
                            merchant_url: url
                        })
                    })
                    return this
                }
                addButton(type, display_text = '', urlOrId = '') {
                    if (type === 'cta_url' || type === 'url') {
                        this.addUrl(display_text, urlOrId);
                    } else if (type === 'quick_reply' || type === 'reply') {
                        this.addReply(display_text, urlOrId);
                    } else if (type === 'cta_copy' || type === 'copy') {
                        this.addCopy(display_text, urlOrId);
                    } else {
                        this.addUrl(display_text, urlOrId);
                    }
                    return this;
                }
                setVideo(path, options = {}) {
                    if (!path) throw new Error('URL or buffer needed')
                    this._data = Buffer.isBuffer(path)
                        ? { video: path, ...options }
                        : { video: { url: path }, ...options }
                    return this
                }
                setImage(path, options = {}) {
                    if (!path) throw new Error('URL or buffer needed')
                    this._data = Buffer.isBuffer(path)
                        ? { image: path, ...options }
                        : { image: { url: path }, ...options }
                    return this
                }
                setDocument(path, options = {}) {
                    if (!path) throw new Error('URL or buffer needed')
                    this._data = Buffer.isBuffer(path)
                        ? { document: path, ...options }
                        : { document: { url: path }, ...options }
                    return this
                }
                setTitle(title) {
                    this._title = title || ''
                    return this
                }
                setSubtitle(subtitle) {
                    this._subtitle = subtitle || ''
                    return this
                }
                async run(jid, connInstance, quoted = {}) {
                    const targetConn = connInstance || conn;
                    const message = {
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: this._body
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: this._footer
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: this._title,
                            subtitle: this._subtitle,
                            hasMediaAttachment: !!this._data,
                            ...(this._data && targetConn?.waUploadToServer
                                ? await prepareWAMessageMedia(this._data, {
                                    upload: targetConn.waUploadToServer
                                })
                                : {})
                        })
                    }
                    const userJid = targetConn?.user?.jid || targetConn?.user?.id || '';
                    const msg = await generateWAMessageFromContent(
                        jid,
                        {
                            viewOnceMessage: {
                                message: {
                                    interactiveMessage: proto.Message.InteractiveMessage.create({
                                        ...message,
                                        contextInfo: this._contextInfo,
                                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                            buttons: this._buttons,
                                            messageParamsJson: ''
                                        })
                                    })
                                }
                            }
                        },
                        {
                            userJid: userJid,
                            quoted: quoted,
                            upload: targetConn?.waUploadToServer,
                            ephemeralExpiration: WA_DEFAULT_EPHEMERAL
                        }
                    )
                    await targetConn.relayMessage(msg.key.remoteJid, msg.message, {
                        messageId: msg.key.id
                    })
                    return msg
                }
                async send(jid, options = {}) {
                    return await this.run(jid, conn, options.quoted || {});
                }
            }
            return new Button()
        },
        enumerable: true
    });

    return m;
}
