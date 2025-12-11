/**
 * =============================================================================
 * TWO-TOWER MOVIE RECOMMENDATION SYSTEM
 * =============================================================================
 * 
 * Architecture Overview:
 * ----------------------
 * This implements a Two-Tower neural retrieval architecture for movie recommendations
 * using collaborative filtering signals from user ratings.
 * 
 * ITEM TOWER (Movie Embeddings):
 *   - Creates dense vector representations for each movie
 *   - Encodes: rating distribution, popularity, collaborative signals, genres
 *   - Uses users who rated highly as collaborative features
 * 
 * USER TOWER (User Embeddings):
 *   - Creates dense vector representation of user preferences
 *   - Aggregates embeddings of movies the user rated highly
 *   - Encodes rating behavior patterns (avg rating, variance)
 * 
 * MATCHING:
 *   - Computes cosine similarity between user and movie embeddings
 *   - Excludes movies the user has already rated
 *   - Returns top-k movies with highest similarity scores
 * 
 * Embedding Dimension: 64 (configurable)
 * 
 * Data Format:
 *   - Ratings CSV: userId, movieId, rating, timestamp
 *   - Movies CSV: movieId, title, genres
 * 
 * @author Recommendation Engine Team
 * =============================================================================
 */

class MovieRecommendationSystem {
  /**
   * Initialize the movie recommendation system
   * @param {Object} db - Firestore database instance (optional)
   */
  constructor(db) {
    this.db = db;                    // Firestore database reference
    this.ratings = [];               // All rating records
    this.movies = [];                // Movie metadata (titles, genres)
    this.movieEmbeddings = {};       // Map: movieId -> embedding vector
    this.userProfiles = {};          // Map: userId -> profile with ratings
    this.movieStats = {};            // Map: movieId -> statistics
    this.embeddingDim = 64;          // Embedding vector dimension
  }

  // ===========================================================================
  // DATA PROCESSING
  // ===========================================================================

  /**
   * Process ratings data from CSV upload
   * Normalizes field names and builds user/movie indices
   * 
   * @param {Array} ratingsData - Array of rating objects from CSV
   * @returns {number} Total number of ratings processed
   */
  processRatings(ratingsData) {
    // Normalize field names from various CSV formats
    this.ratings = ratingsData.map(r => ({
      userId: String(r.userId || r.user_id || r.UserID),
      movieId: String(r.movieId || r.movie_id || r.MovieID),
      rating: parseFloat(r.rating || r.Rating) || 0,
      timestamp: parseInt(r.timestamp || r.Timestamp) || Date.now()
    }));

    // Build derived data structures
    this.buildUserProfiles();
    this.buildMovieStats();
    
    return this.ratings.length;
  }

  /**
   * Process movies metadata from CSV upload
   * 
   * @param {Array} moviesData - Array of movie objects from CSV
   * @returns {number} Total number of movies processed
   */
  processMovies(moviesData) {
    this.movies = moviesData.map(m => ({
      movieId: String(m.movieId || m.movie_id || m.MovieID),
      title: m.title || m.Title || `Movie ${m.movieId}`,
      genres: m.genres || m.Genres || m.genre || '',
      year: parseInt(m.year || m.Year) || null
    }));
    
    return this.movies.length;
  }

  /**
   * Build user profiles with rating statistics
   * Computes: average rating, count, variance for each user
   */
  buildUserProfiles() {
    this.userProfiles = {};
    
    // Group ratings by user
    this.ratings.forEach(r => {
      if (!this.userProfiles[r.userId]) {
        this.userProfiles[r.userId] = {
          ratings: [],
          avgRating: 0,
          ratingCount: 0,
          ratingVariance: 0
        };
      }
      this.userProfiles[r.userId].ratings.push(r);
    });

    // Calculate statistics for each user
    Object.keys(this.userProfiles).forEach(userId => {
      const profile = this.userProfiles[userId];
      const ratingValues = profile.ratings.map(r => r.rating);
      
      profile.ratingCount = ratingValues.length;
      profile.avgRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
      
      // Variance: measures how "picky" or "generous" a user is
      const sqDiffs = ratingValues.map(r => Math.pow(r - profile.avgRating, 2));
      profile.ratingVariance = sqDiffs.reduce((a, b) => a + b, 0) / ratingValues.length;
    });
  }

  /**
   * Build movie statistics from all ratings
   * Computes: average rating, count, lists of high/low raters
   */
  buildMovieStats() {
    this.movieStats = {};
    
    // Aggregate ratings by movie
    this.ratings.forEach(r => {
      if (!this.movieStats[r.movieId]) {
        this.movieStats[r.movieId] = {
          ratings: [],
          avgRating: 0,
          ratingCount: 0,
          highRatingUsers: [],   // Users who rated 4+ (liked it)
          lowRatingUsers: []     // Users who rated 2- (disliked it)
        };
      }
      
      const stat = this.movieStats[r.movieId];
      stat.ratings.push(r.rating);
      
      // Track users by sentiment for collaborative features
      if (r.rating >= 4) {
        stat.highRatingUsers.push(r.userId);
      } else if (r.rating <= 2) {
        stat.lowRatingUsers.push(r.userId);
      }
    });

    // Calculate averages
    Object.keys(this.movieStats).forEach(movieId => {
      const stat = this.movieStats[movieId];
      stat.ratingCount = stat.ratings.length;
      stat.avgRating = stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length;
    });
  }

  // ===========================================================================
  // EMBEDDING UTILITIES
  // ===========================================================================

  /**
   * Hash a string into vector contributions
   * @param {string} str - Text to hash
   * @param {Array} vec - Target vector
   * @param {number} offset - Starting index
   * @param {number} weight - Feature importance weight
   */
  hashToVector(str, vec, offset, weight) {
    const text = String(str || '').toLowerCase();
    for (let i = 0; i < text.length && (offset + i) < vec.length; i++) {
      const idx = offset + (i % 16);
      vec[idx] += (text.charCodeAt(i) / 255.0) * weight;
    }
  }

  /**
   * Hash user ID to a deterministic value in [0, 1]
   * Used for collaborative filtering features
   * 
   * @param {string} userId - User identifier
   * @returns {number} Hashed value between 0 and 1
   */
  hashUser(userId) {
    let hash = 0;
    const str = String(userId);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;  // Convert to 32-bit integer
    }
    return (Math.abs(hash) % 1000) / 1000;
  }

  /**
   * L2 normalize a vector to unit length
   * @param {Array} vec - Vector to normalize
   * @returns {Array} Normalized vector
   */
  normalizeVector(vec) {
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map(v => v / magnitude);
  }

  // ===========================================================================
  // ITEM TOWER: MOVIE EMBEDDINGS
  // ===========================================================================

  /**
   * Create dense embedding vector for a movie
   * 
   * Feature layout (64 dimensions):
   *   [0-4]   : Rating distribution (1-5 star bins)
   *   [5-9]   : Statistical features (avg, popularity, ratios)
   *   [10-29] : Collaborative signals (hashed high-rating users)
   *   [30-31] : Reserved
   *   [32-47] : Genre hash embedding
   *   [48-49] : Temporal features (activity span, recency)
   *   [50-55] : Reserved
   *   [56-63] : Movie ID hash (cold-start regularization)
   * 
   * @param {string} movieId - Movie identifier
   * @returns {Array} 64-dimensional embedding vector
   */
  createMovieEmbedding(movieId) {
    const vec = new Array(this.embeddingDim).fill(0);
    const stat = this.movieStats[movieId];
    
    if (!stat) return vec;

    // Rating distribution histogram (normalized)
    const ratings = stat.ratings;
    const bins = [0, 0, 0, 0, 0];  // 1-5 star counts
    ratings.forEach(r => {
      const binIdx = Math.min(Math.floor(r) - 1, 4);
      if (binIdx >= 0) bins[binIdx]++;
    });
    const total = ratings.length || 1;
    for (let i = 0; i < 5; i++) {
      vec[i] = bins[i] / total;
    }

    // Statistical features
    vec[5] = stat.avgRating / 5;                           // Normalized average
    vec[6] = Math.min(stat.ratingCount / 1000, 1);        // Popularity (capped)
    vec[7] = Math.sqrt(stat.ratingCount) / 100;           // Log-like popularity
    vec[8] = stat.highRatingUsers.length / total;         // Like ratio
    vec[9] = 1 - (stat.lowRatingUsers.length / total);    // Inverse dislike ratio

    // Collaborative signals: encode users who liked this movie
    stat.highRatingUsers.slice(0, 20).forEach((userId, idx) => {
      vec[10 + idx] = this.hashUser(userId);
    });

    // Genre embedding from metadata
    const movie = this.movies.find(m => m.movieId === movieId);
    if (movie && movie.genres) {
      this.hashToVector(movie.genres, vec, 32, 1.0);
    }

    // Temporal features
    const movieRatings = this.ratings.filter(r => r.movieId === movieId);
    if (movieRatings.length > 0) {
      const timestamps = movieRatings.map(r => r.timestamp);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const timeSpanYears = (maxTime - minTime) / (1000 * 60 * 60 * 24 * 365);
      vec[48] = Math.min(timeSpanYears / 10, 1);  // Activity span
      
      // Recent activity ratio
      const now = Date.now() / 1000;
      const oneYearAgo = now - (365 * 24 * 60 * 60);
      const recentRatings = movieRatings.filter(r => r.timestamp > oneYearAgo);
      vec[49] = recentRatings.length / movieRatings.length;
    }

    // Movie ID hash for cold-start regularization
    this.hashToVector(movieId, vec, 56, 0.5);

    return vec;
  }

  // ===========================================================================
  // USER TOWER: USER EMBEDDINGS
  // ===========================================================================

  /**
   * Create dense embedding vector for a user
   * 
   * Feature layout (64 dimensions):
   *   [0-4]   : Rating behavior (avg, variance, activity, tendencies)
   *   [5-31]  : Aggregated embeddings of liked movies (weighted)
   *   [32-39] : Anti-pattern from disliked movies
   *   [40-47] : Reserved
   *   [48-55] : Genre preferences (avg rating per genre)
   *   [56-63] : Reserved
   * 
   * @param {string} userId - User identifier
   * @returns {Array} Normalized 64-dimensional embedding vector
   */
  createUserEmbedding(userId) {
    const vec = new Array(this.embeddingDim).fill(0);
    const profile = this.userProfiles[userId];
    
    if (!profile || profile.ratings.length === 0) return vec;

    // User rating behavior features
    vec[0] = profile.avgRating / 5;                        // Rating generosity
    vec[1] = Math.sqrt(profile.ratingVariance) / 2;        // Rating consistency
    vec[2] = Math.min(profile.ratingCount / 500, 1);       // Activity level
    vec[3] = profile.ratings.filter(r => r.rating >= 4).length / profile.ratingCount;  // % likes
    vec[4] = profile.ratings.filter(r => r.rating <= 2).length / profile.ratingCount;  // % dislikes

    // Aggregate embeddings of highly-rated movies
    const likedMovies = profile.ratings
      .filter(r => r.rating >= 4)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30);

    let totalWeight = 0;
    likedMovies.forEach(r => {
      const movieEmb = this.movieEmbeddings[r.movieId];
      if (!movieEmb) return;
      
      const weight = (r.rating - 3) / 2;  // 4-star = 0.5, 5-star = 1.0
      for (let i = 0; i < this.embeddingDim; i++) {
        vec[i] += movieEmb[i] * weight;
      }
      totalWeight += weight;
    });

    // Normalize aggregated portion
    if (totalWeight > 0) {
      for (let i = 5; i < this.embeddingDim; i++) {
        vec[i] /= totalWeight;
      }
    }

    // Anti-pattern: subtract patterns from disliked movies
    const dislikedMovies = profile.ratings
      .filter(r => r.rating <= 2)
      .slice(0, 10);

    dislikedMovies.forEach(r => {
      const movieEmb = this.movieEmbeddings[r.movieId];
      if (!movieEmb) return;
      
      for (let i = 32; i < 40 && i < this.embeddingDim; i++) {
        vec[i] -= movieEmb[i] * 0.3;  // Subtract with lower weight
      }
    });

    // Genre preferences: average rating per genre
    const genreScores = {};
    profile.ratings.forEach(r => {
      const movie = this.movies.find(m => m.movieId === r.movieId);
      if (movie && movie.genres) {
        movie.genres.split('|').forEach(g => {
          if (!genreScores[g]) genreScores[g] = { sum: 0, count: 0 };
          genreScores[g].sum += r.rating;
          genreScores[g].count++;
        });
      }
    });

    Object.entries(genreScores).forEach(([genre, data], idx) => {
      if (idx < 8) {
        vec[48 + idx] = (data.sum / data.count) / 5;
      }
    });

    return this.normalizeVector(vec);
  }

  // ===========================================================================
  // TRAINING
  // ===========================================================================

  /**
   * Train embeddings for all movies in the dataset
   * Must be called after processRatings()
   * 
   * @returns {number} Number of movie embeddings created
   */
  trainMovieEmbeddings() {
    this.movieEmbeddings = {};
    
    const movieIds = [...new Set(this.ratings.map(r => r.movieId))];
    movieIds.forEach(movieId => {
      this.movieEmbeddings[movieId] = this.createMovieEmbedding(movieId);
    });
    
    console.log(`Trained embeddings for ${movieIds.length} movies`);
    return movieIds.length;
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
    if (!a || !b || a.length !== b.length) return 0;
    
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }

  /**
   * Predict rating based on embedding similarity
   * 
   * @param {Array} userEmb - User embedding
   * @param {Array} movieEmb - Movie embedding
   * @param {Object} movieStat - Movie statistics
   * @returns {string} Predicted rating (1.0 - 5.0)
   */
  predictRating(userEmb, movieEmb, movieStat) {
    const similarity = this.cosineSimilarity(userEmb, movieEmb);
    const baseRating = movieStat?.avgRating || 3;
    
    // Adjust prediction based on similarity
    const predicted = baseRating + (similarity - 0.5) * 2;
    return Math.max(1, Math.min(5, predicted)).toFixed(1);
  }

  // ===========================================================================
  // RECOMMENDATION GENERATION
  // ===========================================================================

  /**
   * Generate personalized movie recommendations for a user
   * 
   * Algorithm:
   * 1. Get list of movies user has already rated (to exclude)
   * 2. Create user embedding from their rating history
   * 3. Score all unrated movies using cosine similarity
   * 4. Return top-k highest scoring movies
   * 
   * @param {string} userId - User to generate recommendations for
   * @param {number} limit - Maximum recommendations to return (default: 20)
   * @returns {Array} Sorted array of movie recommendations
   */
  getRecommendations(userId, limit = 20) {
    const userProfile = this.userProfiles[userId];
    
    // Get movies to exclude (already rated)
    const ratedMovieIds = new Set(
      userProfile ? userProfile.ratings.map(r => r.movieId) : []
    );

    // Create user embedding
    const userEmb = this.createUserEmbedding(userId);
    
    // Score all unrated movies
    const candidates = Object.keys(this.movieEmbeddings)
      .filter(movieId => !ratedMovieIds.has(movieId))
      .map(movieId => {
        const movieEmb = this.movieEmbeddings[movieId];
        const similarity = this.cosineSimilarity(userEmb, movieEmb);
        
        // Get movie metadata
        const movie = this.movies.find(m => m.movieId === movieId);
        const stat = this.movieStats[movieId];
        
        return {
          movieId,
          title: movie?.title || `Movie ${movieId}`,
          genres: movie?.genres || 'Unknown',
          year: movie?.year || null,
          avgRating: stat?.avgRating?.toFixed(2) || 'N/A',
          ratingCount: stat?.ratingCount || 0,
          similarity_score: similarity,
          predicted_rating: this.predictRating(userEmb, movieEmb, stat)
        };
      });

    // Sort by similarity and return top results
    return candidates
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  /**
   * Save recommendation metadata to Firestore
   * @param {string} userId - User identifier
   * @returns {boolean} Success status
   */
  async saveToFirestore(userId) {
    if (!this.db) {
      console.warn('Firestore not available');
      return false;
    }

    try {
      const ref = this.db.collection('movie_recommendations').doc(userId);
      await ref.set({
        ratingsCount: this.ratings.length,
        moviesCount: this.movies.length,
        lastUpdated: new Date(),
        userProfile: this.userProfiles[userId] ? {
          avgRating: this.userProfiles[userId].avgRating,
          ratingCount: this.userProfiles[userId].ratingCount
        } : null
      });
      return true;
    } catch (error) {
      console.error('Firestore save error:', error);
      return false;
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get statistics about the loaded dataset
   * @returns {Object} Dataset statistics
   */
  getStats() {
    const uniqueUsers = Object.keys(this.userProfiles).length;
    const uniqueMovies = Object.keys(this.movieStats).length;
    
    return {
      totalRatings: this.ratings.length,
      uniqueUsers,
      uniqueMovies,
      moviesWithMetadata: this.movies.length,
      avgRatingsPerUser: uniqueUsers ? (this.ratings.length / uniqueUsers).toFixed(1) : 0,
      avgRatingsPerMovie: uniqueMovies ? (this.ratings.length / uniqueMovies).toFixed(1) : 0
    };
  }
}

module.exports = MovieRecommendationSystem;
