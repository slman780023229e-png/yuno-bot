import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// بيانات مشروعك من فايربيس
const firebaseConfig = {
  apiKey: "AIzaSyBssf8rHH4822YH1K_K_zCSHm...", // ضع مفتاحك الصحيح هنا
  authDomain: "yuon-accef.firebaseapp.com",
  projectId: "yuon-accef",
  storageBucket: "yuon-accef.appspot.com",
  messagingSenderId: "88800926506",
  appId: "1:88800926506:web:509bd3d28486f..." // ضع معرف التطبيق الصحيح هنا
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const useFirebaseAuthState = async (sessionId = "bot_session") => {
  const docRef = doc(db, "whatsapp_sessions", sessionId);

  const readData = async () => {
    try {
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return JSON.parse(snapshot.data().data);
      }
      return null;
    } catch (error) {
      console.error("خطأ في قراءة الجلسة:", error);
      return null;
    }
  };

  const writeData = async (data) => {
    try {
      const stringified = JSON.stringify(data, (key, value) =>
        Buffer.isBuffer(value) ? { type: "Buffer", data: Array.from(value) } : value
      );
      await setDoc(docRef, { data: stringified });
    } catch (error) {
      console.error("خطأ في حفظ الجلسة:", error);
    }
  };

  const storedData = await readData();
  let creds = storedData?.creds || {};

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = storedData?.keys || {};
          return ids.reduce((dict, id) => {
            let value = data[type]?.[id];
            if (value && value.type === "Buffer") {
              value = Buffer.from(value.data);
            }
            dict[id] = value;
            return dict;
          }, {});
        },
        set: async (data) => {
          let keys = storedData?.keys || {};
          for (const category of Object.keys(data)) {
            keys[category] = keys[category] || {};
            for (const id of Object.keys(data[category])) {
              keys[category][id] = data[category][id];
            }
          }
          await writeData({ creds, keys });
        }
      }
    },
    saveCreds: async () => {
      let keys = storedData?.keys || {};
      await writeData({ creds, keys });
    }
  };
};
