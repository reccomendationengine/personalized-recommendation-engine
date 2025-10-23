// build.js
const fs = require('fs');
const path = require('path');

// Ensure required directories exist
const dirs = ['data', 'uploads'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

console.log('Build completed successfully!');