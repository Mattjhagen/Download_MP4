# Use a Node.js base image on Debian Bookworm (includes Python 3.11)
FROM node:20-bookworm-slim

# Install FFmpeg, Python 3, and curl (required for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment and install yt-dlp
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install -U yt-dlp

# Set yt-dlp path for the server to use
ENV YT_DLP_PATH=/opt/venv/bin/yt-dlp

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
