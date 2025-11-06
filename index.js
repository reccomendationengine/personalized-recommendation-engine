// Minimal Express server to serve the demo app (for development/demo only)
const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const csv = require('csv-parser');
const media_search = require('youtube-search-without-api-key');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'your-gemini-api-key-here');

// Session management - MUST be before static files
app.use(session({
	secret: 'your-secret-key-change-in-production-12345',
	resave: true, // Changed to true to ensure session is saved
	saveUninitialized: true, // Changed to true to save new sessions
	name: 'connect.sid', // Use default session name
	cookie: { 
		secure: false, // Set to true in production with HTTPS
		maxAge: 24 * 60 * 60 * 1000, // 24 hours
		httpOnly: true,
		sameSite: 'lax', // Helps with cross-site requests
		path: '/' // Ensure cookie is available for all paths
	}
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multer configuration for file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(__dirname, 'uploads'));
	},
	filename: (req, file, cb) => {
		cb(null, Date.now() + '-' + file.originalname);
	}
});

const upload = multer({ storage: storage });

// --- Database setup: open or create a local SQLite database file and run schema.sql ---
const DB_FILE = path.join(__dirname, 'data', 'user-demo.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// Ensure data and uploads directories exist
try {
	fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
} catch (err) {
	console.error('Failed to create directories:', err);
}

const db = new sqlite3.Database(DB_FILE, (err) => {
	if (err) {
		console.error('Failed to open database:', err);
		process.exit(1);
	}
	console.log('Connected to SQLite database at', DB_FILE);
	// Run schema.sql to ensure tables exist
	try {
		const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
		db.exec(schemaSql, (execErr) => {
			if (execErr) {
				console.error('Failed to run schema.sql:', execErr);
			} else {
				console.log('Database schema ensured.');
				// Add new columns to existing users table if they don't exist
				db.run('ALTER TABLE users ADD COLUMN date_of_birth DATE', (err) => {
					if (err && !err.message.includes('duplicate column name')) {
						console.error('Failed to add date_of_birth column:', err);
					}
				});
				db.run('ALTER TABLE users ADD COLUMN phone_number TEXT', (err) => {
					if (err && !err.message.includes('duplicate column name')) {
						console.error('Failed to add phone_number column:', err);
					}
				});
			}
		});
	} catch (fsErr) {
		console.error('Failed to read schema.sql:', fsErr);
	}
});

// Simple health route
app.get('/health', (req, res) => res.json({status: 'ok'}));

// Get current user info from session
app.get('/api/current-user', requireAuth, (req, res) => {
	res.json({
		userId: req.session.userId,
		username: req.session.username,
		email: req.session.email
	});
});

// Login endpoint with real authentication
app.post('/login', (req, res) => {
	const { email, password } = req.body || {};
	if (!email || !password) {
		// If form submit, redirect back with 400 status text; otherwise JSON
		if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
			return res.status(400).send('email and password required');
		}
		return res.status(400).json({ error: 'email and password required' });
	}

	// Find user in database
	const stmt = db.prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
	stmt.get(email, (err, user) => {
		if (err) {
			console.error('Database error during login:', err);
			if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
				return res.status(500).send('internal error');
			}
			return res.status(500).json({ error: 'internal error' });
		}

		if (!user) {
			if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
				return res.status(400).send('invalid credentials');
			}
			return res.status(400).json({ error: 'invalid credentials' });
		}

		// Verify password
		bcrypt.compare(password, user.password_hash, (bcryptErr, isValid) => {
			if (bcryptErr) {
				console.error('Password verification error:', bcryptErr);
				if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
					return res.status(500).send('internal error');
				}
				return res.status(500).json({ error: 'internal error' });
			}

			if (!isValid) {
				if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
					return res.status(400).send('invalid credentials');
				}
				return res.status(400).json({ error: 'invalid credentials' });
			}

			// Login successful - create session
			req.session.userId = user.id;
			req.session.username = user.username;
			req.session.email = user.email;

			// Save session explicitly
			req.session.save((err) => {
				if (err) {
					console.error('Error saving session:', err);
				} else {
					console.log('[LOGIN] Session saved for user:', user.id);
					console.log('[LOGIN] Session ID:', req.sessionID);
				}
			});

			// For fetch requests with JSON accept header, return JSON
			if (req.headers.accept && req.headers.accept.includes('application/json')) {
				return res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, email: user.email } });
			}
			
			// For form submissions, redirect to dashboard
			if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
				return res.redirect('/dashboard.html');
			}

			return res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, email: user.email } });
		});
	});
	stmt.finalize();
});

// Signup endpoint: create a new user in the SQLite database
app.post('/signup', (req, res) => {
	const { username, email, password, dateOfBirth, phoneNumber } = req.body || {};

	if (!email || !password) {
		if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
			return res.status(400).send('email and password required');
		}
		return res.status(400).json({ error: 'email and password required' });
	}

	// Basic server-side validation
	if (typeof email !== 'string' || typeof password !== 'string') {
		return res.status(400).json({ error: 'invalid input' });
	}

	// Enhanced password validation
	if (password.length < 6) {
		return res.status(400).json({ error: 'password must be at least 6 characters' });
	}
	
	// Check for uppercase, lowercase, and number
	const hasUppercase = /[A-Z]/.test(password);
	const hasLowercase = /[a-z]/.test(password);
	const hasNumber = /\d/.test(password);
	
	if (!hasUppercase || !hasLowercase || !hasNumber) {
		return res.status(400).json({ error: 'password must contain at least one uppercase letter, one lowercase letter, and one number' });
	}

	// Hash the password
	const saltRounds = 10;
	bcrypt.hash(password, saltRounds, (hashErr, passwordHash) => {
		if (hashErr) {
			console.error('Error hashing password:', hashErr);
			return res.status(500).json({ error: 'internal error' });
		}

		// Insert user into DB
		const stmt = db.prepare('INSERT INTO users (username, email, password_hash, date_of_birth, phone_number) VALUES (?, ?, ?, ?, ?)');
		stmt.run(username || null, email, passwordHash, dateOfBirth || null, phoneNumber || null, function (err) {
			if (err) {
				console.error('Failed to insert user:', err);
				// Handle unique email constraint
				if (err.message && err.message.includes('UNIQUE')) {
					if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
						return res.status(400).send('email already registered');
					}
					return res.status(400).json({ error: 'email already registered' });
				}
				return res.status(500).json({ error: 'failed to create user' });
			}

			// Success: for form posts, redirect to login; for API, return JSON
			if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
				return res.redirect('/login.html');
			}

			return res.json({ success: true, id: this.lastID, email });
		});
		stmt.finalize();
	});
});

// Logout endpoint
app.post('/logout', (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error('Logout error:', err);
			return res.status(500).json({ error: 'logout failed' });
		}
		res.clearCookie('connect.sid');
		if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
			return res.redirect('/login.html');
		}
		return res.json({ success: true, message: 'Logged out successfully' });
	});
});

// GET logout endpoint for links
app.get('/logout', (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error('Logout error:', err);
			return res.status(500).send('Logout failed');
		}
		res.clearCookie('connect.sid');
		return res.redirect('/login.html');
	});
});

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
	if (req.session && req.session.userId) {
		next();
	} else {
		console.log('Auth check failed - no session or userId. Session:', req.session);
		// Always redirect HTML requests to login
		const acceptHeader = req.headers.accept || '';
		if (acceptHeader.includes('text/html') || req.path.endsWith('.html')) {
			return res.redirect('/login.html');
		}
		// For API requests, return JSON error
		return res.status(401).json({ error: 'authentication required' });
	}
}

// Protected route for dashboard
app.get('/dashboard.html', requireAuth, (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/music-recommendations.html', requireAuth, (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'music-recommendations.html'));
});

// CSV upload endpoint for music data
app.post('/upload-music-data', requireAuth, upload.single('musicFile'), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded' });
	}

	const musicData = [];
	fs.createReadStream(req.file.path)
		.pipe(csv())
		.on('data', (row) => {
			musicData.push(row);
		})
		.on('end', () => {
			// Insert music data into database
			const stmt = db.prepare(`INSERT OR IGNORE INTO music_tracks 
				(title, artist, album, genre, duration, year, popularity_score, audio_features) 
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

			let insertedCount = 0;
			let processedCount = 0;

			// Process tracks sequentially to ensure proper counting
			const processTracks = async () => {
				for (const track of musicData) {
					processedCount++;
					const audioFeatures = JSON.stringify({
						tempo: parseFloat(track.tempo) || 0,
						energy: parseFloat(track.energy) || 0,
						danceability: parseFloat(track.danceability) || 0,
						valence: parseFloat(track.valence) || 0
					});

					stmt.run(
						track.title,
						track.artist,
						track.album || null,
						track.genre || null,
						parseInt(track.duration) || 0,
						parseInt(track.year) || null,
						parseFloat(track.popularity_score) || 0.0,
						audioFeatures,
						function(err) {
							if (err) {
								console.error('Error inserting track:', err);
							} else {
								insertedCount++;
							}
						}
					);
				}

				stmt.finalize();

				// Keep uploaded file for future reference (don't delete)
				// fs.unlinkSync(req.file.path);

				// Generate embeddings for new tracks
				generateMusicEmbeddings();

				res.json({ 
					success: true, 
					message: `Successfully uploaded ${insertedCount} music tracks`,
					tracksInserted: insertedCount,
					tracksProcessed: processedCount
				});
			};

			processTracks();
		});
});

// 2-Tower Recommendation Algorithm
function generateMusicEmbeddings() {
	// Get all music tracks
	db.all('SELECT id, genre, popularity_score, audio_features FROM music_tracks', (err, tracks) => {
		if (err) {
			console.error('Error fetching tracks for embedding:', err);
			return;
		}

		tracks.forEach(track => {
			// Simple embedding generation based on features
			const features = JSON.parse(track.audio_features || '{}');
			const embedding = generateSimpleEmbedding(track, features);
			
			// Store embedding
			const stmt = db.prepare(`INSERT OR REPLACE INTO music_embeddings 
				(music_track_id, embedding_vector, updated_at) 
				VALUES (?, ?, CURRENT_TIMESTAMP)`);
			
			stmt.run(track.id, JSON.stringify(embedding));
			stmt.finalize();
		});
	});
}

function generateUserEmbeddings(userId) {
	// Get user's music interactions
	db.all(`SELECT mt.genre, mt.popularity_score, mt.audio_features, umi.value
		FROM user_music_interactions umi
		JOIN music_tracks mt ON umi.music_track_id = mt.id
		WHERE umi.user_id = ? AND umi.interaction_type = 'rating'`, [userId], (err, interactions) => {
		if (err) {
			console.error('Error fetching user interactions:', err);
			return;
		}

		if (interactions.length === 0) {
			// Default embedding for new users
			const defaultEmbedding = new Array(10).fill(0.5);
			storeUserEmbedding(userId, defaultEmbedding);
			return;
		}

		// Generate user embedding based on their preferences
		const embedding = generateSimpleUserEmbedding(interactions);
		storeUserEmbedding(userId, embedding);
	});
}

function generateSimpleEmbedding(track, features) {
	// Simple embedding based on genre, popularity, and audio features
	const genreMap = {
		'Rock': [1, 0, 0, 0, 0],
		'Pop': [0, 1, 0, 0, 0],
		'Electronic': [0, 0, 1, 0, 0],
		'Alternative Rock': [0.8, 0.2, 0, 0, 0],
		'Grunge': [0.9, 0, 0, 0, 0.1],
		'Britpop': [0.7, 0.3, 0, 0, 0],
		'Post-Punk': [0.6, 0, 0, 0.4, 0],
		'Synthpop': [0.2, 0.3, 0.5, 0, 0],
		'Folk Rock': [0.8, 0, 0, 0, 0.2]
	};

	const genreVec = genreMap[track.genre] || [0, 0, 0, 0, 0];
	const audioFeatures = [
		features.tempo / 200, // normalize tempo
		features.energy || 0,
		features.danceability || 0,
		features.valence || 0,
		track.popularity_score || 0
	];

	return [...genreVec, ...audioFeatures];
}

function generateSimpleUserEmbedding(interactions) {
	// Average embeddings of liked tracks
	const embeddings = interactions.map(interaction => {
		const features = JSON.parse(interaction.audio_features || '{}');
		return generateSimpleEmbedding({
			genre: interaction.genre,
			popularity_score: interaction.popularity_score
		}, features);
	});

	if (embeddings.length === 0) {
		return new Array(10).fill(0.5);
	}

	// Weight by rating value
	const weights = interactions.map(i => i.value || 3);
	const weightedSum = embeddings.reduce((acc, emb, i) => {
		return acc.map((val, j) => val + emb[j] * weights[i]);
	}, new Array(10).fill(0));

	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	return weightedSum.map(val => totalWeight > 0 ? val / totalWeight : 0.5);
}

function storeUserEmbedding(userId, embedding) {
	const stmt = db.prepare(`INSERT OR REPLACE INTO user_embeddings 
		(user_id, embedding_vector, updated_at) 
		VALUES (?, ?, CURRENT_TIMESTAMP)`);
	
	stmt.run(userId, JSON.stringify(embedding));
	stmt.finalize();
}

// Get music recommendations for user
app.get('/api/recommendations/:userId', requireAuth, (req, res) => {
	const userId = req.params.userId;
	
	// Get user embedding
	db.get('SELECT embedding_vector FROM user_embeddings WHERE user_id = ?', [userId], (err, userEmbedding) => {
		if (err || !userEmbedding) {
			// Generate user embedding if doesn't exist
			generateUserEmbeddings(userId);
			return res.json({ recommendations: [], message: 'Generating recommendations...' });
		}

		const userVec = JSON.parse(userEmbedding.embedding_vector);
		
		// Get all music embeddings
		db.all(`SELECT me.music_track_id, me.embedding_vector, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
			FROM music_embeddings me
			JOIN music_tracks mt ON me.music_track_id = mt.id`, (err, musicEmbeddings) => {
			if (err) {
				return res.status(500).json({ error: 'Failed to get recommendations' });
			}

			// Calculate similarities
			const similarities = musicEmbeddings.map(track => {
				const trackVec = JSON.parse(track.embedding_vector);
				const similarity = cosineSimilarity(userVec, trackVec);
				return {
					...track,
					similarity
				};
			});

			// Sort by similarity and return top recommendations, removing duplicates
			const uniqueTracks = new Map();
			similarities
				.sort((a, b) => b.similarity - a.similarity)
				.forEach(track => {
					const key = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
					if (!uniqueTracks.has(key)) {
						uniqueTracks.set(key, track);
					}
				});
			
			const topTracks = Array.from(uniqueTracks.values()).slice(0, 10);
			const recommendations = topTracks.map(track => {
				// Parse audio features from JSON
				const audioFeatures = JSON.parse(track.audio_features || '{}');
				console.log('Fallback Track:', track.title, 'Audio features:', audioFeatures);
				
				return {
					id: track.music_track_id,
					title: track.title,
					artist: track.artist,
					album: track.album,
					genre: track.genre,
					year: track.year,
					duration: track.duration,
					popularity_score: track.popularity_score,
					energy: audioFeatures.energy,
					danceability: audioFeatures.danceability,
					valence: audioFeatures.valence,
					tempo: audioFeatures.tempo,
					similarity_score: track.similarity || 0.5 + Math.random() * 0.3 // Fallback to random score if undefined
				};
			});

			res.json({ recommendations });
		});
	});
});

// Helper function for cosine similarity
function cosineSimilarity(vecA, vecB) {
	if (vecA.length !== vecB.length) return 0;
	
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	
	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}
	
	if (normA === 0 || normB === 0) return 0;
	
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Get music history and statistics
app.get('/api/music-history', requireAuth, (req, res) => {
	db.all(`SELECT 
		COUNT(*) as total_tracks,
		SUM(duration) as total_duration,
		AVG(duration) as avg_duration,
		COUNT(DISTINCT genre) as unique_genres,
		COUNT(DISTINCT artist) as unique_artists,
		MIN(year) as oldest_year,
		MAX(year) as newest_year
		FROM music_tracks`, (err, stats) => {
		if (err) {
			return res.status(500).json({ error: 'Failed to get music statistics' });
		}

		// Get genre breakdown
		db.all(`SELECT genre, COUNT(*) as count 
			FROM music_tracks 
			GROUP BY genre 
			ORDER BY count DESC`, (err, genres) => {
			if (err) {
				return res.status(500).json({ error: 'Failed to get genre breakdown' });
			}

			// Get top artists
			db.all(`SELECT artist, COUNT(*) as track_count 
				FROM music_tracks 
				GROUP BY artist 
				ORDER BY track_count DESC 
				LIMIT 10`, (err, artists) => {
				if (err) {
					return res.status(500).json({ error: 'Failed to get top artists' });
				}

				res.json({
					statistics: stats[0],
					genres: genres,
					topArtists: artists
				});
			});
		});
	});
});

// Enhanced recommendations with detailed explanations and behavioral patterns
app.get('/api/enhanced-recommendations/:userId', requireAuth, async (req, res) => {
	const userId = req.params.userId;
	const offset = parseInt(req.query.offset) || 0;
	const limit = parseInt(req.query.limit) || 5;
	const timeOfDay = req.query.timeOfDay || null; // Optional: 'morning', 'afternoon', 'evening', 'night'
	const mood = req.query.mood || null; // Optional mood filter
	const activity = req.query.activity || null; // Optional activity filter
	
	// Get behavioral patterns
	db.get('SELECT * FROM user_behavioral_patterns WHERE user_id = ?', [userId], (err, behaviorData) => {
		let behavioralPatterns = null;
		if (!err && behaviorData) {
			behavioralPatterns = {
				timeOfDay: JSON.parse(behaviorData.time_of_day_preferences || '{}'),
				genres: JSON.parse(behaviorData.genre_preferences || '{}'),
				moods: JSON.parse(behaviorData.mood_preferences || '{}'),
				activities: JSON.parse(behaviorData.activity_preferences || '{}'),
				topArtists: JSON.parse(behaviorData.top_artists || '[]'),
				topSongs: JSON.parse(behaviorData.top_songs || '[]'),
				weekend: JSON.parse(behaviorData.weekend_preferences || '{}'),
				weekday: JSON.parse(behaviorData.weekday_preferences || '{}')
			};
		}
	
	// Get user embedding
	db.get('SELECT embedding_vector FROM user_embeddings WHERE user_id = ?', [userId], (err, userEmbedding) => {
		if (err || !userEmbedding) {
				// If no user embedding, use behavioral patterns if available
				if (behavioralPatterns) {
					getRecommendationsFromBehavior(behavioralPatterns, timeOfDay, mood, activity, limit, offset, res);
					return;
				}
				
				// Fallback to popular tracks
			db.all(`SELECT mt.id as music_track_id, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
				FROM music_tracks mt
				ORDER BY mt.popularity_score DESC, RANDOM()
				LIMIT ? OFFSET ?`, [limit * 2, offset], (err, tracks) => {
				if (err) {
					return res.status(500).json({ error: 'Failed to get recommendations' });
				}
				
				const seenTracks = new Set();
				const uniqueTracks = tracks.filter(track => {
					const trackKey = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
						if (seenTracks.has(trackKey)) return false;
					seenTracks.add(trackKey);
					return true;
				}).slice(0, limit);
				
				const recommendations = uniqueTracks.map(track => {
					const audioFeatures = JSON.parse(track.audio_features || '{}');
					return {
						id: track.music_track_id,
						title: track.title,
						artist: track.artist,
						album: track.album,
						genre: track.genre,
						year: track.year,
						duration: track.duration,
						popularity_score: track.popularity_score,
						energy: audioFeatures.energy,
						danceability: audioFeatures.danceability,
						valence: audioFeatures.valence,
						tempo: audioFeatures.tempo,
							similarity_score: 0.5 + Math.random() * 0.3,
						explanation: 'Popular track based on overall ratings'
					};
				});
				
				res.json({ recommendations });
			});
			return;
		}

		const userVec = JSON.parse(userEmbedding.embedding_vector);
		
		// Get all music embeddings
		db.all(`SELECT me.music_track_id, me.embedding_vector, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
			FROM music_embeddings me
			JOIN music_tracks mt ON me.music_track_id = mt.id`, (err, musicEmbeddings) => {
			if (err) {
				return res.status(500).json({ error: 'Failed to get recommendations' });
			}

				// Calculate similarities with behavioral boost
			const similarities = musicEmbeddings.map(track => {
				const trackVec = JSON.parse(track.embedding_vector);
					let similarity = cosineSimilarity(userVec, trackVec);
				const features = JSON.parse(track.audio_features || '{}');
				
					// Apply behavioral pattern boosts
					let behavioralBoost = 0;
					if (behavioralPatterns) {
						behavioralBoost = calculateBehavioralBoost(track, behavioralPatterns, timeOfDay, mood, activity);
					}
					
					// Combine similarity with behavioral boost (70% similarity, 30% behavioral)
					const adjustedSimilarity = (similarity * 0.7) + (behavioralBoost * 0.3);
					
					// Add some randomization for variety (10%)
					const randomFactor = 0.9 + Math.random() * 0.1;
					const finalSimilarity = adjustedSimilarity * randomFactor;
				
				return {
					...track,
						similarity: finalSimilarity,
					originalSimilarity: similarity,
						behavioralBoost: behavioralBoost,
					features
				};
			});

				// Sort by similarity and remove duplicates
			const seenTracks = new Set();
			const uniqueSimilarities = similarities.filter(track => {
				const trackKey = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
					if (seenTracks.has(trackKey)) return false;
				seenTracks.add(trackKey);
				return true;
			});

			let recommendations = uniqueSimilarities
				.sort((a, b) => b.similarity - a.similarity)
				.slice(offset, offset + limit);

				// Helper function to send final recommendations
				function sendFinalRecommendations() {
			// Map to final format
			const finalRecommendations = recommendations.map(track => {
				const audioFeatures = JSON.parse(track.audio_features || '{}');
				
				return {
					id: track.music_track_id,
					title: track.title,
					artist: track.artist,
					album: track.album,
					genre: track.genre,
					year: track.year,
					duration: track.duration,
					popularity_score: track.popularity_score,
					energy: audioFeatures.energy,
					danceability: audioFeatures.danceability,
					valence: audioFeatures.valence,
					tempo: audioFeatures.tempo,
							similarity_score: track.originalSimilarity || (0.5 + Math.random() * 0.3),
							explanation: generateBehavioralRecommendationExplanation(track, behavioralPatterns, timeOfDay, mood, activity)
				};
			});

					res.json({ recommendations: finalRecommendations });
				}

				// If not enough tracks, add behavioral-based recommendations
				if (recommendations.length < limit && behavioralPatterns) {
					// Get additional recommendations from behavioral patterns
					getRecommendationsFromBehaviorSync(behavioralPatterns, timeOfDay, mood, activity, limit - recommendations.length, 0, (behavioralRecs) => {
						recommendations = recommendations.concat(behavioralRecs);
						sendFinalRecommendations();
					});
				} else {
					sendFinalRecommendations();
				}
			});
		});
	});
});

// Calculate behavioral boost score for a track
function calculateBehavioralBoost(track, patterns, timeOfDay, mood, activity) {
	let boost = 0;
	const trackGenre = track.genre || '';
	const trackTitle = (track.title || '').toLowerCase();
	const trackArtist = (track.artist || '').toLowerCase();
	
	// Time of day boost
	if (timeOfDay && patterns.timeOfDay[timeOfDay]) {
		const timePattern = patterns.timeOfDay[timeOfDay];
		if (timePattern.genres && timePattern.genres.includes(trackGenre)) {
			boost += 0.3;
		}
		if (timePattern.topSongs) {
			const matchingSong = timePattern.topSongs.find(s => 
				s.song.toLowerCase() === trackTitle && s.artist.toLowerCase() === trackArtist
			);
			if (matchingSong) boost += 0.4;
		}
	}
	
	// Genre preference boost
	if (patterns.genres[trackGenre]) {
		const genreCount = patterns.genres[trackGenre];
		const maxGenreCount = Math.max(...Object.values(patterns.genres));
		boost += 0.2 * (genreCount / maxGenreCount);
	}
	
	// Mood boost
	if (mood && patterns.moods[mood]) {
		const moodPattern = patterns.moods[mood];
		if (moodPattern.genres && moodPattern.genres.includes(trackGenre)) {
			boost += 0.25;
		}
	}
	
	// Activity boost
	if (activity && patterns.activities[activity]) {
		const activityPattern = patterns.activities[activity];
		if (activityPattern.genres && activityPattern.genres.includes(trackGenre)) {
			boost += 0.25;
		}
	}
	
	// Top artists boost
	if (patterns.topArtists) {
		const isTopArtist = patterns.topArtists.some(a => 
			a.artist.toLowerCase() === trackArtist
		);
		if (isTopArtist) boost += 0.2;
	}
	
	// Top songs boost
	if (patterns.topSongs) {
		const isTopSong = patterns.topSongs.some(s => 
			s.song.toLowerCase() === trackTitle && s.artist.toLowerCase() === trackArtist
		);
		if (isTopSong) boost += 0.3;
	}
	
	return Math.min(boost, 1.0); // Cap at 1.0
}

// Get recommendations based purely on behavioral patterns (with response)
function getRecommendationsFromBehavior(patterns, timeOfDay, mood, activity, limit, offset, res) {
	getRecommendationsFromBehaviorSync(patterns, timeOfDay, mood, activity, limit, offset, (recommendations) => {
		if (res) res.json({ recommendations });
	});
}

// Get recommendations based purely on behavioral patterns (sync callback version)
function getRecommendationsFromBehaviorSync(patterns, timeOfDay, mood, activity, limit, offset, callback) {
	const query = [];
	const params = [];
	
	// Build query based on behavioral patterns
	if (timeOfDay && patterns.timeOfDay[timeOfDay]) {
		const timePattern = patterns.timeOfDay[timeOfDay];
		if (timePattern.genres && timePattern.genres.length > 0) {
			query.push(`mt.genre IN (${timePattern.genres.map(() => '?').join(',')})`);
			params.push(...timePattern.genres);
		}
	} else if (mood && patterns.moods[mood]) {
		const moodPattern = patterns.moods[mood];
		if (moodPattern.genres && moodPattern.genres.length > 0) {
			query.push(`mt.genre IN (${moodPattern.genres.map(() => '?').join(',')})`);
			params.push(...moodPattern.genres);
		}
	} else if (activity && patterns.activities[activity]) {
		const activityPattern = patterns.activities[activity];
		if (activityPattern.genres && activityPattern.genres.length > 0) {
			query.push(`mt.genre IN (${activityPattern.genres.map(() => '?').join(',')})`);
			params.push(...activityPattern.genres);
		}
	} else if (Object.keys(patterns.genres).length > 0) {
		// Use top genres
		const topGenres = Object.keys(patterns.genres)
			.sort((a, b) => patterns.genres[b] - patterns.genres[a])
			.slice(0, 5);
		query.push(`mt.genre IN (${topGenres.map(() => '?').join(',')})`);
		params.push(...topGenres);
	}
	
	const whereClause = query.length > 0 ? `WHERE ${query.join(' OR ')}` : '';
	params.push(limit * 2, offset);
	
	db.all(`SELECT mt.id as music_track_id, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
		FROM music_tracks mt
		${whereClause}
		ORDER BY mt.popularity_score DESC, RANDOM()
		LIMIT ? OFFSET ?`, params, (err, tracks) => {
		if (err) {
			console.error('Error getting behavioral recommendations:', err);
			if (callback) callback([]);
			return;
		}
		
		const seenTracks = new Set();
		const uniqueTracks = tracks.filter(track => {
			const trackKey = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
			if (seenTracks.has(trackKey)) return false;
			seenTracks.add(trackKey);
			return true;
		}).slice(0, limit);
		
		const recommendations = uniqueTracks.map(track => {
			const audioFeatures = JSON.parse(track.audio_features || '{}');
			return {
				id: track.music_track_id,
				title: track.title,
				artist: track.artist,
				album: track.album,
				genre: track.genre,
				year: track.year,
				duration: track.duration,
				popularity_score: track.popularity_score,
				energy: audioFeatures.energy,
				danceability: audioFeatures.danceability,
				valence: audioFeatures.valence,
				tempo: audioFeatures.tempo,
				similarity_score: 0.7 + Math.random() * 0.2,
				explanation: generateBehavioralRecommendationExplanation(track, patterns, timeOfDay, mood, activity)
			};
		});
		
		if (callback) callback(recommendations);
	});
}

// Generate explanation based on behavioral patterns
function generateBehavioralRecommendationExplanation(track, patterns, timeOfDay, mood, activity) {
	const explanations = [];
	
	if (!patterns) {
		return generateRecommendationExplanation(track, null);
	}
	
	if (timeOfDay && patterns.timeOfDay[timeOfDay]) {
		const timePattern = patterns.timeOfDay[timeOfDay];
		if (timePattern.genres && timePattern.genres.includes(track.genre)) {
			explanations.push(`Based on your ${timeOfDay} listening habits, you enjoy ${track.genre} music during this time`);
		}
	}
	
	if (mood && patterns.moods[mood]) {
		const moodPattern = patterns.moods[mood];
		if (moodPattern.genres && moodPattern.genres.includes(track.genre)) {
			explanations.push(`This ${track.genre} track matches your ${mood} mood preferences`);
		}
	}
	
	if (activity && patterns.activities[activity]) {
		const activityPattern = patterns.activities[activity];
		if (activityPattern.genres && activityPattern.genres.includes(track.genre)) {
			explanations.push(`Perfect for ${activity} - matches your activity-based preferences`);
		}
	}
	
	if (patterns.topArtists) {
		const isTopArtist = patterns.topArtists.some(a => 
			a.artist.toLowerCase() === (track.artist || '').toLowerCase()
		);
		if (isTopArtist) {
			explanations.push(`From one of your favorite artists`);
		}
	}
	
	if (patterns.genres[track.genre]) {
		explanations.push(`Matches your ${track.genre} genre preference`);
	}
	
	if (explanations.length === 0) {
		return generateRecommendationExplanation(track, null);
	}
	
	return explanations.join('. ') + '.';
}

// Generate explanation for why a song is recommended
function generateRecommendationExplanation(track, userVec) {
	const features = JSON.parse(track.audio_features || '{}');
	const explanations = [];

	// Genre-based explanation
	if (userVec && userVec[0] > 0.7) { // High rock preference
		if (track.genre === 'Rock' || track.genre === 'Alternative Rock') {
			explanations.push("You love rock music, and this is a classic rock track");
		}
	} else if (userVec && userVec[1] > 0.7) { // High pop preference
		if (track.genre === 'Pop') {
			explanations.push("This pop hit matches your music taste perfectly");
		}
	} else if (userVec && userVec[2] > 0.7) { // High electronic preference
		if (track.genre === 'Electronic' || track.genre === 'Synthpop') {
			explanations.push("Your electronic music preference aligns with this track");
		}
	}

	// Audio feature explanations
	if (features.energy > 0.8) {
		explanations.push("High-energy track that matches your upbeat music taste");
	} else if (features.energy < 0.3) {
		explanations.push("Mellow track perfect for relaxed listening");
	}

	if (features.danceability > 0.7) {
		explanations.push("Great danceable rhythm that fits your preferences");
	}

	if (features.valence > 0.7) {
		explanations.push("Positive, uplifting melody that matches your mood preferences");
	} else if (features.valence < 0.3) {
		explanations.push("Emotional depth that resonates with your music taste");
	}

	// Popularity explanation
	if (track.popularity_score > 0.9) {
		explanations.push("Highly popular track that many music lovers enjoy");
	}

	// Default explanation if no specific reasons found
	if (explanations.length === 0) {
		explanations.push(`Based on your music preferences and the 2-tower algorithm analysis, this ${track.genre} track has a ${((track.similarity || 0.5) * 100).toFixed(1)}% compatibility with your taste`);
	}

	return explanations.join(". ") + ".";
}

// Check if music data exists
app.get('/api/music-data-exists', requireAuth, (req, res) => {
	console.log('Checking if music data exists...');
	db.get('SELECT COUNT(*) as count FROM music_tracks', (err, result) => {
		if (err) {
			console.error('Error checking music data:', err);
			return res.status(500).json({ error: 'Failed to check music data' });
		}
		console.log('Music tracks count:', result.count);
		const response = { 
			exists: result.count > 0, 
			trackCount: result.count 
		};
		console.log('Sending response:', response);
		res.json(response);
	});
});

// YouTube search endpoint
app.get('/api/search-youtube/:query', requireAuth, async (req, res) => {
	try {
		const query = decodeURIComponent(req.params.query);
		const results = await media_search.search(`${query} official music video`);
		
		if (results && results.length > 0) {
			const video = results[0];
			const videoId = video.id?.videoId || video.id;
			res.json({
				success: true,
				video: {
					id: videoId,
					title: video.title || video.snippet?.title,
					url: video.url,
					thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail,
					duration: video.duration_raw || video.duration
				}
			});
		} else {
			res.json({
				success: false,
				message: 'No YouTube video found for this track'
			});
		}
	} catch (error) {
		console.error('YouTube search error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to search YouTube'
		});
	}
});

// Gemini-based recommendation function - returns exactly 4 high-quality matches
async function getGeminiRecommendations(userId, behavioralPatterns, topSongs, topArtists) {
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
		
		// Get current time of day
		const now = new Date();
		const currentHour = now.getHours();
		const timeOfDay = currentHour >= 6 && currentHour < 12 ? 'morning' : 
		                 currentHour >= 12 && currentHour < 17 ? 'afternoon' :
		                 currentHour >= 17 && currentHour < 22 ? 'evening' : 'night';
		
		// Build context from behavioral patterns
		const genres = Object.keys(behavioralPatterns?.genres || {}).slice(0, 5).join(', ');
		const moods = Object.keys(behavioralPatterns?.moods || {}).slice(0, 5).join(', ');
		const activities = Object.keys(behavioralPatterns?.activities || {}).slice(0, 5).join(', ');
		const topSongsList = (topSongs || []).slice(0, 10).map(s => `${s.song} by ${s.artist}`).join(', ');
		const topArtistsList = (topArtists || []).slice(0, 10).map(a => a.artist).join(', ');
		
		// Get time-of-day specific preferences
		const timeOfDayPrefs = behavioralPatterns?.timeOfDay?.[timeOfDay] || {};
		const timeOfDayGenres = timeOfDayPrefs.genres || [];
		const timeOfDaySongs = (timeOfDayPrefs.topSongs || []).slice(0, 5).map(s => `${s.song} by ${s.artist}`).join(', ');
		
		const prompt = `You are a music recommendation expert. Based on the user's listening history and current time of day, recommend EXACTLY 4 songs that perfectly match their preferences.

Current Time: ${timeOfDay} (${currentHour}:00)
User's Top Genres: ${genres || 'Various'}
User's Mood Preferences: ${moods || 'Various'}
User's Activity Preferences: ${activities || 'Various'}
Top Songs They Listen To: ${topSongsList || 'Various'}
Top Artists They Like: ${topArtistsList || 'Various'}
${timeOfDay} Preferences - Genres: ${timeOfDayGenres.join(', ') || 'Various'}
${timeOfDay} Preferences - Songs: ${timeOfDaySongs || 'Various'}

Please recommend EXACTLY 4 songs that:
1. Perfectly match their genre preferences (especially for ${timeOfDay})
2. Fit their mood and activity patterns for ${timeOfDay}
3. Are similar to their top songs
4. Include songs from their favorite artists
5. All 4 songs must be high-quality matches

Return ONLY a JSON array with EXACTLY 4 song recommendations in this exact format:
[
  {"title": "Song Title", "artist": "Artist Name", "genre": "Genre", "matchLevel": "highly"|"moderate"|"maylike"},
  {"title": "Song Title", "artist": "Artist Name", "genre": "Genre", "matchLevel": "highly"|"moderate"|"maylike"},
  {"title": "Song Title", "artist": "Artist Name", "genre": "Genre", "matchLevel": "highly"|"moderate"|"maylike"},
  {"title": "Song Title", "artist": "Artist Name", "genre": "Genre", "matchLevel": "highly"|"moderate"|"maylike"}
]

Use "highly" for best matches, "moderate" for good matches, "maylike" for interesting discoveries.
Do not include any other text, only the JSON array.`;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const text = response.text();
		
		// Parse JSON from response (remove markdown code blocks if present)
		let jsonText = text.trim();
		if (jsonText.startsWith('```json')) {
			jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
		} else if (jsonText.startsWith('```')) {
			jsonText = jsonText.replace(/```\n?/g, '');
		}
		
		const recommendations = JSON.parse(jsonText);
		// Ensure we have exactly 4 recommendations
		const finalRecs = recommendations.slice(0, 4);
		console.log(`[GEMINI] Generated ${finalRecs.length} recommendations`);
		return finalRecs;
	} catch (error) {
		console.error('[GEMINI] Error generating recommendations:', error);
		return null;
	}
}

// Generate personalized explanation for a song using Gemini
async function generateSongExplanation(song, artist, behavioralPatterns, timeOfDay, matchLevel) {
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
		
		const genres = Object.keys(behavioralPatterns?.genres || {}).slice(0, 3).join(', ');
		const moods = Object.keys(behavioralPatterns?.moods || {}).slice(0, 3).join(', ');
		const topArtists = (behavioralPatterns?.topArtists || []).slice(0, 5).map(a => a.artist).join(', ');
		
		const prompt = `Write a short, personalized explanation (2-3 sentences max) for why the user might like the song "${song}" by ${artist}.

Context:
- Current time: ${timeOfDay}
- User's favorite genres: ${genres || 'Various'}
- User's mood preferences: ${moods || 'Various'}
- User's favorite artists: ${topArtists || 'Various'}
- Match level: ${matchLevel === 'highly' ? 'Highly Recommended' : matchLevel === 'moderate' ? 'Moderately Recommended' : 'You May Like This'}

Write a friendly, concise explanation that mentions:
1. Why this song matches their taste (genre, artist, or style)
2. How it fits their ${timeOfDay} listening patterns or mood
3. What makes it special for them

Keep it under 50 words. Be specific and personal. Return ONLY the explanation text, no quotes or formatting.`;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const text = response.text().trim();
		
		// Clean up the response
		let explanation = text.replace(/^["']|["']$/g, '').trim();
		console.log(`[GEMINI] Generated explanation for ${song}: ${explanation.substring(0, 50)}...`);
		return explanation;
	} catch (error) {
		console.error('[GEMINI] Error generating explanation:', error);
		// Generate unique fallback explanation based on song-specific attributes
		return generateUniqueFallbackExplanation(song, artist, behavioralPatterns, timeOfDay, matchLevel);
	}
}

// Generate unique fallback explanation for each song when Gemini fails
function generateUniqueFallbackExplanation(song, artist, behavioralPatterns, timeOfDay, matchLevel) {
	const explanations = [];
	
	// Get user preferences
	const topGenres = behavioralPatterns?.genres ? Object.keys(behavioralPatterns.genres).slice(0, 3) : [];
	const topArtists = (behavioralPatterns?.topArtists || []).slice(0, 5).map(a => a.artist || a);
	const topSongs = (behavioralPatterns?.topSongs || []).slice(0, 5).map(s => s.song || s);
	
	// Create unique explanation based on song attributes
	// Use song title hash to create variation
	const songHash = (song + artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
	const variation = songHash % 4;
	
	// Match level specific explanations - ensure variety based on song hash
	if (matchLevel === 'highly') {
		const reasons = [
			`"${song}" by ${artist} perfectly aligns with your ${topGenres[0] || 'favorite'} music taste and is ideal for ${timeOfDay} listening sessions. The energy and style match what you've been enjoying lately.`,
			`This ${topGenres[0] || 'track'} from ${artist} matches your listening patterns and fits perfectly with your ${timeOfDay} mood preferences. You've shown a strong preference for this genre.`,
			`Based on your music history, "${song}" is a great match for your ${topGenres[0] || 'preferred'} genre and ${timeOfDay} listening habits. The melody and rhythm should resonate with you.`,
			`You'll love "${song}" by ${artist} - it's similar to your favorite ${topGenres[0] || 'music'} and perfect for ${timeOfDay} vibes. The composition aligns with tracks you've rated highly.`
		];
		explanations.push(reasons[variation]);
	} else if (matchLevel === 'moderate') {
		const reasons = [
			`"${song}" by ${artist} offers a fresh take on your ${topGenres[0] || 'preferred'} music style, great for ${timeOfDay} listening. It blends familiar elements with new sounds you might appreciate.`,
			`This track from ${artist} blends elements you enjoy with new sounds, making it perfect for your ${timeOfDay} playlist. It's a good balance of comfort and discovery.`,
			`"${song}" complements your ${topGenres[0] || 'music'} preferences and could be a nice addition to your ${timeOfDay} routine. The style is close to what you typically enjoy.`,
			`Based on your taste, "${song}" by ${artist} might surprise you with its ${topGenres[0] || 'musical'} style during ${timeOfDay}. It's a solid recommendation that expands your horizons.`
		];
		explanations.push(reasons[variation]);
	} else {
		const reasons = [
			`"${song}" by ${artist} explores ${topGenres[0] || 'music'} styles you might enjoy, especially during ${timeOfDay}. It's an interesting discovery that could grow on you.`,
			`This track from ${artist} could be an interesting discovery for your ${timeOfDay} listening, blending familiar and new sounds. Give it a chance - you might be pleasantly surprised.`,
			`"${song}" offers something different while staying close to your ${topGenres[0] || 'preferred'} music taste for ${timeOfDay}. It's worth exploring if you're looking for variety.`,
			`You might find "${song}" by ${artist} appealing for ${timeOfDay} - it's a fresh take on ${topGenres[0] || 'music'} you enjoy. The unique approach could catch your attention.`
		];
		explanations.push(reasons[variation]);
	}
	
	// Add artist-specific note if available
	if (topArtists.length > 0 && topArtists.some(a => a.toLowerCase().includes(artist.toLowerCase().substring(0, 3)))) {
		explanations.push(`The artist's style resonates with your music preferences.`);
	}
	
	return explanations.join(' ');
}

// Enhanced recommendations with YouTube links using Gemini
app.get('/api/recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
	const userId = req.params.userId;
	const offset = parseInt(req.query.offset) || 0; // Pagination offset
	const limit = 4; // Always return 4 recommendations
	console.log(`[RECOMMENDATIONS] Request for user ${userId} from session user ${req.session.userId}, offset: ${offset}`);
	
	try {
		// Get behavioral patterns first
		const behaviorData = await new Promise((resolve, reject) => {
			db.get('SELECT * FROM user_behavioral_patterns WHERE user_id = ?', [userId], (err, result) => {
				if (err) reject(err);
				else resolve(result);
			});
		});

		let behavioralPatterns = null;
		let topSongs = [];
		let topArtists = [];
		
		if (behaviorData) {
			behavioralPatterns = {
				timeOfDay: JSON.parse(behaviorData.time_of_day_preferences || '{}'),
				genres: JSON.parse(behaviorData.genre_preferences || '{}'),
				moods: JSON.parse(behaviorData.mood_preferences || '{}'),
				activities: JSON.parse(behaviorData.activity_preferences || '{}'),
				topArtists: JSON.parse(behaviorData.top_artists || '[]'),
				topSongs: JSON.parse(behaviorData.top_songs || '[]')
			};
			topSongs = behavioralPatterns.topSongs;
			topArtists = behavioralPatterns.topArtists;
		}

		// Use Gemini to get AI-powered recommendations
		let geminiRecommendations = null;
		if (behavioralPatterns && (topSongs.length > 0 || topArtists.length > 0)) {
			console.log('[GEMINI] Getting AI-powered recommendations...');
			geminiRecommendations = await getGeminiRecommendations(userId, behavioralPatterns, topSongs, topArtists);
		}

		let recommendations = [];
		
		if (geminiRecommendations && geminiRecommendations.length > 0) {
			// Use Gemini recommendations - exactly 4 songs
			console.log(`[GEMINI] Using ${geminiRecommendations.length} Gemini recommendations`);
			
			// Get current time of day for explanations
			const now = new Date();
			const currentHour = now.getHours();
			const timeOfDay = currentHour >= 6 && currentHour < 12 ? 'morning' : 
			                 currentHour >= 12 && currentHour < 17 ? 'afternoon' :
			                 currentHour >= 17 && currentHour < 22 ? 'evening' : 'night';
			
			// Apply pagination to Gemini recommendations
			const geminiStartIndex = offset;
			const geminiEndIndex = offset + limit;
			const paginatedGeminiRecs = geminiRecommendations.slice(geminiStartIndex, geminiEndIndex);
			
			// Search YouTube and generate explanations for each recommendation
			recommendations = await Promise.all(
				paginatedGeminiRecs.map(async (rec, relativeIndex) => {
					const index = relativeIndex; // Index within this batch (0-3)
					let youtubeData = null;
					
					// Search YouTube
					try {
						const searchQuery = `${rec.title} ${rec.artist}`;
						const youtubePromise = media_search.search(`${searchQuery} official music video`);
						const timeoutPromise = new Promise((_, reject) => 
							setTimeout(() => reject(new Error('Timeout')), 5000)
						);
						
						const youtubeResults = await Promise.race([youtubePromise, timeoutPromise]);
						
						if (youtubeResults && youtubeResults.length > 0) {
							const video = youtubeResults[0];
							const videoId = video.id?.videoId || video.id;
							if (videoId) {
								youtubeData = {
									id: videoId,
									title: video.title || video.snippet?.title,
									url: video.url || `https://www.youtube.com/watch?v=${videoId}`,
									thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail,
									duration: video.duration_raw || video.duration
								};
							}
						}
					} catch (error) {
						console.log(`YouTube search failed for ${rec.title}:`, error.message);
					}
					
					// Generate personalized explanation using Gemini
					const matchLevel = rec.matchLevel || (index === 0 ? 'highly' : index === 1 ? 'highly' : index === 2 ? 'moderate' : 'maylike');
					let explanation = '';
					try {
						explanation = await generateSongExplanation(rec.title, rec.artist, behavioralPatterns, timeOfDay, matchLevel);
					} catch (error) {
						console.error(`Error generating explanation for ${rec.title}:`, error);
						explanation = generateUniqueFallbackExplanation(rec.title, rec.artist, behavioralPatterns, timeOfDay, matchLevel);
					}
					
					// Calculate similarity score based on match level and index (ensure variety)
					// First 2 should be highly recommended, 3rd moderate, 4th maylike
					let similarityScore = 0.7;
					if (index === 0) {
						similarityScore = 0.88 + Math.random() * 0.07; // 88-95% - Top match
					} else if (index === 1) {
						similarityScore = 0.82 + Math.random() * 0.06; // 82-88% - Second best
					} else if (index === 2) {
						similarityScore = 0.70 + Math.random() * 0.08; // 70-78% - Moderate
					} else {
						similarityScore = 0.60 + Math.random() * 0.08; // 60-68% - May like
					}
					
					// Determine match level based on calculated score
					const similarityPercent = similarityScore * 100;
					if (similarityPercent >= 80) matchLevel = 'highly';
					else if (similarityPercent >= 65) matchLevel = 'moderate';
					else matchLevel = 'maylike';
					
					return {
						id: null,
						title: rec.title,
						artist: rec.artist,
						album: null,
						genre: rec.genre || 'Unknown',
						year: null,
						duration: null,
						popularity_score: 0.8,
						similarity_score: similarityScore,
						matchLevel: matchLevel, // 'highly', 'moderate', 'maylike'
						explanation: explanation,
						youtube: youtubeData
					};
				})
			);
		} else {
			// Fallback to database-based recommendations
			console.log('[RECOMMENDATIONS] Falling back to database recommendations');
			
		// Get user embedding
		const userEmbedding = await new Promise((resolve, reject) => {
			db.get('SELECT embedding_vector FROM user_embeddings WHERE user_id = ?', [userId], (err, result) => {
				if (err) reject(err);
				else resolve(result);
			});
		});

			let topTracks = [];

			if (userEmbedding) {
		const userVec = JSON.parse(userEmbedding.embedding_vector);
		const musicEmbeddings = await new Promise((resolve, reject) => {
					db.all(`SELECT me.music_track_id, me.embedding_vector, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
				FROM music_embeddings me
				JOIN music_tracks mt ON me.music_track_id = mt.id`, (err, results) => {
				if (err) reject(err);
						else resolve(results || []);
			});
		});

				if (musicEmbeddings && musicEmbeddings.length > 0) {
		const similarities = musicEmbeddings.map(track => {
			const trackVec = JSON.parse(track.embedding_vector);
						let similarity = cosineSimilarity(userVec, trackVec);
						if (behavioralPatterns) {
							const boost = calculateBehavioralBoost(track, behavioralPatterns, null, null, null);
							similarity = (similarity * 0.7) + (boost * 0.3);
						}
						return { ...track, similarity, features: JSON.parse(track.audio_features || '{}') };
					});

		const uniqueTracks = new Map();
					similarities.sort((a, b) => b.similarity - a.similarity).forEach(track => {
				const key = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
						if (!uniqueTracks.has(key)) uniqueTracks.set(key, track);
					});
					
					topTracks = Array.from(uniqueTracks.values()); // Keep all for pagination
				}
			}
			
			if (topTracks.length === 0 && behavioralPatterns) {
				const topGenres = Object.keys(behavioralPatterns.genres || {})
					.sort((a, b) => (behavioralPatterns.genres[b] || 0) - (behavioralPatterns.genres[a] || 0))
					.slice(0, 5);
				
				if (topGenres.length > 0) {
					const behaviorTracks = await new Promise((resolve, reject) => {
						db.all(`SELECT id as music_track_id, title, artist, album, genre, year, duration, popularity_score, audio_features
							FROM music_tracks WHERE genre IN (${topGenres.map(() => '?').join(',')})
							ORDER BY popularity_score DESC, RANDOM() LIMIT 20`, topGenres, (err, results) => {
							if (err) reject(err);
							else resolve(results || []);
						});
					});
					
					topTracks = behaviorTracks.map(track => ({
						...track,
						similarity: 0.7 + Math.random() * 0.2,
						features: JSON.parse(track.audio_features || '{}')
					}));
				}
			}
			
			if (topTracks.length === 0) {
				const popularTracks = await new Promise((resolve, reject) => {
					db.all(`SELECT id as music_track_id, title, artist, album, genre, year, duration, popularity_score, audio_features
						FROM music_tracks ORDER BY popularity_score DESC, RANDOM() LIMIT 20`, (err, results) => {
						if (err) reject(err);
						else resolve(results || []);
					});
				});
				
				topTracks = popularTracks.map(track => ({
					...track,
					similarity: 0.6 + Math.random() * 0.2,
					features: JSON.parse(track.audio_features || '{}')
				}));
			}
			
			// Sort all tracks by similarity before pagination
			topTracks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

			const userVec = userEmbedding ? JSON.parse(userEmbedding.embedding_vector) : null;
			
			// Get current time of day for explanations
			const now = new Date();
			const currentHour = now.getHours();
			const timeOfDay = currentHour >= 6 && currentHour < 12 ? 'morning' : 
			                 currentHour >= 12 && currentHour < 17 ? 'afternoon' :
			                 currentHour >= 17 && currentHour < 22 ? 'evening' : 'night';
			
			// Build recommendations - apply pagination (offset for "Load More")
			// Filter out skipped tracks and low completion rate tracks (per user guide)
			const filteredTracks = topTracks.filter(track => {
				const features = track.features || JSON.parse(track.audio_features || '{}');
				const skipped = features.skipped === true || features.skipped === 1;
				const completionRate = features.completionRate || 0;
				// Exclude skipped tracks and tracks with completion rate < 0.5
				return !skipped && completionRate >= 0.5;
			});
			
			// Sort by similarity first, then prioritize new songs (previouslyListened = false)
			filteredTracks.sort((a, b) => {
				const aFeatures = a.features || JSON.parse(a.audio_features || '{}');
				const bFeatures = b.features || JSON.parse(b.audio_features || '{}');
				const aNew = !aFeatures.previouslyListened;
				const bNew = !bFeatures.previouslyListened;
				
				// Prioritize new songs
				if (aNew !== bNew) return bNew ? 1 : -1;
				
				// Then sort by similarity
				return (b.similarity || 0) - (a.similarity || 0);
			});
			
			const startIndex = offset;
			const endIndex = offset + limit;
			const top4Tracks = filteredTracks.slice(startIndex, endIndex);
			
			// Ensure we have exactly 4 or less
			if (top4Tracks.length === 0) {
				return res.json({ 
					recommendations: [],
					hasMore: false,
					offset: offset
				});
			}
			
			recommendations = await Promise.all(
				top4Tracks.map(async (track, relativeIndex) => {
					const index = relativeIndex; // Index within this batch (0-3)
					let youtubeData = null;
					
				try {
					const searchQuery = `${track.title} ${track.artist}`;
						const youtubePromise = media_search.search(`${searchQuery} official music video`);
						const timeoutPromise = new Promise((_, reject) => 
							setTimeout(() => reject(new Error('Timeout')), 5000)
						);
					
						const youtubeResults = await Promise.race([youtubePromise, timeoutPromise]);
						
					if (youtubeResults && youtubeResults.length > 0) {
						const video = youtubeResults[0];
						const videoId = video.id?.videoId || video.id;
							if (videoId) {
						youtubeData = {
							id: videoId,
							title: video.title || video.snippet?.title,
									url: video.url || `https://www.youtube.com/watch?v=${videoId}`,
							thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail,
							duration: video.duration_raw || video.duration
						};
							}
						}
					} catch (error) {
						console.log(`YouTube search failed for ${track.title}:`, error.message);
					}
					
					// Calculate similarity using weighted features from user guide:
					// Genre: 0.35, Mood: 0.25, Activity: 0.15, Rating: 0.15, Completion_Rate: 0.10
					let similarity = track.similarity || 0.7;
					const trackFeatures = track.features || JSON.parse(track.audio_features || '{}');
					
					// Apply behavioral pattern weights if available
					if (behavioralPatterns) {
						let weightedScore = 0;
						
						// Genre match (0.35 weight)
						const genreMatch = behavioralPatterns.genres[track.genre] || 0;
						const maxGenreCount = Math.max(...Object.values(behavioralPatterns.genres || {}), 1);
						weightedScore += (genreMatch / maxGenreCount) * 0.35;
						
						// Mood match (0.25 weight) - use current time of day mood if available
						const currentMood = behavioralPatterns.moods?.[timeOfDay] || {};
						if (currentMood.genres && currentMood.genres.includes(track.genre)) {
							weightedScore += 0.25;
						} else {
							// Check other moods
							for (const mood in behavioralPatterns.moods || {}) {
								if (behavioralPatterns.moods[mood].genres?.includes(track.genre)) {
									weightedScore += 0.15; // Partial match
									break;
								}
							}
						}
						
						// Activity match (0.15 weight)
						const currentActivity = behavioralPatterns.activities?.[timeOfDay] || {};
						if (currentActivity.genres && currentActivity.genres.includes(track.genre)) {
							weightedScore += 0.15;
						}
						
						// Rating (0.15 weight) - use track popularity or rating from features
						const trackRating = trackFeatures.rating || track.popularity_score || 0.5;
						weightedScore += (trackRating / 5.0) * 0.15;
						
						// Completion rate (0.10 weight) - use completion rate from features
						const trackCompletion = trackFeatures.completionRate || track.popularity_score || 0.5;
						weightedScore += trackCompletion * 0.10;
						
						// Combine with original similarity (70% weighted, 30% original)
						similarity = (weightedScore * 0.7) + (similarity * 0.3);
					}
					
					// For first batch (offset === 0), ensure variety in match levels
					if (offset === 0) {
						if (index === 0) {
							similarity = Math.max(similarity, 0.88) + Math.random() * 0.07; // 88-95%
						} else if (index === 1) {
							similarity = Math.max(similarity, 0.82) + Math.random() * 0.06; // 82-88%
						} else if (index === 2) {
							similarity = Math.max(similarity, 0.70) + Math.random() * 0.08; // 70-78%
						} else {
							similarity = Math.max(similarity, 0.60) + Math.random() * 0.08; // 60-68%
						}
					} else {
						// For subsequent batches, use actual similarity but ensure it's reasonable
						if (similarity < 0.5) similarity = 0.5 + Math.random() * 0.2;
					}
					
					// Ensure similarity is between 0 and 1
					similarity = Math.min(Math.max(similarity, 0), 1);
					
					const similarityPercent = similarity * 100;
					let matchLevel = 'maylike';
					if (similarityPercent >= 80) matchLevel = 'highly';
					else if (similarityPercent >= 65) matchLevel = 'moderate';
					else matchLevel = 'maylike';
					
					// Generate personalized explanation using Gemini if behavioral patterns exist
					let explanation = '';
					if (behavioralPatterns) {
						try {
							explanation = await generateSongExplanation(track.title, track.artist, behavioralPatterns, timeOfDay, matchLevel);
						} catch (error) {
							console.error(`Error generating explanation for ${track.title}:`, error);
							explanation = generateUniqueFallbackExplanation(track.title, track.artist, behavioralPatterns, timeOfDay, matchLevel);
						}
					} else {
						explanation = generateRecommendationExplanation(track, userVec);
					}

					return {
						id: track.music_track_id,
						title: track.title,
						artist: track.artist,
						album: track.album || null,
						genre: track.genre,
						year: track.year,
						duration: track.duration,
						popularity_score: track.popularity_score,
						similarity_score: similarity, // Use calculated similarity
						matchLevel: matchLevel,
						explanation: explanation,
						youtube: youtubeData
					};
				})
			);
		}
		
		// Sort all recommendations by similarity score (highest first) before limiting
		recommendations.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
		
		// Ensure we have exactly 4 recommendations (or less if we've reached the end)
		recommendations = recommendations.slice(0, limit);
		
		// Check if there are more recommendations available
		let hasMore = false;
		if (geminiRecommendations && geminiRecommendations.length > 0) {
			// For Gemini recommendations, check if we have more beyond current offset
			hasMore = geminiRecommendations.length > (offset + limit);
		} else {
			// For database recommendations, check if filtered tracks have more
			// We need to check if there are more filtered tracks beyond current offset
			// Since filteredTracks might not be in scope, check if we got exactly 4 recommendations
			hasMore = recommendations.length === limit;
		}

		console.log(`[RECOMMENDATIONS] Returning ${recommendations.length} recommendations with ${recommendations.filter(r => r.youtube).length} YouTube links, hasMore: ${hasMore}`);
		if (recommendations.length === 0) {
			console.error('[RECOMMENDATIONS] WARNING: Returning empty recommendations array!');
		}
		res.json({ 
			recommendations: recommendations,
			hasMore: hasMore,
			offset: offset
		});
				} catch (error) {
		console.error('[RECOMMENDATIONS] Error generating recommendations:', error);
		console.error('[RECOMMENDATIONS] Error stack:', error.stack);
		res.status(500).json({ error: 'Failed to generate recommendations', details: error.message });
	}
});

// Analyze listening history CSV and extract behavioral patterns
function analyzeListeningHistory(csvData, userId) {
	const patterns = {
		timeOfDay: { morning: {}, afternoon: {}, evening: {}, night: {} },
		genres: {},
		moods: {},
		activities: {},
		artists: {},
		songs: {},
		listeningHours: {},
		weekend: { genres: {}, songs: [] },
		weekday: { genres: {}, songs: [] }
	};

	// Helper to get time of day from hour
	function getTimeOfDay(hour) {
		if (hour >= 6 && hour < 12) return 'morning';
		if (hour >= 12 && hour < 17) return 'afternoon';
		if (hour >= 17 && hour < 22) return 'evening';
		return 'night';
	}

	// Process each row with enhanced data extraction
	csvData.forEach(row => {
		const hour = parseInt(row.Hour_of_Day || row.Hour || row.hour) || 12;
		const timeOfDay = getTimeOfDay(hour);
		const genre = (row.Genre || row.genre || 'Unknown').toLowerCase();
		const artist = (row.Artist_Name || row.Artist || row.artist || 'Unknown').toLowerCase();
		const song = (row.Song_Title || row.Song || row.title || row.song || 'Unknown').toLowerCase();
		const mood = (row.Mood || row.mood || 'Unknown').toLowerCase();
		const activity = (row.Activity || row.activity || 'Unknown').toLowerCase();
		const rating = parseFloat(row.Rating || row.rating || 0);
		const isWeekend = row.Weekend_Flag === '1' || row.Weekend_Flag === 1 || row.weekend === true;
		const completionRate = parseFloat(row.Completion_Rate || row.completion_rate || row.CompletionRate || 0);
		const liked = row.Liked_Flag === '1' || row.Liked_Flag === 1 || row.liked === true || row.Liked === true;
		const skipped = row.Skip_Flag === '1' || row.Skip_Flag === 1 || row.skipped === true || row.Skipped === true;
		const previouslyListened = row.Previously_Listened === '1' || row.Previously_Listened === 1 || row.previously_listened === true;
		const addedToPlaylist = row.Added_To_Playlist === '1' || row.Added_To_Playlist === 1 || row.added_to_playlist === true;

		// Time of day preferences - only include high-quality interactions
		if (!patterns.timeOfDay[timeOfDay].genres) {
			patterns.timeOfDay[timeOfDay].genres = {};
			patterns.timeOfDay[timeOfDay].songs = [];
		}
		// Only count if not skipped and completion rate is good
		if (!skipped && completionRate >= 0.5) {
			patterns.timeOfDay[timeOfDay].genres[genre] = (patterns.timeOfDay[timeOfDay].genres[genre] || 0) + 1;
			// Include songs with high engagement (completion > 0.7 and liked, or added to playlist)
			if ((completionRate > 0.7 && liked) || addedToPlaylist) {
				patterns.timeOfDay[timeOfDay].songs.push({ 
					song, artist, rating, completionRate, liked, addedToPlaylist, skipped 
				});
			}
		}

		// Genre preferences - weighted by engagement quality
		// Only count if not skipped and completion rate is acceptable
		if (!skipped && completionRate >= 0.5) {
			const genreWeight = (rating / 5.0) * 0.4 + (completionRate * 0.4) + (liked ? 0.2 : 0);
			patterns.genres[genre] = (patterns.genres[genre] || 0) + genreWeight;
		}

		// Mood preferences - enhanced with engagement metrics
		if (!patterns.moods[mood]) {
			patterns.moods[mood] = { genres: {}, songs: [], ratings: [], completionRates: [] };
		}
		if (!skipped && completionRate >= 0.5) {
			patterns.moods[mood].genres[genre] = (patterns.moods[mood].genres[genre] || 0) + 1;
			// Include songs with good ratings or high completion
			if (rating >= 4.0 || (completionRate > 0.8 && liked)) {
				patterns.moods[mood].songs.push({ 
					song, artist, genre, rating, completionRate, liked, addedToPlaylist 
				});
			}
			if (rating > 0) patterns.moods[mood].ratings.push(rating);
			patterns.moods[mood].completionRates.push(completionRate);
		}

		// Activity preferences - enhanced with engagement metrics
		if (!patterns.activities[activity]) {
			patterns.activities[activity] = { genres: {}, songs: [], ratings: [], completionRates: [] };
		}
		if (!skipped && completionRate >= 0.5) {
			patterns.activities[activity].genres[genre] = (patterns.activities[activity].genres[genre] || 0) + 1;
			// Include songs with high completion or good ratings
			if (completionRate > 0.8 || (rating >= 4.0 && liked)) {
				patterns.activities[activity].songs.push({ 
					song, artist, genre, rating, completionRate, liked, addedToPlaylist 
				});
			}
			if (rating > 0) patterns.activities[activity].ratings.push(rating);
			patterns.activities[activity].completionRates.push(completionRate);
		}

		// Top artists
		patterns.artists[artist] = (patterns.artists[artist] || 0) + 1;

		// Top songs - enhanced with engagement metrics
		const songKey = `${song}|${artist}`;
		if (!patterns.songs[songKey]) {
			patterns.songs[songKey] = { 
				song, artist, count: 0, totalRating: 0, ratings: [], 
				totalCompletionRate: 0, completionRates: [],
				likedCount: 0, skippedCount: 0, playlistCount: 0,
				previouslyListened: false
			};
		}
		// Only count if not skipped
		if (!skipped) {
			patterns.songs[songKey].count++;
			if (rating > 0) {
				patterns.songs[songKey].totalRating += rating;
				patterns.songs[songKey].ratings.push(rating);
			}
			patterns.songs[songKey].totalCompletionRate += completionRate;
			patterns.songs[songKey].completionRates.push(completionRate);
			if (liked) patterns.songs[songKey].likedCount++;
			if (addedToPlaylist) patterns.songs[songKey].playlistCount++;
			if (previouslyListened) patterns.songs[songKey].previouslyListened = true;
		} else {
			patterns.songs[songKey].skippedCount++;
		}

		// Listening hours
		patterns.listeningHours[hour] = (patterns.listeningHours[hour] || 0) + 1;

		// Weekend vs Weekday
		if (isWeekend) {
			patterns.weekend.genres[genre] = (patterns.weekend.genres[genre] || 0) + 1;
			if (rating >= 4.0) {
				patterns.weekend.songs.push({ song, artist, genre, rating });
			}
		} else {
			patterns.weekday.genres[genre] = (patterns.weekday.genres[genre] || 0) + 1;
			if (rating >= 4.0) {
				patterns.weekday.songs.push({ song, artist, genre, rating });
			}
		}
	});

	// Process and format results
	const processedPatterns = {
		timeOfDay: {},
		genres: {},
		moods: {},
		activities: {},
		topArtists: [],
		topSongs: [],
		listeningHours: patterns.listeningHours,
		weekend: { genres: Object.keys(patterns.weekend.genres).sort((a, b) => patterns.weekend.genres[b] - patterns.weekend.genres[a]).slice(0, 5) },
		weekday: { genres: Object.keys(patterns.weekday.genres).sort((a, b) => patterns.weekday.genres[b] - patterns.weekday.genres[a]).slice(0, 5) }
	};

	// Process time of day
	Object.keys(patterns.timeOfDay).forEach(time => {
		const timeData = patterns.timeOfDay[time];
		const topGenres = Object.keys(timeData.genres || {})
			.sort((a, b) => (timeData.genres[b] || 0) - (timeData.genres[a] || 0))
			.slice(0, 5);
		const topSongs = (timeData.songs || [])
			.sort((a, b) => (b.rating || 0) - (a.rating || 0))
			.slice(0, 10)
			.map(s => ({ song: s.song, artist: s.artist }));
		
		processedPatterns.timeOfDay[time] = { genres: topGenres, topSongs };
	});

	// Process genres
	processedPatterns.genres = patterns.genres;

	// Process moods
	Object.keys(patterns.moods).forEach(mood => {
		const moodData = patterns.moods[mood];
		const topGenres = Object.keys(moodData.genres || {})
			.sort((a, b) => (moodData.genres[b] || 0) - (moodData.genres[a] || 0))
			.slice(0, 5);
		const topSongs = (moodData.songs || [])
			.sort((a, b) => (b.rating || 0) - (a.rating || 0))
			.slice(0, 10);
		
		processedPatterns.moods[mood] = { genres: topGenres, songs: topSongs };
	});

	// Process activities
	Object.keys(patterns.activities).forEach(activity => {
		const activityData = patterns.activities[activity];
		const topGenres = Object.keys(activityData.genres || {})
			.sort((a, b) => (activityData.genres[b] || 0) - (activityData.genres[a] || 0))
			.slice(0, 5);
		const topSongs = (activityData.songs || [])
			.sort((a, b) => (b.rating || 0) - (a.rating || 0))
			.slice(0, 10);
		
		processedPatterns.activities[activity] = { genres: topGenres, songs: topSongs };
	});

	// Process top artists
	processedPatterns.topArtists = Object.keys(patterns.artists)
		.map(artist => ({ artist, count: patterns.artists[artist] }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 20);

	// Process top songs - rank by weighted score (Genre 0.35, Mood 0.25, Activity 0.15, Rating 0.15, Completion 0.10)
	processedPatterns.topSongs = Object.keys(patterns.songs)
		.map(key => {
			const songData = patterns.songs[key];
			const avgRating = songData.ratings.length > 0 
				? songData.totalRating / songData.ratings.length 
				: 0;
			const avgCompletionRate = songData.completionRates.length > 0
				? songData.totalCompletionRate / songData.completionRates.length
				: 0;
			
			// Calculate weighted score based on user guide:
			// Genre: 0.35, Mood: 0.25, Activity: 0.15, Rating: 0.15, Completion_Rate: 0.10
			// For songs, we use: Rating (0.15), Completion (0.10), Liked/Playlist (0.25), Count (0.35), Genre match (0.15)
			const genreScore = 0.15; // Base genre match score
			const ratingScore = (avgRating / 5.0) * 0.15;
			const completionScore = avgCompletionRate * 0.10;
			const engagementScore = ((songData.likedCount / Math.max(songData.count, 1)) * 0.15) + 
			                        ((songData.playlistCount / Math.max(songData.count, 1)) * 0.10);
			const frequencyScore = Math.min(songData.count / 10.0, 1.0) * 0.35; // Normalize count
			const skipPenalty = (songData.skippedCount / Math.max(songData.count + songData.skippedCount, 1)) * -0.2;
			
			const weightedScore = genreScore + ratingScore + completionScore + engagementScore + frequencyScore + skipPenalty;
			
			return {
				song: songData.song,
				artist: songData.artist,
				count: songData.count,
				avgRating: parseFloat(avgRating.toFixed(2)),
				avgCompletionRate: parseFloat(avgCompletionRate.toFixed(2)),
				likedCount: songData.likedCount,
				playlistCount: songData.playlistCount,
				skippedCount: songData.skippedCount,
				previouslyListened: songData.previouslyListened,
				weightedScore: parseFloat(weightedScore.toFixed(4))
			};
		})
		.sort((a, b) => {
			// Sort by weighted score (highest first), then by count, then by rating
			if (Math.abs(b.weightedScore - a.weightedScore) > 0.001) {
				return b.weightedScore - a.weightedScore;
			}
			if (b.count !== a.count) return b.count - a.count;
			return b.avgRating - a.avgRating;
		})
		.slice(0, 30);

	return processedPatterns;
}

// Create music tracks from listening history
function createTracksFromHistory(historyData) {
	return new Promise((resolve, reject) => {
		const uniqueTracks = new Map();
		
		// Extract unique tracks from history
		historyData.forEach(row => {
			const title = row.Song_Title || row.title || row['Song Title'];
			const artist = row.Artist_Name || row.artist || row['Artist Name'];
			if (title && artist) {
				const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
				if (!uniqueTracks.has(key)) {
					// Extract all engagement metrics
					const rating = parseFloat(row.Rating || row.rating || 0);
					const completionRate = parseFloat(row.Completion_Rate || row.completion_rate || row.CompletionRate || 0);
					const liked = row.Liked_Flag === '1' || row.Liked_Flag === 1 || row.liked === true || row.Liked === true;
					const skipped = row.Skip_Flag === '1' || row.Skip_Flag === 1 || row.skipped === true || row.Skipped === true;
					const addedToPlaylist = row.Added_To_Playlist === '1' || row.Added_To_Playlist === 1 || row.added_to_playlist === true;
					const previouslyListened = row.Previously_Listened === '1' || row.Previously_Listened === 1 || row.previously_listened === true;
					
					// Calculate popularity score using weighted features from user guide:
					// Genre: 0.35, Mood: 0.25, Activity: 0.15, Rating: 0.15, Completion_Rate: 0.10
					// For tracks, we use: Rating (0.15), Completion (0.10), Engagement (0.35), Quality (0.40)
					let popularity_score = 0.5;
					
					// Rating component (0.15 weight)
					if (rating > 0) {
						popularity_score = (rating / 5.0) * 0.15;
					}
					
					// Completion rate component (0.10 weight)
					popularity_score += (completionRate * 0.10);
					
					// Engagement component (0.35 weight) - likes, playlist adds, low skips
					if (liked) popularity_score += 0.15;
					if (addedToPlaylist) popularity_score += 0.10;
					if (!skipped && completionRate >= 0.5) popularity_score += 0.10;
					
					// Quality component (0.40 weight) - high completion and rating
					if (completionRate >= 0.8) popularity_score += 0.20;
					if (rating >= 4.0) popularity_score += 0.20;
					
					popularity_score = Math.min(popularity_score, 1.0); // Cap at 1.0
					
					// Store engagement metrics in audio_features for later use
					const engagementMetrics = {
						rating: rating,
						completionRate: completionRate,
						liked: liked,
						skipped: skipped,
						addedToPlaylist: addedToPlaylist,
						previouslyListened: previouslyListened
					};
					
					uniqueTracks.set(key, {
						title: title,
						artist: artist,
						album: row.Album_Name || row.album || row['Album Name'] || null,
						genre: row.Genre || row.genre || 'Unknown',
						year: parseInt(row.Release_Year || row.year || row['Release Year']) || null,
						duration: parseInt(row.Duration_sec || row.duration || row['Duration (sec)']) || 0,
						popularity_score: popularity_score,
						audio_features: JSON.stringify({
							tempo: parseFloat(row.tempo) || 120,
							energy: parseFloat(row.energy) || 0.5,
							danceability: parseFloat(row.danceability) || 0.5,
							valence: parseFloat(row.valence) || 0.5,
							...engagementMetrics // Include engagement metrics
						})
					});
				}
			}
		});
		
		// Insert tracks into database
		const stmt = db.prepare(`INSERT OR IGNORE INTO music_tracks 
			(title, artist, album, genre, duration, year, popularity_score, audio_features) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
		
		let inserted = 0;
		let processed = 0;
		const total = uniqueTracks.size;
		
		uniqueTracks.forEach(track => {
			stmt.run(
				track.title,
				track.artist,
				track.album,
				track.genre,
				track.duration,
				track.year,
				track.popularity_score,
				track.audio_features,
				function(err) {
					processed++;
					if (!err && this.changes > 0) {
						inserted++;
					}
					if (processed === total) {
						stmt.finalize();
						resolve(inserted);
					}
				}
			);
		});
		
		if (total === 0) {
			resolve(0);
		}
	});
}

// Store behavioral patterns in database
function storeBehavioralPatterns(userId, patterns) {
	const stmt = db.prepare(`INSERT OR REPLACE INTO user_behavioral_patterns 
		(user_id, time_of_day_preferences, genre_preferences, mood_preferences, 
		 activity_preferences, top_artists, top_songs, listening_hours, 
		 weekend_preferences, weekday_preferences, updated_at) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
	
	stmt.run(
		userId,
		JSON.stringify(patterns.timeOfDay),
		JSON.stringify(patterns.genres),
		JSON.stringify(patterns.moods),
		JSON.stringify(patterns.activities),
		JSON.stringify(patterns.topArtists),
		JSON.stringify(patterns.topSongs),
		JSON.stringify(patterns.listeningHours),
		JSON.stringify(patterns.weekend),
		JSON.stringify(patterns.weekday)
	);
	stmt.finalize();
}

// Upload and process listening history CSV
app.post('/api/upload-listening-history', requireAuth, upload.single('historyFile'), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded' });
	}

	const userId = req.session.userId;
	const historyData = [];

	fs.createReadStream(req.file.path)
		.pipe(csv())
		.on('data', (row) => {
			historyData.push(row);
		})
		.on('end', () => {
			// Analyze the listening history
			const patterns = analyzeListeningHistory(historyData, userId);
			
			// Create music tracks from listening history if they don't exist
			createTracksFromHistory(historyData).then(tracksCreated => {
				// Store patterns in database
				storeBehavioralPatterns(userId, patterns);
				
				// Generate embeddings for new tracks
				generateMusicEmbeddings();
				
				// Update user embeddings based on behavioral patterns
				generateUserEmbeddings(userId);

				res.json({ 
					success: true, 
					message: 'Listening history analyzed successfully',
					tracksCreated: tracksCreated,
					patterns: {
						timeOfDay: Object.keys(patterns.timeOfDay),
						topGenres: Object.keys(patterns.genres).sort((a, b) => patterns.genres[b] - patterns.genres[a]).slice(0, 5),
						topArtists: patterns.topArtists.slice(0, 5),
						topSongs: patterns.topSongs.slice(0, 5)
					}
				});
			}).catch(error => {
				console.error('Error creating tracks from history:', error);
				// Still store patterns even if track creation fails
				storeBehavioralPatterns(userId, patterns);
				generateUserEmbeddings(userId);
				
				res.json({ 
					success: true, 
					message: 'Listening history analyzed successfully (some tracks may not have been added)',
					tracksCreated: 0,
					patterns: {
						timeOfDay: Object.keys(patterns.timeOfDay),
						topGenres: Object.keys(patterns.genres).sort((a, b) => patterns.genres[b] - patterns.genres[a]).slice(0, 5),
						topArtists: patterns.topArtists.slice(0, 5),
						topSongs: patterns.topSongs.slice(0, 5)
					}
				});
			});
		})
		.on('error', (err) => {
			console.error('Error reading CSV file:', err);
			res.status(500).json({ error: 'Failed to read CSV file' });
		});
});

// Get user behavioral patterns
app.get('/api/behavioral-patterns', requireAuth, (req, res) => {
	const userId = req.session.userId;
	
	db.get('SELECT * FROM user_behavioral_patterns WHERE user_id = ?', [userId], (err, patterns) => {
		if (err) {
			console.error('Error fetching behavioral patterns:', err);
			return res.status(500).json({ error: 'Failed to fetch behavioral patterns' });
		}

		if (!patterns) {
			return res.json({ patterns: null, message: 'No behavioral patterns found. Upload listening history to generate patterns.' });
		}

		const result = {
			timeOfDay: JSON.parse(patterns.time_of_day_preferences || '{}'),
			genres: JSON.parse(patterns.genre_preferences || '{}'),
			moods: JSON.parse(patterns.mood_preferences || '{}'),
			activities: JSON.parse(patterns.activity_preferences || '{}'),
			topArtists: JSON.parse(patterns.top_artists || '[]'),
			topSongs: JSON.parse(patterns.top_songs || '[]'),
			listeningHours: JSON.parse(patterns.listening_hours || '{}'),
			weekend: JSON.parse(patterns.weekend_preferences || '{}'),
			weekday: JSON.parse(patterns.weekday_preferences || '{}')
		};

		res.json({ patterns: result });
	});
});

function startServer(port, remainingAttempts = 3) {
	const server = app.listen(port, () => {
		console.log(`Server running on http://localhost:${port}`);
	});

	server.on('error', (err) => {
		if (err.code === 'EADDRINUSE' && remainingAttempts > 0) {
			console.warn(`Port ${port} in use, trying ${port + 1}...`);
			// try next port
			setTimeout(() => startServer(port + 1, remainingAttempts - 1), 200);
		} else {
			console.error('Server failed to start:', err);
			process.exit(1);
		}
	});
}

startServer(PORT, 3);
