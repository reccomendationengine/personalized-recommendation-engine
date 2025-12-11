/**
 * =============================================================================
 * PERSONALIZED RECOMMENDATION ENGINE - MAIN SERVER
 * =============================================================================
 * 
 * Express server that powers both Music and Movie recommendation systems
 * using the Two-Tower neural retrieval architecture.
 * 
 * Features:
 *   - Firebase Authentication for secure API access
 *   - Music recommendations with YouTube integration
 *   - Movie recommendations with trailer previews
 *   - CSV data upload and processing
 *   - Firestore persistence for user data
 * 
 * Architecture:
 *   - MusicRecommendationSystem: User listening history → song recommendations
 *   - MovieRecommendationSystem: User ratings → movie recommendations
 *   - Both use cosine similarity between user and item embeddings
 * 
 * @requires firebase-admin - Firebase Admin SDK for auth and Firestore
 * @requires youtube-search-without-api-key - YouTube video search
 * @requires multer - File upload handling
 * =============================================================================
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const admin = require('firebase-admin');
const media_search = require('youtube-search-without-api-key');

// Import recommendation system modules
const MusicRecommendationSystem = require('./musicrec.js');
const MovieRecommendationSystem = require('./movierec.js');

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Middleware configuration
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// =============================================================================
// FIREBASE ADMIN INITIALIZATION
// =============================================================================

let serviceAccount;
try {
  // Load Firebase credentials from environment or local file
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

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Verify Firebase ID token from Authorization header
 * Extracts user info and attaches to req.user
 */
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

// =============================================================================
// RECOMMENDATION SYSTEM INSTANCES
// =============================================================================

const recSystem = new MusicRecommendationSystem(db);
const movieRecSystem = new MovieRecommendationSystem(db);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parse a CSV line handling quoted fields with commas
 * @param {string} line - CSV line to parse
 * @param {number} expectedCols - Expected number of columns
 * @returns {Array} Array of field values
 */
function parseCSVLine(line, expectedCols) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, ''));
  
  return result;
}

/**
 * Parse complete CSV text into array of objects
 * @param {string} csvText - Full CSV content
 * @returns {Array} Array of row objects with header keys
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], header.length);
    if (values.length !== header.length) continue;
    
    const row = {};
    header.forEach((key, idx) => {
      row[key] = values[idx].trim().replace(/^"|"$/g, '');
    });
    data.push(row);
  }
  
  return data;
}

/**
 * Remove duplicate songs based on title + artist
 * @param {Array} records - Array of song records
 * @returns {Array} Deduplicated array
 */
function deduplicateSongs(records) {
  const seen = new Map();
  
  records.forEach(r => {
    const title = (r.title || r.track_name || r.Song_Title || "").trim().toLowerCase();
    const artist = (r.artist || r.artist_name || r.Artist_Name || "").trim().toLowerCase();
    const key = `${title}::${artist}`;
    
    if (!seen.has(key)) {
      seen.set(key, r);
    }
  });
  
  return Array.from(seen.values());
}

// =============================================================================
// BASIC ENDPOINTS
// =============================================================================

/** Health check endpoint */
app.get('/health', (req, res) => res.json({ status: "ok" }));

/** Get current authenticated user info */
app.get('/api/current-user', requireAuth, (req, res) => {
  res.json({
    userID: req.user.userId,
    username: req.user.name || req.user.email.split("@")[0],
    email: req.user.email,
  });
});

// HTML page routes
app.get('/dashboard.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.get('/music-recommendations.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html'))
);
app.get('/movie-recommendations.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'movie-recommendations.html'))
);

// =============================================================================
// MUSIC RECOMMENDATION ENDPOINTS
// =============================================================================

/**
 * Upload music data CSV
 * POST /api/upload-music-data
 * 
 * Accepts a CSV file with song metadata and listening data.
 * Trains the Item Tower (song embeddings) from the uploaded data.
 */
app.post('/api/upload-music-data', requireAuth, upload.single("musicFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No CSV uploaded." });
    }

    const userId = req.user.userId;
    const csvText = req.file.buffer.toString("utf-8");
    const lines = csvText.trim().split("\n");
    const header = lines[0].split(",");

    // Parse CSV rows
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

    // Load into recommendation system and train embeddings
    recSystem.songs = songs;
    recSystem.trainSongEmbeddings();

    // Persist to Firestore (optional)
    try {
      await recSystem.saveListeningHistory(userId, songs);
      console.log(`Uploaded & processed ${songs.length} songs for user ${userId}`);
    } catch (dbError) {
      console.warn("Warning: Could not save to Firestore:", dbError.message);
    }

    res.json({
      success: true,
      message: "Music CSV uploaded successfully.",
      songsLoaded: songs.length,
      warning: !db ? "Firebase not configured - data saved in memory only" : undefined
    });

  } catch (err) {
    console.error("upload-music-data error:", err);
    res.status(500).json({ success: false, error: "Upload processing failed." });
  }
});

/**
 * Upload listening history CSV (2-week log format)
 * POST /api/upload-listening-history
 * 
 * Accepts CSV text in request body. Deduplicates songs and trains embeddings.
 */
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
      const cols = parseCSVLine(lines[i], header.length);
      if (cols.length !== header.length) continue;

      const row = {};
      header.forEach((key, idx) => (row[key.trim()] = cols[idx].trim()));
      records.push(row);
    }

    // Deduplicate and train
    recSystem.songs = deduplicateSongs(records);
    recSystem.trainSongEmbeddings();

    try {
      await recSystem.saveListeningHistory(userId, records);
      res.json({
        success: true,
        message: "Listening history uploaded successfully.",
        count: records.length
      });
    } catch (dbError) {
      console.error("Failed to save listening history:", dbError.message);
      res.json({ 
        success: true,
        message: "Listening history processed (saved in memory).",
        count: records.length,
        warning: "Database save failed: " + dbError.message
      });
    }

  } catch (error) {
    console.error("Upload history error:", error);
    res.status(500).json({ error: "Failed to upload listening history" });
  }
});

/**
 * Get music recommendations for authenticated user
 * GET /api/recommendations
 */
app.get('/api/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Load from Firestore if catalog empty
    if (!recSystem.songs.length) {
      const history = await recSystem.getListeningHistory(userId);
      if (history?.length) {
        recSystem.songs = deduplicateSongs(history);
        recSystem.trainSongEmbeddings();
      } else {
        return res.json({ recommendations: [] });
      }
    }

    const recs = await recSystem.recommendSongs(userId, 10);
    res.json({ recommendations: recs });
  } catch (err) {
    console.error("Recommendation Error:", err);
    res.status(500).json({ error: "Failed to compute recommendations" });
  }
});

/**
 * Get music recommendations with YouTube video data
 * GET /api/recommendations-with-youtube/:userId
 * 
 * Enriches each recommendation with YouTube video ID, URL, and thumbnail.
 */
app.get('/api/recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Load from Firestore if catalog empty
    if (!recSystem.songs.length) {
      const history = await recSystem.getListeningHistory(userId);
      if (history?.length) {
        recSystem.songs = deduplicateSongs(history);
        recSystem.trainSongEmbeddings();
      } else {
        return res.json({ recommendations: [], hasMore: false });
      }
    }

    const recs = await recSystem.recommendSongs(userId, 10);

    // Enrich with YouTube data
    const enriched = await Promise.all(
      recs.map(async (track) => {
        const q = `${track.title} ${track.artist}`;
        const yt = await media_search.search(q);
        const video = yt?.[0];

        return {
          ...track,
          youtube: video ? {
            id: video.id?.videoId || video.id,
            url: video.link || `https://www.youtube.com/watch?v=${video.id?.videoId || video.id}`,
            thumbnail: video.snippet?.thumbnails?.high?.url || 
                       video.snippet?.thumbnails?.medium?.url ||
                       `https://img.youtube.com/vi/${video.id?.videoId || video.id}/hqdefault.jpg`
          } : null
        };
      })
    );

    res.json({ recommendations: enriched, hasMore: false });

  } catch (err) {
    console.error("YouTube recommendation error:", err);
    res.status(500).json({ error: "Failed to fetch YouTube recommendations" });
  }
});

/**
 * Search YouTube for a specific query
 * GET /api/search-youtube/:query
 */
app.get("/api/search-youtube/:query", requireAuth, async (req, res) => {
  try {
    const query = decodeURIComponent(req.params.query);
    const results = await media_search.search(query);
    res.json({ videoId: results?.[0]?.id?.videoId || null });
  } catch (err) {
    console.error("search-youtube error:", err);
    res.status(500).json({ error: "Failed YouTube search" });
  }
});

// =============================================================================
// MOVIE RECOMMENDATION ENDPOINTS
// =============================================================================

/**
 * Upload movie ratings and metadata CSVs
 * POST /api/upload-movie-data
 * 
 * Body: { ratingsText: string, moviesText?: string }
 * 
 * Processes ratings to build user profiles and movie statistics.
 * Trains the Item Tower (movie embeddings) from collaborative signals.
 */
app.post('/api/upload-movie-data', requireAuth, async (req, res) => {
  try {
    const { ratingsText, moviesText } = req.body;
    
    if (!ratingsText) {
      return res.status(400).json({ error: "Missing ratings data" });
    }

    // Parse and process ratings
    const ratingsData = parseCSV(ratingsText);
    if (ratingsData.length === 0) {
      return res.status(400).json({ error: "No valid ratings found in CSV" });
    }

    const ratingsCount = movieRecSystem.processRatings(ratingsData);
    console.log(`Processed ${ratingsCount} movie ratings`);

    // Process movies metadata if provided
    let moviesCount = 0;
    if (moviesText) {
      const moviesData = parseCSV(moviesText);
      moviesCount = movieRecSystem.processMovies(moviesData);
      console.log(`Processed ${moviesCount} movies metadata`);
    }

    // Train movie embeddings
    movieRecSystem.trainMovieEmbeddings();
    console.log("Movie embeddings trained successfully");

    // Get stats and sorted user list
    const stats = movieRecSystem.getStats();
    const users = Object.keys(movieRecSystem.userProfiles).sort((a, b) => {
      return movieRecSystem.userProfiles[b].ratingCount - movieRecSystem.userProfiles[a].ratingCount;
    });

    // Persist to Firestore (optional)
    try {
      await movieRecSystem.saveToFirestore(req.user.userId);
    } catch (dbErr) {
      console.warn("Could not save to Firestore:", dbErr.message);
    }

    res.json({
      success: true,
      message: "Movie data processed and model trained",
      stats,
      users
    });

  } catch (error) {
    console.error("Upload movie data error:", error);
    res.status(500).json({ error: "Failed to process movie data: " + error.message });
  }
});

/**
 * Get movie recommendations for a specific user
 * GET /api/movie-recommendations/:userId
 */
app.get('/api/movie-recommendations/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    // Validate model is trained
    if (Object.keys(movieRecSystem.movieEmbeddings).length === 0) {
      return res.status(400).json({ 
        error: "Model not trained. Please upload movie data first." 
      });
    }

    // Validate user exists
    if (!movieRecSystem.userProfiles[userId]) {
      return res.status(404).json({ 
        error: `User ${userId} not found in the dataset` 
      });
    }

    const recommendations = movieRecSystem.getRecommendations(userId, limit);

    res.json({
      success: true,
      userId,
      recommendations,
      totalRecommendations: recommendations.length
    });

  } catch (error) {
    console.error("Movie recommendations error:", error);
    res.status(500).json({ error: "Failed to generate recommendations: " + error.message });
  }
});

/**
 * Get movie recommendation system statistics
 * GET /api/movie-stats
 */
app.get('/api/movie-stats', requireAuth, (req, res) => {
  try {
    const stats = movieRecSystem.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

/**
 * Get list of users in the movie dataset
 * GET /api/movie-users
 * 
 * Returns users sorted by number of ratings (most active first)
 */
app.get('/api/movie-users', requireAuth, (req, res) => {
  try {
    const users = Object.keys(movieRecSystem.userProfiles).sort((a, b) => {
      return movieRecSystem.userProfiles[b].ratingCount - movieRecSystem.userProfiles[a].ratingCount;
    });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: "Failed to get users" });
  }
});

/**
 * Get movie recommendations with YouTube trailers
 * GET /api/movie-recommendations-with-youtube/:userId
 * 
 * Enriches each recommendation with YouTube trailer data:
 *   - video ID, URL, thumbnail, title
 */
app.get('/api/movie-recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    // Validate model is trained
    if (Object.keys(movieRecSystem.movieEmbeddings).length === 0) {
      return res.status(400).json({ 
        error: "Model not trained. Please upload movie data first." 
      });
    }

    // Validate user exists
    if (!movieRecSystem.userProfiles[userId]) {
      return res.status(404).json({ 
        error: `User ${userId} not found in the dataset` 
      });
    }

    const recommendations = movieRecSystem.getRecommendations(userId, limit);

    // Enrich with YouTube trailers
    const enriched = await Promise.all(
      recommendations.map(async (movie) => {
        try {
          const searchQuery = `${movie.title} official trailer`;
          const ytResults = await media_search.search(searchQuery);
          const video = ytResults?.[0];

          return {
            ...movie,
            youtube: video ? {
              id: video.id?.videoId || video.id,
              url: video.link || `https://www.youtube.com/watch?v=${video.id?.videoId || video.id}`,
              thumbnail: video.snippet?.thumbnails?.high?.url || 
                         video.snippet?.thumbnails?.medium?.url ||
                         `https://img.youtube.com/vi/${video.id?.videoId || video.id}/hqdefault.jpg`,
              title: video.title || video.snippet?.title || searchQuery
            } : null
          };
        } catch (ytErr) {
          console.warn(`YouTube search failed for ${movie.title}:`, ytErr.message);
          return { ...movie, youtube: null };
        }
      })
    );

    res.json({
      success: true,
      userId,
      recommendations: enriched,
      totalRecommendations: enriched.length
    });

  } catch (error) {
    console.error("Movie recommendations with YouTube error:", error);
    res.status(500).json({ error: "Failed to generate recommendations: " + error.message });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});