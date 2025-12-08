// Firebase-enabled Express server for the music recommendation engine
require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');

const admin = require('firebase-admin');
const media_search = require('youtube-search-without-api-key');
const MusicRecommendationSystem = require('./musicrec.js');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------------------------------------------
// FIREBASE ADMIN INITIALIZATION
// -------------------------------------------------------
let serviceAccount;
try {
  serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('./personal-recommendation-engine-firebase-adminsdk.json');
} catch (err) {
  console.error("ERROR loading Firebase service account:", err);
  serviceAccount = null;
}

let db = null;

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "personal-recommendation-engine"
    });

    db = admin.firestore();
    console.log("Firebase Admin initialized.");
  } catch (err) {
    console.error("Firebase Admin initialization failed:", err);
  }
} else {
  console.error("Firebase Admin SDK not initialized.");
}

// -------------------------------------------------------
// AUTH MIDDLEWARE
// -------------------------------------------------------
async function authenticateFirebaseUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    req.user = {
      userId: decoded.uid,
      email: decoded.email,
      name: decoded.name || null,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired Firebase token" });
  }
}

const requireAuth = authenticateFirebaseUser;

// -------------------------------------------------------
// GLOBAL Two-Tower RECOMMENDATION INSTANCE
// -------------------------------------------------------
const recSystem = new MusicRecommendationSystem(db);

// -------------------------------------------------------
// BASIC ENDPOINTS
// -------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: "ok" }));

app.get('/api/current-user', requireAuth, (req, res) => {
  res.json({
    userID: req.user.userId,
    username: req.user.name || req.user.email.split("@")[0],
    email: req.user.email,
  });
});

// HTML routes
app.get('/dashboard.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.get('/music-recommendations.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html'))
);

// -------------------------------------------------------
// UPLOAD MUSIC CSV — User provides master songs dataset
// -------------------------------------------------------
app.post('/api/upload-music-data', requireAuth, upload.single("musicFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No CSV uploaded." });
    }

    const userId = req.user.userId;
    const csvText = req.file.buffer.toString("utf-8");

    const lines = csvText.trim().split("\n");
    const header = lines[0].split(",");

    const songs = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length !== header.length) continue;

      const row = {};
      header.forEach((key, idx) => {
        row[key.trim()] = cols[idx].trim();
      });

      songs.push(row);
    }

    // Save songs INTO recSystem.songs
    recSystem.songs = songs;

    // Train embeddings from uploaded user CSV
    recSystem.trainSongEmbeddings();

    // Save raw listening records also into Firestore (optional)
    await recSystem.saveListeningHistory(userId, songs);

    console.log(`Uploaded & processed ${songs.length} songs for user ${userId}`);

    res.json({
      success: true,
      message: "Music CSV uploaded successfully.",
      songsLoaded: songs.length
    });

  } catch (err) {
    console.error("upload-music-data error:", err);
    res.status(500).json({ success: false, error: "Upload processing failed." });
  }
});

// -------------------------------------------------------
// UPLOAD LISTENING HISTORY CSV (2-week log)
// -------------------------------------------------------
app.post('/api/upload-listening-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const csvText = req.body.csvText;

    if (!csvText) {
      return res.status(400).json({ error: "Missing csvText in request body." });
    }

    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV appears empty" });
    }

    const header = lines[0].split(",");

    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length !== header.length) continue;

      const row = {};
      header.forEach((key, idx) => (row[key.trim()] = cols[idx].trim()));
      records.push(row);
    }

    await recSystem.saveListeningHistory(userId, records);

    res.json({
      success: true,
      message: "Listening history uploaded to Firestore.",
      count: records.length
    });

  } catch (error) {
    console.error("Upload history error:", error);
    res.status(500).json({ error: "Failed to upload listening history" });
  }
});


// -------------------------------------------------------
// RECOMMENDATIONS (No YouTube fallback)
// -------------------------------------------------------
app.get('/api/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!recSystem.songs.length) {
      return res.json({ recommendations: [] });
    }

    const recs = await recSystem.recommendSongs(userId, 10);

    res.json({ recommendations: recs });
  } catch (err) {
    console.error("Recommendation Error:", err);
    res.status(500).json({ error: "Failed to compute recommendations" });
  }
});

// -------------------------------------------------------
// ENHANCED Recommendations w/ YouTube
// -------------------------------------------------------
app.get('/api/recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!recSystem.songs.length) {
      return res.json({ recommendations: [], hasMore: false });
    }

    const recs = await recSystem.recommendSongs(userId, 10);

    const enriched = await Promise.all(
      recs.map(async (track) => {
        const q = `${track.title} ${track.artist}`;
        const yt = await media_search.search(q);

        return {
          ...track,
          youtube: yt?.[0]
            ? { id: yt[0].id.videoId, url: yt[0].link }
            : null
        };
      })
    );

    res.json({
      recommendations: enriched,
      hasMore: false
    });

  } catch (err) {
    console.error("YouTube recommendation error:", err);
    res.status(500).json({ error: "Failed to fetch YouTube recommendations" });
  }
});

// -------------------------------------------------------
// YouTube search endpoint
// -------------------------------------------------------
app.get("/api/search-youtube/:query", requireAuth, async (req, res) => {
  try {
    const query = decodeURIComponent(req.params.query);
    const results = await media_search.search(query);

    res.json({
      videoId: results?.[0]?.id?.videoId || null
    });

  } catch (err) {
    console.error("❌ search-youtube error:", err);
    res.status(500).json({ error: "Failed YouTube search" });
  }
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
