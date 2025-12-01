// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-analytics.js";

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
