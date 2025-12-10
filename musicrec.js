// Two-Tower Music Recommendation System (Enhanced)
// Item Tower: Song embeddings from metadata + audio features
// User Tower: User embedding from listening behavior + context
// Matching: Cosine similarity between user and song embeddings

class MusicRecommendationSystem {
  constructor(db) {
    this.db = db;
    this.songs = [];
    this.songEmbeddings = {};
    this.embeddingDim = 128; // Increased for more features
  }

  // Save listening history to Firestore
  async saveListeningHistory(userId, records) {
    if (!this.db) throw new Error("Firebase not initialized");

    const ref = this.db.collection("user_interactions").doc(userId).collection("history");
    const batch = this.db.batch();

    records.forEach((r) => {
      batch.set(ref.doc(), {
        // Song info
        title: r.title || r.Song_Title || "",
        artist: r.artist || r.Artist_Name || "",
        genre: r.genre || r.Genre || "",
        subGenre: r.Sub_Genre || "",
        language: r.Language || "",
        releaseYear: r.Release_Year || "",
        // Listening behavior
        listenDuration: parseFloat(r.Listen_Duration_sec) || 0,
        completionRate: parseFloat(r.Completion_Rate) || 0,
        skipFlag: parseInt(r.Skip_Flag) || 0,
        repeatCount: parseInt(r.Repeat_Count) || 0,
        likedFlag: parseInt(r.Liked_Flag) || 0,
        addedToPlaylist: parseInt(r.Added_To_Playlist) || 0,
        rating: parseFloat(r.Rating) || 0,
        // Context
        mood: r.Mood || "",
        activity: r.Activity || "",
        device: r.Device || "",
        location: r.Location || "",
        weather: r.Weather || "",
        hourOfDay: parseInt(r.Hour_of_Day) || 0,
        weekendFlag: parseInt(r.Weekend_Flag) || 0,
        dayOfWeek: r.Day_of_Week || "",
        // Recommendation info
        recommendedBySystem: parseInt(r.Recommended_By_System) || 0,
        recommendationSource: r.Recommendation_Source || "",
        userAction: r.User_Action || "",
        timestamp: new Date(),
      });
    });

    await batch.commit();
  }

  // Get listening history from Firestore
  async getListeningHistory(userId) {
    if (!this.db) return [];
    const snapshot = await this.db.collection("user_interactions").doc(userId).collection("history").get();
    return snapshot.docs.map((d) => d.data());
  }

  // Create song ID from title + artist
  makeSongId(song) {
    const title = (song.title || song.Song_Title || "").trim().toLowerCase();
    const artist = (song.artist || song.Artist_Name || "").trim().toLowerCase();
    return title || artist ? `${title}::${artist}` : JSON.stringify(song);
  }

  // Hash string to vector contribution
  hashToVector(str, vec, offset = 0, weight = 1.0) {
    const text = (str || "").toLowerCase();
    for (let i = 0; i < text.length; i++) {
      const idx = (offset + i) % vec.length;
      vec[idx] += (text.charCodeAt(i) / 255.0) * weight;
    }
  }

  // ITEM TOWER: Create rich embedding from song metadata
  createSongEmbedding(song) {
    const vec = Array(this.embeddingDim).fill(0);

    // Text features (weighted by importance)
    this.hashToVector(song.title || song.Song_Title, vec, 0, 1.5);
    this.hashToVector(song.artist || song.Artist_Name, vec, 16, 1.5);
    this.hashToVector(song.genre || song.Genre, vec, 32, 2.0);
    this.hashToVector(song.subGenre || song.Sub_Genre, vec, 48, 1.5);
    this.hashToVector(song.language || song.Language, vec, 64, 1.0);
    this.hashToVector(song.mood || song.Mood, vec, 80, 1.8);
    this.hashToVector(song.activity || song.Activity, vec, 96, 1.5);

    // Numeric features (normalized)
    const releaseYear = parseInt(song.releaseYear || song.Release_Year) || 2020;
    vec[112] = (releaseYear - 1950) / 100; // Normalize year

    const duration = parseFloat(song.duration || song.Duration_sec) || 200;
    vec[113] = duration / 600; // Normalize duration (max ~10 min)

    // Behavioral signals (if available from listening data)
    vec[114] = parseFloat(song.completionRate || song.Completion_Rate) || 0.5;
    vec[115] = (parseFloat(song.rating || song.Rating) || 3) / 5;
    vec[116] = parseInt(song.likedFlag || song.Liked_Flag) || 0;
    vec[117] = Math.min(parseInt(song.repeatCount || song.Repeat_Count) || 0, 5) / 5;
    vec[118] = 1 - (parseInt(song.skipFlag || song.Skip_Flag) || 0); // Invert skip
    vec[119] = parseInt(song.addedToPlaylist || song.Added_To_Playlist) || 0;

    // Context features
    const hour = parseInt(song.hourOfDay || song.Hour_of_Day) || 12;
    vec[120] = Math.sin(2 * Math.PI * hour / 24); // Cyclical hour encoding
    vec[121] = Math.cos(2 * Math.PI * hour / 24);
    vec[122] = parseInt(song.weekendFlag || song.Weekend_Flag) || 0;

    // Weather/Location context
    this.hashToVector(song.weather || song.Weather, vec, 123, 0.8);
    this.hashToVector(song.location || song.Location, vec, 126, 0.5);

    return vec;
  }

  // Train item tower embeddings for all songs
  trainSongEmbeddings() {
    this.songEmbeddings = {};
    this.songs.forEach((song) => {
      const id = this.makeSongId(song);
      this.songEmbeddings[id] = this.createSongEmbedding(song);
    });
  }

  // USER TOWER: Create user embedding by weighted aggregation of listened songs
  createUserEmbedding(history) {
    const agg = Array(this.embeddingDim).fill(0);
    let totalWeight = 0;

    history.forEach((entry) => {
      const emb = this.songEmbeddings[this.makeSongId(entry)];
      if (!emb) return;

      // Weight by engagement signals
      const completionRate = parseFloat(entry.completionRate || entry.Completion_Rate) || 0.5;
      const rating = (parseFloat(entry.rating || entry.Rating) || 3) / 5;
      const liked = parseInt(entry.likedFlag || entry.Liked_Flag) || 0;
      const skipped = parseInt(entry.skipFlag || entry.Skip_Flag) || 0;
      const repeated = Math.min(parseInt(entry.repeatCount || entry.Repeat_Count) || 0, 3);

      // Calculate engagement weight
      let weight = 1.0;
      weight *= (0.5 + completionRate); // Higher completion = more weight
      weight *= (0.6 + rating * 0.8);   // Higher rating = more weight
      weight += liked * 0.5;             // Liked songs get boost
      weight += repeated * 0.3;          // Repeated songs get boost
      weight *= skipped ? 0.3 : 1.0;     // Skipped songs get penalty

      for (let i = 0; i < this.embeddingDim; i++) {
        agg[i] += emb[i] * weight;
      }
      totalWeight += weight;
    });

    if (!totalWeight) return Array(this.embeddingDim).fill(0);

    // Normalize
    const mag = Math.sqrt(agg.reduce((s, v) => s + v * v, 0)) || 1;
    return agg.map((x) => x / mag);
  }

  // Cosine similarity between two vectors
  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }

  // Generate recommendations using Two-Tower matching
  async recommendSongs(userId, limit = 10) {
    if (!this.songs.length) return [];

    if (!Object.keys(this.songEmbeddings).length) {
      this.trainSongEmbeddings();
    }

    const history = await this.getListeningHistory(userId);
    if (!history.length) return [];

    const userEmb = this.createUserEmbedding(history);

    // Score all songs against user embedding
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

    // Return top matches
    return results.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
  }
}

module.exports = MusicRecommendationSystem;
