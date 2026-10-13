// main.js
// ✧ ARTHUR BOT - Main Entry Point
// ✧ Stable / Protected / Anti-Duplicate Session
// ✧ Baileys + NixCode + Plugin System

'use strict'

import serialize from './utils/serialize.js'
import {
    handleMessages,
    getLoadedPlugins,
    warmupHandler
} from './utils/handler.js'

import {
    Button,
    ButtonV2,
    Carousel,
    AIRich,
    Toolkit
} from './utils/nixcode.js'

import './utils/memory-cleaner.js'

import {
    scanAllProjectFiles
} from './utils/watcher.js'

import '@whiskeysockets/baileys'

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    proto
} from '@whiskeysockets/baileys'

import pino from 'pino'
import chalk from 'chalk'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'


// ============================================================
// PATHS
// ============================================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sessionDir = path.join(
    __dirname,
    'ملف_الاتصال'
)

const dataDir = path.join(
    __dirname,
    'data'
)


// ============================================================
// SESSION RESTORE CONDITION
// ============================================================

try {
    fs.ensureDirSync(sessionDir)

    const credsPath = path.join(
        sessionDir,
        'creds.json'
    )

    if (
        !fs.existsSync(credsPath) &&
        process.env.SESSION_DATA &&
        process.env.SESSION_DATA.trim() !== ''
    ) {
        fs.writeFileSync(
            credsPath,
            process.env.SESSION_DATA,
            'utf-8'
        )

        console.log(
            chalk.green(
                '✅ تم تحميل الجلسة من متغير البيئة لعدم وجود ملف اتصال محلي.'
            )
        )
    } else {
        console.log(
            chalk.gray(
                'ℹ️ تم الاعتماد على ملف الاتصال المحلي الموجود مسبقاً ولم يتم فرض متغير البيئة.'
            )
        )
    }

} catch (e) {
    console.log(
        chalk.red(
            '⚠️ خطأ في معالجة مسار الجلسة: ' +
            e.message
        )
    )
}


// ============================================================
// KEEP ALIVE
// ============================================================

const PORT = process.env.PORT || 3000

const keepAliveServer = http.createServer(
    (req, res) => {

        res.writeHead(
            200,
            {
                'Content-Type':
                    'text/plain; charset=utf-8'
            }
        )

        res.end(
            'ARTHUR BOT IS RUNNING 🟢\n'
        )
    }
)

keepAliveServer.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            chalk.green(
                `🌐 Keep-Alive Server Running On Port ${PORT}`
            )
        )
    }
)


// ============================================================
// LIVE CLOCK
// ============================================================

const liveClock = setInterval(
    () => {

        const now = new Date()

        const time =
            now.toLocaleTimeString(
                'en-US',
                {
                    hour12: false
                }
            )

        console.log(
            chalk.gray(
                `🕒 ARTHUR BOT | ${time}`
            )
        )

    },
    60000
)


// ============================================================
// GLOBAL STATE
// ============================================================

let currentSock = null

let isStarting = false
let isShuttingDown = false

let reconnectTimer = null

let projectScanned = false


// ============================================================
// SETTINGS
// ============================================================

const RECONNECT_DELAY = 3000


// ============================================================
// HELPERS
// ============================================================

function clearReconnectTimer() {

    if (reconnectTimer) {

        clearTimeout(
            reconnectTimer
        )

        reconnectTimer = null
    }
}


// ============================================================
// PLUGIN EVENT SYSTEM
// ============================================================

async function runPluginEvent(
    sock,
    eventName,
    payload
) {

    try {

        const plugins =
            await getLoadedPlugins(sock)

        if (!Array.isArray(plugins)) {
            return
        }

        for (const plugin of plugins) {

            if (!plugin) continue

            const eventHandler =
                plugin[eventName]

            if (
                typeof eventHandler !==
                'function'
            ) {
                continue
            }

            try {

                await eventHandler(
                    sock,
                    payload
                )

            } catch (error) {

                console.error(
                    chalk.red(
                        `❌ Plugin Event Error [${eventName}]`
                    ),
                    error
                )
            }
        }

    } catch (error) {

        console.error(
            chalk.red(
                `❌ Failed To Run Plugin Event [${eventName}]`
            ),
            error
        )
    }
}


// ============================================================
// START BOT
// ============================================================

async function startBot() {

    if (isStarting) {

        console.log(
            chalk.yellow(
                '⚠️ Bot is already starting. Skipping duplicate start.'
            )
        )

        return
    }

    if (isShuttingDown) {

        console.log(
            chalk.yellow(
                '⚠️ Shutdown is in progress. Start cancelled.'
            )
        )

        return
    }

    if (
        currentSock &&
        currentSock.ws &&
        currentSock.ws.readyState === 1
    ) {

        console.log(
            chalk.yellow(
                '⚠️ Existing socket is already connected. Skipping duplicate socket.'
            )
        )

        return
    }

    isStarting = true

    clearReconnectTimer()


    try {

        try {

            await fs.ensureDir(
                sessionDir
            )

            await fs.ensureDir(
                dataDir
            )

        } catch (e) {

            console.log(
                chalk.red(
                    '⚠️ خطأ في إنشاء المجلدات الأساسية: ' +
                    e.message
                )
            )
        }


        if (!projectScanned) {

            try {

                await scanAllProjectFiles()

                projectScanned = true

                console.log(
                    chalk.green(
                        '📂 Project files scanned successfully.'
                    )
                )

            } catch (error) {

                console.error(
                    chalk.red(
                        '❌ Project scan failed:'
                    ),
                    error
                )
            }
        }


        console.log(
            chalk.cyan(
                '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
        )

        console.log(
            chalk.cyan.bold(
                '        🩸 ARTHUR BOT 🩸'
            )
        )

        console.log(
            chalk.gray(
                '        Main Session Starting...'
            )
        )

        console.log(
            chalk.cyan(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            )
        )


        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                sessionDir
            )


        let version

        try {

            const latestVersion =
                await fetchLatestBaileysVersion()

            version =
                latestVersion.version

            console.log(
                chalk.gray(
                    `📦 Baileys Version: ${version.join('.')}`
                )
            )

        } catch (error) {

            console.log(
                chalk.yellow(
                    '⚠️ Could not fetch latest Baileys version. Using default.'
                )
            )

            version = undefined
        }


        const sock =
            makeWASocket({

                ...(version
                    ? { version }
                    : {}),

                auth: state,

                logger: pino({
                    level: 'silent'
                }),

                browser: [
                    'Mac OS',
                    'Chrome',
                    '1.0.0'
                ],

                markOnlineOnConnect: true,

                generateHighQualityLinkPreview:
                    true,

                syncFullHistory: false
            })


        currentSock = sock

        global.sock = sock


        sock.ev.on(
            'creds.update',
            saveCreds
        )


        global.NixCode = {

            Button,
            ButtonV2,
            Carousel,
            AIRich,
            Toolkit
        }


        sock.sendRealButtons =
            async (
                jid,
                text,
                footerText,
                buttonsArray
            ) => {

                try {

                    const btn =
                        new Button(sock)

                    btn.setBody(text)

                    if (footerText) {
                        btn.setFooter(
                            footerText
                        )
                    }

                    for (
                        const b
                        of buttonsArray
                    ) {

                        const displayText =
                            b.displayText ||
                            b.text ||
                            "زر"

                        const id =
                            b.id ||
                            b.command ||
                            "click"

                        const type =
                            b.name ||
                            "quick_reply"


                        if (
                            type ===
                            "quick_reply"
                        ) {

                            btn.addReply(
                                displayText,
                                id
                            )

                        } else if (
                            type ===
                            "cta_url"
                        ) {

                            btn.addUrl(
                                displayText,
                                b.url || ""
                            )

                        } else if (
                            type ===
                            "cta_call"
                        ) {

                            btn.addCall(
                                displayText,
                                id
                            )

                        } else {

                            btn.addButton(
                                type,
                                {
                                    display_text:
                                        displayText,
                                    id
                                }
                            )
                        }
                    }

                    return await btn.send(
                        jid
                    )

                } catch (e) {

                    const messageContent =
                        generateWAMessageFromContent(
                            jid,
                            {
                                interactiveMessage:
                                    proto.Message
                                        .InteractiveMessage
                                        .create({

                                            body:
                                                proto.Message
                                                    .InteractiveMessage
                                                    .Body
                                                    .create({
                                                        text
                                                    }),

                                            footer:
                                                proto.Message
                                                    .InteractiveMessage
                                                    .Footer
                                                    .create({
                                                        text:
                                                            footerText ||
                                                            "Arthur Bot Framework"
                                                    }),

                                            nativeFlowMessage:
                                                proto.Message
                                                    .InteractiveMessage
                                                    .NativeFlowMessage
                                                    .create({

                                                        buttons:
                                                            buttonsArray.map(
                                                                btn => ({

                                                                    name:
                                                                        btn.name ||
                                                                        "quick_reply",

                                                                    buttonParamsJson:
                                                                        JSON.stringify({

                                                                            display_text:
                                                                                btn.displayText ||
                                                                                btn.text,

                                                                            id:
                                                                                btn.id ||
                                                                                btn.command

                                                                        })
                                                                })
                                                            )
                                                    })
                                        })
                            },
                            {
                                userJid:
                                    sock.user.id
                            }
                        )


                    return await sock.relayMessage(
                        jid,
                        messageContent.message,
                        {

                            messageId:
                                messageContent.key.id,

                            additionalNodes: [

                                {
                                    tag:
                                        "biz",

                                    attrs: {},

                                    content: [

                                        {
                                            tag:
                                                "interactive",

                                            attrs: {
                                                type:
                                                    "native_flow",

                                                v:
                                                    "1"
                                            },

                                            content: [

                                                {
                                                    tag:
                                                        "native_flow",

                                                    attrs: {
                                                        name:
                                                            "quick_reply"
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    )
                }
            }


        if (
            !state.creds.registered
        ) {

            const pairingNumber =
                String(
                    process.env.PAIRING_NUMBER ||
                    '967715795639'
                )
                .replace(/\D/g, '')


            if (!pairingNumber) {

                console.log(
                    chalk.red(
                        '❌ No valid pairing number found.'
                    )
                )

            } else {

                console.log(
                    chalk.yellow(
                        `📱 Pairing Number: ${pairingNumber}`
                    )
                )


                setTimeout(
                    async () => {

                        try {

                            if (
                                isShuttingDown ||
                                currentSock !== sock
                            ) {
                                return
                            }

                            if (
                                state.creds.registered
                            ) {
                                return
                            }

                            console.log(
                                chalk.cyan(
                                    '🔐 Requesting pairing code...'
                                )
                            )


                            const code =
                                await sock.requestPairingCode(
                                    pairingNumber
                                )


                            console.log(
                                chalk.green(
                                    `\n🔑 PAIRING CODE: ${code}\n`
                                )
                            )

                        } catch (error) {

                            console.error(
                                chalk.red(
                                    '❌ Pairing Code Error:'
                                ),
                                error
                            )
                        }

                    },
                    5000
                )
            }
        }


        sock.ev.on(
            'connection.update',
            async update => {

                const {
                    connection,
                    lastDisconnect
                } = update


                if (
                    connection ===
                    'connecting'
                ) {

                    console.log(
                        chalk.yellow(
                            '🔄 Connecting to WhatsApp...'
                        )
                    )
                }


                if (
                    connection ===
                    'open'
                ) {

                    console.log(
                        chalk.green.bold(
                            '\n╭──────────────────────────────╮'
                        )
                    )

                    console.log(
                        chalk.green.bold(
                            '│   🟢 ARTHUR BOT IS ONLINE     │'
                        )
                    )

                    console.log(
                        chalk.green.bold(
                            '╰──────────────────────────────╯\n'
                        )
                    )


                    try {

                        if (sock.user?.id) {

                            sock.mainBotNumber =
                                sock.user.id

                            sock.__mainBotNumber =
                                sock.user.id
                        }

                    } catch (error) {}


                    try {

                        await warmupHandler(
                            sock
                        )

                        console.log(
                            chalk.green(
                                '✅ Handler warmup completed.'
                            )
                        )

                    } catch (error) {
                        console.error(
                            chalk.red('❌ Handler warmup failed:'),
                            error?.stack || error?.message || error
                        )
                    }


                    try {

                        const restartFile =
                            path.join(
                                dataDir,
                                'restart.json'
                            )


                        if (
                            await fs.pathExists(
                                restartFile
                            )
                        ) {

                            let restartData =
                                null

                            try {

                                restartData =
                                    await fs.readJson(
                                        restartFile
                                    )

                            } catch {}


                            if (
                                restartData &&
                                restartData.jid
                            ) {

                                const restartText =
                                    restartData.message ||
                                    '*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*\n' +
                                    '*║ 🩸 𝐀𝐑𝐓𝐇𝐔𝐑 𝐁𝐎𝐓 🩸*\n' +
                                    '*║ 🚀 تمت إعادة تشغيل النواة بنجاح*\n' +
                                    '*║ تم التشغيل والاتصال بالخادم ✅*\n' +
                                    '*◇❐ ═━━╾ 🩸 ╼━━═ ❐◇*'


                                try {

                                    await sock.sendMessage(
                                        restartData.jid,
                                        {
                                            text:
                                                restartText
                                        }
                                    )

                                } catch (error) {
                                    console.error(
                                        chalk.yellow('⚠️ Restart notification failed:'),
                                        error?.message || error
                                    )
                                }
                            }


                            try {

                                await fs.remove(
                                    restartFile
                                )

                            } catch {}
                        }

                    } catch (error) {
                        console.error(
                            chalk.yellow('⚠️ Restart-file processing failed:'),
                            error?.message || error
                        )
                    }
                }


                if (
                    connection ===
                    'close'
                ) {

                    const statusCode =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode

                    const errorMessage =
                        lastDisconnect
                            ?.error
                            ?.message ||
                        ''

                    const closeReason =
                        statusCode ??
                        errorMessage ??
                        'UNKNOWN'


                    console.log(
                        chalk.red(
                            `❌ Connection closed : ${closeReason}`
                        )
                    )


                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {

                        console.log(
                            chalk.red(
                                '🚫 Session logged out. Automatic reconnect disabled.'
                            )
                        )


                        if (
                            currentSock === sock
                        ) {
                            currentSock = null
                        }


                        if (
                            global.sock === sock
                        ) {
                            global.sock = null
                        }


                        clearReconnectTimer()

                        return
                    }


                    if (
                        isShuttingDown
                    ) {

                        if (
                            currentSock === sock
                        ) {
                            currentSock = null
                        }

                        return
                    }


                    if (
                        reconnectTimer
                    ) {
                        return
                    }


                    if (
                        currentSock === sock
                    ) {
                        currentSock = null
                    }


                    if (
                        global.sock === sock
                    ) {
                        global.sock = null
                    }


                    reconnectTimer =
                        setTimeout(
                            async () => {

                                reconnectTimer =
                                    null

                                if (
                                    isShuttingDown
                                ) {
                                    return
                                }


                                if (
                                    currentSock &&
                                    currentSock.ws &&
                                    currentSock.ws.readyState === 1
                                ) {
                                    return
                                }


                                console.log(
                                    chalk.cyan(
                                        '🔄 Restarting WhatsApp connection...'
                                    )
                                )


                                try {

                                    await startBot()

                                } catch (error) {
                                    console.error(
                                        chalk.red('❌ Reconnect attempt failed:'),
                                        error?.stack || error?.message || error
                                    )
                                }

                            },
                            RECONNECT_DELAY
                        )
                }
            }
        )


        // ========================================================
        // MESSAGES — DIAGNOSTIC LOGGING
        // ========================================================

        sock.ev.on(
            'messages.upsert',
            async chatUpdate => {

                try {

                    if (
                        !chatUpdate ||
                        !Array.isArray(chatUpdate.messages) ||
                        chatUpdate.messages.length === 0
                    ) {
                        return
                    }

                    const updateType =
                        chatUpdate.type || 'unknown'

                    console.log(
                        chalk.cyan(
                            `📩 messages.upsert: type=${updateType}, count=${chatUpdate.messages.length}`
                        )
                    )

                    // Preserve the current policy: process notify messages
                    // and append batches that contain a message sent by this bot.
                    if (updateType !== 'notify') {

                        const hasOutgoingBotMessage =
                            updateType === 'append' &&
                            chatUpdate.messages.some(
                                message =>
                                    message?.key?.fromMe === true
                            )

                        if (!hasOutgoingBotMessage) {

                            console.log(
                                chalk.gray(
                                    `⏭️ Ignored messages.upsert type: ${updateType}`
                                )
                            )

                            return
                        }
                    }

                    for (
                        const mek
                        of chatUpdate.messages
                    ) {

                        if (!mek) continue

                        try {

                            serialize(
                                sock,
                                mek
                            )

                        } catch (error) {

                            console.error(
                                chalk.red('❌ serialize error:'),
                                error?.stack || error?.message || error
                            )
                        }
                    }

                    console.log(
                        chalk.cyan(
                            '⚙️ Passing message batch to handleMessages...'
                        )
                    )

                    await handleMessages(
                        sock,
                        chatUpdate
                    )

                    console.log(
                        chalk.green(
                            '✅ handleMessages completed.'
                        )
                    )

                } catch (error) {

                    console.error(
                        chalk.red('❌ messages.upsert handler error:'),
                        error?.stack || error?.message || error
                    )
                }
            }
        )


        // ========================================================
        // GROUP PARTICIPANTS
        // ========================================================

        sock.ev.on(
            'group-participants.update',
            async update => {

                try {

                    await runPluginEvent(
                        sock,
                        'onGroupParticipantsUpdate',
                        update
                    )

                } catch (error) {
                    console.error(
                        chalk.red('❌ Group participant event failed:'),
                        error?.message || error
                    )
                }
            }
        )


        // ========================================================
        // GROUP JOIN REQUEST
        // ========================================================

        sock.ev.on(
            'group.join-request',
            async update => {

                try {

                    await runPluginEvent(
                        sock,
                        'onGroupJoinRequest',
                        update
                    )

                } catch (error) {
                    console.error(
                        chalk.red('❌ Group join-request event failed:'),
                        error?.message || error
                    )
                }
            }
        )


        console.log(
            chalk.green(
                '✅ ARTHUR BOT socket initialized successfully.'
            )
        )


    } catch (error) {

        console.error(
            chalk.red.bold(
                '❌ Failed to start ARTHUR BOT:'
            ),
            error?.stack || error?.message || error
        )


        if (
            currentSock &&
            currentSock === global.sock
        ) {

            currentSock = null
            global.sock = null
        }


        if (
            !isShuttingDown &&
            !reconnectTimer
        ) {

            reconnectTimer =
                setTimeout(
                    async () => {

                        reconnectTimer =
                            null

                        if (
                            isShuttingDown
                        ) {
                            return
                        }


                        try {

                            await startBot()

                        } catch (retryError) {

                            console.error(
                                chalk.red('❌ Startup retry failed:'),
                                retryError?.stack || retryError?.message || retryError
                            )
                        }

                    },
                    RECONNECT_DELAY
                )
        }

    } finally {

        isStarting = false
    }
}


// ============================================================
// ERROR HANDLERS
// ============================================================

process.on('unhandledRejection', error => {
    console.error(
        chalk.red('❌ Unhandled rejection:'),
        error?.stack || error?.message || error
    )
})

process.on('uncaughtException', error => {
    console.error(
        chalk.red('❌ Uncaught exception:'),
        error?.stack || error?.message || error
    )
})


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function gracefulShutdown(
    signal
) {

    if (isShuttingDown) {
        return
    }

    isShuttingDown = true


    console.log(
        chalk.yellow(
            `\n🛑 ${signal} received. Shutting down ARTHUR BOT...`
        )
    )


    clearReconnectTimer()


    try {

        clearInterval(
            liveClock
        )

    } catch {}


    try {

        await new Promise(
            resolve => {

                keepAliveServer.close(
                    () => resolve()
                )
            }
        )

    } catch {}


    try {

        if (currentSock) {

            try {

                if (
                    currentSock.ws &&
                    typeof currentSock.ws.close ===
                    'function'
                ) {

                    currentSock.ws.close()
                }

            } catch {}


            currentSock = null
        }


        if (global.sock) {
            global.sock = null
        }

    } catch {}


    console.log(
        chalk.green(
            '✅ ARTHUR BOT shutdown complete.'
        )
    )


    process.exit(0)
}


// ============================================================
// PROCESS SIGNALS
// ============================================================

process.once(
    'SIGINT',
    () =>
        gracefulShutdown('SIGINT')
)

process.once(
    'SIGTERM',
    () =>
        gracefulShutdown('SIGTERM')
)


// ============================================================
// START
// ============================================================

startBot().catch(
    error => {
        console.error(
            chalk.red('❌ Initial start failed:'),
            error?.stack || error?.message || error
        )
    }
)