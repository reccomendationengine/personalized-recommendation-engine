/**
 * Build Script
 * Creates required directories for the application
 */

const fs = require('fs');
const path = require('path');

// Create uploads directory for temporary file storage
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

console.log('Build completed successfully!');
