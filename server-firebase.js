// Firebase-enabled Express server for the recommendation engine
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Fallback to file for local development
    serviceAccount = require('./personalizedreceng-firebase-adminsdk-fbsvc-21cc18d3fc.json');
  }
} catch (error) {
  console.error('Firebase service account configuration not found.');
  console.error('Please set FIREBASE_SERVICE_ACCOUNT environment variable or add service account JSON file.');
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "personalizedreceng"
  });
  
  const db = admin.firestore();
  console.log('Firebase Admin SDK initialized successfully');
  
  // Middleware to add db to requests
  app.use((req, res, next) => {
    req.db = db;
    next();
  });
} else {
  console.log('Running in development mode without Firebase');
}

// Simple health route
app.get('/health', (req, res) => res.json({status: 'ok', firebase: !!serviceAccount}));

// Firebase Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// User registration endpoint using Firebase Auth
app.post('/signup', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  try {
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username || null
    });

    // Store additional user data in Firestore
    await req.db.collection('users').doc(userRecord.uid).set({
      email: email,
      username: username || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      preferences: {
        genres: [],
        categories: []
      }
    });

    res.json({ 
      success: true, 
      uid: userRecord.uid, 
      email: email 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(400).json({ error: 'email already registered' });
    } else {
      res.status(500).json({ error: 'failed to create user' });
    }
  }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userDoc = await req.db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists) {
      res.json(userDoc.data());
    } else {
      res.status(404).json({ error: 'user not found' });
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'failed to fetch profile' });
  }
});

// Update user preferences
app.put('/api/user/preferences', authenticateToken, async (req, res) => {
  try {
    await req.db.collection('users').doc(req.user.uid).update({
      preferences: req.body.preferences,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'failed to update preferences' });
  }
});

// Get recommendations (placeholder for now)
app.get('/api/recommendations', authenticateToken, async (req, res) => {
  try {
    // This is where you'll implement your recommendation algorithm
    // For now, return some mock data
    const recommendations = [
      { id: '1', title: 'Sample Item 1', type: 'movie', rating: 4.5 },
      { id: '2', title: 'Sample Item 2', type: 'book', rating: 4.2 },
      { id: '3', title: 'Sample Item 3', type: 'music', rating: 4.8 }
    ];
    
    res.json({ recommendations });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'failed to fetch recommendations' });
  }
});

// Record user interaction (like, view, purchase)
app.post('/api/interactions', authenticateToken, async (req, res) => {
  try {
    const { contentId, interactionType, rating } = req.body;
    
    await req.db.collection('user_interactions').doc(req.user.uid).collection('interactions').add({
      contentId,
      interactionType, // 'like', 'view', 'purchase', 'rating'
      rating: rating || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording interaction:', error);
    res.status(500).json({ error: 'failed to record interaction' });
  }
});

function startServer(port, remainingAttempts = 3) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log('Firebase integration:', serviceAccount ? 'Enabled' : 'Disabled (Development mode)');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && remainingAttempts > 0) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      setTimeout(() => startServer(port + 1, remainingAttempts - 1), 200);
    } else {
      console.error('Server failed to start:', err);
      process.exit(1);
    }
  });
}

startServer(PORT, 3);
