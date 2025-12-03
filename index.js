// Firebase-enabled Express server for the music recommendation engine
require('dotenv').config();
const path = require('path');
const express = require('express');

const admin = require('firebase-admin');
const media_search = require('youtube-search-without-api-key');
const MusicRecommendationSystem = require('./musicrec.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- FIREBASE INITIALIZATION ---
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
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
    projectId: "personal-recommendation-engine"
  });

  db = admin.firestore();
  console.log('Firebase Admin SDK initialized successfully.');
} else {
  console.error('SERVER ERROR: Firebase Admin SDK not initialized.');
}

// -------------------------------------------------------
// AUTH MIDDLEWARE
// -------------------------------------------------------
async function authenticateFirebaseUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || null
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const requireAuth = authenticateFirebaseUser;

// -------------------------------------------------------
// GLOBAL TWO-TOWER RECOMMENDATION SYSTEM INSTANCE
// -------------------------------------------------------
const recSystem = new MusicRecommendationSystem(db);

// -------------------------------------------------------
// BASIC ENDPOINTS
// -------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/current-user', requireAuth, (req, res) => {
  res.json({
    userID: req.user.userId,
    username: req.user.name || req.user.email.split('@')[0],
    email: req.user.email
  });
});

// Serve HTML
app.get('/dashboard.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);

app.get('/music-recommendations.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html'))
);

// -------------------------------------------------------
// UPLOAD LISTENING HISTORY (CSV RAW TEXT EXPECTED)
// -------------------------------------------------------
app.post('/api/upload-listening-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const csvText = req.body.csvText;

    if (!csvText) {
      return res.status(400).json({ error: "Missing csvText in request body." });
    }

    const historyRef = db
      .collection("user_interactions")
      .doc(userId)
      .collection("history");

    const lines = csvText.split("\n");
    const header = lines[0].split(",");

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length !== header.length) continue;

      const row = {};
      header.forEach((key, idx) => (row[key.trim()] = cols[idx].trim()));

      await historyRef.add({
        contentId: row.track_id || row.song_id || "unknown",
        title: row.title || null,
        artist: row.artist || null,
        genre: row.genre || null,
        timestamp: new Date(),
      });
    }

    res.json({ message: "Listening history uploaded to Firestore." });
  } catch (error) {
    console.error("Upload history error:", error);
    res.status(500).json({ error: "Failed to upload listening history" });
  }
});

// -------------------------------------------------------
// RECOMMENDATION ENDPOINT
// -------------------------------------------------------
app.get('/api/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Load item tower
    await recSystem.initializeTwoTowerModel();

    // Compute recommendations
    const recs = await recSystem.recommendForUser(userId, 10);

    res.json({ recommendations: recs });
  } catch (error) {
    console.error("Recommendation error:", error);
    res.status(500).json({ error: "Failed to compute recommendations" });
  }
});

// -------------------------------------------------------
// YOUTUBE SEARCH API
// -------------------------------------------------------
app.get("/api/search-video", requireAuth, async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ error: "Missing ?q= search query" });
    }

    const results = await media_search.search(query);

    res.json({ results });
  } catch (error) {
    console.error("YouTube search error:", error);
    res.status(500).json({ error: "Failed to search YouTube" });
  }
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
