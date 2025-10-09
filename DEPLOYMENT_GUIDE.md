# 🚀 Deployment Guide

## Firebase Configuration Complete! ✅

Your Firebase project is now configured with:
- **Project ID**: `personalizedreceng`
- **Frontend Config**: Updated in `public/firebase-config.js`
- **Server Config**: Updated in `server-firebase.js`
- **Firebase Files**: All configuration files created

## 🔐 Final Setup Steps

### 1. Get Service Account Key (for full server functionality)
1. Go to [Firebase Console](https://console.firebase.google.com/project/personalizedreceng)
2. Click the gear icon → "Project Settings"
3. Go to "Service Accounts" tab
4. Click "Generate new private key"
5. Download the JSON file
6. Rename it to `firebase-service-account.json`
7. Place it in your project root directory

### 2. Enable Authentication
1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Save changes

### 3. Create Firestore Database
1. Go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location close to your users

### 4. Deploy to Firebase Hosting

#### Option A: Using Firebase CLI (Recommended)
```bash
# Login to Firebase (run this in your terminal)
firebase login

# Deploy static files to hosting
firebase deploy --only hosting

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy everything
firebase deploy
```

#### Option B: Manual Upload
1. Go to [Firebase Console](https://console.firebase.google.com/project/personalizedreceng/hosting)
2. Click "Get started"
3. Upload your `public` folder contents

## 🌐 Your Live URLs

After deployment, your app will be available at:
- **Main App**: `https://personalizedreceng.firebaseapp.com`
- **Custom Domain**: `https://personalizedreceng.web.app`

## 🔧 Development Commands

```bash
# Local development (SQLite)
npm start

# Local development (Firebase - requires service account key)
npm run start:firebase

# Deploy to Firebase
firebase deploy
```

## 📊 Firebase Console Access

- **Project Console**: https://console.firebase.google.com/project/personalizedreceng
- **Hosting**: https://console.firebase.google.com/project/personalizedreceng/hosting
- **Authentication**: https://console.firebase.google.com/project/personalizedreceng/authentication
- **Firestore**: https://console.firebase.google.com/project/personalizedreceng/firestore

## 🎯 Next Steps

1. ✅ Complete the service account key setup
2. ✅ Enable Authentication and Firestore
3. ✅ Run `firebase login` in your terminal
4. ✅ Run `firebase deploy` to go live!

## 🆘 Troubleshooting

- **"Permission denied"**: Make sure you're logged in with `firebase login`
- **"Project not found"**: Verify your Firebase project ID is correct
- **"Service account error"**: Ensure `firebase-service-account.json` is in project root
- **"Hosting not configured"**: Run `firebase deploy --only hosting` first

Your personalized recommendation engine is ready for deployment! 🚀
