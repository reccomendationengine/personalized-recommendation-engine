// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4qcVqY8FgestCQ6knA43hv7Q4gKvPkSY",
  authDomain: "personalizedreceng.firebaseapp.com",
  projectId: "personalizedreceng",
  storageBucket: "personalizedreceng.firebasestorage.app",
  messagingSenderId: "105286234897",
  appId: "1:105286234897:web:17d59441d3a1df031f92b0",
  measurementId: "G-LN3DFJYK8P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
