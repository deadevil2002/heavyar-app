import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth } from 'firebase/auth';
// @ts-ignore - getReactNativePersistence exists in RN bundle but missing from TS definitions
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { resolveFirebaseConfig, type FirebasePublicConfig } from './firebaseConfigResolver';

const environmentConfig: Partial<FirebasePublicConfig> = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const extraConfig = Constants.expoConfig?.extra?.firebase as Partial<FirebasePublicConfig> | undefined;
const development = typeof __DEV__ !== 'undefined' && __DEV__;
const firebaseConfig = resolveFirebaseConfig(
  Platform.OS as 'web' | 'ios' | 'android',
  development,
  environmentConfig,
  extraConfig,
);

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
