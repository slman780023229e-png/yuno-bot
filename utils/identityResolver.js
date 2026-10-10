import fs from "fs";
import path from "path";

// استخدام مسار جذري ثابت وآمن تماماً للاستضافات
const dataDir = path.join(process.cwd(), "data");
const identityFile = path.join(dataDir, "الهويات.json");

let identityCache = new Map();
let identityLoaded = false;
let identityLoading = null;

const MIN_NUMBER_LENGTH = 5;
const MAX_IDENTITY_CACHE = 200; // حد أقصى آمن جداً للاستضافات المجانية

function _cleanupIdentityCache() {
    if (identityCache.size <= MAX_IDENTITY_CACHE) return;
    const oldestKey = identityCache.keys().next().value;
    if (oldestKey !== undefined) {
        identityCache.delete(oldestKey);
    }
}

export function extractPureNumber(value) {
    try {
        if (value === undefined || value === null) return "";
        let v = String(value).trim();
        if (!v) return "";
        if (v.includes(":")) v = v.split(":")[0];
        if (v.includes("@")) v = v.split("@")[0];
        return v.replace(/\D/g, "");
    } catch {
        return "";
    }
}

export function normalizeIdentity(value) {
    try {
        if (value === undefined || value === null) return "";
        return String(value).trim().toLowerCase();
    } catch {
        return "";
    }
}

export function normalizePhone(value) {
    const number = extractPureNumber(value);
    if (!number) return "";
    return number.replace(/^0+(?=\d)/, "");
}

export function getIdentityType(value) {
    const id = normalizeIdentity(value);
    if (!id) return "unknown";
    if (id.endsWith("@lid")) return "lid";
    if (id.endsWith("@s.whatsapp.net")) return "phone";
    if (id.endsWith("@g.us")) return "group";
    if (id.includes("@") && id.includes(".")) return "jid";
    if (/^\d+$/.test(id) && id.length >= MIN_NUMBER_LENGTH) return "phone";
    return "id";
}

function addIdentity(result, seen, value, type = null) {
    if (value === undefined || value === null) return;
    const raw = normalizeIdentity(value);
    if (!raw) return;

    const detectedType = type || getIdentityType(raw);
    const key = `${detectedType}:${raw}`;
    if (seen.has(key)) return;

    seen.add(key);
    result.push({ type: detectedType, value: raw });

    const number = normalizePhone(raw);
    if (number && number.length >= MIN_NUMBER_LENGTH) {
        const numberKey = `phone:${number}`;
        if (!seen.has(numberKey)) {
            seen.add(numberKey);
            result.push({ type: "phone", value: number });
        }
    }
}

export function getParticipantIdentities(participant) {
    const result = [];
    const seen = new Set();
    if (!participant) return result;

    addIdentity(result, seen, participant.id);
    addIdentity(result, seen, participant.jid);
    addIdentity(result, seen, participant.lid);
    addIdentity(result, seen, participant.phone);
    addIdentity(result, seen, participant.phoneNumber);
    return result;
}

export function findParticipantByIdentity(participants, identities) {
    if (!Array.isArray(participants) || !participants.length) return null;
    if (!Array.isArray(identities)) identities = [identities];

    for (const identity of identities) {
        const wanted = typeof identity === "object" ? normalizeIdentity(identity.value) : normalizeIdentity(identity);
        if (!wanted) continue;
        const found = participants.find(p => [p?.id, p?.jid, p?.lid].some(c => normalizeIdentity(c) === wanted));
        if (found) return found;
    }

    for (const identity of identities) {
        const wanted = typeof identity === "object" ? normalizePhone(identity.value) : normalizePhone(identity);
        if (!wanted || wanted.length < MIN_NUMBER_LENGTH) continue;
        const found = participants.find(p => [p?.phoneNumber, p?.phone, p?.id, p?.jid].some(c => normalizePhone(c) === wanted));
        if (found) return found;
    }
    return null;
}

export function getBotIdentities(sock) {
    const result = [];
    const seen = new Set();
    const candidates = [
        sock?.user?.id, sock?.user?.jid, sock?.user?.lid, sock?.user?.phone,
        sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.jid, sock?.authState?.creds?.me?.lid, sock?.authState?.creds?.me?.phone,
        sock?.botJid, sock?.botLid, sock?.botPhone, sock?.__botJid, sock?.__botLid, sock?.__botPhone
    ];
    for (const value of candidates) addIdentity(result, seen, value);
    return result;
}

export function resolveBotIdentity(sock, metadata = null) {
    const identities = getBotIdentities(sock);
    let participant = null;
    if (metadata?.participants && Array.isArray(metadata.participants)) {
        participant = findParticipantByIdentity(metadata.participants, identities);
    }
    const all = [...identities];
    if (participant) {
        for (const identity of getParticipantIdentities(participant)) {
            if (!all.some(x => x.type === identity.type && x.value === identity.value)) all.push(identity);
        }
    }
    const phone = all.find(x => x.type === "phone")?.value || "";
    const lid = all.find(x => x.type === "lid")?.value || "";
    const jid = all.find(x => x.type === "phone" && x.value.includes("@"))?.value || "";
    return { identities: all, phone, lid, jid, participant };
}

export function resolveUserIdentity(sock, msg, metadata = null) {
    const result = [];
    const seen = new Set();
    const isGroup = msg?.key?.remoteJid?.endsWith("@g.us");
    let sender = "";

    if (msg?.key?.fromMe) {
        sender = sock?.user?.id || sock?.user?.jid || sock?.user?.lid || "";
    } else if (isGroup) {
        sender = msg?.key?.participant || msg?.participant || "";
    } else {
        sender = msg?.key?.remoteJid || "";
    }

    addIdentity(result, seen, sender);
    let participant = null;
    if (metadata?.participants && Array.isArray(metadata.participants)) {
        participant = findParticipantByIdentity(metadata.participants, result);
    }
    if (participant) {
        for (const identity of getParticipantIdentities(participant)) {
            addIdentity(result, seen, identity.value, identity.type);
        }
    }

    const phone = result.find(x => x.type === "phone")?.value || "";
    const lid = result.find(x => x.type === "lid")?.value || "";
    const jid = result.find(x => x.type === "jid" || (x.type === "id" && x.value.includes("@")))?.value || "";
    return { sender, phone, lid, jid, participant, identities: result };
}

async function loadIdentityFile() {
    if (identityLoaded) return identityCache;
    if (identityLoading) return identityLoading;

    identityLoading = (async () => {
        try {
            await fs.promises.mkdir(dataDir, { recursive: true });
            if (!fs.existsSync(identityFile)) {
                await fs.promises.writeFile(identityFile, "{}", "utf8");
            }
            const content = await fs.promises.readFile(identityFile, "utf8");
            const data = JSON.parse(content || "{}");
            identityCache = new Map();

            if (data && typeof data === "object") {
                for (const [key, value] of Object.entries(data)) {
                    _cleanupIdentityCache();
                    identityCache.set(normalizeIdentity(key), value);
                }
            }
            identityLoaded = true;
            return identityCache;
        } catch {
            identityCache = new Map();
            identityLoaded = true;
            return identityCache;
        } finally {
            identityLoading = null;
        }
    })();
    return identityLoading;
}

export async function saveIdentity(identities, data = {}) {
    try {
        await loadIdentityFile();
        const values = Array.isArray(identities) ? identities : [identities];

        for (const identity of values) {
            const value = typeof identity === "object" ? identity.value : identity;
            const key = normalizeIdentity(value);
            if (!key) continue;

            _cleanupIdentityCache();
            identityCache.set(key, { ...data, updatedAt: Date.now() });
        }

        const output = Object.fromEntries(identityCache.entries());
        await fs.promises.writeFile(identityFile, JSON.stringify(output, null, 2), "utf8");
        return true;
    } catch {
        return false;
    }
}

export function clearIdentityCache() {
    identityLoaded = false;
    identityLoading = null;
    identityCache = new Map();
}

export async function warmupIdentityResolver() {
    try {
        await loadIdentityFile();
        return true;
    } catch {
        return false;
    }
}

export default {
    extractPureNumber, normalizeIdentity, normalizePhone, getIdentityType,
    getParticipantIdentities, findParticipantByIdentity, getBotIdentities,
    resolveBotIdentity, resolveUserIdentity, saveIdentity, clearIdentityCache,
    warmupIdentityResolver
};
