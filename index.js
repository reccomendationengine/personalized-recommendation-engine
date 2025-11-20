const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors'); // Required for development/testing

// --- Configuration and Initialization ---

// 1. Load the Service Account Credentials
// IMPORTANT: This file MUST NOT be committed to your repository. 
// It appears you were blocked by GitHub Push Protection because this file was committed.
// Make sure this file is listed in your .gitignore: personal-recommendation-engine-firebase-adminsdk.json
const serviceAccount = require('./personal-recommendation-engine-firebase-adminsdk.json');

// 2. Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
    // You might need to add databaseURL if you use Realtime Database, 
    // but Firestore works without it here.
});

const app = express();
const db = admin.firestore();
const port = 3000;

// --- Middleware Setup ---
app.use(cors({ origin: true })); // Allows cross-origin requests (for testing)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, client-side JS)
app.use(express.static(path.join(__dirname)));

/**
 * Middleware to protect API routes and retrieve user context.
 * The token is sent in the 'Authorization: Bearer <ID_TOKEN>' header from the client.
 */
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.sendStatus(401).send('Unauthorized: No token provided'); // No token
    }

    try {
        // Verify the token using Firebase Admin SDK
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Attach user info to the request object
        req.user = { 
            uid: decodedToken.uid,
            email: decodedToken.email
        };
        next();
    } catch (error) {
        console.error("Token verification error:", error);
        return res.sendStatus(403).send('Forbidden: Invalid or expired token'); // Invalid token
    }
}

// --- API Endpoints ---

// 1. Login Endpoint: Generates a custom token for the client
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    // In a production scenario, you would securely verify the password
    // (e.g., using Firebase Auth REST API or a secure service).
    // For this mock, we assume the user authenticated successfully on the client
    // and is now exchanging the ID token for a session token/custom claim, or just fetching profile.
    
    try {
        // Lookup the user by email
        const user = await admin.auth().getUserByEmail(email);
        
        // Fetch profile data from Firestore
        const profileRef = db.doc(`artifacts/${appId}/users/${user.uid}/profile/data/user_profile`);
        const profileDoc = await profileRef.get();
        
        if (!profileDoc.exists) {
            console.warn(`Profile not found for user: ${user.uid}`);
        }
        
        const profileData = profileDoc.data() || {};
        
        // Return user data (or an ID token if using custom claims)
        res.status(200).json({ 
            message: 'Login successful', 
            user: {
                id: user.uid,
                email: user.email,
                username: profileData.username
            }
        });
        
    } catch (error) {
        console.error('Server-side login error:', error.message);
        // Map common errors
        if (error.code === 'auth/user-not-found') {
            return res.status(401).send('Invalid email or password.');
        }
        res.status(500).send('Authentication failed.');
    }
});

// 2. Recommendations Endpoint (Protected)
app.post('/api/recommendations', authenticateToken, async (req, res) => {
    // This is a protected route. req.user contains the UID.
    const { category, exclude_song_ids } = req.body;
    const userId = req.user.uid;

    try {
        // Lazy load the recommendation engine and mock data
        const { MusicRecommendationSystem } = require('./musicrec');
        const fs = require('fs');
        const mockDataPath = path.join(__dirname, 'mock_listening_history.csv');
        const csvData = fs.readFileSync(mockDataPath, 'utf8');

        const recommender = new MusicRecommendationSystem();
        recommender.loadData(csvData);

        // Train and generate recommendations
        recommender.trainUserTower(userId); 
        const recommendations = recommender.getRecommendations(userId, 100, category, exclude_song_ids);

        res.status(200).json({ 
            userId,
            category: category || 'General',
            recommendations 
        });

    } catch (error) {
        console.error('Error generating recommendations:', error);
        res.status(500).json({ error: 'Failed to generate recommendations.' });
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port}/index.html to start the app.`);
});