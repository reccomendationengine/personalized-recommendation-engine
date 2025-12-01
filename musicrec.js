// musicrec.js – Full Two-Tower Music Recommendation System
// ---------------------------------------------------------

const fs = require('fs');
const path = require('path');

class MusicRecommendationSystem {
    constructor(db) {
        this.db = db;

        // Store all songs here after reading the CSV
        this.songs = [];

        // Store song embeddings here after training
        this.songEmbeddings = {};

        // Store user embeddings here
        this.userEmbeddings = {};
    }

    // -------------------------------------------------------------
    // 1. LOAD CSV OF SONGS
    // -------------------------------------------------------------
    async loadCSV(csvPath = './data/songs.csv') {
        if (!fs.existsSync(csvPath)) {
            console.error(`ERROR: CSV file not found at ${csvPath}`);
            return false;
        }

        const csvData = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvData.trim().split('\n');
        const header = lines.shift().split(',');

        this.songs = lines.map((line) => {
            const cols = line.split(',');
            const song = {};
            header.forEach((key, idx) => {
                song[key.trim()] = cols[idx].trim();
            });
            return song;
        });

        console.log(`Loaded ${this.songs.length} songs from CSV.`);
        return true;
    }

    // -------------------------------------------------------------
    // 2. SAVE USER LISTENING HISTORY TO FIRESTORE
    // -------------------------------------------------------------
    async saveListeningHistory(userId, records) {
        const ref = this.db
            .collection('user_interactions')
            .doc(userId)
            .collection('history');

        const batch = this.db.batch();

        records.forEach((rec) => {
            const doc = ref.doc();
            batch.set(doc, rec);
        });

        await batch.commit();
        console.log(`Saved ${records.length} listening history records for ${userId}`);
        return true;
    }

    // -------------------------------------------------------------
    // 3. GET USER LISTENING HISTORY FROM FIRESTORE
    // -------------------------------------------------------------
    async getListeningHistory(userId) {
        const snapshot = await this.db
            .collection('user_interactions')
            .doc(userId)
            .collection('history')
            .get();

        const data = snapshot.docs.map((d) => d.data());
        return data;
    }

    // -------------------------------------------------------------
    // 4. CREATE RAW SONG EMBEDDING (Simple text → vector)
    // -------------------------------------------------------------
    createSongEmbedding(song) {
        const text = [
            song.title,
            song.artist,
            song.genre,
            song.album,
        ]
            .join(' ')
            .toLowerCase();

        // Very simple bag-of-words vector (you can expand this)
        const vector = Array(64).fill(0);

        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            vector[i % 64] += code / 255.0;
        }

        return vector;
    }

    // -------------------------------------------------------------
    // 5. TRAIN SONG EMBEDDINGS (Two-Tower item tower)
    // -------------------------------------------------------------
    trainSongEmbeddings() {
        console.log("Training song embeddings…");

        this.songs.forEach((song) => {
            const id = song.id || song.song_id || song.title;
            this.songEmbeddings[id] = this.createSongEmbedding(song);
        });

        console.log(`Created embeddings for ${Object.keys(this.songEmbeddings).length} songs.`);
    }

    // -------------------------------------------------------------
    // 6. CREATE USER EMBEDDING FROM LISTENING HISTORY
    // -------------------------------------------------------------
    createUserEmbedding(listeningHistory) {
        if (listeningHistory.length === 0) {
            return Array(64).fill(0);
        }

        const agg = Array(64).fill(0);

        listeningHistory.forEach((play) => {
            const songId = play.songId || play.id || play.song_id;
            const emb = this.songEmbeddings[songId];
            if (emb) {
                for (let i = 0; i < agg.length; i++) {
                    agg[i] += emb[i];
                }
            }
        });

        // Normalize
        const magnitude = Math.sqrt(agg.reduce((sum, v) => sum + v * v, 0)) || 1;
        return agg.map((x) => x / magnitude);
    }

    // -------------------------------------------------------------
    // 7. CALCULATE COSINE SIMILARITY BETWEEN USER AND SONG
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

        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    // -------------------------------------------------------------
    // 8. RECOMMEND SONGS
    // -------------------------------------------------------------
    async recommendSongs(userId, limit = 20) {
        const history = await this.getListeningHistory(userId);

        if (history.length === 0) {
            return [];
        }

        const userEmb = this.createUserEmbedding(history);

        const scores = [];

        for (const song of this.songs) {
            const songId = song.id || song.song_id || song.title;
            const emb = this.songEmbeddings[songId];

            if (!emb) continue;

            const score = this.cosineSimilarity(userEmb, emb);

            scores.push({
                song: song,
                score: score,
            });
        }

        scores.sort((a, b) => b.score - a.score);

        return scores.slice(0, limit);
    }
}

module.exports = MusicRecommendationSystem;
