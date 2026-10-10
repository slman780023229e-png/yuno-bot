import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../data");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}

class Database {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.CACHE_DURATION = 60 * 1000; // دقيقة واحدة صلاحية للكاش
        this.MAX_CACHE_ITEMS = 100; // الحد الأقصى للعناصر في الذاكرة لمنع امتلاءها نهائياً
    }

    // تنظيف تلقائي للعناصر القديمة في الكاش
    _cleanupCache() {
        if (this.cache.size <= this.MAX_CACHE_ITEMS) return;
        
        // إزالة أقدم عنصر تم تخزينه (FIFO)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
            this.cache.delete(oldestKey);
            this.cacheTimestamps.delete(oldestKey);
        }
    }

    read(filename, defaultData = []) {
        const filePath = path.join(dbPath, filename);
        const now = Date.now();

        // التحقق من صلاحية الكاش
        if (this.cache.has(filename) && (now - this.cacheTimestamps.get(filename) < this.CACHE_DURATION)) {
            return this.cache.get(filename);
        }

        try {
            if (!fs.existsSync(filePath)) {
                this.write(filename, defaultData);
                return defaultData;
            }

            const data = fs.readFileSync(filePath, "utf-8");
            if (!data.trim()) {
                this.write(filename, defaultData);
                return defaultData;
            }

            const parsed = JSON.parse(data);
            
            // تنظيف الذاكرة قبل إضافة عنصر جديد إذا وصلت للحد الأقصى
            this._cleanupCache();

            // تحديث الكاش والوقت الحالي
            this.cache.set(filename, parsed);
            this.cacheTimestamps.set(filename, now);
            
            return parsed;
        } catch (error) {
            console.error(`❌ [Database Error] Failed to read ${filename}:`, error.message);
            return defaultData;
        }
    }

    write(filename, data) {
        const filePath = path.join(dbPath, filename);
        
        try {
            this._cleanupCache();

            // تحديث الكاش أولاً
            this.cache.set(filename, data);
            this.cacheTimestamps.set(filename, Date.now());
            
            const tempPath = `${filePath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            fs.renameSync(tempPath, filePath);
            
            return true;
        } catch (error) {
            console.error(`❌ [Database Error] Failed to write ${filename}:`, error.message);
            return false;
        }
    }

    update(filename, updaterFunc, defaultData = []) {
        let currentData = this.read(filename, defaultData);
        if (typeof updaterFunc === "function") {
            currentData = updaterFunc(currentData);
        }
        return this.write(filename, currentData);
    }

    clearCache() {
        this.cache.clear();
        this.cacheTimestamps.clear();
    }
}

export default new Database();
