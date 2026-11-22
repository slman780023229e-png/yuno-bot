import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

const DB_NAME = 'whatsapp_bot';
const COLLECTION_NAME = 'auth_sessions';
const LEGACY_MASTER_SUFFIX = '-MASTER-SNAPSHOT';
const MAX_SNAPSHOT_BYTES = 15 * 1024 * 1024;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureMongoConnection(mongoUrl) {
  const state = mongoose.connection.readyState;
  if (state === 0 || state === 3) {
    await mongoose.connect(mongoUrl, { dbName: DB_NAME });
  } else {
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
  const metaId = `${sessionId}-AUTH-META`;
  const legacyPrefix = `${sessionId}-`;
  const legacyMasterId = `${sessionId}${LEGACY_MASTER_SUFFIX}`;
  const repairPrefix = `${sessionId}-REPAIR-ACTIVE-`;
  const meta = await collection.findOne({ _id: metaId });

  // During a repair, keep one stable working namespace so an interrupted
  // pairing can resume without ever loading the revoked master credentials.
  const repairMode = meta?.repairRequired === true;
  const activePrefix = repairMode
    ? repairPrefix
    : `${sessionId}-ACTIVE-${randomUUID()}-`;

  const memoryCache = new Map();
  let writeQueue = Promise.resolve();
  let lastWriteError = null;
  let masterWasLoaded = false;
  let currentMasterId = meta?.currentMasterId || null;

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

  async function loadPrefix(prefix) {
    const escaped = escapeRegex(prefix);
    const docs = await collection.find({
      _id: { $regex: `^${escaped}` }
    }).toArray();

    for (const doc of docs) {
      const key = doc._id.slice(prefix.length);
      if (!key || typeof doc.value !== 'string') continue;
      try {
        memoryCache.set(key, deserialize(doc.value));
      } catch (error) {
        console.error(`⚠️ Could not parse Mongo auth record ${doc._id}:`, error?.message || error);
      }
    }
    return docs.length;
  }

  if (repairMode) {
    const count = await loadPrefix(repairPrefix);
    console.log(`🆕 Fresh re-pair mode: loaded ${count} pending auth records; old MASTER will not be restored.`);
  } else {
    if (!currentMasterId) {
      const oldMaster = await collection.findOne({ _id: legacyMasterId });
      if (oldMaster?.value) currentMasterId = legacyMasterId;
    }

    const masterDoc = currentMasterId
      ? await collection.findOne({ _id: currentMasterId })
      : null;

    if (masterDoc?.value) {
      const snapshot = deserialize(masterDoc.value);
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('The MongoDB MASTER snapshot has an invalid format.');
      }
      for (const [key, value] of Object.entries(snapshot)) {
        memoryCache.set(key, value);
      }
      masterWasLoaded = true;
      await persistCurrentCache();
      console.log(`🔒 MASTER restored: ${memoryCache.size} auth records.`);
    } else {
      // Backward compatibility: import the previous flat session layout once.
      const escapedPrefix = escapeRegex(legacyPrefix);
      const legacyDocs = await collection.find({
        _id: { $regex: `^${escapedPrefix}` }
      }).toArray();

      for (const doc of legacyDocs) {
        if (
          doc._id === legacyMasterId ||
          doc._id === metaId ||
          doc._id.startsWith(`${sessionId}-ACTIVE-`) ||
          doc._id.startsWith(`${sessionId}-REPAIR-ACTIVE-`) ||
          doc._id.startsWith(`${sessionId}-MASTER-`)
        ) continue;

        const key = doc._id.slice(legacyPrefix.length);
        if (!key || typeof doc.value !== 'string') continue;
        try {
          memoryCache.set(key, deserialize(doc.value));
        } catch (error) {
          console.error(`⚠️ Could not parse legacy auth record ${doc._id}:`, error?.message || error);
        }
      }

      console.log(`🍃 Legacy MongoDB auth loaded: ${memoryCache.size} records.`);
      if (memoryCache.size > 0) await persistCurrentCache();
    }
  }

  function readData(id) {
    return memoryCache.has(id) ? memoryCache.get(id) : null;
  }

  async function writeData(data, id) {
    const serialized = serialize(data);
    await queueWrite(async () => {
      await collection.updateOne(
        { _id: `${activePrefix}${id}` },
        { $set: { value: serialized, updatedAt: new Date() } },
        { upsert: true }
      );
      memoryCache.set(id, data);
    });
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
    await writeData(creds, 'creds');
  };

  async function flush() {
    await writeQueue;
    if (lastWriteError) {
      const error = lastWriteError;
      lastWriteError = null;
      throw error;
    }
  }

  async function createMasterSnapshot() {
    await flush();

    if (!repairMode && masterWasLoaded) {
      return { created: false, records: memoryCache.size, reason: 'master-already-current' };
    }
    if (!creds.registered) {
      return { created: false, records: memoryCache.size, reason: 'credentials-not-registered' };
    }

    const snapshot = Object.fromEntries(memoryCache.entries());
    const serialized = serialize(snapshot);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new Error(`MASTER snapshot too large (${bytes} bytes); safe MongoDB document limit reached.`);
    }

    // Each successful pairing gets a new immutable generation. Previous
    // generations are retained untouched for recovery/audit purposes.
    const nextMasterId = `${sessionId}-MASTER-${randomUUID()}`;
    await queueWrite(() => collection.insertOne({
      _id: nextMasterId,
      value: serialized,
      createdAt: new Date(),
      recordCount: memoryCache.size,
      generation: randomUUID()
    }));

    await collection.updateOne(
      { _id: metaId },
      {
        $set: {
          currentMasterId: nextMasterId,
          repairRequired: false,
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    currentMasterId = nextMasterId;
    masterWasLoaded = true;
    console.log(`🔐 New immutable MASTER generation created (${memoryCache.size} records).`);
    return { created: true, records: memoryCache.size, masterId: nextMasterId };
  }

  async function requestRePair() {
    await flush();

    // Clear only the pending repair namespace, never any MASTER generation.
    await collection.deleteMany({
      _id: { $regex: `^${escapeRegex(repairPrefix)}` }
    });

    await collection.updateOne(
      { _id: metaId },
      {
        $set: {
          repairRequired: true,
          repairRequestedAt: new Date(),
          previousMasterId: currentMasterId || legacyMasterId,
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    console.log('🛡️ Re-pair requested. Old MASTER generations remain untouched; next boot will request a fresh WhatsApp pairing.');
    return { requested: true, previousMasterId: currentMasterId || legacyMasterId };
  }

  return {
    state: { creds, keys },
    saveCreds,
    flush,
    createMasterSnapshot,
    requestRePair,
    getSessionInfo: () => ({
      activePrefix,
      masterId: currentMasterId,
      masterWasLoaded,
      repairMode,
      records: memoryCache.size
    })
  };
}
