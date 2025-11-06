# Dockerfile for Cloud Run deployment
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files (excluding files in .dockerignore)
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p data uploads && \
    chmod 755 data uploads

# Expose port (Cloud Run will set PORT env variable)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "index.js"]

