// Minimal Express server to serve the demo app (for development/demo only)
const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Database setup: open or create a local SQLite database file and run schema.sql ---
const DB_FILE = path.join(__dirname, 'data', 'user-demo.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// Ensure data directory exists
try {
	fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
} catch (err) {
	console.error('Failed to create data directory:', err);
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
			}
		});
	} catch (fsErr) {
		console.error('Failed to read schema.sql:', fsErr);
	}
});

// Simple health route
app.get('/health', (req, res) => res.json({status: 'ok'}));

// Demo login endpoint (NO real auth - for demo only)
app.post('/login', (req, res) => {
	const { email, password } = req.body || {};
	if (!email || !password) {
		// If form submit, redirect back with 400 status text; otherwise JSON
		if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
			return res.status(400).send('email and password required');
		}
		return res.status(400).json({ error: 'email and password required' });
	}

	// Demo: accept any credentials. For form posts, redirect back to home.
	if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
		// Redirect form logins to the welcome page
		return res.redirect('/welcome.html');
	}

	return res.json({ success: true, message: 'Demo login accepted', email });
});

// Signup endpoint: create a new user in the SQLite database
app.post('/signup', (req, res) => {
	const { username, email, password } = req.body || {};

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

	if (password.length < 6) {
		return res.status(400).json({ error: 'password must be at least 6 characters' });
	}

	// Hash the password
	const saltRounds = 10;
	bcrypt.hash(password, saltRounds, (hashErr, passwordHash) => {
		if (hashErr) {
			console.error('Error hashing password:', hashErr);
			return res.status(500).json({ error: 'internal error' });
		}

		// Insert user into DB
		const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
		stmt.run(username || null, email, passwordHash, function (err) {
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
