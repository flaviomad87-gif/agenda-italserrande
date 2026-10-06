import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Persistenza del login:
//   1. IndexedDB (più duratura: sopravvive ad aggiornamenti PWA e pulizie OS)
//   2. localStorage come fallback
//   3. memoria come ultima spiaggia (es. browser privato)
// `initializeAuth` applica la catena immediatamente, PRIMA di qualunque signIn,
// a differenza del vecchio `setPersistence` asincrono che poteva perdere la
// corsa con il primo login.
export const auth = getApps().length
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        inMemoryPersistence,
      ],
    });
