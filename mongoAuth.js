
import mongoose from 'mongoose';
import {
  initAuthCreds,
  BufferJSON
} from '@whiskeysockets/baileys';

export async function useMongoDBAuthState(
  mongoUrl,
  sessionId = 'arthur-session'
) {
  if (!mongoUrl || !mongoUrl.trim()) {
    throw new Error('MONGO_URI is missing.');
  }

  // ============================================================
  // MONGODB CONNECTION
  // ============================================================

  if (
    mongoose.connection.readyState === 0 ||
    mongoose.connection.readyState === 3
  ) {
    await mongoose.connect(mongoUrl, {
      dbName: 'whatsapp_bot'
    });
  } else if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
  } else if (mongoose.connection.readyState === 1) {
    await mongoose.connection.asPromise();
  }

  const db = mongoose.connection
    .useDb('whatsapp_bot', { useCache: true })
    .db;

  if (!db) {
    throw new Error('MongoDB database is not available.');
  }

  const collection = db.collection('auth_sessions');

  const prefix = `${sessionId}-`;
  const escapedPrefix = prefix.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  // ============================================================
  // MEMORY CACHE
  // ============================================================

  const memoryCache = new Map();

  // ============================================================
  // SERIALIZED DATABASE WRITES
  // ============================================================

  let writeQueue = Promise.resolve();

  function queueWrite(task) {
    writeQueue = writeQueue
      .then(task)
      .catch(error => {
        console.error(
          '❌ MongoDB Auth Save Error:',
          error?.stack || error?.message || error
        );
      });

    return writeQueue;
  }

  // ============================================================
  // LOAD EXISTING SESSION
  // ============================================================

  const existingDocs = await collection
    .find({
      _id: {
        $regex: `^${escapedPrefix}`
      }
    })
    .toArray();

  for (const doc of existingDocs) {
    try {
      const key = doc._id.slice(prefix.length);

      if (typeof doc.value !== 'string') {
        continue;
      }

      const value = JSON.parse(
        doc.value,
        BufferJSON.reviver
      );

      memoryCache.set(key, value);
    } catch (error) {
      console.error(
        '⚠️ Failed to restore auth document:',
        doc?._id,
        error?.message || error
      );
    }
  }

  console.log(
    `🍃 MongoDB Auth Loaded: ${memoryCache.size} records`
  );

  // ============================================================
  // READ DATA
  // ============================================================

  function readData(id) {
    return memoryCache.has(id)
      ? memoryCache.get(id)
      : null;
  }

  // ============================================================
  // WRITE SINGLE RECORD
  // ============================================================

  async function writeData(data, id) {
    const serialized = JSON.stringify(
      data,
      BufferJSON.replacer
    );

    memoryCache.set(id, data);

    return queueWrite(async () => {
      await collection.updateOne(
        {
          _id: `${prefix}${id}`
        },
        {
          $set: {
            value: serialized
          }
        },
        {
          upsert: true
        }
      );
    });
  }

  // ============================================================
  // AUTH CREDS
  // ============================================================

  const creds = readData('creds') || initAuthCreds();

  // ============================================================
  // SIGNAL KEYS
  // ============================================================

  const keys = {
    get: async (type, ids) => {
      const data = {};

      for (const id of ids) {
        const value = readData(`${type}-${id}`);

        if (
          value !== null &&
          value !== undefined
        ) {
          data[id] = value;
        }
      }

      return data;
    },

    set: async (data) => {
      const bulkOps = [];

      for (const category of Object.keys(data)) {
        const categoryData = data[category];

        if (!categoryData) continue;

        for (const id of Object.keys(categoryData)) {
          const value = categoryData[id];
          const key = `${category}-${id}`;

          if (
            value !== null &&
            value !== undefined
          ) {
            const serialized = JSON.stringify(
              value,
              BufferJSON.replacer
            );

            memoryCache.set(key, value);

            bulkOps.push({
              updateOne: {
                filter: {
                  _id: `${prefix}${key}`
                },
                update: {
                  $set: {
                    value: serialized
                  }
                },
                upsert: true
              }
            });
          } else {
            memoryCache.delete(key);

            bulkOps.push({
              deleteOne: {
                filter: {
                  _id: `${prefix}${key}`
                }
              }
            });
          }
        }
      }

      if (bulkOps.length === 0) return;

      // لا نسمح لعمليات حفظ متزامنة بكتابة
      // تحديثات قديمة بعد تحديثات أحدث.
      await queueWrite(async () => {
        await collection.bulkWrite(
          bulkOps,
          {
            ordered: true
          }
        );
      });
    }
  };

  // ============================================================
  // SAVE CREDS
  // ============================================================

  const saveCreds = async () => {
    try {
      await writeData(creds, 'creds');
    } catch (error) {
      console.error(
        '❌ Failed to save credentials:',
        error?.message || error
      );
    }
  };

  return {
    state: {
      creds,
      keys
    },
    saveCreds
  };
}
