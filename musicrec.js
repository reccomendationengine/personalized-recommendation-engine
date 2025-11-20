/**
 * MusicRecommendationSystem - 2-Tower Algorithm Implementation (Firestore Enabled)
 *
 * This class implements a music recommendation engine using the 2-Tower architecture:
 * 1. User Tower: Creates embeddings based on user listening patterns (fetched from Firestore)
 * 2. Item Tower: Creates embeddings for songs based on features (fetched from Firestore)
 *
 * It replaces all in-memory and SQLite data dependencies with asynchronous Firebase/Firestore calls.
 */
const { v4: uuidv4 } = require('uuid');

// Define the feature dimensions for our mock embedding space
const FEATURES = ['Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'Folk', 'HipHop', 'Dance'];

// --- Core Mathematical Helper Functions ---

/**
 * Calculates the Cosine Similarity between two vectors (used for scoring recommendations).
 * This is the core similarity function used to match User Embeddings to Item Embeddings.
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

class MusicRecommendationSystem {
    constructor(db) {
        this.db = db; // Firestore instance passed from index.js
        this.itemCatalog = new Map(); // Local cache for item metadata
        this.itemEmbeddings = new Map(); // Item Tower: Local cache for song feature embeddings
    }

    /**
     * Seeds initial content and a mock history to Firestore for the demo.
     * Collections used: 'content_metadata' and 'user_interactions/{userId}/history'
     */
    async seedMockHistory(userId) {
        if (!this.db) throw new Error("Firestore not initialized.");
        const contentRef = this.db.collection('content_metadata');
        const historyRef = this.db.collection('user_interactions').doc(userId).collection('history');

        // 1. Mock Content Catalog
        const mockContent = [
            { id: '1', title: "Bohemian Rhapsody", artist: "Queen", genre: "Rock", tags: ["Rock", "Classic"], releaseYear: 1975, duration_sec: 354 },
            { id: '2', title: "Thriller", artist: "Michael Jackson", genre: "Pop", tags: ["Pop", "Dance"], releaseYear: 1982, duration_sec: 357 },
            { id: '3', title: "So What", artist: "Miles Davis", genre: "Jazz", tags: ["Jazz", "Instrumental"], releaseYear: 1959, duration_sec: 561 },
            { id: '4', title: "Stairway to Heaven", artist: "Led Zeppelin", genre: "Rock", tags: ["Rock", "Folk"], releaseYear: 1971, duration_sec: 482 },
            { id: '5', title: "Clair de Lune", artist: "Claude Debussy", genre: "Classical", tags: ["Classical"], releaseYear: 1905, duration_sec: 285 },
            { id: '6', title: "Starboy", artist: "The Weeknd", genre: "Electronic", tags: ["Pop", "Electronic"], releaseYear: 2016, duration_sec: 230 },
            { id: '7', title: "Smooth Criminal", artist: "Michael Jackson", genre: "Pop", tags: ["Pop", "Dance"], releaseYear: 1987, duration_sec: 257 },
            { id: '8', title: "Imagine", artist: "John Lennon", genre: "Pop", tags: ["Pop", "Folk"], releaseYear: 1971, duration_sec: 187 },
        ];

        const batch = this.db.batch();
        mockContent.forEach(item => {
            this.itemCatalog.set(item.id, item);
            batch.set(contentRef.doc(item.id), item);
        });

        // 2. Mock User History (simulating a Rock/Pop preference)
        const mockHistory = [
            { contentId: '1', Song_Title: "Bohemian Rhapsody", Artist_Name: "Queen", Genre: "Rock", Liked_Flag: '1', Repeat_Count: 2, Completion_Rate: 1.0, timestamp: new Date(Date.now() - 3600000) },
            { contentId: '4', Song_Title: "Stairway to Heaven", Artist_Name: "Led Zeppelin", Genre: "Rock", Liked_Flag: '0', Repeat_Count: 1, Completion_Rate: 0.9, timestamp: new Date(Date.now() - 7200000) },
            { contentId: '2', title: "Thriller", Artist_Name: "Michael Jackson", Genre: "Pop", Liked_Flag: '1', Repeat_Count: 0, Completion_Rate: 1.0, timestamp: new Date(Date.now() - 10800000) },
            { contentId: '5', title: "Clair de Lune", Artist_Name: "Claude Debussy", Genre: "Classical", Liked_Flag: '0', Repeat_Count: 0, Completion_Rate: 0.2, timestamp: new Date(Date.now() - 14400000) },
        ];

        mockHistory.forEach(record => {
            batch.set(historyRef.doc(uuidv4()), record);
        });

        await batch.commit();
        console.log(`Firestore seeded with ${mockContent.length} items and ${mockHistory.length} history records for user ${userId}.`);
    }

    /**
     * (Item Tower) Fetches all items from Firestore and generates their embeddings.
     * This forms the Item Tower, mapping each song to a feature vector.
     */
    async initializeTwoTowerModel() {
        if (!this.db) return;
        const contentSnapshot = await this.db.collection('content_metadata').get();
        this.itemCatalog.clear();
        this.itemEmbeddings.clear();

        contentSnapshot.docs.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            this.itemCatalog.set(doc.id, item);
            const embedding = this._generateSimpleItemEmbedding(item);
            this.itemEmbeddings.set(doc.id, embedding);
        });

        console.log(`Generated embeddings for ${this.itemEmbeddings.size} items from Firestore.`);
    }

    /**
     * MOCK Item Tower: Generates a simple, deterministic embedding for an item.
     * In a real system, this would be a complex ML model trained offline.
     */
    _generateSimpleItemEmbedding(item) {
        const embedding = Array(FEATURES.length).fill(0);
        const tags = [item.genre].filter(g => g);

        tags.forEach(tag => {
            const index = FEATURES.indexOf(tag);
            if (index !== -1) {
                embedding[index] = 1.0;
            }
        });
        // Add minor noise to prevent perfect duplicates in mock data
        return embedding.map(e => e + (Math.random() * 0.05));
    }

    /**
     * (User Tower) Fetches user history from Firestore and generates a preference embedding.
     * This forms the User Tower, mapping the user's history to a preference vector.
     */
    async _generateSimpleUserEmbedding(userId) {
        if (!this.db) return Array(FEATURES.length).fill(0.1);

        // 1. Fetch user interactions from Firestore
        const historyRef = this.db.collection('user_interactions').doc(userId).collection('history');
        const historySnapshot = await historyRef.orderBy('timestamp', 'desc').limit(100).get();
        const interactions = historySnapshot.docs.map(doc => doc.data());

        // 2. Aggregate preferences into a vector
        const preferenceVector = Array(FEATURES.length).fill(0);
        let totalInteractions = 0;

        interactions.forEach(record => {
            const item = this.itemCatalog.get(record.contentId);
            if (item && item.genre) {
                let weight = 1;
                // Assign higher weight for strong positive signals
                if (record.Liked_Flag === '1') weight = 5;
                if (record.Repeat_Count > 0) weight = 3 + parseInt(record.Repeat_Count, 10) || 3;
                if (parseFloat(record.Completion_Rate) > 0.9) weight = 2;

                const index = FEATURES.indexOf(item.genre);
                if (index !== -1) {
                    preferenceVector[index] += weight;
                    totalInteractions += weight;
                }
            }
        });

        // 3. Normalize the vector (User Embedding)
        if (totalInteractions === 0) return Array(FEATURES.length).fill(0.1);

        return preferenceVector.map(p => p / totalInteractions);
    }

    /**
     * Core Recommendation Logic: Generates recommendations using the 2-Tower model (User Embedding vs Item Embeddings).
     */
    async getHybridRecommendations(userId, context, limit = 50) {
        if (this.itemEmbeddings.size === 0) {
            await this.initializeTwoTowerModel();
        }

        const userEmbedding = await this._generateSimpleUserEmbedding(userId);
        let recommendations = [];

        // Calculate similarity for every item against the user profile
        for (const [itemId, itemEmbedding] of this.itemEmbeddings.entries()) {
            const item = this.itemCatalog.get(itemId);
            if (!item) continue;

            const score = cosineSimilarity(userEmbedding, itemEmbedding);

            recommendations.push({
                ...item,
                score: score,
                title: item.title,
                artist: item.artist,
                genre: item.genre,
                releaseYear: item.releaseYear,
            });
        }

        // Sort by score and return the top N
        recommendations.sort((a, b) => b.score - a.score);

        return recommendations.slice(0, limit);
    }

    /**
     * Provides recommendations based on a specific category analysis (e.g., Top Genre).
     */
    async getRecommendationsBy(category, userId, context, limit = 100) {
        if (!this.db) return [];

        // Fetch history
        const historyRef = this.db.collection('user_interactions').doc(userId).collection('history');
        const historySnapshot = await historyRef.orderBy('timestamp', 'desc').limit(100).get();
        const interactions = historySnapshot.docs.map(doc => doc.data());

        // Simple analysis: Find the user's most listened-to genre
        const genreCounts = interactions.reduce((acc, record) => {
            const item = this.itemCatalog.get(record.contentId);
            const genre = item?.genre;
            if (genre) {
                acc[genre] = (acc[genre] || 0) + 1;
            }
            return acc;
        }, {});

        const sortedGenres = Object.entries(genreCounts).sort(([, a], [, b]) => b - a);
        const topGenre = sortedGenres.length > 0 ? sortedGenres[0][0] : null;

        if (!topGenre) return [];

        // 1. Filter songs by the top genre
        const genreRecs = Array.from(this.itemCatalog.values())
            .filter(item => item.genre === topGenre)
            .map(item => ({
                ...item,
                explanation: `Recommended because ${topGenre} is your top genre.`,
            }));

        // 2. Re-score filtered items using the User Embedding for better personalization
        const userEmbedding = await this._generateSimpleUserEmbedding(userId);
        const finalRecs = genreRecs.map(rec => {
            const itemEmbedding = this.itemEmbeddings.get(rec.id) || this._generateSimpleItemEmbedding(rec);
            const score = cosineSimilarity(userEmbedding, itemEmbedding);
            return { ...rec, score };
        });

        finalRecs.sort((a, b) => b.score - a.score);

        return finalRecs.slice(0, limit);
    }
}

module.exports = MusicRecommendationSystem;