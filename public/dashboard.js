import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";


onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.warn("No Firebase user found - redirecting to login.");
        window.location.href = "login.html";
        return;
    }

    const userDisplayName = user.displayName
    const email = user.email;

    if (userDisplayName && userDisplayName.trim()){
        document.getElementById("userDisplayName").textContent = userDisplayName;
    } else {
        document.getElementById("userDisplayName").textContent = email.split('@')[0]; 
    }
});

async function verifyBackendSession(){
    const user = auth.currentUser;
    if(!user) return;

    const token = await user.getIdToken();

    try{
        const res = await fetch('/api/current-user', {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        if(!res.ok){
            console.warn("Backend session rejected token. Redirecting to login.");
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Backend session check failed:", error);
        window.location.href = "login.html";
    }
}

document.addEventListener("DOMContentLoaded", verifyBackendSession);

function selectOption(type) {
    if (type === "music") {
        window.location.href = "music-recommendations.html";
    } else if (type === "movie") {
        window.location.href = "movie-recommendations.html";
    }
}

window.selectOption = selectOption;


function viewProfile() {
    window.location.href = "profile.html";
}
window.viewProfile = viewProfile;

async function logout(){
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
    }
}
window.logout = logout;