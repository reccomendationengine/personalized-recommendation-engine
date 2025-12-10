// signup.js
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";


// --- Form Validation ---
function validatePassword(password) {
    const requirements = {
        length: password.length >= 6,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password)
    };
    updateRequirement('req-length', requirements.length);
    updateRequirement('req-uppercase', requirements.uppercase);
    updateRequirement('req-lowercase', requirements.lowercase);
    updateRequirement('req-number', requirements.number);
    return Object.values(requirements).every(Boolean);
}

function updateRequirement(id, met) {
    const element = document.getElementById(id);
    const icon = element.querySelector('.requirement-icon');
    if (met) {
        element.classList.add('met');
        icon.textContent = '✓';
    } else {
        element.classList.remove('met');
        icon.textContent = '✗';
    }
}

function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 6) value = value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    else if (value.length >= 3) value = value.replace(/(\d{3})(\d{0,3})/, '($1) $2');
    input.value = value;
}

// --- Event Listeners ---
document.getElementById('password').addEventListener('input', function () {
    validatePassword(this.value);
});
document.getElementById('phoneNumber').addEventListener('input', function () {
    formatPhoneNumber(this);
});

// --- Form Submit ---
document.getElementById('signupForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    // --- Grab values ---
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const profilePicInput = document.getElementById('profilePic');

    // --- Error elements ---
    const usernameError = document.getElementById('usernameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const confirmError = document.getElementById('confirmError');

    // Reset errors
    [usernameError, emailError, passwordError, confirmError].forEach(el => el.style.display = 'none');

    // --- Validation ---
    let isValid = true;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailPattern.test(email)) { emailError.style.display = 'block'; isValid = false; }
    if (username.length > 0 && username.length < 2) { usernameError.style.display = 'block'; isValid = false; }
    if (!validatePassword(password)) { passwordError.style.display = 'block'; passwordError.textContent = 'Password must meet all requirements.'; isValid = false; }
    if (password !== confirmPassword) { confirmError.style.display = 'block'; isValid = false; }
    if (!isValid) return;

    try {
        // --- Firebase Auth ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // --- Firestore User Document ---
        await setDoc(doc(db, "users", user.uid), {
            username: email,
            fullName: username || "",
            email,
            createdAt: new Date(),
            preferences: {},
            categories: [],
            genres: [],
            dateOfBirth: dateOfBirth || "",
            phoneNumber: phoneNumber || ""
        });

        // --- Optional Profile Picture ---
        if (profilePicInput.files && profilePicInput.files[0]) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                await setDoc(doc(db, "users", user.uid), { profilePic: event.target.result }, { merge: true });
                window.location.href = 'dashboard.html';
            };
            reader.readAsDataURL(profilePicInput.files[0]);
        } else {
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        console.error("Signup error:", error);
        passwordError.style.display = 'block';
        passwordError.textContent = error.message;
    }
});
