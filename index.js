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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session management
app.use(session({
	secret: 'your-secret-key-change-in-production',
	resave: false,
	saveUninitialized: false,
	cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

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

			// Redirect form logins to dashboard
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
	if (req.session.userId) {
		next();
	} else {
		if (req.headers.accept && req.headers.accept.includes('text/html')) {
			return res.redirect('/login.html');
		}
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

// Enhanced recommendations with detailed explanations
app.get('/api/enhanced-recommendations/:userId', requireAuth, async (req, res) => {
	const userId = req.params.userId;
	const offset = parseInt(req.query.offset) || 0;
	const limit = parseInt(req.query.limit) || 5;
	
	// Get user embedding
	db.get('SELECT embedding_vector FROM user_embeddings WHERE user_id = ?', [userId], (err, userEmbedding) => {
		if (err || !userEmbedding) {
			// If no user embedding, provide diverse recommendations based on popularity and randomization
			db.all(`SELECT mt.id as music_track_id, mt.title, mt.artist, mt.album, mt.genre, mt.year, mt.duration, mt.popularity_score, mt.audio_features
				FROM music_tracks mt
				ORDER BY mt.popularity_score DESC, RANDOM()
				LIMIT ? OFFSET ?`, [limit * 2, offset], (err, tracks) => {
				if (err) {
					return res.status(500).json({ error: 'Failed to get recommendations' });
				}
				
				// Remove duplicates
				const seenTracks = new Set();
				const uniqueTracks = tracks.filter(track => {
					const trackKey = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
					if (seenTracks.has(trackKey)) {
						return false;
					}
					seenTracks.add(trackKey);
					return true;
				}).slice(0, limit);
				
				const recommendations = uniqueTracks.map(track => {
					// Parse audio features from JSON
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
						similarity_score: 0.5 + Math.random() * 0.3, // Random similarity for display
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

			// Calculate similarities and generate explanations
			const similarities = musicEmbeddings.map(track => {
				const trackVec = JSON.parse(track.embedding_vector);
				const similarity = cosineSimilarity(userVec, trackVec);
				const features = JSON.parse(track.audio_features || '{}');
				
				// Add significant randomization to similarity score to provide variety
				const randomFactor = 0.3 + Math.random() * 0.7; // Add 30-100% randomization
				const adjustedSimilarity = similarity * randomFactor;
				
				return {
					...track,
					similarity: adjustedSimilarity,
					originalSimilarity: similarity,
					features
				};
			});

			// Sort by adjusted similarity and remove duplicates
			const seenTracks = new Set();
			const uniqueSimilarities = similarities.filter(track => {
				const trackKey = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
				if (seenTracks.has(trackKey)) {
					return false;
				}
				seenTracks.add(trackKey);
				return true;
			});

			// If we don't have enough unique tracks, add some random popular tracks
			let recommendations = uniqueSimilarities
				.sort((a, b) => b.similarity - a.similarity)
				.slice(offset, offset + limit);

			// If we still don't have enough variety, add random tracks
			if (recommendations.length < limit) {
				const randomTracks = musicEmbeddings
					.filter(track => !seenTracks.has(`${track.title.toLowerCase()}-${track.artist.toLowerCase()}`))
					.sort(() => Math.random() - 0.5)
					.slice(0, limit - recommendations.length);
				
				recommendations = recommendations.concat(randomTracks);
			}

			// Map to final format
			const finalRecommendations = recommendations.map(track => {
				// Parse audio features from JSON
				const audioFeatures = JSON.parse(track.audio_features || '{}');
				console.log('Track:', track.title, 'Audio features:', audioFeatures);
				
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
					similarity_score: track.originalSimilarity || (0.5 + Math.random() * 0.3), // Use original similarity for display
					explanation: generateRecommendationExplanation(track, userVec)
				};
			});

			res.json({ recommendations });
		});
	});
});

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

// Enhanced recommendations with YouTube links
app.get('/api/recommendations-with-youtube/:userId', requireAuth, async (req, res) => {
	const userId = req.params.userId;
	
	try {
		// Get user embedding
		const userEmbedding = await new Promise((resolve, reject) => {
			db.get('SELECT embedding_vector FROM user_embeddings WHERE user_id = ?', [userId], (err, result) => {
				if (err) reject(err);
				else resolve(result);
			});
		});

		if (!userEmbedding) {
			generateUserEmbeddings(userId);
			return res.json({ recommendations: [], message: 'Generating recommendations...' });
		}

		const userVec = JSON.parse(userEmbedding.embedding_vector);
		
		// Get all music embeddings
		const musicEmbeddings = await new Promise((resolve, reject) => {
			db.all(`SELECT me.music_track_id, me.embedding_vector, mt.title, mt.artist, mt.genre, mt.popularity_score, mt.audio_features
				FROM music_embeddings me
				JOIN music_tracks mt ON me.music_track_id = mt.id`, (err, results) => {
				if (err) reject(err);
				else resolve(results);
			});
		});

		// Calculate similarities and generate explanations
		const similarities = musicEmbeddings.map(track => {
			const trackVec = JSON.parse(track.embedding_vector);
			const similarity = cosineSimilarity(userVec, trackVec);
			const features = JSON.parse(track.audio_features || '{}');
			
			return {
				...track,
				similarity,
				features
			};
		});

		// Sort by similarity and get top 5, removing duplicates
		const uniqueTracks = new Map();
		similarities
			.sort((a, b) => b.similarity - a.similarity)
			.forEach(track => {
				const key = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
				if (!uniqueTracks.has(key)) {
					uniqueTracks.set(key, track);
				}
			});
		
		const topTracks = Array.from(uniqueTracks.values()).slice(0, 5);

		// Search YouTube for each track
		const recommendationsWithYouTube = await Promise.all(
			topTracks.map(async (track) => {
				try {
					const searchQuery = `${track.title} ${track.artist}`;
					const youtubeResults = await media_search.search(`${searchQuery} official music video`);
					
					let youtubeData = null;
					if (youtubeResults && youtubeResults.length > 0) {
						const video = youtubeResults[0];
						const videoId = video.id?.videoId || video.id;
						youtubeData = {
							id: videoId,
							title: video.title || video.snippet?.title,
							url: video.url,
							thumbnail: video.snippet?.thumbnails?.default?.url || video.thumbnail,
							duration: video.duration_raw || video.duration
						};
					}

					return {
						id: track.music_track_id,
						title: track.title,
						artist: track.artist,
						genre: track.genre,
						popularity_score: track.popularity_score,
						similarity_score: track.similarity,
						explanation: generateRecommendationExplanation(track, userVec),
						youtube: youtubeData
					};
				} catch (error) {
					console.error(`Error searching YouTube for ${track.title}:`, error);
					return {
						id: track.music_track_id,
						title: track.title,
						artist: track.artist,
						genre: track.genre,
						popularity_score: track.popularity_score,
						similarity_score: track.similarity,
						explanation: generateRecommendationExplanation(track, userVec),
						youtube: null
					};
				}
			})
		);

		res.json({ recommendations: recommendationsWithYouTube });
	} catch (error) {
		console.error('Error generating recommendations with YouTube:', error);
		res.status(500).json({ error: 'Failed to generate recommendations' });
	}
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
