# Use a Node.js base image on Debian Bookworm (includes Python 3.11)
FROM node:20-bookworm-slim

# Install FFmpeg, Python 3, pip, and curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally with the EJS python dependency group for JS challenges
RUN pip3 install --no-cache-dir --upgrade "yt-dlp[default]" --break-system-packages

# Set yt-dlp path for the server to use
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy the rest of your backend code
COPY . .

# Expose the port your API uses
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
