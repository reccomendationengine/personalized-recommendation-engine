# Personalized Recommendation Engine

A modern recommendation engine built with Node.js, Express, and Firebase. Features user authentication, preference tracking, and personalized content recommendations.

## 🚀 Features

- **User Authentication**: Secure signup/login with Firebase Auth
- **User Profiles**: Store user preferences and interaction history
- **Recommendation System**: Personalized content recommendations (framework ready)
- **Modern UI**: Clean, responsive web interface
- **Cloud-Ready**: Deployed on Firebase Hosting with Firestore database

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Database**: Firebase Firestore (with SQLite fallback)
- **Authentication**: Firebase Authentication
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Hosting**: Firebase Hosting

## 📦 Quick Start

### Option 1: Local Development (SQLite)
```bash
npm install
npm start
```
Open http://localhost:3000

### Option 2: Firebase Integration
1. Follow the [Firebase Setup Guide](FIREBASE_SETUP.md)
2. Configure your Firebase project
3. Run: `npm run start:firebase`
4. Deploy: `firebase deploy`

## 📁 Project Structure

```
├── public/                 # Frontend files
│   ├── firebase-config.js # Firebase configuration
│   ├── index.html         # Home page
│   ├── login.html         # Login page
│   └── ...
├── server-firebase.js     # Firebase-enabled server
├── index.js              # Original SQLite server
├── firebase.json         # Firebase hosting config
└── FIREBASE_SETUP.md     # Detailed setup guide
```

## 🔧 Development

- **SQLite Mode**: `npm start` (uses local SQLite database)
- **Firebase Mode**: `npm run start:firebase` (uses Firebase services)
- **Deploy**: `firebase deploy`

## 📚 Documentation

- [Firebase Setup Guide](FIREBASE_SETUP.md) - Complete Firebase integration guide
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions
- [API Documentation](docs/API.md) - API endpoints and usage

## 🔥 Firebase Project Ready!

- **Project ID**: `personalizedreceng`
- **Status**: ✅ Configured and ready for deployment
- **Next Step**: Follow [Deployment Guide](DEPLOYMENT_GUIDE.md) to go live!

## 🎯 Roadmap

- [ ] Implement recommendation algorithms
- [ ] Add content management system
- [ ] User interaction tracking
- [ ] Machine learning integration
- [ ] Mobile app support
