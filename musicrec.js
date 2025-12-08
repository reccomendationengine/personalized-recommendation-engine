// musicrec.js – Two-Tower Music Recommendation System (upload-based)
// ------------------------------------------------------------------

class MusicRecommendationSystem {
  constructor(db) {
    this.db = db;

    // All songs loaded from the user's uploaded CSV
    this.songs = [];

    // Embeddings for each song, keyed by songId
    this.songEmbeddings = {};

    // (Optional cache – not strictly required, but kept for future use)
    this.userEmbeddings = {};
  }

  // -------------------------------------------------------------
  // 1. Save user listening history to Firestore
  //    Called from /api/upload-music-data and /api/upload-listening-history
  // -------------------------------------------------------------
  async saveListeningHistory(userId, records) {
    if (!this.db) {
      console.error("Firestore DB not initialized; cannot save listening history.");
      return;
    }

    const ref = this.db
      .collection("user_interactions")
      .doc(userId)
      .collection("history");

    const batch = this.db.batch();

    records.forEach((r) => {
      const doc = ref.doc();
      batch.set(doc, {
        title: r.title || r.track_name || "",
        artist: r.artist || r.artist_name || "",
        genre: r.genre || "",
        album: r.album || "",
        timestamp: new Date(),
      });
    });

    await batch.commit();
    console.log(`Saved ${records.length} listening records for ${userId}`);
  }

  // -------------------------------------------------------------
  // 2. Get user listening history from Firestore
  // -------------------------------------------------------------
  async getListeningHistory(userId) {
    if (!this.db) {
      console.error("Firestore DB not initialized; cannot read listening history.");
      return [];
    }

    const snapshot = await this.db
      .collection("user_interactions")
      .doc(userId)
      .collection("history")
      .get();

    return snapshot.docs.map((d) => d.data());
  }

  // -------------------------------------------------------------
  // Helper: build a stable song ID from title + artist (or fallbacks)
  // Used for both catalog and listening history so they match.
  // -------------------------------------------------------------
  makeSongId(obj = {}) {
    const title =
      (obj.title || obj.track_name || "").trim().toLowerCase();
    const artist =
      (obj.artist || obj.artist_name || "").trim().toLowerCase();

    if (title || artist) {
      return `${title}::${artist}`;
    }

    // Fallbacks if title/artist are missing
    return (
      obj.id ||
      obj.song_id ||
      obj.track_id ||
      obj._id ||
      JSON.stringify(obj)
    );
  }

  // -------------------------------------------------------------
  // 3. Song embedding (simple hashed text → 64-dim vector)
  // -------------------------------------------------------------
  createSongEmbedding(song) {
    const text = [
      song.title || song.track_name || "",
      song.artist || song.artist_name || "",
      song.genre || "",
      song.album || "",
    ]
      .join(" ")
      .toLowerCase();

    const vectorSize = 64;
    const vec = Array(vectorSize).fill(0);

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % vectorSize] += code / 255.0;
    }

    return vec;
  }

  // -------------------------------------------------------------
  // 4. Train "item tower" embeddings for all songs in this.songs
  //    Call this after you assign recSystem.songs in /api/upload-music-data
  // -------------------------------------------------------------
  trainSongEmbeddings() {
    console.log("Training song embeddings from uploaded CSV…");

    this.songEmbeddings = {};

    this.songs.forEach((song) => {
      const id = this.makeSongId(song);
      if (!id) return;

      // keep a copy on the song object for debugging / future use
      song._id = id;
      this.songEmbeddings[id] = this.createSongEmbedding(song);
    });

    console.log(
      `Created ${Object.keys(this.songEmbeddings).length} song embeddings.`
    );
  }

  // -------------------------------------------------------------
  // 5. Create a user embedding from listening history
  // -------------------------------------------------------------
  createUserEmbedding(listeningHistory) {
    const dim = 64;
    if (!listeningHistory || listeningHistory.length === 0) {
      return Array(dim).fill(0);
    }

    const agg = Array(dim).fill(0);
    let count = 0;

    listeningHistory.forEach((entry) => {
      const id = this.makeSongId(entry);
      const emb = this.songEmbeddings[id];

      if (!emb) return; // skip songs not in catalog

      for (let i = 0; i < dim; i++) {
        agg[i] += emb[i];
      }
      count++;
    });

    if (!count) {
      return Array(dim).fill(0);
    }

    // Normalize
    const magnitude =
      Math.sqrt(agg.reduce((sum, v) => sum + v * v, 0)) || 1;

    return agg.map((x) => x / magnitude);
  }

  // -------------------------------------------------------------
  // 6. Cosine similarity
  // -------------------------------------------------------------
  cosineSimilarity(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB) || 1;
    return dot / denom;
  }

  // -------------------------------------------------------------
  // 7. Recommend songs (flattened objects for API/front-end)
  //    Returns [{ id, title, artist, album, genre, similarity_score }, …]
  // -------------------------------------------------------------
  async recommendSongs(userId, limit = 20) {
    if (!this.songs || this.songs.length === 0) {
      console.warn("recommendSongs: no catalog songs loaded yet.");
      return [];
    }

    // Ensure embeddings exist (in case someone forgot to call trainSongEmbeddings)
    if (!Object.keys(this.songEmbeddings).length) {
      this.trainSongEmbeddings();
    }

    const history = await this.getListeningHistory(userId);

    if (!history || history.length === 0) {
      console.warn(`recommendSongs: no listening history for user ${userId}`);
      return [];
    }

    const userEmb = this.createUserEmbedding(history);
    const results = [];

    this.songs.forEach((song) => {
      const id = this.makeSongId(song);
      const emb = this.songEmbeddings[id];
      if (!emb) return;

      const score = this.cosineSimilarity(userEmb, emb);

      results.push({
        id,
        title: song.title || song.track_name || "",
        artist: song.artist || song.artist_name || "",
        album: song.album || "",
        genre: song.genre || "",
        similarity_score: score,
      });
    });

    // Highest similarity first
    results.sort((a, b) => b.similarity_score - a.similarity_score);

    return results.slice(0, limit);
  }

  // -------------------------------------------------------------
  // 8. Optional: keep initializeTwoTowerModel for compatibility
  //    (just re-trains from current this.songs; no CSV reading)
  // -------------------------------------------------------------
  async initializeTwoTowerModel() {
    if (!this.songs || this.songs.length === 0) {
      console.warn(
        "initializeTwoTowerModel called but no songs are loaded. Upload a CSV first."
      );
      return;
    }
    this.trainSongEmbeddings();
    console.log("Two-Tower model initialized from uploaded song catalog.");
  }
}

module.exports = MusicRecommendationSystem;
