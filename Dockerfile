# Use a Node.js 20 base image that's Debian-based
FROM node:20-slim

# Set up the working directory
WORKDIR /app

# Install necessary dependencies for Puppeteer/Chromium
# This is the crucial part for Cloud Run
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package.json ./
COPY package-lock.json ./

# Use npm ci for faster, more reliable builds
# Also, prevent Puppeteer from downloading a browser binary during this step
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci

# Copy the rest of the application code
COPY . .

# Puppeteer will use the browser from the @puppeteer/browsers package.
# The Dockerfile expects the browser to be downloaded, so we don't need to do anything special here.
# The 'PUPPETEER_EXECUTABLE_PATH' is not needed if we use the default browser download location.

# The app listens on the PORT environment variable, which Cloud Run sets.
# No need to expose a port here, but we can keep it for clarity.
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
