//nixcode.js

'use strict';

const VERSION = '4.7';

import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';
import crypto from 'crypto';
let sharp = null;
try {
	const sharpModule = await import('sharp');
	sharp = sharpModule.default || sharpModule;
} catch (error) {
	console.warn('⚠️ sharp غير متاح؛ وظائف الصور التي تعتمد عليه ستبقى معطلة فقط.');
}
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🧹 نظام تنظيف الذاكرة المؤقتة التلقائي (Memory & Cache Garbage Collection)
function performSystemCleanup() {
	try {
		if (global.gc) {
			global.gc();
		}
	} catch (e) {}
}

function isHttpUrl(value) { return typeof value === 'string' && /^https?:\/\/.+/i.test(value.trim()); }
function isWhatsAppUrl(value) { return typeof value === 'string' && /^https?:\/\/[^/]*\.whatsapp\.net\//i.test(value.trim()); }
function isDataUrl(value) { return typeof value === 'string' && /^data:[^;,]+;base64,/i.test(value.trim()); }
function isBase64(value) {
	if (typeof value !== 'string') return false;
	const clean = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
	return !!clean && clean.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(clean) && clean.length % 4 === 0;
}

function getLocalCandidates(input) {
	if (typeof input !== 'string') return [];
	const value = input.trim();
	if (!value || isHttpUrl(value) || isDataUrl(value) || isBase64(value)) return [];
	const candidates = [];
	if (path.isAbsolute(value)) {
		candidates.push(value);
	} else {
		candidates.push(path.resolve(process.cwd(), value));
		candidates.push(path.resolve(__dirname, value));
		candidates.push(path.resolve(__dirname, '..', value));
		candidates.push(path.resolve(__dirname, '..', '..', value));
	}
	return [...new Set(candidates)];
}

function getExistingLocalPath(input) {
	for (const candidate of getLocalCandidates(input)) {
		try {
			if (!fs.existsSync(candidate)) continue;
			if (fs.statSync(candidate).isFile()) return candidate;
		} catch {}
	}
	return null;
}

function isLocalFile(input) { return !!getExistingLocalPath(input); }

function readLocalFile(input, { silent = true } = {}) {
	try {
		const localPath = getExistingLocalPath(input);
		if (!localPath) {
			if (silent) return Buffer.alloc(0);
			throw new Error(`Local file not found: ${input}`);
		}
		return fs.readFileSync(localPath);
	} catch (error) {
		if (silent) return Buffer.alloc(0);
		throw error;
	}
}

function getExtension(input = '') {
	if (typeof input !== 'string') return '';
	return path.extname(input.split('?')[0].split('#')[0]).replace('.', '').toLowerCase();
}

function getMimeType(input = '', fallback = 'application/octet-stream') {
	const ext = getExtension(input);
	const mimeMap = {
		jpg: 'image/jpeg',
		    jpeg: 'image/jpeg',
		    jpe: 'image/jpeg',
		    png: 'image/png',
		    gif: 'image/gif',
		    webp: 'image/webp',
		    bmp: 'image/bmp',
		    heic: 'image/heic',
		    heif: 'image/heif',
		    avif: 'image/avif',
		mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
		mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
		pdf: 'application/pdf',
		    doc: 'application/msword',
		    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		    xls: 'application/vnd.ms-excel',
		    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		    ppt: 'application/vnd.ms-powerpoint',
		    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		    txt: 'text/plain',
		    zip: 'application/zip',
		    rar: 'application/vnd.rar'
	};
	return mimeMap[ext] || fallback;
}

function inferMediaType(input, fallback = 'image') {
	if (typeof input === 'object' && input !== null) {
		if (input.image) return 'image';
		if (input.video) return 'video';
		if (input.document) return 'document';
		if (input.audio) return 'audio';
	}
	const mime = getMimeType(typeof input === 'string' ? input : '');
	if (mime.startsWith('image/')) return 'image';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime === 'application/pdf' || mime.startsWith('application/')) return 'document';
	return fallback;
}

function base64ToBuffer(value) {
	if (typeof value !== 'string') throw new TypeError('Base64 value must be a string');
	return Buffer.from(value.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, ''), 'base64');
}

function bufferToDataUrl(buffer, mime = 'application/octet-stream') {
	if (!Buffer.isBuffer(buffer)) throw new TypeError('bufferToDataUrl requires a Buffer');
	return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function normalizeLocalMedia(value) {
	if (Buffer.isBuffer(value)) return value;
	if (Array.isArray(value)) return Promise.all(value.map(item => normalizeLocalMedia(item)));
	if (value === null || value === undefined || typeof value !== 'object') {
		if (typeof value === 'string' && isLocalFile(value)) return readLocalFile(value, { silent: false });
		return value;
	}
	const output = {};
	const mediaKeys = new Set(['url',
	    'imageUrl',
	    'image_url',
	    'videoUrl',
	    'video_url',
	    'thumbnailUrl',
	    'thumbnail_url',
	    'thumbnail',
	    'jpegThumbnail',
	    'sourceUrl',
	    'source_url',
	    'profileIconUrl',
	    'profile_url',
	    'profile',
	    'profile_picture_url',
	    'footer_icon',
	    'icon_url',
	    'icon',
	    'image',
	    'video',
	    'document',
	    'audio',
	    'media']);
	for (const [key, item] of Object.entries(value)) {
		if (mediaKeys.has(key) && typeof item === 'string' && isLocalFile(item)) {
			output[key] = readLocalFile(item, { silent: false });
			continue;
		}
		if (mediaKeys.has(key) && typeof item === 'string' && isDataUrl(item)) {
			output[key] = item;
			continue;
		}
		output[key] = await normalizeLocalMedia(item);
	}
	return output;
}

async function resolveMediaSource(input, { result = 'buffer', silent = true, fetchOptions = {} } = {}) {
	try {
		let res;
		if (Buffer.isBuffer(input)) {
			if (result === 'buffer') return input;
			if (result === 'base64') return input.toString('base64');
			if (result === 'dataurl') return bufferToDataUrl(input);
			return input;
		}
		if (input && typeof input === 'object' && !Array.isArray(input)) {
			if (Buffer.isBuffer(input.buffer)) return resolveMediaSource(input.buffer, { result, silent });
			if (input.path) return resolveMediaSource(input.path, { result, silent, fetchOptions });
			if (input.url) return resolveMediaSource(input.url, { result, silent, fetchOptions });
			return input;
		}
		if (typeof input !== 'string') {
			if (silent) return Buffer.alloc(0);
			throw new Error('Media source must be a string, Buffer or object');
		}
		const value = input.trim();
		if (!value) {
			if (silent) return Buffer.alloc(0);
			throw new Error('Media source is empty');
		}
		const localPath = getExistingLocalPath(value);
		if (localPath) {
			const buffer = fs.readFileSync(localPath);
			if (result === 'buffer') return buffer;
			if (result === 'base64') return buffer.toString('base64');
			if (result === 'dataurl') return bufferToDataUrl(buffer, getMimeType(localPath));
			if (result === 'path') return localPath;
			return buffer;
		}
		if (isDataUrl(value)) {
			const buffer = base64ToBuffer(value);
			if (result === 'buffer') return buffer;
			if (result === 'base64') return buffer.toString('base64');
			if (result === 'dataurl') {
				const mime = value.match(/^data:([^;]+);/i)?.[1] || 'application/octet-stream';
				return bufferToDataUrl(buffer, mime);
			}
			return buffer;
		}
		if (isBase64(value)) {
			const buffer = base64ToBuffer(value);
			if (result === 'buffer') return buffer;
			if (result === 'base64') return buffer.toString('base64');
			if (result === 'dataurl') return bufferToDataUrl(buffer);
			return buffer;
		}
		if (isHttpUrl(value)) {
			const response = await fetch(value, fetchOptions);
			if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
			const buffer = Buffer.from(await response.arrayBuffer());
			if (result === 'buffer') return buffer;
			if (result === 'base64') return buffer.toString('base64');
			if (result === 'dataurl') {
				const mime = response.headers.get('content-type') || getMimeType(value);
				return bufferToDataUrl(buffer, mime);
			}
			if (result === 'url') return value;
			return buffer;
		}
		if (silent) return Buffer.alloc(0);
		throw new Error(`File or URL not found: ${value}`);
	} catch (error) {
		if (silent) return Buffer.alloc(0);
		throw error;
	} finally {
		performSystemCleanup();
	}
}

function extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
	if (!extract) return { text, ie: [], inline_entities: [] };
	const createIE = (type, ie) => {
		if (type === 'hyperlink') return { key: ie.key,
		    metadata: { display_name: ie.text,
		    is_trusted: ie.is_trusted,
		    url: ie.url,
		    __typename: 'GenAIInlineLinkItem' } };
		if (type === 'citation') return { key: ie.key,
		    metadata: { reference_id: ie.reference_id,
		    reference_url: ie.url,
		    reference_title: ie.url,
		    reference_display_name: ie.url,
		    sources: [],
		    __typename: 'GenAISearchCitationItem' } };
		if (type === 'latex') return { key: ie.key,
		    metadata: { latex_expression: ie.text,
		    latex_image: { url: ie.url,
		    width: Number(ie.width) || 100,
		    height: Number(ie.height) || 100 },
		    font_height: Number(ie.font_height) || 83.333333333333,
		    padding: Number(ie.padding) || 15,
		    __typename: 'GenAILatexItem' } };
		return null;
	};
	let ie = [], inline_entities = [], result = '', last = 0, citation_index = 1, hyperlink_index = 0, latex_index = 0, stack = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '[' && text[i - 1] !== '\\') {
			stack.push(i);
		} else if (text[i] === ']' && (text[i + 1] === '(' || text[i + 1] === '<')) {
			const start = stack.pop();
			if (start == null) continue;
			const open = text[i + 1], close = open === '(' ? ')' : '>', type = open === '(' ? 'link' : 'latex';
			let end = i + 2, depth = 1;
			while (end < text.length && depth) {
				if (text[end] === open && text[end - 1] !== '\\') depth++;
				else if (text[end] === close && text[end - 1] !== '\\') depth--;
				end++;
			}
			if (depth) continue;
			const raw = text.slice(start + 1, i).trim();
			let url = text.slice(i + 2, end - 1).trim();
			let key, tag, data;
			if (type === 'latex') {
				if (!latex) continue;
				const [txt = '', width = null, height = null, font_height = null, padding = null] = raw.split('|');
				key = `\u004E\u0049\u0058\u0045\u004C_LATEX_${latex_index++}`;
				tag = `{{${key}}}${txt || 'image'}{{/${key}}}`;
				data = { type: 'latex', ie: { key, text: txt, url, width, height, font_height, padding } };
			} else if (raw) {
				if (!hyperlink) continue;
				const trusted = !url.startsWith('!');
				if (!trusted) url = url.slice(1);
				key = `\u004E\u0049\u0058\u0045\u004C_HYPERLINK_${hyperlink_index++}`;
				tag = `{{${key}}}${url}{{/${key}}}`;
				data = { type: 'hyperlink', ie: { key, text: raw, url, is_trusted: trusted } };
			} else {
				if (!citation) continue;
				key = `\u004E\u0049\u0058\u0045\u004C_CITATION_${citation_index - 1}`;
				tag = `{{${key}}}${url}{{/${key}}}`;
				data = { type: 'citation', ie: { reference_id: citation_index++, key, text: '', url } };
			}
			result += text.slice(last, start) + tag;
			last = end;
			ie.push(data);
			const entity = createIE(data.type, data.ie);
			if (entity) inline_entities.push(entity);
			i = end - 1;
		}
	}
	result += text.slice(last);
	return { text: result, ie, inline_entities };
}

async function waitAllPromises(input) {
	const isPromise = value => value && typeof value.then === 'function';
	const isObject = value => value && typeof value === 'object';
	const deep = async (value) => {
		if (isPromise(value)) return deep(await value);
		if (Array.isArray(value)) return Promise.all(value.map(deep));
		if (isObject(value)) {
			const entries = await Promise.all(Object.entries(value).map(async ([key, val]) => [key, await deep(val)]));
			return Object.fromEntries(entries);
		}
		return value;
	};
	return deep(await input);
}

class Toolkit {
	constructor() {}
	static extractIE(text, opts = {}) { return extractIE(text, opts); }
	static isLocalFile(input) { return isLocalFile(input); }
	static getLocalPath(input) { return getExistingLocalPath(input); }
	static getMimeType(input, fallback = 'application/octet-stream') { return getMimeType(input, fallback); }
	static inferMediaType(input, fallback = 'image') { return inferMediaType(input, fallback); }
	static async normalizeMedia(input) { return normalizeLocalMedia(input); }
	static async fetchBuffer(url, options = {}, { silent = true } = {}) { return resolveMediaSource(url, { result: 'buffer', silent, fetchOptions: options });
	    }
	static async fetchBase64(url, options = {}, { silent = true } = {}) { return resolveMediaSource(url, { result: 'base64', silent, fetchOptions: options });
	    }
	static async fetchDataUrl(url, options = {}, { silent = true } = {}) { return resolveMediaSource(url, { result: 'dataurl', silent, fetchOptions: options });
	    }
	static async resize(buffer, x, y, fit = 'cover') {
		if (!Buffer.isBuffer(buffer)) throw new TypeError('resize requires a Buffer');
		if (!sharp) throw new Error('sharp غير متاح في هذه البيئة؛ ثبّت نسخة متوافقة إذا أردت resize عبر sharp.');
		try {
			return await sharp(buffer).resize(x, y, { fit, position: 'center', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
		} finally {
			performSystemCleanup();
		}
	}
	static async waitAllPromises(input) { return await waitAllPromises(input); }
	static async toUrl(_client, source, mediaType = 'document') {
		if (!source) throw new Error('Url, local path or buffer needed');
		let buffer = source;
		if (!Buffer.isBuffer(buffer)) buffer = await Toolkit.fetchBuffer(source, {}, { silent: false });
		const media = await prepareWAMessageMedia({ [mediaType]: buffer },
		    { upload: _client.waUploadToServer,
		    jid: '\u0040\u006e\u0065\u0077\u0073\u006c\u0065\u0074\u0074\u0065\u0072' });
		return Object.values(media)[0]?.url;
	}
	static async resolveMedia(_client,
	    media,
	    mediaType = 'image',
	    { resolveUrl = false,
	    resolveWAUrl = false,
	    result = 'url',
	    resize = false,
	    width = 300,
	    height = 300 } = {}) {
		const processOne = async (item) => {
			if (item && typeof item === 'object' && !Buffer.isBuffer(item) && !Array.isArray(item)) {
				if (item.buffer) return processOne(item.buffer);
				if (item.path) return processOne(item.path);
				if (item.url) return processOne(item.url);
			}
			if (Buffer.isBuffer(item)) {
				let buffer = item;
				if (resize) buffer = await Toolkit.resize(buffer, width, height);
				if (result === 'buffer') return buffer;
				if (result === 'base64') return buffer.toString('base64');
				if (result === 'dataurl') return bufferToDataUrl(buffer,
				    mediaType === 'image' ? 'image/png' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream');
				return Toolkit.toUrl(_client, buffer, mediaType);
			}
			if (typeof item === 'string' && isLocalFile(item)) {
				let buffer = readLocalFile(item, { silent: false });
				if (resize) buffer = await Toolkit.resize(buffer, width, height);
				if (result === 'buffer') return buffer;
				if (result === 'base64') return buffer.toString('base64');
				if (result === 'dataurl') return bufferToDataUrl(buffer, getMimeType(item));
				return Toolkit.toUrl(_client, buffer, mediaType);
			}
			if (typeof item === 'string' && isHttpUrl(item)) {
				if (result === 'url' && !resolveUrl && !(isWhatsAppUrl(item) && resolveWAUrl)) return item;
				const buffer = await Toolkit.fetchBuffer(item, {}, { silent: false });
				let finalBuffer = buffer;
				if (resize) finalBuffer = await Toolkit.resize(finalBuffer, width, height);
				if (result === 'buffer') return finalBuffer;
				if (result === 'base64') return finalBuffer.toString('base64');
				if (result === 'dataurl') return bufferToDataUrl(finalBuffer,
				    getMimeType(item,
				    mediaType === 'image' ? 'image/png' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream'));
				return Toolkit.toUrl(_client, finalBuffer, mediaType);
			}
			if (typeof item === 'string' && isBase64(item)) {
				let buffer = base64ToBuffer(item);
				if (resize) buffer = await Toolkit.resize(buffer, width, height);
				if (result === 'buffer') return buffer;
				if (result === 'base64') return buffer.toString('base64');
				if (result === 'dataurl') return bufferToDataUrl(buffer,
				    mediaType === 'image' ? 'image/png' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream');
				return Toolkit.toUrl(_client, buffer, mediaType);
			}
			if (typeof item === 'string') return item;
			return item;
		};
		if (Array.isArray(media)) return Promise.all(media.map(processOne));
		return processOne(media);
	}
	static getMp4Duration(buffer, { silent = true } = {}) {
		try {
			if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
				if (silent) return 0;
				throw new Error('Invalid buffer');
			}
			let offset = 0;
			while (offset < buffer.length - 8) {
				const size = buffer.readUInt32BE(offset);
				if (size < 8 || offset + size > buffer.length) {
					if (silent) return 0;
					throw new Error('Invalid atom size');
				}
				const type = buffer.toString('ascii', offset + 4, offset + 8);
				if (type === 'moov') {
					let moovOffset = offset + 8, moovEnd = offset + size;
					while (moovOffset < moovEnd - 8) {
						const childSize = buffer.readUInt32BE(moovOffset);
						if (childSize < 8 || moovOffset + childSize > moovEnd) {
							if (silent) return 0;
							throw new Error('Invalid child atom size');
						}
						const childType = buffer.toString('ascii', moovOffset + 4, moovOffset + 8);
						if (childType === 'mvhd') {
							const version = buffer.readUInt8(moovOffset + 8);
							if (version === 0) {
								const timescale = buffer.readUInt32BE(moovOffset + 20);
								const duration = buffer.readUInt32BE(moovOffset + 24);
								if (!timescale) { if (silent) return 0; throw new Error('Invalid timescale'); }
								return duration / timescale;
							}
							if (version === 1) {
								const timescale = buffer.readUInt32BE(moovOffset + 32);
								const duration = Number(buffer.readBigUInt64BE(moovOffset + 36));
								if (!timescale) { if (silent) return 0; throw new Error('Invalid timescale'); }
								return duration / timescale;
							}
						}
						moovOffset += childSize;
					}
				}
				offset += size;
			}
			if (silent) return 0;
			throw new Error('No mvhd found!');
		} catch (err) {
			if (silent) return 0;
			throw err;
		}
	}
	static getMp4Preview(videoBuffer, { time, result = 'buffer', resize = true, width = 300, height = 300, silent = true } = {}) {
		return new Promise((resolve, reject) => {
			const fail = (err) => {
				performSystemCleanup();
				if (silent) return resolve(result === 'base64' ? '' : Buffer.alloc(0));
				return reject(err);
			};
			try {
				if (!Buffer.isBuffer(videoBuffer) || !videoBuffer.length) return fail(new Error('videoBuffer tidak valid atau kosong'));
				const inputStream = new Readable({ read() {} });
				inputStream.push(videoBuffer);
				inputStream.push(null);
				const outputStream = new PassThrough();
				const chunks = [];
				outputStream.on('data', chunk => chunks.push(chunk));
				outputStream.on('end', async () => {
					try {
						let output = Buffer.concat(chunks);
						if (!output.length) return fail(new Error('Output kosong — cek format atau timestamp video'));
						if (resize) output = await Toolkit.resize(output, width, height);
						performSystemCleanup();
						if (result === 'base64') return resolve(output.toString('base64'));
						if (result === 'dataurl') return resolve(bufferToDataUrl(output, 'image/png'));
						return resolve(output);
					} catch (err) { return fail(err); }
				});
				outputStream.on('error', fail);
				if (time == null) {
					const duration = Toolkit.getMp4Duration(videoBuffer);
					time = duration > 0 ? Math.min(duration * 0.2, 10) : 0;
				}
				ffmpeg(inputStream).outputOptions([`-ss ${time}`,
				    '-vframes 1',
				    '-vcodec png',
				    '-f image2pipe']).on('error',
				    err => fail(new Error(`ffmpeg error: ${err.message}`))).pipe(outputStream,
				    { end: true });
			} catch (err) { return fail(err); }
		});
	}
}

class BaseBuilder {
	constructor() {
		this._title = '';
		this._subtitle = '';
		this._body = '';
		this._footer = '';
		this._contextInfo = {};
		this._extraPayload = {};
	}
	setTitle(title) { if (typeof title !== 'string') throw new TypeError('Title must be a string'); this._title = title; return this; }
	setSubtitle(subtitle) { if (typeof subtitle !== 'string') throw new TypeError('Subtitle must be a string');
	    this._subtitle = subtitle;
	    return this;
	    }
	setBody(body) { if (typeof body !== 'string') throw new TypeError('Body must be a string'); this._body = body; return this; }
	setFooter(footer) { if (typeof footer !== 'string') throw new TypeError('Footer must be a string'); this._footer = footer; return this; }
	setContextInfo(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('ContextInfo must be a plain object');
	    this._contextInfo = obj;
	    return this;
	    }
	addPayload(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Payload must be a plain object');
	    Object.assign(this._extraPayload, obj);
	    return this;
	    }
}

class Button extends BaseBuilder {
	#client;
	constructor(client) {
		super();
		if (!client) throw new Error('Socket is required');
		this.#client = client;
		this._buttons = [];
		this._data = null;
		this._currentSelectionIndex = -1;
		this._currentSectionIndex = -1;
		this._params = {};
	}
	setVideo(media, options = {}) { if (!media) throw new Error('Url, local path or buffer needed');
	    this._data = { video: media, ...options };
	    return this;
	    }
	setImage(media, options = {}) { if (!media) throw new Error('Url, local path or buffer needed');
	    this._data = { image: media, ...options };
	    return this;
	    }
	setDocument(media, options = {}) { if (!media) throw new Error('Url, local path or buffer needed');
	    this._data = { document: media, ...options };
	    return this;
	    }
	setMedia(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Media must be a plain object');
	    this._data = obj;
	    return this;
	    }
	clearButtons() { this._buttons = []; this._currentSelectionIndex = -1; this._currentSectionIndex = -1; return this; }
	setParams(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Params must be a plain object');
	    this._params = obj;
	    return this;
	    }
	addButton(name, params) { this._buttons.push({ name, buttonParamsJson: typeof params === 'string' ? params : JSON.stringify(params) });
	    return this;
	    }
	makeRow(header = '', title = '', description = '', id = '') {
		if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) throw new Error('You need to create a selection and a section first');
		const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
		if (!buttonParams.sections || !Array.isArray(buttonParams.sections)) buttonParams.sections = [];
		if (!buttonParams.sections[this._currentSectionIndex]) buttonParams.sections[this._currentSectionIndex] = { title: '', highlight_label: '', rows: [] };
		if (!Array.isArray(buttonParams.sections[this._currentSectionIndex].rows)) buttonParams.sections[this._currentSectionIndex].rows = [];
		buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id });
		this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
		return this;
	}
	makeSection(title = '', highlight_label = '') {
		if (this._currentSelectionIndex === -1) throw new Error('You need to create a selection first');
		const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
		if (!Array.isArray(buttonParams.sections)) buttonParams.sections = [];
		buttonParams.sections.push({ title, highlight_label, rows: [] });
		this._currentSectionIndex = buttonParams.sections.length - 1;
		this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
		return this;
	}
	addSelection(title, options = {}) {
		this._buttons.push({ ...options, name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections: [] }) });
		this._currentSelectionIndex = this._buttons.length - 1;
		this._currentSectionIndex = -1;
		return this;
	}
	addReply(display_text = '',
	    id = '',
	    options = {}) { this._buttons.push({ name: 'quick_reply',
	    buttonParamsJson: JSON.stringify({ display_text,
	    id,
	    ...options }) });
	    return this;
	    }
	addCall(display_text = '',
	    id = '',
	    options = {}) { this._buttons.push({ name: 'cta_call',
	    buttonParamsJson: JSON.stringify({ display_text,
	    id,
	    ...options }) });
	    return this;
	    }
	addReminder(display_text = '',
	    id = '',
	    options = {}) { this._buttons.push({ name: 'cta_reminder',
	    buttonParamsJson: JSON.stringify({ display_text,
	    id,
	    ...options }) });
	    return this;
	    }
	addCancelReminder(display_text = '',
	    id = '',
	    options = {}) { this._buttons.push({ name: 'cta_cancel_reminder',
	    buttonParamsJson: JSON.stringify({ display_text,
	    id,
	    ...options }) });
	    return this;
	    }
	addAddress(display_text = '',
	    id = '',
	    options = {}) { this._buttons.push({ name: 'address_message',
	    buttonParamsJson: JSON.stringify({ display_text,
	    id,
	    ...options }) });
	    return this;
	    }
	addLocation(options = {}) { this._buttons.push({ name: 'send_location', buttonParamsJson: JSON.stringify(options) }); return this; }
	addUrl(display_text = '', url = '', webview_interaction = false, options = {}) {
		this._buttons.push({ ...options, name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text, url, webview_interaction, ...options }) });
		return this;
	}
	addCopy(display_text = '',
	    copy_code = '',
	    options = {}) { this._buttons.push({ name: 'cta_copy',
	    buttonParamsJson: JSON.stringify({ display_text,
	    copy_code,
	    ...options }) });
	    return this;
	    }
	static paramsList = {
		limited_time_offer: { text: 'string', url: 'string', copy_code: 'string', expiration_time: 'number' },
		bottom_sheet: { in_thread_buttons_limit: 'number', divider_indices: ['number'], list_title: 'string', button_title: 'string' },
		tap_target_configuration: { title: 'string', description: 'string', canonical_url: 'string', domain: 'string', buttonIndex: 'number' }
	};
	async toCard() {
		let media = this._data ? await normalizeLocalMedia(this._data) : null;
		let preparedMedia = {};
		if (media) {
			try {
				preparedMedia = await prepareWAMessageMedia(media, { upload: this.#client.waUploadToServer, jid: '@newsletter' });
			} catch (error) {
				if (!String(error?.message || error).toLowerCase().includes('invalid media type')) throw error;
				preparedMedia = media;
			}
		}
		return {
			body: { text: this._body },
			footer: { text: this._footer },
			header: { title: this._title, subtitle: this._subtitle, hasMediaAttachment: !!media, ...(media ? preparedMedia : {}) },
			nativeFlowMessage: { messageParamsJson: JSON.stringify(this._params), buttons: this._buttons }
		};
	}
	async build(jid, { ...options } = {}) {
		const message = await this.toCard();
		return generateWAMessageFromContent(jid, { ...this._extraPayload, interactiveMessage: { ...message, contextInfo: this._contextInfo } }, { ...options });
	}
	async send(jid, { ...options } = {}) {
		try {
			const msg = await this.build(jid, options);
			await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
				messageId: msg.key.id,
				additionalNodes: [{ tag: 'biz',
				    attrs: {},
				    content: [{ tag: 'interactive',
				    attrs: { type: 'native_flow',
				    v: '1' },
				    content: [{ tag: 'native_flow',
				    attrs: { v: '9',
				    name: 'mixed' } }] }] }],
				...options
			});
			return msg;
		} finally {
			this.clearButtons();
			this._data = null;
			performSystemCleanup();
		}
	}
}

class ButtonV2 extends BaseBuilder {
	#client;
	constructor(client) {
		super();
		if (!client) throw new Error('Socket is required');
		this.#client = client;
		this._image = null;
		this._data = null;
		this._buttons = [];
	}
	addButton(displayText = '', buttonId = crypto.randomUUID()) { this._buttons.push({ buttonId, buttonText: { displayText }, type: 1 });
	    return this;
	    }
	addRawButton(obj) {
		if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Buttons must be a plain object');
		this._buttons.push(obj);
		return this;
	}
	setThumbnail(media) { if (!media) throw new Error('Url, local path or buffer needed'); this._image = media; return this; }
	setMedia(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Media must be a plain object');
	    this._data = obj;
	    return this;
	    }
	async build(jid, { ...options } = {}) {
		let thumbnailBuffer = null;
		if (this._image) {
			thumbnailBuffer = await Toolkit.fetchBuffer(this._image, {}, { silent: true });
			if (thumbnailBuffer.length) {
				try { thumbnailBuffer = await Toolkit.resize(thumbnailBuffer, 300, 300); } catch {}
			}
		}
		const mediaData = this._data ? await normalizeLocalMedia(this._data) : null;
		return generateWAMessageFromContent(jid, {
			...this._extraPayload,
			buttonsMessage: {
				contentText: this._body,
				footerText: this._footer,
				...(mediaData ? mediaData : { headerType: 6,
				    locationMessage: { degreesLatitude: 0,
				    degreesLongitude: 0,
				    name: this._title,
				    address: this._subtitle,
				    jpegThumbnail: thumbnailBuffer } }),
				viewOnce: true,
				contextInfo: this._contextInfo,
				buttons: [...this._buttons]
			}
		}, { ...options });
	}
	async send(jid, { ...options } = {}) {
		if (!this._buttons.length) throw new Error('ButtonV2 requires at least one button');
		try {
			const msg = await this.build(jid, options);
			await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
				messageId: msg.key.id,
				additionalNodes: [{ tag: 'biz',
				    attrs: {},
				    content: [{ tag: 'interactive',
				    attrs: { type: 'native_flow',
				    v: '1' },
				    content: [{ tag: 'native_flow',
				    attrs: { v: '9',
				    name: 'mixed' } }] }] }],
				...options
			});
			return msg;
		} finally {
			this._buttons = [];
			this._image = null;
			this._data = null;
			performSystemCleanup();
		}
	}
}

class Carousel extends BaseBuilder {
	#client;
	constructor(client) {
		super();
		if (!client) throw new Error('Socket is required');
		this.#client = client;
		this._cards = [];
	}
	async addCard(card) {
		const cards = Array.isArray(card) ? card : [card];
		const baseIndex = this._cards.length;
		for (const [index, c] of cards.entries()) {
			if (!c || typeof c !== 'object') throw new TypeError(`Card [${baseIndex + index}] must be an object`);
			const header = c.header || {};
			const hasMedia = header.hasMediaAttachment === true || !!header.imageMessage || !!header.videoMessage || !!header.documentMessage || !!c.image || !!c.video || !!c.media;
			if (!hasMedia) throw new Error(`Card [${baseIndex + index}] must include an image or video in header`);
		}
		const normalized = await Promise.all(cards.map(async (card) => {
			const item = await normalizeLocalMedia(card);
			if (item.image || item.video) {
				const media = item.image ? { image: item.image } : { video: item.video };
				let prepared = {};
				try { prepared = await prepareWAMessageMedia(media, { upload: this.#client.waUploadToServer }); } catch {}
				if (prepared && Object.keys(prepared).length) {
					item.header = { ...(item.header || {}), hasMediaAttachment: true, ...prepared };
				}
			}
			return item;
		}));
		this._cards.push(...normalized);
		return this;
	}
	async build(jid, { ...options } = {}) {
		return generateWAMessageFromContent(jid, {
			...this._extraPayload,
			interactiveMessage: {
				header: { hasMediaAttachment: false },
				body: { text: this._body },
				footer: { text: this._footer },
				contextInfo: this._contextInfo,
				carouselMessage: { cards: this._cards }
			}
		}, { ...options });
	}
	async send(jid, { ...options } = {}) {
		try {
			const msg = await this.build(jid, options);
			await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
				messageId: msg.key.id,
				additionalNodes: [{ tag: 'biz',
				    attrs: {},
				    content: [{ tag: 'interactive',
				    attrs: { type: 'native_flow',
				    v: '1' },
				    content: [{ tag: 'native_flow',
				    attrs: { v: '9',
				    name: 'mixed' } }] }] }],
				...options
			});
			return msg;
		} finally {
			this._cards = [];
			performSystemCleanup();
		}
	}
}

class AIRich extends BaseBuilder {
	#client;
	constructor(client) {
		super();
		if (!client) throw new Error('Socket is required');
		this.#client = client;
		this._contextInfo = {};
		this._submessages = [];
		this._sections = [];
		this._richResponseSources = [];
	}
	addSubmessage(submessage) {
		const items = Array.isArray(submessage) ? submessage : [submessage];
		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new TypeError('Submessage must be a plain object or array of plain objects');
			this._submessages.push(item);
		}
		return this;
	}
	addSection(section) {
		const items = Array.isArray(section) ? section : [section];
		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new TypeError('Section must be a plain object or array of plain objects');
			this._sections.push(item);
		}
		return this;
	}
	addText(text, { hyperlink = true, citation = true, latex = true } = {}) {
		if (typeof text !== 'string') throw new TypeError('Text must be a string');
		const { text: extractedText, inline_entities } = extractIE(text, { hyperlink, citation, latex });
		this._submessages.push({ messageType: 2, messageText: extractedText });
		this._sections.push(AIRich.newLayout('Single',
		    { text: extractedText,
		    ...(inline_entities.length ? { inline_entities } : {}),
		    __typename: 'GenAIMarkdownTextUXPrimitive' }));
		return this;
	}
	addCode(language, code) {
		if (typeof language !== 'string' || typeof code !== 'string') throw new TypeError('Language and code must be a string');
		const meta = AIRich.tokenizer(code, language);
		this._submessages.push({ messageType: 5, codeMetadata: { codeLanguage: language, codeBlocks: meta.codeBlock } });
		this._sections.push(AIRich.newLayout('Single', { language, code_blocks: meta.unified_codeBlock, __typename: 'GenAICodeUXPrimitive' }));
		return this;
	}
	addTable(table, { hyperlink = true, citation = true, latex = true } = {}) {
		if (!Array.isArray(table)) throw new TypeError('Table must be an array');
		const meta = AIRich.toTableMetadata(table, { hyperlink, citation, latex });
		this._submessages.push({ messageType: 4, tableMetadata: { title: meta.title, rows: meta.rows } });
		this._sections.push(AIRich.newLayout('Single', { rows: meta.unified_rows, __typename: 'GenATableUXPrimitive' }));
		return this;
	}
	async addSource(sources = []) {
		if (!(Array.isArray(sources) && (sources.every(item => typeof item === 'string') || sources.every(item => Array.isArray(item) && item.every(v => typeof v === 'string'))))) {
			throw new TypeError('Sources must be a string array or an array of string arrays');
		}
		if (sources.every(item => typeof item === 'string')) sources = [sources];
		const source = [];
		for (const item of sources) {
			const [icon, url, text] = item;
			let favicon = '';
			if (icon) favicon = await Toolkit.resolveMedia(this.#client, icon, 'image', { result: 'url' });
			source.push({ source_type: 'THIRD_PARTY',
			    source_display_name: text ?? '',
			    source_subtitle: 'AI',
			    source_url: url ?? '',
			    favicon: { url: favicon,
			    mime_type: 'image/jpeg',
			    width: 16,
			    height: 16 } });
		}
		this._sections.push(AIRich.newLayout('Single', { sources: source, __typename: 'GenAISearchResultPrimitive' }));
		return this;
	}
	async addReels(reelsItems = []) {
		if (!((reelsItems && typeof reelsItems === 'object' && !Array.isArray(reelsItems)) || (Array.isArray(reelsItems) && reelsItems.every(item => item && typeof item === 'object' && !Array.isArray(item))))) {
			throw new TypeError('Reels items must be an object or an array of objects');
		}
		if (!Array.isArray(reelsItems)) reelsItems = [reelsItems];
		const reels = [];
		for (const item of reelsItems) {
			const avatar = await Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? '', 'image', { result: 'url' });
			const thumbnail = await Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? '', 'image', { result: 'url' });
			reels.push({ ...item, _avatar: avatar, _thumbnail: thumbnail });
		}
		this._submessages.push({
			messageType: 9,
			contentItemsMetadata: {
				contentType: 1,
				itemsMetadata: reels.map(item => ({ reelItem: { title: item.username ?? '',
				    profileIconUrl: item._avatar,
				    thumbnailUrl: item._thumbnail,
				    videoUrl: item.videoUrl ?? item.url ?? '' } }))
			}
		});
		reels.forEach((item, idx) => {
			this._richResponseSources.push({ provider: 'NIXEL',
			    thumbnailCDNURL: item._thumbnail,
			    sourceProviderURL: item.videoUrl ?? item.url ?? '',
			    sourceQuery: '',
			    faviconCDNURL: item._avatar,
			    citationNumber: idx + 1,
			    sourceTitle: item.username ?? '' });
		});
		this._sections.push(AIRich.newLayout('HScroll', reels.map(item => ({
			reels_url: item.videoUrl ?? item.url ?? '',
			    thumbnail_url: item._thumbnail,
			    creator: item.username ?? item.title ?? '',
			    avatar_url: item._avatar,
			    reels_title: item.reels_title ?? item.title ?? '',
			    likes_count: item.likes_count ?? item.like ?? 0,
			    shares_count: item.shares_count ?? item.share ?? 0,
			    view_count: item.view_count ?? item.view ?? 0,
			    reel_source: item.reel_source ?? item.source ?? 'IG',
			    is_verified: !!(item.is_verified || item.verified),
			    __typename: 'GenAIReelPrimitive'
		}))));
		return this;
	}
	async addImage(imageUrl, { resolveUrl = false } = {}) {
		const valid = typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) || (Array.isArray(imageUrl) && imageUrl.every(v => typeof v === 'string' || Buffer.isBuffer(v)));
		if (!valid) throw new TypeError('imageUrl must be string | buffer | array of string/buffer');
		const items = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
		const list = [];
		for (const item of items) {
			const url = await Toolkit.resolveMedia(this.#client, item, 'image', { resolveUrl, result: 'url' });
			list.push({ imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url });
		}
		this._submessages.push({ messageType: 1, gridImageMetadata: { gridImageUrl: { imagePreviewUrl: list[0]?.imagePreviewUrl }, imageUrls: list } });
		list.forEach(({ imagePreviewUrl }) => {
			this._sections.push(AIRich.newLayout('Single',
			    { media: { url: imagePreviewUrl,
			    mime_type: 'image/png' },
			    imagine_type: 'IMAGE',
			    status: { status: 'READY' },
			    __typename: 'GenAIImaginePrimitive' }));
		});
		return this;
	}
	async addVideo(videoUrl, { autoFill = true } = {}) {
		const isObjectVideo = v => v && typeof v === 'object' && v.url;
		const valid = typeof videoUrl === 'string' || Buffer.isBuffer(videoUrl) || isObjectVideo(videoUrl) || (Array.isArray(videoUrl) && videoUrl.every(v => typeof v === 'string' || Buffer.isBuffer(v) || isObjectVideo(v)));
		if (!valid) throw new TypeError('videoUrl must be string | buffer | object | array');
		const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl];
		this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_VIDEO - NIXEL ]' });
		for (const item of items) {
			const isObject = isObjectVideo(item);
			const source = isObject ? item.url : item;
			const url = await Toolkit.resolveMedia(this.#client, source, 'video', { result: 'url' });
			let bufferPromise = autoFill ? Toolkit.fetchBuffer(url, {}, { silent: true }) : null;
			let file_length = isObject && item.file_length != null ? item.file_length : 0;
			let duration = isObject && item.duration != null ? item.duration : 0;
			let thumbnail = isObject && item.thumbnail ? await Toolkit.resolveMedia(this.#client,
			    item.thumbnail,
			    'image',
			    { result: 'base64',
			    resize: true,
			    width: 300,
			    height: 300 }) : '';
			if (autoFill && bufferPromise) {
				const buffer = await bufferPromise;
				if (!file_length) file_length = buffer?.length || 0;
				if (!duration) duration = Toolkit.getMp4Duration(buffer, { silent: true });
				if (!thumbnail && buffer?.length) {
					thumbnail = await Toolkit.getMp4Preview(buffer, { time: 0, result: 'base64', resize: true, width: 300, height: 300, silent: true });
				}
			}
			this._sections.push(AIRich.newLayout('Single', {
				media: { url, mime_type: isObject ? (item.mime_type ?? 'video/mp4') : 'video/mp4', file_length, duration },
				imagine_type: 'ANIMATE',
				status: { status: 'READY' },
				thumbnail: { raw_media: thumbnail },
				__typename: 'GenAIImaginePrimitive'
			}));
		}
		return this;
	}
	async addProduct(data = {}) {
		const valid = (data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item)));
		if (!valid) throw new TypeError('Product items must be an object or an array of objects');
		const items = Array.isArray(data) ? data : [data];
		this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_PRODUCT - NIXEL ]' });
		const product = [];
		for (const item of items) {
			const image = await Toolkit.resolveMedia(this.#client, item.image_url ?? item.image ?? '', 'image', { result: 'url' });
			const icon = await Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon ?? '', 'image', { result: 'url' });
			product.push({
				title: item.title, brand: item.brand, price: item.price, sale_price: item.sale_price, product_url: item.product_url ?? item.url,
				image: { url: image }, additional_images: [{ url: icon }], __typename: 'GenAIProductItemCardPrimitive'
			});
		}
		this._sections.push(AIRich.newLayout(Array.isArray(data) ? 'HScroll' : 'Single', Array.isArray(data) ? product : product[0]));
		return this;
	}
	async addPost(data = {}) {
		const valid = (data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item)));
		if (!valid) throw new TypeError('Post items must be an object or an array of objects');
		const posts = Array.isArray(data) ? data : [data];
		this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_POST - NIXEL ]' });
		const primitives = [];
		for (const p of posts) {
			const profile = await Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? '', 'image', { result: 'url' });
			const thumbnail = await Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? '', 'image', { result: 'url' });
			const footerIcon = await Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? '', 'image', { result: 'url' });
			primitives.push({
				title: p.title ?? '', subtitle: p.subtitle ?? '', username: p.username ?? '', profile_picture_url: profile, is_verified: !!(p.is_verified || p.verified),
				thumbnail_url: thumbnail,
				    post_caption: p.post_caption ?? p.caption ?? '',
				    likes_count: p.likes_count ?? p.like ?? 0,
				    comments_count: p.comments_count ?? p.comment ?? 0,
				shares_count: p.shares_count ?? p.share ?? 0, post_url: p.post_url ?? p.url ?? '', post_deeplink: p.post_deeplink ?? p.deeplink ?? '',
				source_app: p.source_app || p.source || 'INSTAGRAM', footer_label: p.footer_label ?? p.footer ?? '', footer_icon: footerIcon,
				is_carousel: posts.length > 1, orientation: p.orientation ?? 'LANDSCAPE', post_type: p.post_type ?? 'VIDEO', __typename: 'GenAIPostPrimitive'
			});
		}
		this._sections.push(AIRich.newLayout('HScroll', primitives));
		return this;
	}
	addTip(text) {
		this._submessages.push({ messageType: 2, messageText: text });
		this._sections.push(AIRich.newLayout('Single', { text, __typename: 'GenAIMetadataTextPrimitive' }));
		return this;
	}
	addSuggest(suggestion, { scroll = true, layout } = {}) {
		if (!(typeof suggestion === 'string' || (Array.isArray(suggestion) && suggestion.every(v => typeof v === 'string')))) {
			throw new TypeError('Suggestion must be a string or array of strings');
		}
		const suggest = Array.isArray(suggestion) ? suggestion.map(text => ({ prompt_text: text,
		    prompt_type: 'SUGGESTED_PROMPT',
		    __typename: 'GenAIFollowUpSuggestionPillPrimitive' })) : [{ prompt_text: suggestion,
		    prompt_type: 'SUGGESTED_PROMPT',
		    __typename: 'GenAIFollowUpSuggestionPillPrimitive' }];
		const type = layout ?? (suggest.length === 1 ? 'Single' : scroll ? 'HScroll' : 'ActionRow');
		this._sections.push(AIRich.newLayout(type, type === 'Single' ? suggest[0] : suggest, { __typename: 'GenAIUnifiedResponseSection' }));
		return this;
	}
	async build({ forwarded = true,
	    notification = false,
	    includesUnifiedResponse = true,
	    includesSubmessages = true,
	    quoted,
	    quotedParticipant,
	    ...options } = {}) {
		try {
			const forward = forwarded ? { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '0@bot' }, forwardOrigin: 4 } : {};
			const notif = notification ? { sessionTransparencyMetadata: { disclaimerText: '~ Ahmad tumbuh kembang',
			    hcaId: `hca_${Date.now()}`,
			    sessionTransparencyType: 1 } } : {};
			const qObj = quoted ? { stanzaId: quoted?.key?.id ?? quoted?.id,
			    participant: quotedParticipant ?? quoted?.key?.participant ?? quoted?.key?.remoteJid,
			    quotedType: 0,
			    quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined } : {};
			const sections = this._footer ? [...(await waitAllPromises(this._sections)),
			    AIRich.newLayout('Single',
			    { text: this._footer,
			    __typename: 'GenAIMetadataTextPrimitive' })] : [...(await waitAllPromises(this._sections))];
			return {
				messageContextInfo: { deviceListMetadata: {},
				    deviceListMetadataVersion: 2,
				    botMetadata: { messageDisclaimerText: this._title,
				    richResponseSourcesMetadata: { sources: this._richResponseSources },
				    ...notif } },
				...this._extraPayload,
				botForwardedMessage: {
					message: {
						richResponseMessage: {
							messageType: 1,
							submessages: includesSubmessages ? await waitAllPromises(this._submessages) : [],
							unifiedResponse: includesUnifiedResponse ? { data: Buffer.from(JSON.stringify({ response_id: crypto.randomUUID(),
							    sections })).toString('base64') } : { data: '' },
							contextInfo: { ...forward, ...qObj, ...this._contextInfo }
						}
					}
				}
			};
		} finally {
			performSystemCleanup();
		}
	}
	async send(jid, { forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options } = {}) {
		try {
			const msg = await this.build({ forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options });
			return await this.#client.relayMessage(jid, msg, { ...options });
		} finally {
			this._submessages = [];
			this._sections = [];
			this._richResponseSources = [];
			performSystemCleanup();
		}
	}
	static tokenizer(code, lang = 'javascript') {
		const keywordsMap = {
			javascript: new Set(['break',
			    'case',
			    'catch',
			    'continue',
			    'debugger',
			    'delete',
			    'do',
			    'else',
			    'finally',
			    'for',
			    'function',
			    'if',
			    'in',
			    'instanceof',
			    'new',
			    'return',
			    'switch',
			    'this',
			    'throw',
			    'try',
			    'typeof',
			    'var',
			    'void',
			    'while',
			    'with',
			    'true',
			    'false',
			    'null',
			    'undefined',
			    'class',
			    'const',
			    'let',
			    'super',
			    'extends',
			    'export',
			    'import',
			    'yield',
			    'static',
			    'constructor',
			    'async',
			    'await',
			    'get',
			    'set']),
			typescript: new Set(['abstract',
			    'any',
			    'as',
			    'asserts',
			    'bigint',
			    'boolean',
			    'declare',
			    'enum',
			    'implements',
			    'infer',
			    'interface',
			    'is',
			    'keyof',
			    'module',
			    'namespace',
			    'never',
			    'readonly',
			    'require',
			    'number',
			    'object',
			    'override',
			    'private',
			    'protected',
			    'public',
			    'satisfies',
			    'string',
			    'symbol',
			    'type',
			    'unknown',
			    'using',
			    'from',
			    'break',
			    'case',
			    'catch',
			    'continue',
			    'do',
			    'else',
			    'finally',
			    'for',
			    'function',
			    'if',
			    'new',
			    'return',
			    'switch',
			    'this',
			    'throw',
			    'try',
			    'var',
			    'void',
			    'while',
			    'class',
			    'const',
			    'let',
			    'extends',
			    'import',
			    'export',
			    'async',
			    'await']),
			python: new Set(['False',
			    'None',
			    'True',
			    'and',
			    'as',
			    'assert',
			    'async',
			    'await',
			    'break',
			    'class',
			    'continue',
			    'def',
			    'del',
			    'elif',
			    'else',
			    'except',
			    'finally',
			    'for',
			    'from',
			    'global',
			    'if',
			    'import',
			    'in',
			    'is',
			    'lambda',
			    'nonlocal',
			    'not',
			    'or',
			    'pass',
			    'raise',
			    'return',
			    'try',
			    'while',
			    'with',
			    'yield']),
			java: new Set(['abstract',
			    'assert',
			    'boolean',
			    'break',
			    'byte',
			    'case',
			    'catch',
			    'char',
			    'class',
			    'const',
			    'continue',
			    'default',
			    'do',
			    'double',
			    'else',
			    'enum',
			    'extends',
			    'final',
			    'finally',
			    'float',
			    'for',
			    'goto',
			    'if',
			    'implements',
			    'import',
			    'instanceof',
			    'int',
			    'interface',
			    'long',
			    'native',
			    'new',
			    'package',
			    'private',
			    'protected',
			    'public',
			    'return',
			    'short',
			    'static',
			    'strictfp',
			    'super',
			    'switch',
			    'synchronized',
			    'this',
			    'throw',
			    'throws',
			    'transient',
			    'try',
			    'void',
			    'volatile',
			    'while']),
			golang: new Set(['break',
			    'case',
			    'chan',
			    'const',
			    'continue',
			    'default',
			    'defer',
			    'else',
			    'fallthrough',
			    'for',
			    'func',
			    'go',
			    'goto',
			    'if',
			    'import',
			    'interface',
			    'map',
			    'package',
			    'range',
			    'return',
			    'select',
			    'struct',
			    'switch',
			    'type',
			    'var']),
			c: new Set(['auto',
			    'break',
			    'case',
			    'char',
			    'const',
			    'continue',
			    'default',
			    'do',
			    'double',
			    'else',
			    'enum',
			    'extern',
			    'float',
			    'for',
			    'goto',
			    'if',
			    'int',
			    'long',
			    'register',
			    'return',
			    'short',
			    'signed',
			    'sizeof',
			    'static',
			    'struct',
			    'switch',
			    'typedef',
			    'union',
			    'unsigned',
			    'void',
			    'volatile',
			    'while']),
			cpp: new Set(['alignas',
			    'alignof',
			    'and',
			    'auto',
			    'bool',
			    'break',
			    'case',
			    'catch',
			    'class',
			    'const',
			    'constexpr',
			    'continue',
			    'delete',
			    'do',
			    'double',
			    'else',
			    'enum',
			    'explicit',
			    'export',
			    'extern',
			    'false',
			    'float',
			    'for',
			    'friend',
			    'if',
			    'inline',
			    'int',
			    'long',
			    'mutable',
			    'namespace',
			    'new',
			    'noexcept',
			    'nullptr',
			    'operator',
			    'private',
			    'protected',
			    'public',
			    'return',
			    'short',
			    'signed',
			    'sizeof',
			    'static',
			    'struct',
			    'switch',
			    'template',
			    'this',
			    'throw',
			    'true',
			    'try',
			    'typedef',
			    'typename',
			    'union',
			    'unsigned',
			    'using',
			    'virtual',
			    'void',
			    'while']),
			php: new Set(['abstract',
			    'and',
			    'array',
			    'as',
			    'break',
			    'callable',
			    'case',
			    'catch',
			    'class',
			    'clone',
			    'const',
			    'continue',
			    'declare',
			    'default',
			    'do',
			    'echo',
			    'else',
			    'elseif',
			    'empty',
			    'enddeclare',
			    'endfor',
			    'endforeach',
			    'endif',
			    'endswitch',
			    'endwhile',
			    'extends',
			    'final',
			    'finally',
			    'fn',
			    'for',
			    'foreach',
			    'function',
			    'global',
			    'goto',
			    'if',
			    'implements',
			    'include',
			    'include_once',
			    'instanceof',
			    'interface',
			    'match',
			    'namespace',
			    'new',
			    'null',
			    'or',
			    'private',
			    'protected',
			    'public',
			    'require',
			    'require_once',
			    'return',
			    'static',
			    'switch',
			    'throw',
			    'trait',
			    'try',
			    'use',
			    'var',
			    'while',
			    'yield']),
			rust: new Set(['as',
			    'break',
			    'const',
			    'continue',
			    'crate',
			    'else',
			    'enum',
			    'extern',
			    'false',
			    'fn',
			    'for',
			    'if',
			    'impl',
			    'in',
			    'let',
			    'loop',
			    'match',
			    'mod',
			    'move',
			    'mut',
			    'pub',
			    'ref',
			    'return',
			    'self',
			    'Self',
			    'static',
			    'struct',
			    'super',
			    'trait',
			    'true',
			    'type',
			    'unsafe',
			    'use',
			    'where',
			    'while']),
			html: new Set(['html',
			    'head',
			    'body',
			    'div',
			    'span',
			    'p',
			    'a',
			    'img',
			    'video',
			    'audio',
			    'script',
			    'style',
			    'link',
			    'meta',
			    'form',
			    'input',
			    'button',
			    'table',
			    'tr',
			    'td',
			    'th',
			    'ul',
			    'ol',
			    'li',
			    'section',
			    'article',
			    'header',
			    'footer',
			    'nav',
			    'main']),
			bash: new Set(['if',
			    'then',
			    'else',
			    'elif',
			    'fi',
			    'for',
			    'while',
			    'do',
			    'done',
			    'case',
			    'esac',
			    'function',
			    'in',
			    'select',
			    'until',
			    'break',
			    'continue',
			    'return',
			    'export',
			    'readonly',
			    'local',
			    'declare']),
			markdown: new Set(['#','##','###','####','#####','######'])
		};
		if (!lang || lang === 'txt' || lang === 'text' || lang === 'plaintext') {
			return { codeBlock: [{ codeContent: code, highlightType: 0 }], unified_codeBlock: [{ content: code, type: 'DEFAULT' }] };
		}
		const TYPE_MAP = { 0: 'DEFAULT', 1: 'KEYWORD', 2: 'METHOD', 3: 'STR', 4: 'NUMBER', 5: 'COMMENT' };
		const keywords = keywordsMap[String(lang).toLowerCase()] || new Set();
		const tokens = [];
		let i = 0;
		const push = (content, type) => {
			if (!content) return;
			const last = tokens[tokens.length - 1];
			if (last && last.highlightType === type) last.codeContent += content;
			else tokens.push({ codeContent: content, highlightType: type });
		};
		const isIdentifier = (char) => {
			switch (String(lang).toLowerCase()) {
				case 'css': return /[a-zA-Z0-9_$-]/.test(char);
				case 'html': return /[a-zA-Z0-9_$:-]/.test(char);
				default: return /[a-zA-Z0-9_$]/.test(char);
			}
		};
		while (i < code.length) {
			const c = code[i];
			if (/\s/.test(c)) {
				let s = i;
				while (i < code.length && /\s/.test(code[i])) i++;
				push(code.slice(s, i), 0);
				continue;
			}
			if ((c === '/' && code[i + 1] === '/') || (c === '#' && ['python', 'bash'].includes(String(lang).toLowerCase()))) {
				let s = i;
				while (i < code.length && code[i] !== '\n') i++;
				push(code.slice(s, i), 5);
				continue;
			}
			if (c === '"' || c === "'" || c === '`') {
				let s = i, q = c;
				i++;
				while (i < code.length) {
					if (code[i] === '\\' && i + 1 < code.length) i += 2;
					else if (code[i] === q) { i++; break; }
					else i++;
				}
				push(code.slice(s, i), 3);
				continue;
			}
			if (/[0-9]/.test(c)) {
				let s = i;
				while (i < code.length && /[0-9._]/.test(code[i])) i++;
				push(code.slice(s, i), 4);
				continue;
			}
			if (/[a-zA-Z_$]/.test(c)) {
				let s = i;
				while (i < code.length && isIdentifier(code[i])) i++;
				const word = code.slice(s, i);
				let type = 0;
				if (keywords.has(word)) {
					type = 1;
				} else if (String(lang).toLowerCase() === 'css') {
					let j = i;
					while (j < code.length && /\s/.test(code[j])) j++;
					if (code[j] === ':') type = 1;
				} else if (String(lang).toLowerCase() === 'html') {
					let p = s - 1;
					while (p >= 0 && /\s/.test(code[p])) p--;
					if (code[p] === '<' || (code[p] === '/' && code[p - 1] === '<')) type = 1;
				}
				if (type === 0) {
					let j = i;
					while (j < code.length && /\s/.test(code[j])) j++;
					if (code[j] === '(') type = 2;
				}
				push(word, type);
				continue;
			}
			push(c, 0);
			i++;
		}
		return { codeBlock: tokens, unified_codeBlock: tokens.map(t => ({ content: t.codeContent, type: TYPE_MAP[t.highlightType] })) };
	}
	static toTableMetadata(arr, { hyperlink = true, citation = true, latex = true } = {}) {
		if (!Array.isArray(arr) || !arr.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))) {
			throw new TypeError('Table must be a nested array of strings');
		}
		const [header, ...rows] = arr;
		const maxLen = Math.max(header?.length || 0, ...rows.map(r => r.length));
		const normalize = r => [...r, ...Array(Math.max(0, maxLen - r.length)).fill('')];
		const unified_rows = [{ is_header: true, cells: normalize(header || []) }, ...rows.map(r => ({ is_header: false, cells: normalize(r) }))].map((row) => {
			const markdown_cells = row.cells.map((cell) => {
				const extracted = extractIE(cell, { hyperlink, citation, latex });
				return { text: extracted.text, ...(extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {}) };
			});
			return { ...row, ...(markdown_cells.some(c => c.inline_entities?.length) ? { markdown_cells } : {}) };
		});
		const rowsMeta = unified_rows.map(r => ({ items: r.cells, ...(r.is_header ? { isHeading: true } : {}) }));
		return { title: '', rows: rowsMeta, unified_rows };
	}
	static newLayout(name, data, extra = {}) {
		return { ...extra, view_model: { [Array.isArray(data) ? 'primitives' : 'primitive']: data, __typename: `GenAI${name}LayoutViewModel` } };
	}
}

export { VERSION, Button, ButtonV2, Carousel, AIRich, Toolkit };
