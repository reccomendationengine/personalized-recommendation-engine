import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

const loginForm = document.getElementById('loginForm');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email');
    const password = document.getElementById('password');

    if(!email.value || !password.value) {
        alert ("Please enter both email and password.");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);

        const user = userCredential.user;
        console.log("User logged in:", user.email);
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
});