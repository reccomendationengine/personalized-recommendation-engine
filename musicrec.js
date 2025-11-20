/**
 * MusicRecommendationSystem - 2-Tower Algorithm Implementation
 * 
 * This class implements a music recommendation engine using the 2-Tower architecture:
 * - User Tower: Creates embeddings based on user listening patterns (genre, time, mood preferences)
 * - Item Tower: Creates embeddings for songs based on features (genre, artist, performance metrics)
 * 
 * The system also supports category-based recommendations for 9 specific categories.
 */
class MusicRecommendationSystem {
    constructor() {
        this.userHistory = []; // All listening history records
        this.songEmbeddings = new Map(); // Item Tower: Song feature embeddings
        this.userEmbeddings = new Map(); // User Tower: User preference embeddings
        this.genreWeights = new Map(); // Genre preference weights for scoring
        this.artistWeights = new Map(); // Artist preference weights for scoring
    }

    /**
     * Loads and parses CSV data into userHistory array
     * @param {string} csvData - Raw CSV string with listening history
     * Converts CSV rows into structured objects with proper type conversion
     */
    loadData(csvData) {
        const lines = csvData.split('\n').slice(1); // Skip header
        this.userHistory = lines.map(line => {
            const [
                User_ID, Session_ID, Date, Time, Day_of_Week, Song_Title, Artist_Name,
                Genre, Sub_Genre, Language, Release_Year, Duration_sec, Listen_Duration_sec,
                Completion_Rate, Skip_Flag, Repeat_Count, Liked_Flag, Added_To_Playlist,
                Rating, Mood, Activity, Device, Location, Weather, Recommended_By_System,
                Recommendation_Source, Previously_Listened, User_Action, Next_Song_Genre,
                Hour_of_Day, Weekend_Flag, Cumulative_Listening_Minutes
            ] = line.split(',');

            return {
                User_ID, Session_ID, Date, Time, Day_of_Week, Song_Title, Artist_Name,
                Genre, Sub_Genre, Language, Release_Year: parseInt(Release_Year),
                Duration_sec: parseInt(Duration_sec), Listen_Duration_sec: parseInt(Listen_Duration_sec),
                Completion_Rate: parseFloat(Completion_Rate), Skip_Flag: parseInt(Skip_Flag),
                Repeat_Count: parseInt(Repeat_Count), Liked_Flag: parseInt(Liked_Flag),
                Added_To_Playlist: parseInt(Added_To_Playlist), Rating: parseFloat(Rating),
                Mood, Activity, Device, Location, Weather, 
                Recommended_By_System: parseInt(Recommended_By_System),
                Recommendation_Source, Previously_Listened: parseInt(Previously_Listened),
                User_Action, Next_Song_Genre, Hour_of_Day: parseInt(Hour_of_Day),
                Weekend_Flag: parseInt(Weekend_Flag),
                Cumulative_Listening_Minutes: parseInt(Cumulative_Listening_Minutes)
            };
        }).filter(record => record.Song_Title); // Remove empty records
    }

    /**
     * Analyzes user patterns to calculate genre and artist weights
     * These weights are used in the 2-Tower algorithm for scoring recommendations
     * @param {string} userId - User ID to analyze
     */
    analyzeUserPatterns(userId = 'U001') {
        const userSessions = this.userHistory.filter(session => session.User_ID === userId);
        this.analyzeGenrePreferences(userSessions);
        this.analyzeArtistPreferences(userSessions);
    }

    /**
     * Calculates genre preference weights based on listening frequency, ratings, and engagement
     * Higher weights = user prefers this genre more
     * Used in User Tower embedding creation
     */
    analyzeGenrePreferences(sessions) {
        const genreStats = {};
        sessions.forEach(session => {
            const genre = session.Genre;
            if (!genreStats[genre]) {
                genreStats[genre] = {
                    count: 0,
                    totalCompletion: 0,
                    totalRating: 0,
                    likes: 0,
                    skips: 0
                };
            }
            
            genreStats[genre].count++;
            genreStats[genre].totalCompletion += session.Completion_Rate;
            genreStats[genre].totalRating += session.Rating;
            genreStats[genre].likes += session.Liked_Flag;
            genreStats[genre].skips += session.Skip_Flag;
        });

        // Calculate weights: completion (30%) + rating (30%) + likes (40%) - skips (20%)
        Object.keys(genreStats).forEach(genre => {
            const stats = genreStats[genre];
            const weight = (
                (stats.totalCompletion / stats.count) * 0.3 +
                (stats.totalRating / stats.count) * 0.3 +
                (stats.likes / stats.count) * 0.4 -
                (stats.skips / stats.count) * 0.2
            );
            this.genreWeights.set(genre, weight);
        });
    }

    /**
     * Calculates artist preference weights based on ratings, likes, and completion rates
     * Higher weights = user prefers this artist more
     * Used in User Tower embedding creation
     */
    analyzeArtistPreferences(sessions) {
        const artistStats = {};
        sessions.forEach(session => {
            const artist = session.Artist_Name;
            if (!artistStats[artist]) {
                artistStats[artist] = {
                    count: 0,
                    totalRating: 0,
                    likes: 0,
                    completionRate: 0
                };
            }
            
            artistStats[artist].count++;
            artistStats[artist].totalRating += session.Rating;
            artistStats[artist].likes += session.Liked_Flag;
            artistStats[artist].completionRate += session.Completion_Rate;
        });

        // Calculate weights: rating (40%) + likes (40%) + completion (20%)
        Object.keys(artistStats).forEach(artist => {
            const stats = artistStats[artist];
            const weight = (
                (stats.totalRating / stats.count) * 0.4 +
                (stats.likes / stats.count) * 0.4 +
                (stats.completionRate / stats.count) * 0.2
            );
            this.artistWeights.set(artist, weight);
        });
    }

    /**
     * Initializes the 2-Tower Model
     * Creates both User Tower (user embeddings) and Item Tower (song embeddings)
     * Must be called after loadData() and analyzeUserPatterns()
     */
    initializeTwoTowerModel() {
        this.initializeUserTower();
        this.initializeItemTower();
    }

    /**
     * User Tower: Creates embeddings for each user based on their listening patterns
     * Embeddings include: genre preferences, time preferences, activity preferences, mood preferences, behavior patterns
     * These embeddings are used to match users with similar songs
     */
    initializeUserTower() {
        const users = [...new Set(this.userHistory.map(session => session.User_ID))];
        
        users.forEach(userId => {
            const userSessions = this.userHistory.filter(s => s.User_ID === userId);
            
            const userEmbedding = {
                genreVector: this.createGenreVector(userSessions), // Weighted genre preferences
                timeVector: this.createTimeVector(userSessions), // Hour-of-day listening patterns
                activityVector: this.createActivityVector(userSessions), // Activity-based preferences
                moodVector: this.createMoodVector(userSessions), // Mood-based preferences
                behaviorVector: this.createBehaviorVector(userSessions) // Overall listening behavior
            };
            
            this.userEmbeddings.set(userId, userEmbedding);
        });
    }

    /**
     * Item Tower: Creates embeddings for each unique song based on features
     * Embeddings include: genre, artist, release year, duration, performance metrics (completion, rating, likes)
     * These embeddings are used to match songs with user preferences
     */
    initializeItemTower() {
        const uniqueSongs = [...new Set(this.userHistory.map(session => 
            `${session.Song_Title}|${session.Artist_Name}`
        ))];
        
        uniqueSongs.forEach(songKey => {
            const [title, artist] = songKey.split('|');
            const songSessions = this.userHistory.filter(s => 
                s.Song_Title === title && s.Artist_Name === artist
            );
            
            const songEmbedding = {
                genre: songSessions[0].Genre,
                subGenre: songSessions[0].Sub_Genre,
                artist: artist,
                releaseYear: songSessions[0].Release_Year,
                duration: songSessions[0].Duration_sec,
                language: songSessions[0].Language,
                avgCompletion: songSessions.reduce((sum, s) => sum + s.Completion_Rate, 0) / songSessions.length,
                avgRating: songSessions.reduce((sum, s) => sum + s.Rating, 0) / songSessions.length,
                likeRatio: songSessions.filter(s => s.Liked_Flag).length / songSessions.length,
                skipRatio: songSessions.filter(s => s.Skip_Flag).length / songSessions.length,
                commonMoods: this.getMostCommon(songSessions, 'Mood'),
                commonActivities: this.getMostCommon(songSessions, 'Activity'),
                commonTimes: this.getTimeDistribution(songSessions)
            };
            
            this.songEmbeddings.set(songKey, songEmbedding);
        });
    }

    /**
     * Creates genre preference vector for user embedding
     * Uses genreWeights to create weighted genre preferences
     */
    createGenreVector(sessions) {
        const vector = {};
        sessions.forEach(session => {
            const weight = this.genreWeights.get(session.Genre) || 0.5;
            vector[session.Genre] = (vector[session.Genre] || 0) + weight;
        });
        return this.normalizeVector(vector);
    }

    /**
     * Creates time preference vector (24-hour bins) for user embedding
     * Tracks when user listens most actively (based on completion rates)
     */
    createTimeVector(sessions) {
        const timeBins = Array(24).fill(0);
        sessions.forEach(session => {
            timeBins[session.Hour_of_Day] += session.Completion_Rate;
        });
        return this.normalizeArray(timeBins);
    }

    /**
     * Creates activity preference vector for user embedding
     * Tracks which activities correlate with higher engagement
     */
    createActivityVector(sessions) {
        const vector = {};
        sessions.forEach(session => {
            vector[session.Activity] = (vector[session.Activity] || 0) + 
                (session.Completion_Rate * (session.Liked_Flag ? 1.2 : 1));
        });
        return this.normalizeVector(vector);
    }

    /**
     * Creates mood preference vector for user embedding
     * Tracks which moods correlate with higher ratings and completion
     */
    createMoodVector(sessions) {
        const vector = {};
        sessions.forEach(session => {
            vector[session.Mood] = (vector[session.Mood] || 0) + 
                (session.Completion_Rate * session.Rating);
        });
        return this.normalizeVector(vector);
    }

    /**
     * Creates behavior vector summarizing overall listening patterns
     * Includes average completion, rating, like ratio, skip ratio, repeat ratio
     */
    createBehaviorVector(sessions) {
        return {
            avgCompletion: sessions.reduce((sum, s) => sum + s.Completion_Rate, 0) / sessions.length,
            avgRating: sessions.reduce((sum, s) => sum + s.Rating, 0) / sessions.length,
            likeRatio: sessions.filter(s => s.Liked_Flag).length / sessions.length,
            skipRatio: sessions.filter(s => s.Skip_Flag).length / sessions.length,
            repeatRatio: sessions.filter(s => s.Repeat_Count > 0).length / sessions.length
        };
    }

    /**
     * Main recommendation method using 2-Tower algorithm
     * Calculates match scores between user embedding and all song embeddings
     * Returns top K recommendations sorted by score
     * @param {string} userId - User ID
     * @param {object} context - Context (hour, mood) for contextual recommendations
     * @param {number} topK - Number of recommendations to return
     * @returns {Array} Array of recommended songs with scores
     */
    getRecommendations(userId, context = {}, topK = 10) {
        const userEmbedding = this.userEmbeddings.get(userId);
        if (!userEmbedding) return [];

        const allSongs = Array.from(this.songEmbeddings.keys());
        const scoredSongs = [];

        allSongs.forEach(songKey => {
            const songEmbedding = this.songEmbeddings.get(songKey);
            const score = this.calculateMatchScore(userEmbedding, songEmbedding, context);
            
            scoredSongs.push({
                songKey,
                title: songKey.split('|')[0],
                artist: songKey.split('|')[1],
                score,
                ...songEmbedding
            });
        });

        return scoredSongs
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Calculates match score between user embedding and song embedding
     * Score combines: genre match (40%), artist preference (20%), context match (20%), song performance (20%)
     * Higher score = better match for the user
     */
    calculateMatchScore(userEmbedding, songEmbedding, context) {
        let score = 0;
        
        // Genre matching (40% weight) - most important factor
        const genreScore = userEmbedding.genreVector[songEmbedding.genre] || 0;
        score += genreScore * 0.4;
        
        // Artist preference (20% weight)
        const artistScore = this.artistWeights.get(songEmbedding.artist) || 0.5;
        score += artistScore * 0.2;
        
        // Context matching (20% weight) - time and mood
        const contextScore = this.calculateContextScore(userEmbedding, songEmbedding, context);
        score += contextScore * 0.2;
        
        // Song performance (20% weight) - how well the song performs overall
        const performanceScore = (
            songEmbedding.avgCompletion * 0.6 +
            songEmbedding.avgRating * 0.3 +
            songEmbedding.likeRatio * 0.1
        );
        score += performanceScore * 0.2;
        
        return score;
    }

    /**
     * Calculates context-based score using time and mood preferences
     * Matches current context (hour, mood) with user's historical patterns
     */
    calculateContextScore(userEmbedding, songEmbedding, context) {
        let contextScore = 0;
        
        // Time context (50% of context score)
        if (context.hour !== undefined) {
            const timePref = userEmbedding.timeVector[context.hour] || 0;
            contextScore += timePref * 0.5;
        }
        
        // Mood context (50% of context score)
        if (context.mood && userEmbedding.moodVector[context.mood]) {
            contextScore += userEmbedding.moodVector[context.mood] * 0.5;
        }
        
        return contextScore;
    }

    /**
     * Main hybrid recommendation method (currently uses only 2-Tower)
     * Returns top K recommendations for a user
     * @param {string} userId - User ID
     * @param {object} context - Context object with hour, mood
     * @param {number} topK - Number of recommendations
     * @returns {Array} Recommended songs with scores
     */
    getHybridRecommendations(userId, context = {}, topK = 10) {
        return this.getRecommendations(userId, context, topK);
    }

    /**
     * Category-based recommendations for 9 specific categories
     * Each category has its own scoring algorithm tailored to that dimension
     * @param {string} category - Category name (genre, sub-genre, artist, mood, time of day, day of week, weekend listening, user action, listening history flags)
     * @param {string} userId - User ID
     * @param {object} context - Context object
     * @param {number} topK - Maximum number of recommendations
     * @returns {Array} Recommendations scored by category-specific algorithm
     */
    getRecommendationsBy(category, userId, context = {}, topK = 50) {
        const userSessions = this.userHistory.filter(s => s.User_ID === userId);
        if (userSessions.length === 0) return [];

        // Category-specific limits (different categories return different numbers of songs)
        const categoryLimits = {
            'genre': 30,
            'sub-genre': 25,
            'artist': 20,
            'mood': 25,
            'time of day': 15,
            'day of week': 20,
            'weekend listening': 15,
            'user action': 25,
            'listening history flags': 20
        };
        
        const actualLimit = categoryLimits[category.toLowerCase()] || topK;
        const uniqueSongs = [...new Set(this.userHistory.map(s => `${s.Song_Title}|${s.Artist_Name}`))];
        const scoredRecs = [];

        switch(category.toLowerCase()) {
            case 'genre':
                // Scores songs based on user's top genres (frequency + rating + completion)
                const genreStats = {};
                userSessions.forEach(s => {
                    const genre = s.Genre || 'Unknown';
                    if (!genreStats[genre]) {
                        genreStats[genre] = { count: 0, totalRating: 0, totalCompletion: 0 };
                    }
                    genreStats[genre].count++;
                    genreStats[genre].totalRating += s.Rating || 0;
                    genreStats[genre].totalCompletion += s.Completion_Rate || 0;
                });
                
                const topGenres = Object.entries(genreStats)
                    .map(([genre, stats]) => ({
                        genre,
                        score: (stats.count / userSessions.length) * 0.5 + 
                               (stats.totalRating / stats.count) * 0.3 +
                               (stats.totalCompletion / stats.count) * 0.2
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);

                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songGenre = songSessions[0].Genre || 'Unknown';
                    const genreMatch = topGenres.find(g => g.genre === songGenre);
                    const score = genreMatch ? genreMatch.score : (topGenres.length > 0 ? topGenres[topGenres.length - 1].score * 0.1 : 0.1);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songGenre,
                        score: Math.max(score, 0.1),
                        explanation: `Matches your ${songGenre} preferences`
                    });
                });
                break;

            case 'sub-genre':
                // Scores songs based on user's preferred sub-genres
                const subGenreStats = {};
                userSessions.forEach(s => {
                    const subGenre = s.Sub_Genre || s.Genre || 'Unknown';
                    if (!subGenreStats[subGenre]) {
                        subGenreStats[subGenre] = { count: 0, totalRating: 0 };
                    }
                    subGenreStats[subGenre].count++;
                    subGenreStats[subGenre].totalRating += s.Rating || 0;
                });
                
                const topSubGenres = Object.entries(subGenreStats)
                    .map(([subGenre, stats]) => ({
                        subGenre,
                        score: (stats.count / userSessions.length) * 0.6 + 
                               (stats.totalRating / stats.count) * 0.4
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);

                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songSubGenre = songSessions[0].Sub_Genre || songSessions[0].Genre || 'Unknown';
                    const subGenreMatch = topSubGenres.find(g => g.subGenre === songSubGenre);
                    const score = subGenreMatch ? subGenreMatch.score : (topSubGenres.length > 0 ? topSubGenres[topSubGenres.length - 1].score * 0.1 : 0.1);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songSessions[0].Genre,
                        score: Math.max(score, 0.1),
                        explanation: `Matches your ${songSubGenre} sub-genre preference`
                    });
                });
                break;

            case 'artist':
                // Scores songs based on user's preferred artists (from artistWeights)
                const artistWeights = this.artistWeights;
                const topArtists = Array.from(artistWeights.entries())
                    .map(([artist, weight]) => ({ artist, weight }))
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 10);

                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const weight = artistWeights.get(artist) || 0;
                    const artistRank = topArtists.findIndex(a => a.artist === artist);
                    const score = weight > 0 ? weight * (artistRank >= 0 ? 1.2 : 0.5) : (topArtists.length > 0 ? topArtists[topArtists.length - 1].weight * 0.1 : 0.1);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: this.userHistory.find(s => s.Song_Title === title && s.Artist_Name === artist)?.Genre || 'Unknown',
                        score: Math.max(score, 0.1),
                        explanation: `From ${artist}, one of your preferred artists`
                    });
                });
                break;

            case 'mood':
                // Scores songs based on user's mood listening patterns
                const moodStats = {};
                userSessions.forEach(s => {
                    const mood = s.Mood || 'Unknown';
                    if (!moodStats[mood]) {
                        moodStats[mood] = { count: 0, totalRating: 0, totalCompletion: 0 };
                    }
                    moodStats[mood].count++;
                    moodStats[mood].totalRating += s.Rating || 0;
                    moodStats[mood].totalCompletion += s.Completion_Rate || 0;
                });
                
                const topMoods = Object.entries(moodStats)
                    .map(([mood, stats]) => ({
                        mood,
                        score: (stats.count / userSessions.length) * 0.5 + 
                               (stats.totalRating / stats.count) * 0.3 +
                               (stats.totalCompletion / stats.count) * 0.2
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);

                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songMoods = this.getMostCommon(songSessions, 'Mood');
                    let maxScore = 0;
                    songMoods.forEach(mood => {
                        const moodMatch = topMoods.find(m => m.mood === mood);
                        if (moodMatch && moodMatch.score > maxScore) {
                            maxScore = moodMatch.score;
                        }
                    });
                    if (maxScore === 0 && topMoods.length > 0) {
                        maxScore = topMoods[topMoods.length - 1].score * 0.1;
                    }
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songSessions[0].Genre || 'Unknown',
                        score: Math.max(maxScore, 0.1),
                        explanation: `Matches your ${songMoods[0] || 'mood'} preferences`
                    });
                });
                break;

            case 'time of day':
            case 'timeofday':
                // Scores songs based on current time of day and user's historical time patterns
                const currentHour = context.hour !== undefined ? context.hour : new Date().getHours();
                const timeSlot = this.getTimeSlot(currentHour);
                
                // Get time patterns from user's listening history
                const timeStats = {};
                const timeSlotCounts = {}; // Track session counts per slot for fallback
                const timeSlots = { morning: [6,7,8,9,10], afternoon: [11,12,13,14,15], evening: [16,17,18,19], night: [20,21,22,23,0,1,2,3,4,5] };
                Object.keys(timeSlots).forEach(slot => {
                    const slotSessions = userSessions.filter(s => timeSlots[slot].includes(s.Hour_of_Day));
                    timeSlotCounts[slot] = slotSessions.length;
                    if (slotSessions.length > 0) {
                        timeStats[slot] = {
                            avgCompletion: slotSessions.reduce((sum, s) => sum + (s.Completion_Rate || 0), 0) / slotSessions.length,
                            avgRating: slotSessions.reduce((sum, s) => sum + (s.Rating || 0), 0) / slotSessions.length,
                            likedRatio: slotSessions.filter(s => s.Liked_Flag).length / slotSessions.length,
                            commonGenres: this.getMostCommon(slotSessions, 'Genre')
                        };
                    }
                });
                
                // Determine which time slot to use: current slot if available, otherwise use slot with most data
                let selectedTimeSlot = timeSlot;
                if (!timeStats[timeSlot] || Object.keys(timeStats).length === 0) {
                    // Fallback: use the time slot with the most listening history
                    const slotsWithData = Object.keys(timeSlotCounts).filter(slot => timeSlotCounts[slot] > 0);
                    if (slotsWithData.length > 0) {
                        selectedTimeSlot = slotsWithData.reduce((a, b) => 
                            timeSlotCounts[a] > timeSlotCounts[b] ? a : b
                        );
                    } else {
                        // Ultimate fallback: use overall user patterns if no time slot data exists
                        const overallGenres = this.getMostCommon(userSessions, 'Genre');
                        const overallAvgCompletion = userSessions.reduce((sum, s) => sum + (s.Completion_Rate || 0), 0) / userSessions.length;
                        const overallAvgRating = userSessions.reduce((sum, s) => sum + (s.Rating || 0), 0) / userSessions.length;
                        const overallLikedRatio = userSessions.filter(s => s.Liked_Flag).length / userSessions.length;
                        
                        uniqueSongs.forEach(songKey => {
                            const [title, artist] = songKey.split('|');
                            const songSessions = this.userHistory.filter(s => 
                                s.Song_Title === title && s.Artist_Name === artist
                            );
                            if (songSessions.length === 0) return;
                            
                            const songGenre = songSessions[0].Genre || 'Unknown';
                            const genreMatch = overallGenres.includes(songGenre);
                            let score = genreMatch ? 
                                (overallAvgCompletion * 0.5 + overallAvgRating * 0.3 + overallLikedRatio * 0.2) : 
                                (overallAvgCompletion * 0.3 + overallAvgRating * 0.2 + overallLikedRatio * 0.1) * 0.3;
                            score = Math.max(score, 0.1);
                            
                            scoredRecs.push({
                                title,
                                artist,
                                genre: songGenre,
                                score,
                                explanation: `Based on your overall listening patterns`
                            });
                        });
                        break;
                    }
                }
                
                // Use the selected time slot (current or fallback) for recommendations
                const preferredGenres = timeStats[selectedTimeSlot].commonGenres || [];
                const stats = timeStats[selectedTimeSlot];
                
                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songGenre = songSessions[0].Genre || 'Unknown';
                    const genreMatch = preferredGenres.includes(songGenre);
                    let score = genreMatch ? 
                        (stats.avgCompletion * 0.5 + stats.avgRating * 0.3 + stats.likedRatio * 0.2) : 0;
                    if (score === 0) {
                        score = (stats.avgCompletion * 0.3 + stats.avgRating * 0.2 + stats.likedRatio * 0.1) * 0.3;
                    }
                    score = Math.max(score, 0.1);
                    
                    const explanation = selectedTimeSlot === timeSlot 
                        ? `Matches your ${timeSlot} listening patterns`
                        : `Based on your ${selectedTimeSlot} listening patterns (current time slot has limited data)`;
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songGenre,
                        score,
                        explanation
                    });
                });
                break;

            case 'day of week':
            case 'dayofweek':
                // Scores songs based on which day of week user listens most
                const dayStats = {};
                userSessions.forEach(s => {
                    const day = s.Day_of_Week || 'Unknown';
                    if (!dayStats[day]) {
                        dayStats[day] = { count: 0, genres: {}, totalRating: 0 };
                    }
                    dayStats[day].count++;
                    dayStats[day].genres[s.Genre] = (dayStats[day].genres[s.Genre] || 0) + 1;
                    dayStats[day].totalRating += s.Rating || 0;
                });
                
                const topDays = Object.entries(dayStats)
                    .map(([day, stats]) => ({
                        day,
                        score: (stats.count / userSessions.length) * 0.7 + 
                               (stats.totalRating / stats.count) * 0.3
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3);

                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songDay = songSessions[0].Day_of_Week || 'Unknown';
                    const dayMatch = topDays.find(d => d.day === songDay);
                    let score = dayMatch ? dayMatch.score : 0;
                    if (score === 0 && topDays.length > 0) {
                        score = topDays[topDays.length - 1].score * 0.1;
                    }
                    score = Math.max(score, 0.1);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songSessions[0].Genre || 'Unknown',
                        score,
                        explanation: `Matches your ${songDay} listening habits`
                    });
                });
                break;

            case 'weekend listening':
            case 'weekendlistening':
                // Scores songs based on weekend vs weekday listening patterns
                const weekendSessions = userSessions.filter(s => s.Weekend_Flag === 1);
                const weekdaySessions = userSessions.filter(s => s.Weekend_Flag === 0);
                
                if (weekendSessions.length > 0) {
                    const weekendGenres = this.getMostCommon(weekendSessions, 'Genre');
                    const weekendArtists = this.getMostCommon(weekendSessions, 'Artist_Name');
                    
                    uniqueSongs.forEach(songKey => {
                        const [title, artist] = songKey.split('|');
                        const songSessions = this.userHistory.filter(s => 
                            s.Song_Title === title && s.Artist_Name === artist
                        );
                        if (songSessions.length === 0) return;
                        
                        const songGenre = songSessions[0].Genre || 'Unknown';
                        const genreMatch = weekendGenres.includes(songGenre);
                        const artistMatch = weekendArtists.includes(artist);
                        const weekendRatio = songSessions.filter(s => s.Weekend_Flag === 1).length / songSessions.length;
                        
                        let score = (genreMatch ? 0.4 : 0.1) + (artistMatch ? 0.3 : 0.05) + (weekendRatio * 0.3);
                        score = Math.max(score, 0.1);
                        
                        scoredRecs.push({
                            title,
                            artist,
                            genre: songGenre,
                            score,
                            explanation: `Matches your weekend listening preferences`
                        });
                    });
                }
                break;

            case 'user action':
            case 'useraction':
                // Scores songs based on user interactions: repeats, playlist adds, skips
                // Prefers songs that were repeated or added to playlist, avoids skipped songs
                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songGenre = songSessions[0].Genre || 'Unknown';
                    const skipRatio = songSessions.filter(s => s.Skip_Flag === 1).length / songSessions.length;
                    const repeatRatio = songSessions.filter(s => s.Repeat_Count > 0).length / songSessions.length;
                    const playlistRatio = songSessions.filter(s => s.Added_To_Playlist === 1).length / songSessions.length;
                    
                    const score = (repeatRatio * 0.4) + (playlistRatio * 0.4) + ((1 - skipRatio) * 0.2);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songGenre,
                        score: Math.max(score, 0.1),
                        explanation: `Based on your interaction patterns (repeats, playlists, skips)`
                    });
                });
                break;

            case 'listening history flags':
            case 'listeninghistoryflags':
            case 'previously listened':
            case 'previouslylistened':
                // Scores songs based on new vs previously listened music preferences
                // Adapts to whether user prefers discovering new music or listening to familiar songs
                const newSessions = userSessions.filter(s => s.Previously_Listened === 0);
                const oldSessions = userSessions.filter(s => s.Previously_Listened === 1);
                
                const newGenres = this.getMostCommon(newSessions, 'Genre');
                const oldGenres = this.getMostCommon(oldSessions, 'Genre');
                
                uniqueSongs.forEach(songKey => {
                    const [title, artist] = songKey.split('|');
                    const songSessions = this.userHistory.filter(s => 
                        s.Song_Title === title && s.Artist_Name === artist
                    );
                    if (songSessions.length === 0) return;
                    
                    const songGenre = songSessions[0].Genre || 'Unknown';
                    const previouslyListenedRatio = songSessions.filter(s => s.Previously_Listened === 1).length / songSessions.length;
                    
                    const newMusicPreference = newSessions.length / userSessions.length;
                    let score = newMusicPreference > 0.5 ? 
                        (newGenres.includes(songGenre) ? 0.7 : 0.2) * (1 - previouslyListenedRatio) :
                        (oldGenres.includes(songGenre) ? 0.7 : 0.2) * previouslyListenedRatio;
                    score = Math.max(score, 0.1);
                    
                    scoredRecs.push({
                        title,
                        artist,
                        genre: songGenre,
                        score,
                        explanation: `Based on your new vs. familiar music preferences`
                    });
                });
                break;

            default:
                return [];
        }

        // Remove duplicates and sort by score
        const uniqueRecs = new Map();
        scoredRecs.forEach(rec => {
            const key = `${rec.title}|${rec.artist}`;
            if (!uniqueRecs.has(key) || uniqueRecs.get(key).score < rec.score) {
                uniqueRecs.set(key, rec);
            }
        });

        const finalRecs = Array.from(uniqueRecs.values())
            .sort((a, b) => b.score - a.score);
        
        // Fallback scoring if all scores are 0
        if (finalRecs.length > 0 && finalRecs.every(r => r.score === 0)) {
            finalRecs.forEach(rec => {
                const songSessions = this.userHistory.filter(s => 
                    s.Song_Title === rec.title && s.Artist_Name === rec.artist
                );
                if (songSessions.length > 0) {
                    const avgRating = songSessions.reduce((sum, s) => sum + (s.Rating || 0), 0) / songSessions.length;
                    const avgCompletion = songSessions.reduce((sum, s) => sum + (s.Completion_Rate || 0), 0) / songSessions.length;
                    rec.score = (avgRating * 0.5) + (avgCompletion * 0.5);
                }
            });
            finalRecs.sort((a, b) => b.score - a.score);
        }
        
        // Ensure score variation for proper normalization
        if (finalRecs.length > 0) {
            const maxScore = Math.max(...finalRecs.map(r => r.score));
            const minScore = Math.min(...finalRecs.map(r => r.score));
            
            if (maxScore === minScore && maxScore > 0) {
                finalRecs.forEach((rec, index) => {
                    rec.score = maxScore * (1 - (index * 0.01));
                });
            } else if (maxScore === minScore && maxScore === 0) {
                finalRecs.forEach((rec, index) => {
                    rec.score = 0.1 + (0.9 * (1 - index / finalRecs.length));
                });
            }
        }
        
        return finalRecs.slice(0, actualLimit);
    }

    // Utility Methods

    /**
     * Gets most common values for a field from sessions
     * Used to identify top genres, moods, activities, etc.
     */
    getMostCommon(sessions, field) {
        const counts = {};
        sessions.forEach(session => {
            counts[session[field]] = (counts[session[field]] || 0) + 1;
        });
        
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([value]) => value);
    }

    /**
     * Gets time distribution (24-hour bins) for sessions
     * Used in song embeddings to track when songs are typically listened to
     */
    getTimeDistribution(sessions) {
        const distribution = Array(24).fill(0);
        sessions.forEach(session => {
            distribution[session.Hour_of_Day]++;
        });
        return distribution;
    }

    /**
     * Converts hour (0-23) to time slot (morning, afternoon, evening, night)
     * Used for time-based recommendations
     */
    getTimeSlot(hour) {
        if (hour >= 6 && hour <= 10) return 'morning';
        if (hour >= 11 && hour <= 15) return 'afternoon';
        if (hour >= 16 && hour <= 19) return 'evening';
        return 'night';
    }

    /**
     * Normalizes a vector (object with numeric values) to 0-1 range
     * Used to normalize preference vectors in embeddings
     */
    normalizeVector(vector) {
        const values = Object.values(vector);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;
        
        if (range === 0) return vector;
        
        const normalized = {};
        Object.keys(vector).forEach(key => {
            normalized[key] = (vector[key] - min) / range;
        });
        
        return normalized;
    }

    /**
     * Normalizes an array to 0-1 range
     * Used to normalize time vectors (24-hour bins)
     */
    normalizeArray(array) {
        const max = Math.max(...array);
        const min = Math.min(...array);
        const range = max - min;
        
        if (range === 0) return array.map(() => 0);
        
        return array.map(value => (value - min) / range);
    }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicRecommendationSystem;
}
