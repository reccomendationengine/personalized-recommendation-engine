const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const csv = require('csv-parser');
const media_search = require('youtube-search-without-api-key');
const MusicRecommendationSystem = require('./musicrec.js');
const MovieRecommendationSystem = require('./movierec.js');

const app = express();
const PORT = process.env.PORT || 3000;
const userRecommendationSystems = new Map();
const userMovieSystems = new Map();

app.use(session({ secret: 'your-secret-key-change-in-production-12345', resave: true, saveUninitialized: true, cookie: { maxAge: 24 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const upload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => { const dir = path.join(__dirname, 'uploads'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); cb(null, dir); }, filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) }) });

const db = new sqlite3.Database(path.join(__dirname, 'data', 'user-demo.db'), (err) => { if (err) { console.error('Database error:', err); process.exit(1); } try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'); db.exec(schema); } catch (e) {} });

function escapeCsvField(field) { if (!field) return ''; const str = String(field); return (str.includes(',') || str.includes('"') || str.includes('\n')) ? '"' + str.replace(/"/g, '""') + '"' : str; }
function requireAuth(req, res, next) { if (req.session?.userId) next(); else req.headers.accept?.includes('text/html') ? res.redirect('/login.html') : res.status(401).json({ error: 'authentication required' }); }

app.get('/health', (req, res) => res.json({status: 'ok'}));
app.get('/api/current-user', requireAuth, (req, res) => res.json({ userId: req.session.userId, username: req.session.username, email: req.session.email }));

app.post('/login', (req, res) => {
	const { email, password } = req.body || {};
	if (!email || !password) return res.status(400).json({ error: 'email and password required' });
	const stmt = db.prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
	stmt.get(email, (err, user) => {
		if (err) return res.status(500).json({ error: 'internal error' });
		if (!user) return res.status(400).json({ error: 'invalid credentials' });
		bcrypt.compare(password, user.password_hash, (bcryptErr, isValid) => {
			if (bcryptErr || !isValid) return res.status(400).json({ error: 'invalid credentials' });
			req.session.userId = user.id; req.session.username = user.username; req.session.email = user.email;
			req.headers['content-type']?.includes('application/x-www-form-urlencoded') ? res.redirect('/dashboard.html') : res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
		});
	});
	stmt.finalize();
});

app.post('/signup', (req, res) => {
	const { username, email, password } = req.body || {};
	if (!email || !password || typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'email and password required' });
	if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return res.status(400).json({ error: 'password must be at least 6 characters with uppercase, lowercase, number, and special character' });
	bcrypt.hash(password, 10, (hashErr, passwordHash) => {
		if (hashErr) return res.status(500).json({ error: 'internal error' });
		const stmt = db.prepare('INSERT INTO users (username, email, password_hash, date_of_birth, phone_number) VALUES (?, ?, ?, ?, ?)');
		stmt.run(username || null, email, passwordHash, req.body.dateOfBirth || null, req.body.phoneNumber || null, function (err) {
			if (err) return res.status(err.message?.includes('UNIQUE') ? 400 : 500).json({ error: err.message?.includes('UNIQUE') ? 'email already registered' : 'failed to create user' });
			req.headers['content-type']?.includes('application/x-www-form-urlencoded') ? res.redirect('/login.html') : res.json({ success: true, id: this.lastID, email });
		});
		stmt.finalize();
	});
});

app.post('/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('connect.sid'); req.headers['content-type']?.includes('application/x-www-form-urlencoded') ? res.redirect('/login.html') : res.json({ success: true }); }); });
app.get('/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('connect.sid'); res.redirect('/login.html'); }); });
app.get('/dashboard.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/music-recommendations.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html')));
app.get('/movie-recommendations.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'movie-recommendations.html')));

app.post('/api/upload-listening-history', requireAuth, upload.single('historyFile'), (req, res) => {
	if (!req.file || !req.session.userId) return res.status(400).json({ error: 'No file uploaded' });
	const userId = req.session.userId;
	const historyData = [];
	fs.createReadStream(req.file.path).pipe(csv()).on('data', (row) => historyData.push(row)).on('end', () => {
		try {
			const recSystem = new MusicRecommendationSystem();
			const csvHeader = 'User_ID,Session_ID,Date,Time,Day_of_Week,Song_Title,Artist_Name,Genre,Sub_Genre,Language,Release_Year,Duration_sec,Listen_Duration_sec,Completion_Rate,Skip_Flag,Repeat_Count,Liked_Flag,Added_To_Playlist,Rating,Mood,Activity,Device,Location,Weather,Recommended_By_System,Recommendation_Source,Previously_Listened,User_Action,Next_Song_Genre,Hour_of_Day,Weekend_Flag,Cumulative_Listening_Minutes';
			const csvRows = historyData.map(row => [userId.toString(), row.Session_ID || '', row.Date || '', row.Time || '', row.Day_of_Week || '', row.Song_Title || row['Song Title'] || '', row.Artist_Name || row['Artist Name'] || row.Artist || '', row.Genre || row.genre || '', row.Sub_Genre || row['Sub Genre'] || '', row.Language || row.language || '', row.Release_Year || row['Release Year'] || row.year || '', row.Duration_sec || row['Duration (sec)'] || row.duration || '', row.Listen_Duration_sec || row['Listen Duration (sec)'] || '', row.Completion_Rate || row.completion_rate || row.CompletionRate || '', row.Skip_Flag || row.skip_flag || row.Skipped || '', row.Repeat_Count || row.repeat_count || '', row.Liked_Flag || row.liked_flag || row.Liked || '', row.Added_To_Playlist || row.added_to_playlist || '', row.Rating || row.rating || '', row.Mood || row.mood || '', row.Activity || row.activity || '', row.Device || row.device || '', row.Location || row.location || '', row.Weather || row.weather || '', row.Recommended_By_System || '', row.Recommendation_Source || '', row.Previously_Listened || row.previously_listened || '', row.User_Action || '', row.Next_Song_Genre || '', row.Hour_of_Day || row.Hour || row.hour || '', row.Weekend_Flag || row.weekend || '', row.Cumulative_Listening_Minutes || ''].map(escapeCsvField).join(','));
			recSystem.loadData(csvHeader + '\n' + csvRows.join('\n'));
			if (recSystem.userHistory.length === 0) throw new Error('No data loaded');
			const userIdStr = recSystem.userHistory[0]?.User_ID || userId.toString();
			recSystem.analyzeUserPatterns(userIdStr);
			recSystem.initializeTwoTowerModel();
			userRecommendationSystems.set(userId, recSystem);
			res.json({ success: true, message: 'Listening history uploaded successfully', userId, historyRecords: historyData.length });
		} catch (error) {
			res.status(500).json({ error: 'Failed to process file', details: error.message });
		}
	}).on('error', (err) => res.status(500).json({ error: 'Failed to read CSV file', details: err.message }));
});

app.get('/api/recommendations-with-youtube/:userId', requireAuth, (req, res) => {
	const userId = parseInt(req.params.userId);
	const recSystem = userRecommendationSystems.get(userId);
	if (!recSystem) return res.json({ recommendations: [], hasMore: false, message: 'No recommendation system found. Please upload your listening history first.' });
	try {
		const dataUserId = recSystem.userHistory[0]?.User_ID || userId.toString();
		const allRecommendations = recSystem.getHybridRecommendations(dataUserId, { hour: new Date().getHours(), activity: null, mood: null }, 50);
		if (allRecommendations.length === 0) return res.json({ recommendations: [], hasMore: false });
		const allScores = allRecommendations.map(r => r.score || 0);
		const maxScore = Math.max(...allScores) || 1;
		const minScore = Math.min(...allScores) || 0;
		const scoreRange = maxScore - minScore || 1;
		const formattedRecs = allRecommendations.map(rec => {
			const normalizedScore = scoreRange > 0 ? (rec.score - minScore) / scoreRange : 0;
			const percentage = Math.min(normalizedScore * 100, 100);
			if (percentage < 1.0) return null;
			let matchLevel = 'maylike', matchLevelText = 'You May Like';
			if (percentage >= 80) { matchLevel = 'highly'; matchLevelText = 'Highly Recommended'; } else if (percentage >= 50) { matchLevel = 'moderate'; matchLevelText = 'Moderately Recommended'; }
			return { id: null, title: rec.title, artist: rec.artist, album: rec.album || null, genre: rec.genre || 'Unknown', year: rec.releaseYear || null, duration: rec.duration || null, popularity_score: rec.avgRating || 0.5, similarity_score: normalizedScore, matchLevel, matchLevelText, explanation: `Based on your ${rec.genre || 'music'} preferences, this track has a ${percentage.toFixed(1)}% compatibility.`, youtube: null };
		}).filter(rec => rec !== null);
		res.json({ recommendations: formattedRecs, hasMore: false, offset: 0 });
	} catch (error) {
		res.json({ recommendations: [], hasMore: false, error: error.message });
	}
});

app.get('/api/recommendations-by-category/:userId/:category', requireAuth, (req, res) => {
	const userId = parseInt(req.params.userId);
	const category = decodeURIComponent(req.params.category);
	const recSystem = userRecommendationSystems.get(userId);
	if (!recSystem) return res.json({ recommendations: [], hasMore: false, message: 'No recommendation system found.' });
	try {
		const dataUserId = recSystem.userHistory[0]?.User_ID || userId.toString();
		const allRecommendations = recSystem.getRecommendationsBy(category, dataUserId, { hour: new Date().getHours(), activity: null, mood: null }, 100);
		if (allRecommendations.length === 0) return res.json({ recommendations: [], hasMore: false });
		const allScores = allRecommendations.map(r => r.score || 0).filter(s => s > 0);
		if (allScores.length === 0) return res.json({ recommendations: [], hasMore: false });
		const maxScore = Math.max(...allScores);
		const minScore = Math.min(...allScores);
		const scoreRange = maxScore - minScore || 1;
		const formattedRecs = allRecommendations.map(rec => {
			const normalizedScore = scoreRange > 0 ? (rec.score - minScore) / scoreRange : 0;
			const percentage = Math.min(normalizedScore * 100, 100);
			if (percentage < 1.0) return null;
			let matchLevel = 'maylike', matchLevelText = 'You May Like';
			if (percentage >= 80) { matchLevel = 'highly'; matchLevelText = 'Highly Recommended'; } else if (percentage >= 50) { matchLevel = 'moderate'; matchLevelText = 'Moderately Recommended'; }
			return { id: null, title: rec.title, artist: rec.artist, album: null, genre: rec.genre || 'Unknown', year: null, duration: null, popularity_score: 0.5, similarity_score: normalizedScore, matchLevel, matchLevelText, explanation: rec.explanation || `Based on ${category} analysis`, youtube: null };
		}).filter(rec => rec !== null);
		res.json({ recommendations: formattedRecs, hasMore: false, category, offset: 0 });
	} catch (error) {
		res.status(500).json({ error: 'Failed to get category recommendations', details: error.message });
	}
});

app.get('/api/search-youtube/:query', requireAuth, async (req, res) => {
	try {
		const query = decodeURIComponent(req.params.query);
		const results = await media_search.search(`${query} official music video`);
		if (results && results.length > 0) {
			const video = results[0];
			const videoId = video.id?.videoId || video.id;
			res.json({ success: true, video: { id: videoId, title: video.title || video.snippet?.title, url: video.url || `https://www.youtube.com/watch?v=${videoId}`, thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail, duration: video.duration_raw || video.duration } });
		} else {
			res.json({ success: false, message: 'No YouTube video found' });
		}
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to search YouTube' });
	}
});

// Movie Recommendation Endpoints
app.post('/api/upload-movie-data', requireAuth, upload.single('movieFile'), (req, res) => {
	if (!req.file || !req.session.userId) return res.status(400).json({ error: 'No file uploaded' });
	const userId = req.session.userId;
	try {
		const csvData = fs.readFileSync(req.file.path, 'utf8');
		const movieSystem = new MovieRecommendationSystem();
		movieSystem.loadData(csvData);
		if (movieSystem.movies.length === 0) throw new Error('No movies loaded from CSV');
		userMovieSystems.set(userId, movieSystem);
		res.json({ success: true, message: 'Movie data uploaded successfully', userId, movieCount: movieSystem.movies.length });
	} catch (error) {
		res.status(500).json({ error: 'Failed to process file', details: error.message });
	}
});

app.get('/api/movie-recommendations/:userId', requireAuth, (req, res) => {
	const userId = parseInt(req.params.userId);
	const movieSystem = userMovieSystems.get(userId);
	if (!movieSystem) return res.json({ recommendations: [], hasMore: false, message: 'No movie system found. Please upload your movie data first.' });
	try {
		const allRecommendations = movieSystem.getAllMovies(50);
		if (allRecommendations.length === 0) return res.json({ recommendations: [], hasMore: false });
		// Normalize scores
		const allScores = allRecommendations.map(r => r.score || 0.5);
		const maxScore = Math.max(...allScores) || 1;
		const minScore = Math.min(...allScores) || 0;
		const scoreRange = maxScore - minScore || 1;
		const formattedRecs = allRecommendations.map(rec => {
			const normalizedScore = scoreRange > 0 ? (rec.score - minScore) / scoreRange : 0.5;
			return {
				title: rec.title,
				year: rec.year,
				genres: rec.genres,
				genresArray: rec.genresArray,
				score: normalizedScore,
				explanation: rec.explanation
			};
		});
		res.json({ recommendations: formattedRecs, hasMore: false });
	} catch (error) {
		res.json({ recommendations: [], hasMore: false, error: error.message });
	}
});

app.get('/api/movie-recommendations-by-category/:userId/:category', requireAuth, (req, res) => {
	const userId = parseInt(req.params.userId);
	const category = decodeURIComponent(req.params.category);
	const movieSystem = userMovieSystems.get(userId);
	if (!movieSystem) return res.json({ recommendations: [], hasMore: false, message: 'No movie system found. Please upload your movie data first.' });
	try {
		const allRecommendations = movieSystem.getRecommendationsByCategory(category, 20);
		if (allRecommendations.length === 0) return res.json({ recommendations: [], hasMore: false });
		
		// Use percentile-based scoring to ensure good distribution
		// Sort by score first
		allRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));
		
		// Assign scores based on percentile position to create clear distribution
		const formattedRecs = allRecommendations.map((rec, index) => {
			const total = allRecommendations.length;
			const percentile = index / total;
			
			// Create score distribution:
			// Top 20% get 0.85-1.0 (Highly Recommended)
			// Next 40% get 0.55-0.84 (Moderately Recommended)
			// Rest get 0.3-0.54 (You May Like)
			let finalScore;
			if (percentile <= 0.2) {
				// Top 20%: 0.85 to 1.0
				finalScore = 0.85 + ((0.2 - percentile) / 0.2) * 0.15;
			} else if (percentile <= 0.6) {
				// Next 40%: 0.55 to 0.84
				finalScore = 0.55 + ((0.6 - percentile) / 0.4) * 0.29;
			} else {
				// Rest: 0.3 to 0.54
				finalScore = 0.3 + ((1.0 - percentile) / 0.4) * 0.24;
			}
			
			// Ensure score is in valid range
			finalScore = Math.max(0.3, Math.min(1.0, finalScore));
			
			// Debug logging for first few movies
			if (index < 3) {
				console.log(`Movie ${index + 1}: ${rec.title}, percentile: ${percentile.toFixed(2)}, score: ${finalScore.toFixed(2)}`);
			}
			
			return {
				title: rec.title,
				year: rec.year,
				genres: rec.genres,
				genresArray: rec.genresArray,
				score: finalScore,
				explanation: rec.explanation
			};
		});
		res.json({ recommendations: formattedRecs, hasMore: false, category });
	} catch (error) {
		res.status(500).json({ error: 'Failed to get category recommendations', details: error.message });
	}
});

function startServer(port, remainingAttempts = 3) {
	const server = app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
	server.on('error', (err) => { if (err.code === 'EADDRINUSE' && remainingAttempts > 0) { setTimeout(() => startServer(port + 1, remainingAttempts - 1), 200); } else { console.error('Server failed to start:', err); process.exit(1); } });
}
startServer(PORT, 3);
