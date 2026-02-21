const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const app = express();
const PORT = process.env.PORT || 3000;
const TMP_DIR = path.resolve(process.env.TMP_DIR || path.join(__dirname, 'tmp'));
const CONVERSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_CONVERSIONS = 3;

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors({ origin: true }));

const convertRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many conversion requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Allowed video hostnames (yt-dlp supports many more; extend as needed)
const ALLOWED_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'fb.com', 'm.facebook.com',
  'instagram.com', 'www.instagram.com',
  'dailymotion.com', 'www.dailymotion.com', 'dm.tudou.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  'soundcloud.com', 'www.soundcloud.com',
  'twitch.tv', 'www.twitch.tv', 'clips.twitch.tv',
  'reddit.com', 'www.reddit.com', 'v.redd.it', 'old.reddit.com',
  'bandcamp.com', 'www.bandcamp.com',
  'ted.com', 'www.ted.com',
]);

function isValidVideoUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return false;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const withWww = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host) || ALLOWED_HOSTS.has(withWww)) return true;
  // Allow known CDN / embed patterns that yt-dlp might resolve
  if (host.endsWith('.youtube.com') || host.endsWith('.vimeo.com')) return true;
  return false;
}

function removeFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) console.error('Error deleting file:', err);
  });
}

let activeConversions = 0;
const conversionQueue = [];

function runWithConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeConversions++;
      fn()
        .then((result) => {
          activeConversions--;
          resolve(result);
          if (conversionQueue.length > 0) conversionQueue.shift()();
        })
        .catch((err) => {
          activeConversions--;
          reject(err);
          if (conversionQueue.length > 0) conversionQueue.shift()();
        });
    };
    if (activeConversions < MAX_CONCURRENT_CONVERSIONS) {
      run();
    } else {
      conversionQueue.push(run);
    }
  });
}

function getYtDlpExec() {
  const bin = process.env.YT_DLP_PATH;
  if (bin) {
    return youtubedl.create(bin);
  }
  return youtubedl;
}

app.post('/api/convert', convertRateLimiter, async (req, res) => {
  const run = async () => {
    let videoFile;
    let audioFile;
    let finalFile;
    let timeoutId;

    try {
      const { url, format = 'mp3' } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing URL' });
      if (!isValidVideoUrl(url)) {
        return res.status(400).json({ error: 'Unsupported or invalid video URL' });
      }

      videoFile = path.join(TMP_DIR, `${randomUUID()}.mp4`);
      audioFile = path.join(TMP_DIR, `${randomUUID()}.mp3`);
      const exec = getYtDlpExec();

      const conversionPromise = (async () => {
        if (format === 'mp3') {
          // Audio only flow
          await exec.exec(url.trim(), {
            output: videoFile,
            format: 'bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: false,
            addHeader: ['referer:https://www.youtube.com/', 'user-agent: Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0'],
          });

          await new Promise((resolve, reject) => {
            ffmpeg(videoFile)
              .noVideo()
              .audioCodec('libmp3lame')
              .audioBitrate(128)
              .save(audioFile)
              .on('end', () => resolve())
              .on('error', (err) => reject(err));
          });
          finalFile = audioFile;

        } else {
          // Video flow (mp4_hd or mp4_sd)
          // bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best -> this ensures we get a single mp4 file or merge them
          const formatString = format === 'mp4_hd'
            ? 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            : 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4]/best';

          await exec.exec(url.trim(), {
            output: videoFile,
            format: formatString,
            mergeOutputFormat: 'mp4',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: false,
            addHeader: ['referer:https://www.youtube.com/', 'user-agent: Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0'],
          });
          finalFile = videoFile;
        }
      })();

      const timeoutPromise = new Promise((_, rej) => {
        timeoutId = setTimeout(() => rej(new Error('Conversion timeout (max 5 minutes)')), CONVERSION_TIMEOUT_MS);
      });

      await Promise.race([conversionPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const downloadName = format === 'mp3' ? 'audio.mp3' : 'video.mp4';

      res.download(finalFile, downloadName, (err) => {
        clearTimeout(timeoutId);
        removeFile(videoFile);
        removeFile(audioFile);
        if (err && !res.headersSent) console.error('Download send error:', err);
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      removeFile(videoFile);
      removeFile(audioFile);
      console.error('Conversion error:', error);
      const message = error.message || 'Conversion failed';
      res.status(500).json({ error: message });
    }
  };

  runWithConcurrencyLimit(run).catch((err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Conversion failed' });
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
