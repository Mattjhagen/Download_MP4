# Video to MP3 Converter

Web app that converts video URLs (YouTube, Twitter, Facebook, Vimeo, TikTok, etc.) to MP3. Paste a link, get an audio file. Built with Node.js, Express, **yt-dlp**, and **ffmpeg**.

## Prerequisites

Install these before setup:

- **Node.js** v18 or newer ([nodejs.org](https://nodejs.org))
- **ffmpeg** with MP3 support (e.g. `brew install ffmpeg` on macOS)
- **Git** (to clone the repo)

**yt-dlp** is pulled in automatically by the app. To use your own binary instead, set `YT_DLP_PATH` in `.env` (see Configuration).

## Setup

### 1. Clone the repository

```bash
git clone git@github.com:Mattjhagen/Download_MP4.git
cd Download_MP4
```

### 2. Install dependencies

```bash
npm install
```

### 3. (Optional) Configure environment

```bash
cp .env.example .env
```

Edit `.env` to set:

- `PORT` – port the server listens on (default: `3000`)
- `YT_DLP_PATH` – path to your yt-dlp binary (optional)
- `TMP_DIR` – directory for temporary files (default: `./tmp`)

You can skip this step and run with defaults.

### 4. Run the server

```bash
npm start
```

Open **http://localhost:3000** in your browser. Paste a video URL and click **Convert to MP3**.

## Project structure

| Path                | Purpose                           |
|---------------------|-----------------------------------|
| `server.js`         | Express server and `/api/convert` |
| `public/index.html` | Main page with URL input         |
| `public/js/app.js`  | Client-side convert & download   |
| `public/terms.html` | Terms of Service                 |
| `public/robots.txt` | Crawler rules                     |
| `public/sitemap.xml`| XML sitemap for SEO              |
| `tmp/`              | Temporary files (gitignored)      |

## Configuration (.env)

| Variable     | Description                          | Default |
|-------------|--------------------------------------|---------|
| `PORT`      | Server port                          | `3000`  |
| `YT_DLP_PATH` | Path to yt-dlp binary (optional)  | (bundled) |
| `TMP_DIR`   | Directory for temp video/audio files | `./tmp` |

## Legal

Use only for content you own or have permission to download. See [Terms of Service](public/terms.html). Respect platform terms and copyright.

## Deploying

**Option A – GitHub Pages + Render (recommended):** Frontend in `docs/` for GitHub Pages; backend on Render via Docker. See steps below.

**Option B – Your own server:** On your server: install Node.js, ffmpeg, and (if needed) yt-dlp. Run the app with a process manager (e.g. **pm2**) behind a reverse proxy (e.g. **Nginx**) with HTTPS (e.g. Let’s Encrypt). Rate limiting and CORS are already configured in the app.

**GitHub Pages + Render steps:** (1) Push repo, then open [Render Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/Mattjhagen/Download_MP4) → sign in with GitHub → select Download_MP4 → Apply → copy service URL. (2) Repo **Settings** → **Pages** → Source: Deploy from branch → branch **main**, folder **/docs** → Save. (3) Edit `docs/js/config.js`: set `window.API_BASE = 'https://your-render-url.onrender.com';` then commit and push. (4) **Custom domain:** The site is configured for **https://globalnexus.online**. In GitHub Pages settings, add `globalnexus.online` as a custom domain and set the required DNS records (CNAME or A) at your registrar.
