import mongoose from 'mongoose';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

export async function useMongoDBAuthState(mongoUrl, sessionId = 'arthur-session') {
  if (!mongoUrl) {
    throw new Error('MONGO_URI is missing.');
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUrl, {
      dbName: 'whatsapp_bot',
    });
  } else if (mongoose.connection.readyState === 1) {
    await mongoose.connection.asPromise();
  }

  const db = mongoose.connection.useDb('whatsapp_bot', { useCache: true }).db;
  const collection = db.collection('auth_sessions');

  // ذاكرة تخزين سريعة في الرام لتجنب بطء الشبكة مع كل رسالة
  const memoryCache = new Map();
  const prefix = `${sessionId}-`;

  // تحميل الجلسة كاملة إلى الرام مرة واحدة عند التشغيل
  const existingDocs = await collection
    .find({ _id: { $regex: `^${prefix}` } })
    .toArray();

  for (const doc of existingDocs) {
    const key = doc._id.slice(prefix.length);
    memoryCache.set(key, JSON.parse(doc.value, BufferJSON.reviver));
  }

  const writeData = async (data, id) => {
    memoryCache.set(id, data);
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await collection.updateOne(
      { _id: `${prefix}${id}` },
      { $set: { value: serialized } },
      { upsert: true }
    );
  };

  const readData = (id) => {
    return memoryCache.has(id) ? memoryCache.get(id) : null;
  };

  const creds = readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const value = readData(`${type}-${id}`);
            if (value !== null && value !== undefined) {
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          const bulkOps = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;

              if (value) {
                memoryCache.set(key, value);
                bulkOps.push({
                  updateOne: {
                    filter: { _id: `${prefix}${key}` },
                    update: {
                      $set: { value: JSON.stringify(value, BufferJSON.replacer) },
                    },
                    upsert: true,
                  },
                });
              } else {
                memoryCache.delete(key);
                bulkOps.push({
                  deleteOne: {
                    filter: { _id: `${prefix}${key}` },
                  },
                });
              }
            }
          }

          // حفظ التحديثات في MongoDB بالخلفية دفعة واحدة دون تأخير الرد
          if (bulkOps.length > 0) {
            collection.bulkWrite(bulkOps, { ordered: false }).catch((err) => {
              console.error('MongoDB key sync error:', err.message);
            });
          }
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
}