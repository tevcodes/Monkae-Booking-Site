// Import only what you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// 🆕 ADDED: Import Firebase Authentication SDK
import { getAuth } from "firebase/auth"; 
import { getFunctions } from "firebase/functions";


const firebaseConfig = {
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
 authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
 projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
 storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
 messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
 appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Initialize Firestore and assign to db
const db = getFirestore(app);

// 🆕 INITIALIZED: Initialize Firebase Authentication
const auth = getAuth(app);

const functions = getFunctions(app, 'us-central1');

// ✅ Export db and auth so other files can import them
export { db, auth, functions };