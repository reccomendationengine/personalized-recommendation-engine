// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA1-L2WLdKYKxIOvE0Uk4HZafTI_ji7sho",
  authDomain: "personal-recommendation-engine.firebaseapp.com",
  projectId: "personal-recommendation-engine",
  storageBucket: "personal-recommendation-engine.firebasestorage.app",
  messagingSenderId: "540660260722",
  appId: "1:540660260722:web:6ff903df8a5fef942a47eb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
