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

  const db = mongoose.connection.useDb('whatsapp_bot').db;
  const collection = db.collection('auth_sessions');

  const writeData = async (data, id) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await collection.updateOne(
      { _id: `${sessionId}-${id}` },
      { $set: { value: serialized } },
      { upsert: true }
    );
  };

  const readData = async (id) => {
    const doc = await collection.findOne({ _id: `${sessionId}-${id}` });
    if (!doc) return null;
    return JSON.parse(doc.value, BufferJSON.reviver);
  };

  const removeData = async (id) => {
    await collection.deleteOne({ _id: `${sessionId}-${id}` });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}-${id}`);
              if (value !== null && value !== undefined) {
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
}
