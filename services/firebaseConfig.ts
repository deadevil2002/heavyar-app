import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth } from 'firebase/auth';
// @ts-ignore - getReactNativePersistence exists in RN bundle but missing from TS definitions
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

if (!apiKey) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_API_KEY');
if (!authDomain) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
if (!projectId) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_PROJECT_ID');
if (!storageBucket) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET');
if (!messagingSenderId) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
if (!appId) throw new Error('[Firebase Config] Missing required env var: EXPO_PUBLIC_FIREBASE_APP_ID');

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
  }
  return app;
}

function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    try {
      if (Platform.OS !== 'web') {
        auth = initializeAuth(firebaseApp, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } else {
        auth = getAuth(firebaseApp);
      }
    } catch (error) {
      auth = getAuth(firebaseApp);
    }
  }
  return auth;
}

function getFirebaseDb(): Firestore {
  if (!db) {
    const firebaseApp = getFirebaseApp();
    db = getFirestore(firebaseApp);
  }
  return db;
}

export { getFirebaseApp, getFirebaseAuth, getFirebaseDb };
export { firebaseConfig };
