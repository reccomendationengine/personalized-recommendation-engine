// Firebase-enabled Express server for the music recommendation engine
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
// Removed SQLite, session, and multer in favor of Firebase/client auth
const admin = require('firebase-admin');
const media_search = require('youtube-search-without-api-key');
const MusicRecommendationSystem = require('./musicrec.js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- FIREBASE INITIALIZATION ---
// This block initializes the Firebase Admin SDK, which allows the Node.js server
// to securely interact with Firestore (replacing SQLite).
let serviceAccount;
try {
  // Try to load the service account from an environment variable first (best practice)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Fallback: This is a placeholder for local development. 
    // You MUST ensure your service account file is present here or use the environment variable.
    serviceAccount = require('./personal-recommendation-engine-firebase-adminsdk.json'); 
  }
} catch (error) {
  console.error('Firebase service account configuration not found or invalid.');
  serviceAccount = null;
}

let db;
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "personal-recommendation-engine" // Your actual Firebase Project ID
  });
  
  db = admin.firestore();
  console.log('Firebase Admin SDK initialized successfully.');
} else {
  console.error('SERVER ERROR: Firebase Admin SDK not initialized. Recommendation features requiring database access will fail.');
}

// Mock user session/auth for demonstration purposes. 
// In a production environment, this authentication should be handled via Firebase Auth.
const MOCK_USER_ID = 'user_demo_123';
const MOCK_USER_EMAIL = 'demo@example.com';
const MOCK_USER_NAME = 'DemoUser';

app.use((req, res, next) => {
    // Attach the DB instance and Mock Auth details to the request
    req.db = db;
    req.session = { userId: MOCK_USER_ID, email: MOCK_USER_EMAIL, username: MOCK_USER_NAME };
    next();
});

// Mock authentication check
function requireAuth(req, res, next) { 
    if (req.session?.userId) next(); 
    else res.status(401).json({ error: 'authentication required' }); 
}

// Global instance of the Recommendation System, initialized with Firestore
const recSystem = new MusicRecommendationSystem(db); 

// --- API ENDPOINTS ---

app.get('/health', (req, res) => res.json({status: 'ok'}));
app.get('/api/current-user', requireAuth, (req, res) => res.json({ userId: req.session.userId, username: req.session.username, email: req.session.email }));

// Serve static HTML files
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/music-recommendations.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html')));

/**
 * Replaces the CSV upload endpoint. Now, it seeds mock data into Firestore 
 * to ensure the recommendation engine has data to work with.
 */
app.post('/api/upload-listening-history', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    try {
        // Seed content and user history data into the Firestore collections
        await recSystem.seedMockHistory(userId);
        // Initialize the Item Tower embeddings based on the seeded content
        await recSystem.initializeTwoTowerModel(); 
        
        res.json({ success: true, message: 'Mock listening history seeded to Firestore successfully.', userId });
    } catch (error) {
        console.error('Error seeding mock history:', error);
        res.status(500).json({ error: 'Failed to seed mock history data', details: error.message });
    }
});

/**
 * Main recommendation endpoint using the 2-Tower model.
 * Fetches user history from Firestore -> generates User Embedding -> calculates similarity
 * with Item Embeddings -> returns top results.
 */
app.get('/api/recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
	const userId = req.params.userId;
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    
	try {
		const allRecommendations = await recSystem.getHybridRecommendations(userId, { hour: new Date().getHours() }, 50);
        
		if (allRecommendations.length === 0) {
            return res.json({ recommendations: [], hasMore: false, message: 'No recommendations found. Run /api/upload-listening-history first to seed data.' });
        }

		// Normalize scores for client-side presentation
		const allScores = allRecommendations.map(r => r.score || 0);
		const maxScore = Math.max(...allScores) || 1;
		const minScore = Math.min(...allScores) || 0;
		const scoreRange = maxScore - minScore || 1;
        
		const formattedRecs = allRecommendations.map(rec => {
			const normalizedScore = scoreRange > 0 ? (rec.score - minScore) / scoreRange : 0;
			const percentage = Math.min(normalizedScore * 100, 100);
			if (percentage < 1.0) return null; // Filter out very low compatibility
            
			let matchLevel = 'maylike', matchLevelText = 'You May Like';
			if (percentage >= 80) { matchLevel = 'highly'; matchLevelText = 'Highly Recommended'; } 
            else if (percentage >= 50) { matchLevel = 'moderate'; matchLevelText = 'Moderately Recommended'; }
            
			return { 
                id: rec.id, 
                title: rec.title, 
                artist: rec.artist, 
                genre: rec.genre || 'Unknown', 
                similarity_score: normalizedScore, 
                matchLevel, 
                matchLevelText, 
                explanation: `Based on your ${rec.genre || 'music'} preferences, this track has a ${percentage.toFixed(1)}% compatibility.`, 
                youtube: null // Placeholder for YouTube search (handled separately on client)
            };
		}).filter(rec => rec !== null);
        
		res.json({ recommendations: formattedRecs, hasMore: false, offset: 0 });
	} catch (error) {
		console.error('Recommendation Error:', error);
		res.status(500).json({ recommendations: [], hasMore: false, error: error.message });
	}
});

// Endpoint to get category-based recommendations (e.g., based on top genre)
app.get('/api/recommendations-by-category/:userId/:category', requireAuth, async (req, res) => {
	const userId = req.params.userId;
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
	const category = decodeURIComponent(req.params.category);
    
	try {
		const allRecommendations = await recSystem.getRecommendationsBy(category, userId, { hour: new Date().getHours() }, 100);
        
		if (allRecommendations.length === 0) {
            return res.json({ recommendations: [], hasMore: false, message: 'No category recommendations found.' });
        }
        
		// Normalization logic is performed inside the musicrec.js and for presentation here

		res.json({ recommendations: allRecommendations, hasMore: false, category, offset: 0 });
	} catch (error) {
        console.error('Category Recommendation Error:', error);
		res.status(500).json({ error: 'Failed to get category recommendations', details: error.message });
	}
});

// Endpoint to search YouTube for video links (for playing the music)
app.get('/api/search-youtube/:query', requireAuth, async (req, res) => {
	try {
		const query = decodeURIComponent(req.params.query);
		const results = await media_search.search(`${query} official music video`);
		if (results && results.length > 0) {
			const video = results[0];
			const videoId = video.id?.videoId || video.id;
			res.json({ success: true, video: { id: videoId, title: video.title || video.snippet?.title, url: video.url || `https://www.youtube.com/watch?v=${videoId}`, thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail, duration: video.duration_raw || video.duration } });
		} else {
			res.json({ success: false, message: 'No YouTube video found' });
		}
	} catch (error) {
		console.error('YouTube Search Error:', error);
		res.status(500).json({ success: false, error: 'Failed to search YouTube' });
	}
});

function startServer(port, remainingAttempts = 3) {
	const server = app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
	server.on('error', (err) => { 
        if (err.code === 'EADDRINUSE' && remainingAttempts > 0) { 
            setTimeout(() => startServer(port + 1, remainingAttempts - 1), 200); 
        } else { 
            console.error('Server failed to start:', err); 
            process.exit(1); 
        } 
    });
}
startServer(PORT, 3);