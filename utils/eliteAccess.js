import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");
const eliteFiles = [
    "النخبة.json",
    "النخبه.json",
    "النخبة",
    "النخبه"
];

export function normalizeNumber(value) {
    if (value === undefined || value === null) return "";
    let raw = String(value).trim();
    const colon = raw.indexOf(":");
    if (colon >= 0) raw = raw.slice(0, colon);
    const at = raw.indexOf("@");
    if (at >= 0) raw = raw.slice(0, at);
    return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function valuesFromRecord(record) {
    if (record && typeof record === "object") {
        return [
            record.number,
            record.phone,
            record.phoneNumber,
            record.id,
            record.jid,
            record.lid
        ];
    }
    return [record];
}

export function readEliteNumbers() {
    for (const filename of eliteFiles) {
        const fullPath = path.join(dataDir, filename);
        if (!fs.existsSync(fullPath)) continue;
        try {
            const content = fs.readFileSync(fullPath, "utf8").trim();
            if (!content) return [];
            let records;
            try {
                const parsed = JSON.parse(content);
                records = Array.isArray(parsed)
                    ? parsed
                    : Object.values(parsed || {}).flat();
            } catch {
                records = content.split(/\r?\n/).filter(Boolean);
            }
            const numbers = records
                .flatMap(valuesFromRecord)
                .map(normalizeNumber)
                .filter(Boolean);
            return [...new Set(numbers)];
        } catch (error) {
            console.error("[ARTHUR] تعذر قراءة ملف النخبة:", error.message);
        }
    }
    return [];
}

export function getSenderNumber(msg, data = {}) {
    const candidates = [
        msg?.key?.participant,
        data?.sender,
        msg?.participant,
        msg?.key?.remoteJid,
        data?.jid
    ];
    for (const candidate of candidates) {
        const number = normalizeNumber(candidate);
        if (number) return number;
    }
    return "";
}

export function isConfiguredOwner(number) {
    const normalized = normalizeNumber(number);
    const owners = Array.isArray(config?.owner)
        ? config.owner
        : [config?.owner];
    return Boolean(normalized) && owners.some(owner => {
        return normalizeNumber(owner) === normalized;
    });
}

export function isEliteMember(msg, data = {}) {
    const number = getSenderNumber(msg, data);
    if (!number) return false;
    if (isConfiguredOwner(number)) return true;
    return readEliteNumbers().includes(number);
}

export default {
    normalizeNumber,
    readEliteNumbers,
    getSenderNumber,
    isConfiguredOwner,
    isEliteMember
};
