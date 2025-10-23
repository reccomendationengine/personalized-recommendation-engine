-- Simple users table for the demo app
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT,
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	date_of_birth DATE,
	phone_number TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Music tracks table
CREATE TABLE IF NOT EXISTS music_tracks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	album TEXT,
	genre TEXT,
	duration INTEGER, -- in seconds
	year INTEGER,
	popularity_score REAL DEFAULT 0.0,
	audio_features TEXT, -- JSON string for features like tempo, energy, etc.
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User music interactions (ratings, plays, likes)
CREATE TABLE IF NOT EXISTS user_music_interactions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	music_track_id INTEGER NOT NULL,
	interaction_type TEXT NOT NULL, -- 'rating', 'play', 'like', 'skip'
	value REAL, -- rating value (1-5) or play duration
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users (id),
	FOREIGN KEY (music_track_id) REFERENCES music_tracks (id),
	UNIQUE(user_id, music_track_id, interaction_type)
);

-- User embeddings for 2-tower algorithm
CREATE TABLE IF NOT EXISTS user_embeddings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	embedding_vector TEXT NOT NULL, -- JSON array of embedding values
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users (id),
	UNIQUE(user_id)
);

-- Music track embeddings for 2-tower algorithm
CREATE TABLE IF NOT EXISTS music_embeddings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	music_track_id INTEGER NOT NULL,
	embedding_vector TEXT NOT NULL, -- JSON array of embedding values
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (music_track_id) REFERENCES music_tracks (id),
	UNIQUE(music_track_id)
);
