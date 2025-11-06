# Run Server Locally - Quick Commands

## Start the Server

```bash
cd "/Users/sayedtamimhashemi/Desktop/New Submissions/Github/personalized-recommendation-engine-demoThree-fresh"
npm start
```

## Stop the Server

Press `Ctrl + C` in the terminal where the server is running.

Or use:
```bash
pkill -f "node index.js"
```

## Restart the Server

```bash
cd "/Users/sayedtamimhashemi/Desktop/New Submissions/Github/personalized-recommendation-engine-demoThree-fresh"
pkill -f "node index.js" 2>/dev/null; sleep 1 && npm start
```

## Clear Everything and Restart

```bash
cd "/Users/sayedtamimhashemi/Desktop/New Submissions/Github/personalized-recommendation-engine-demoThree-fresh"
pkill -f "node index.js" 2>/dev/null
rm -rf uploads/*
rm -f data/user-demo.db
npm start
```

## Access the Application

Once the server is running:
- **URL**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Check if Server is Running

```bash
curl http://localhost:3000/health
```

## View Server Logs

The server logs will appear in the terminal where you ran `npm start`.

## Environment Variables (Optional)

If you have a Gemini API key, set it before starting:

```bash
export GEMINI_API_KEY=your-api-key-here
npm start
```

Or create a `.env` file:
```
GEMINI_API_KEY=your-api-key-here
```

