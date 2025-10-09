# Firebase Setup Guide

## 🚀 Quick Setup Steps

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `personalized-recommendation-engine`
4. Enable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Authentication
1. In Firebase Console, go to "Authentication" > "Sign-in method"
2. Enable "Email/Password" provider
3. Save changes

### 3. Create Firestore Database
1. Go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (choose closest to your users)

### 4. Get Configuration
1. Go to "Project Settings" (gear icon)
2. Scroll down to "Your apps"
3. Click "Web app" icon (`</>`)
4. Register app with name: `recommendation-engine-web`
5. Copy the Firebase config object

### 5. Update Configuration Files

#### Update `public/firebase-config.js`:
Replace the placeholder config with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-actual-sender-id",
  appId: "your-actual-app-id"
};
```

#### Update `server-firebase.js`:
Replace `"your-project-id"` with your actual project ID.

### 6. Get Service Account Key (for server-side)
1. Go to "Project Settings" > "Service Accounts"
2. Click "Generate new private key"
3. Download the JSON file
4. Rename it to `firebase-service-account.json`
5. Place it in your project root directory

### 7. Update Package.json Scripts
Add this to your `package.json` scripts section:
```json
"scripts": {
  "start": "node index.js",
  "start:firebase": "node server-firebase.js",
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

### 8. Deploy to Firebase Hosting
1. Run: `firebase login` (in your terminal)
2. Run: `firebase use --add` (select your project)
3. Run: `firebase deploy`

## 🔧 Development Commands

```bash
# Start with SQLite (original)
npm start

# Start with Firebase (new)
npm run start:firebase

# Deploy to Firebase
firebase deploy
```

## 📁 Project Structure After Firebase Setup

```
├── public/
│   ├── firebase-config.js    # Frontend Firebase config
│   ├── index.html
│   ├── login.html
│   └── ...
├── firebase.json             # Firebase hosting config
├── firestore.rules           # Database security rules
├── firestore.indexes.json    # Database indexes
├── server-firebase.js        # Firebase-enabled server
├── firebase-service-account.json  # Server auth (keep secret!)
└── index.js                  # Original SQLite server
```

## 🔐 Security Notes

- Never commit `firebase-service-account.json` to version control
- Add it to your `.gitignore` file
- The Firestore rules provided allow users to only access their own data

## 🎯 Next Steps

1. Complete Firebase setup using this guide
2. Test the Firebase-enabled server: `npm run start:firebase`
3. Update frontend to use Firebase Auth instead of custom auth
4. Implement recommendation algorithms in Firestore
5. Deploy to Firebase Hosting

## 🆘 Troubleshooting

- **"Firebase not initialized"**: Check your service account file
- **"Permission denied"**: Check Firestore rules
- **"Auth failed"**: Verify Firebase config in frontend
