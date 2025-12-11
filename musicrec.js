/**
 * =============================================================================
 * TWO-TOWER MUSIC RECOMMENDATION SYSTEM
 * =============================================================================
 * 
 * Architecture Overview:
 * ----------------------
 * This implements a Two-Tower neural retrieval architecture for music recommendations.
 * 
 * ITEM TOWER (Song Embeddings):
 *   - Creates dense vector representations for each song
 *   - Encodes: title, artist, genre, mood, activity, temporal features
 *   - Uses character-level hashing for text features
 * 
 * USER TOWER (User Embeddings):
 *   - Creates dense vector representation of user preferences
 *   - Aggregates embeddings of songs the user has listened to
 *   - Weights by engagement signals (completion rate, likes, skips, etc.)
 * 
 * MATCHING:
 *   - Computes cosine similarity between user and song embeddings
 *   - Returns top-k songs with highest similarity scores
 * 
 * Embedding Dimension: 128 (configurable)
 * 
 * @author Recommendation Engine Team
 * =============================================================================
 */

class MusicRecommendationSystem {
  /**
   * Initialize the recommendation system
   * @param {Object} db - Firestore database instance (optional)
   */
  constructor(db) {
    this.db = db;                    // Firestore database reference
    this.songs = [];                 // Catalog of all songs
    this.songEmbeddings = {};        // Map: songId -> embedding vector
    this.embeddingDim = 128;         // Embedding vector dimension
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  /**
   * Save user's listening history to Firestore
   * Stores detailed listening data including context and behavior signals
   * 
   * @param {string} userId - Unique user identifier
   * @param {Array} records - Array of listening records from CSV
   */
  async saveListeningHistory(userId, records) {
    if (!this.db) throw new Error("Firebase not initialized");

    const ref = this.db.collection("user_interactions").doc(userId).collection("history");
    const batch = this.db.batch();

    records.forEach((r) => {
      batch.set(ref.doc(), {
        // Song metadata
        title: r.title || r.Song_Title || "",
        artist: r.artist || r.Artist_Name || "",
        genre: r.genre || r.Genre || "",
        subGenre: r.Sub_Genre || "",
        language: r.Language || "",
        releaseYear: r.Release_Year || "",
        
        // User engagement signals
        listenDuration: parseFloat(r.Listen_Duration_sec) || 0,
        completionRate: parseFloat(r.Completion_Rate) || 0,
        skipFlag: parseInt(r.Skip_Flag) || 0,
        repeatCount: parseInt(r.Repeat_Count) || 0,
        likedFlag: parseInt(r.Liked_Flag) || 0,
        addedToPlaylist: parseInt(r.Added_To_Playlist) || 0,
        rating: parseFloat(r.Rating) || 0,
        
        // Listening context
        mood: r.Mood || "",
        activity: r.Activity || "",
        device: r.Device || "",
        location: r.Location || "",
        weather: r.Weather || "",
        hourOfDay: parseInt(r.Hour_of_Day) || 0,
        weekendFlag: parseInt(r.Weekend_Flag) || 0,
        dayOfWeek: r.Day_of_Week || "",
        
        // System metadata
        recommendedBySystem: parseInt(r.Recommended_By_System) || 0,
        recommendationSource: r.Recommendation_Source || "",
        userAction: r.User_Action || "",
        timestamp: new Date(),
      });
    });

    await batch.commit();
  }

  /**
   * Retrieve user's listening history from Firestore
   * @param {string} userId - Unique user identifier
   * @returns {Array} Array of listening history records
   */
  async getListeningHistory(userId) {
    if (!this.db) return [];
    const snapshot = await this.db
      .collection("user_interactions")
      .doc(userId)
      .collection("history")
      .get();
    return snapshot.docs.map((d) => d.data());
  }

  // ===========================================================================
  // EMBEDDING UTILITIES
  // ===========================================================================

  /**
   * Generate unique song identifier from title and artist
   * @param {Object} song - Song object with title and artist
   * @returns {string} Unique song ID in format "title::artist"
   */
  makeSongId(song) {
    const title = (song.title || song.Song_Title || "").trim().toLowerCase();
    const artist = (song.artist || song.Artist_Name || "").trim().toLowerCase();
    return title || artist ? `${title}::${artist}` : JSON.stringify(song);
  }

  /**
   * Hash a string into vector contributions using character codes
   * Distributes text information across multiple embedding dimensions
   * 
   * @param {string} str - Text to hash
   * @param {Array} vec - Target embedding vector
   * @param {number} offset - Starting index in vector
   * @param {number} weight - Importance weight for this feature
   */
  hashToVector(str, vec, offset = 0, weight = 1.0) {
    const text = (str || "").toLowerCase();
    for (let i = 0; i < text.length; i++) {
      const idx = (offset + i) % vec.length;
      vec[idx] += (text.charCodeAt(i) / 255.0) * weight;
    }
  }

  // ===========================================================================
  // ITEM TOWER: SONG EMBEDDINGS
  // ===========================================================================

  /**
   * Create dense embedding vector for a song
   * Encodes multiple features with different importance weights:
   * 
   * Features encoded:
   *   [0-15]   : Title hash (weight: 1.5)
   *   [16-31]  : Artist hash (weight: 1.5)
   *   [32-47]  : Genre hash (weight: 2.0) - most important
   *   [48-63]  : Sub-genre hash (weight: 1.5)
   *   [64-79]  : Language hash (weight: 1.0)
   *   [80-95]  : Mood hash (weight: 1.8)
   *   [96-111] : Activity hash (weight: 1.5)
   *   [112]    : Normalized release year
   *   [113]    : Normalized duration
   *   [114-119]: Behavioral signals (completion, rating, likes, etc.)
   *   [120-122]: Temporal context (hour of day, weekend)
   *   [123-127]: Weather and location context
   * 
   * @param {Object} song - Song object with metadata
   * @returns {Array} 128-dimensional embedding vector
   */
  createSongEmbedding(song) {
    const vec = Array(this.embeddingDim).fill(0);

    // Text features with importance weights
    this.hashToVector(song.title || song.Song_Title, vec, 0, 1.5);
    this.hashToVector(song.artist || song.Artist_Name, vec, 16, 1.5);
    this.hashToVector(song.genre || song.Genre, vec, 32, 2.0);       // Genre most important
    this.hashToVector(song.subGenre || song.Sub_Genre, vec, 48, 1.5);
    this.hashToVector(song.language || song.Language, vec, 64, 1.0);
    this.hashToVector(song.mood || song.Mood, vec, 80, 1.8);
    this.hashToVector(song.activity || song.Activity, vec, 96, 1.5);

    // Numeric features (normalized to 0-1 range)
    const releaseYear = parseInt(song.releaseYear || song.Release_Year) || 2020;
    vec[112] = (releaseYear - 1950) / 100;

    const duration = parseFloat(song.duration || song.Duration_sec) || 200;
    vec[113] = duration / 600;  // Normalize assuming max 10 minutes

    // Behavioral signals
    vec[114] = parseFloat(song.completionRate || song.Completion_Rate) || 0.5;
    vec[115] = (parseFloat(song.rating || song.Rating) || 3) / 5;
    vec[116] = parseInt(song.likedFlag || song.Liked_Flag) || 0;
    vec[117] = Math.min(parseInt(song.repeatCount || song.Repeat_Count) || 0, 5) / 5;
    vec[118] = 1 - (parseInt(song.skipFlag || song.Skip_Flag) || 0);  // Invert: not skipped = good
    vec[119] = parseInt(song.addedToPlaylist || song.Added_To_Playlist) || 0;

    // Temporal context (cyclical encoding for hour)
    const hour = parseInt(song.hourOfDay || song.Hour_of_Day) || 12;
    vec[120] = Math.sin(2 * Math.PI * hour / 24);
    vec[121] = Math.cos(2 * Math.PI * hour / 24);
    vec[122] = parseInt(song.weekendFlag || song.Weekend_Flag) || 0;

    // Environmental context
    this.hashToVector(song.weather || song.Weather, vec, 123, 0.8);
    this.hashToVector(song.location || song.Location, vec, 126, 0.5);

    return vec;
  }

  /**
   * Train embeddings for all songs in the catalog
   * Must be called after loading songs into this.songs
   */
  trainSongEmbeddings() {
    this.songEmbeddings = {};
    this.songs.forEach((song) => {
      const id = this.makeSongId(song);
      this.songEmbeddings[id] = this.createSongEmbedding(song);
    });
  }

  // ===========================================================================
  // USER TOWER: USER EMBEDDINGS
  // ===========================================================================

  /**
   * Create user embedding by aggregating listened song embeddings
   * Weights each song by user engagement signals
   * 
   * Engagement weighting formula:
   *   weight = (0.5 + completionRate) * (0.6 + rating*0.8) + liked*0.5 + repeats*0.3
   *   weight *= 0.3 if skipped (penalty)
   * 
   * @param {Array} history - User's listening history records
   * @returns {Array} Normalized 128-dimensional user embedding
   */
  createUserEmbedding(history) {
    const agg = Array(this.embeddingDim).fill(0);
    let totalWeight = 0;

    history.forEach((entry) => {
      const emb = this.songEmbeddings[this.makeSongId(entry)];
      if (!emb) return;

      // Extract engagement signals
      const completionRate = parseFloat(entry.completionRate || entry.Completion_Rate) || 0.5;
      const rating = (parseFloat(entry.rating || entry.Rating) || 3) / 5;
      const liked = parseInt(entry.likedFlag || entry.Liked_Flag) || 0;
      const skipped = parseInt(entry.skipFlag || entry.Skip_Flag) || 0;
      const repeated = Math.min(parseInt(entry.repeatCount || entry.Repeat_Count) || 0, 3);

      // Calculate engagement-based weight
      let weight = 1.0;
      weight *= (0.5 + completionRate);   // Completion boost
      weight *= (0.6 + rating * 0.8);     // Rating boost
      weight += liked * 0.5;               // Like boost
      weight += repeated * 0.3;            // Repeat boost
      weight *= skipped ? 0.3 : 1.0;       // Skip penalty

      // Weighted aggregation
      for (let i = 0; i < this.embeddingDim; i++) {
        agg[i] += emb[i] * weight;
      }
      totalWeight += weight;
    });

    if (!totalWeight) return Array(this.embeddingDim).fill(0);

    // L2 normalize the final embedding
    const magnitude = Math.sqrt(agg.reduce((s, v) => s + v * v, 0)) || 1;
    return agg.map((x) => x / magnitude);
  }

  // ===========================================================================
  // MATCHING: SIMILARITY COMPUTATION
  // ===========================================================================

  /**
   * Compute cosine similarity between two vectors
   * @param {Array} a - First vector
   * @param {Array} b - Second vector
   * @returns {number} Similarity score in range [-1, 1]
   */
  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }

  // ===========================================================================
  // RECOMMENDATION GENERATION
  // ===========================================================================

  /**
   * Generate personalized song recommendations for a user
   * 
   * Algorithm:
   * 1. Load user's listening history
   * 2. Create user embedding from history
   * 3. Score all songs against user embedding using cosine similarity
   * 4. Return top-k highest scoring songs
   * 
   * @param {string} userId - User to generate recommendations for
   * @param {number} limit - Maximum number of recommendations (default: 10)
   * @returns {Array} Sorted array of recommended songs with similarity scores
   */
  async recommendSongs(userId, limit = 10) {
    // Ensure we have songs to recommend
    if (!this.songs.length) return [];

    // Train embeddings if not already done
    if (!Object.keys(this.songEmbeddings).length) {
      this.trainSongEmbeddings();
    }

    // Load user history
    const history = await this.getListeningHistory(userId);
    if (!history.length) return [];

    // Create user embedding
    const userEmb = this.createUserEmbedding(history);

    // Score all songs
    const results = this.songs.map((song) => {
      const id = this.makeSongId(song);
      const emb = this.songEmbeddings[id];
      return {
        id,
        title: song.title || song.Song_Title || "",
        artist: song.artist || song.Artist_Name || "",
        album: song.album || song.Album || "",
        genre: song.genre || song.Genre || "",
        mood: song.mood || song.Mood || "",
        similarity_score: emb ? this.cosineSimilarity(userEmb, emb) : 0,
      };
    });

    // Sort by similarity and return top results
    return results
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);
  }
}

module.exports = MusicRecommendationSystem;
