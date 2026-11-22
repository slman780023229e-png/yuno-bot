import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

const DB_NAME = 'whatsapp_bot';
const COLLECTION_NAME = 'auth_sessions';
const MASTER_SUFFIX = '-MASTER-SNAPSHOT';
const MAX_SNAPSHOT_BYTES = 15 * 1024 * 1024;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureMongoConnection(mongoUrl) {
  const state = mongoose.connection.readyState;
  if (state === 0 || state === 3) {
    await mongoose.connect(mongoUrl, { dbName: DB_NAME });
  } else if (state === 2) {
    await mongoose.connection.asPromise();
  } else if (state === 1) {
    await mongoose.connection.asPromise();
  }
}

export async function useMongoDBAuthState(mongoUrl, sessionId = 'arthur-session') {
  if (!mongoUrl || !mongoUrl.trim()) {
    throw new Error('MONGO_URI is missing.');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('MONGO_SESSION_ID must be a non-empty string.');
  }

  await ensureMongoConnection(mongoUrl);

  const db = mongoose.connection.useDb(DB_NAME, { useCache: true }).db;
  if (!db) throw new Error('MongoDB database is not available.');

  const collection = db.collection(COLLECTION_NAME);
  const legacyPrefix = `${sessionId}-`;
  const masterId = `${sessionId}${MASTER_SUFFIX}`;
  const activePrefix = `${sessionId}-ACTIVE-${randomUUID()}-`;
  const memoryCache = new Map();
  let writeQueue = Promise.resolve();
  let lastWriteError = null;
  let masterWasLoaded = false;

  // Each write is serialized. The returned promise still rejects for its caller,
  // while the queue is recovered so one failed write does not block all later writes.
  function queueWrite(task) {
    const operation = writeQueue.then(async () => {
      try {
        return await task();
      } catch (error) {
        lastWriteError = error;
        throw error;
      }
    });
    writeQueue = operation.catch(error => {
      console.error('❌ MongoDB auth write failed:', error?.stack || error?.message || error);
    });
    return operation;
  }

  function serialize(value) {
    return JSON.stringify(value, BufferJSON.replacer);
  }

  function deserialize(value) {
    return JSON.parse(value, BufferJSON.reviver);
  }

  async function persistCurrentCache() {
    if (memoryCache.size === 0) return;
    const operations = [];
    for (const [key, value] of memoryCache.entries()) {
      operations.push({
        updateOne: {
          filter: { _id: `${activePrefix}${key}` },
          update: { $set: { value: serialize(value), updatedAt: new Date() } },
          upsert: true
        }
      });
    }
    await queueWrite(() => collection.bulkWrite(operations, { ordered: true }));
  }

  // The immutable master is stored as ONE MongoDB document. Its creation is
  // atomic, and $setOnInsert guarantees that later boots never overwrite it.
  const masterDoc = await collection.findOne({ _id: masterId });
  if (masterDoc?.value) {
    const snapshot = deserialize(masterDoc.value);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('The immutable MongoDB master snapshot has an invalid format.');
    }
    for (const [key, value] of Object.entries(snapshot)) {
      memoryCache.set(key, value);
    }
    masterWasLoaded = true;
    await persistCurrentCache();
    console.log(`🔒 MASTER snapshot restored: ${memoryCache.size} auth records`);
  } else {
    // Backward compatibility: import the existing legacy session once.
    const escapedPrefix = escapeRegex(legacyPrefix);
    const legacyDocs = await collection.find({
      _id: { $regex: `^${escapedPrefix}`, $ne: masterId }
    }).toArray();

    for (const doc of legacyDocs) {
      // Never import old ACTIVE copies as a legacy session.
      if (doc._id.startsWith(`${sessionId}-ACTIVE-`)) continue;
      const key = doc._id.slice(legacyPrefix.length);
      if (!key || typeof doc.value !== 'string') continue;
      try {
        memoryCache.set(key, deserialize(doc.value));
      } catch (error) {
        console.error(`⚠️ Could not parse Mongo auth record ${doc._id}:`, error?.message || error);
      }
    }

    console.log(`🍃 Legacy MongoDB auth loaded: ${memoryCache.size} records`);
    if (memoryCache.size > 0) await persistCurrentCache();
  }

  function readData(id) {
    return memoryCache.has(id) ? memoryCache.get(id) : null;
  }

  async function writeData(data, id) {
    const serialized = serialize(data);
    memoryCache.set(id, data);
    await queueWrite(() => collection.updateOne(
      { _id: `${activePrefix}${id}` },
      { $set: { value: serialized, updatedAt: new Date() } },
      { upsert: true }
    ));
  }

  const creds = readData('creds') || initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      const result = {};
      for (const id of ids) {
        const value = readData(`${type}-${id}`);
        if (value !== null && value !== undefined) result[id] = value;
      }
      return result;
    },

    set: async data => {
      const operations = [];
      const changes = [];

      for (const [category, categoryData] of Object.entries(data || {})) {
        if (!categoryData || typeof categoryData !== 'object') continue;
        for (const [id, value] of Object.entries(categoryData)) {
          const key = `${category}-${id}`;
          if (value !== null && value !== undefined) {
            changes.push([key, value]);
            operations.push({
              updateOne: {
                filter: { _id: `${activePrefix}${key}` },
                update: { $set: { value: serialize(value), updatedAt: new Date() } },
                upsert: true
              }
            });
          } else {
            changes.push([key, null]);
            operations.push({ deleteOne: { filter: { _id: `${activePrefix}${key}` } } });
          }
        }
      }

      if (operations.length === 0) return;

      // Update cache in the same serialized operation as the database write.
      await queueWrite(async () => {
        await collection.bulkWrite(operations, { ordered: true });
        for (const [key, value] of changes) {
          if (value === null) memoryCache.delete(key);
          else memoryCache.set(key, value);
        }
      });
    }
  };

  const saveCreds = async () => {
    try {
      await writeData(creds, 'creds');
    } catch (error) {
      console.error('❌ Credentials persistence failed:', error?.stack || error?.message || error);
      throw error;
    }
  };

  async function flush() {
    await writeQueue;
    if (lastWriteError) throw lastWriteError;
  }

  async function createMasterSnapshot() {
    await flush();
    if (masterWasLoaded) {
      return { created: false, records: memoryCache.size, reason: 'master-already-exists' };
    }
    if (!creds.registered) {
      return { created: false, records: memoryCache.size, reason: 'credentials-not-registered' };
    }

    const snapshot = Object.fromEntries(memoryCache.entries());
    const serialized = serialize(snapshot);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Master snapshot is too large (${bytes} bytes); MongoDB document limit safety check stopped creation.`);
    }

    await queueWrite(() => collection.updateOne(
      { _id: masterId },
      { $setOnInsert: { value: serialized, createdAt: new Date(), recordCount: memoryCache.size } },
      { upsert: true }
    ));

    const confirmed = await collection.findOne({ _id: masterId }, { projection: { recordCount: 1 } });
    masterWasLoaded = true;
    const created = !masterDoc;
    console.log(created
      ? `🔐 Immutable MASTER snapshot created (${memoryCache.size} records).`
      : '🔒 Existing MASTER snapshot preserved; it was not overwritten.');
    return { created, records: confirmed?.recordCount ?? memoryCache.size };
  }

  return {
    state: { creds, keys },
    saveCreds,
    flush,
    createMasterSnapshot,
    getSessionInfo: () => ({
      activePrefix,
      masterId,
      masterWasLoaded,
      records: memoryCache.size
    })
  };
}
