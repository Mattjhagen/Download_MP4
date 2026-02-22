const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { EPub } = require('epub2');

require('dotenv').config();
const stripeKeyRaw = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API;
const stripeKey = stripeKeyRaw ? stripeKeyRaw.trim() : null;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

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
const UPLOADS_DIR = path.join(TMP_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const upload = multer({ dest: UPLOADS_DIR });

app.use(express.static(path.join(__dirname, 'public')));

// Stripe Webhook MUST be placed before app.use(express.json()) to access the raw body
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  const webhookSecretRaw = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK;
  const webhookSecret = webhookSecretRaw ? webhookSecretRaw.trim() : null;
  if (!stripe || !webhookSecret) {
    return res.status(400).send(`Webhook Error: Stripe or Webhook Secret not configured`);
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const domain = session.metadata.domain;

    if (domain) {
      console.log(`Payment successful for domain: ${domain}. Registering via Dynadot...`);
      try {
        const apiKey = process.env.DYNADOT_API_KEY || '8z9R6Z7D8i8JF84LE7P8g7j9J9W706n9R9F6YRa7E7X';
        const dynadotRes = await fetch('https://api.dynadot.com/api3.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            key: apiKey,
            command: 'register',
            domain0: domain,
            duration0: '1'
          })
        });
        const data = await dynadotRes.json();
        console.log('Dynadot Registration Response:', data);
      } catch (err) {
        console.error('Failed to register domain with Dynadot:', err);
      }
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

app.use(express.json());

const allowedOrigins = [
  'https://globalnexus.online',
  'https://www.globalnexus.online'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }

    return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
  }
}));

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
    let tempCookiesFile;
    const reqId = randomUUID();

    try {
      const { url, format = 'mp3' } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing URL' });
      if (!isValidVideoUrl(url)) {
        return res.status(400).json({ error: 'Unsupported or invalid video URL' });
      }

      const exec = getYtDlpExec();
      const uniqueId = randomUUID();
      videoFile = path.join(TMP_DIR, `${uniqueId}.%(ext)s`);

      // Setup cookies
      let cookiesFile = null;
      if (fs.existsSync('/etc/secrets/cookies.txt')) {
        // Render Secrets are mounted read-only, and yt-dlp writes to the cookiejar on exit.
        // We must copy it to /tmp so it has write permissions.
        tempCookiesFile = path.join(TMP_DIR, `cookies-${uniqueId}.txt`);
        fs.copyFileSync('/etc/secrets/cookies.txt', tempCookiesFile);
        cookiesFile = tempCookiesFile;
      } else if (process.env.YOUTUBE_COOKIES) {
        tempCookiesFile = path.join(TMP_DIR, `cookies-${uniqueId}.txt`);
        fs.writeFileSync(tempCookiesFile, process.env.YOUTUBE_COOKIES);
        cookiesFile = tempCookiesFile;
      }

      const conversionPromise = (async () => {
        const baseParams = {
          noPlaylist: true,
          retries: 10,
          fragmentRetries: 10,
          socketTimeout: 30,
          forceIpv4: true,
          extractorArgs: 'youtube:player_client=android,web',
        };
        if (cookiesFile) {
          baseParams.cookies = cookiesFile;
        }

        if (format === 'mp3') {
          // Audio only flow using robust retry params
          audioFile = path.join(TMP_DIR, `${uniqueId}.mp3`);
          await exec.exec(url.trim(), {
            ...baseParams,
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            output: audioFile,
          });
          finalFile = audioFile;

        } else {
          // Video flow (mp4_hd or mp4_sd)
          videoFile = path.join(TMP_DIR, `${uniqueId}.mp4`);
          const formatString = format === 'mp4_hd'
            ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
            : 'bestvideo[height<=480]+bestaudio/best[height<=480]';

          await exec.exec(url.trim(), {
            ...baseParams,
            output: videoFile,
            format: formatString,
            mergeOutputFormat: 'mp4',
          });
          finalFile = videoFile;
        }
      })();

      const timeoutPromise = new Promise((_, rej) => {
        timeoutId = setTimeout(() => rej(new Error('Conversion timeout (max 5 minutes)')), CONVERSION_TIMEOUT_MS);
      });

      await Promise.race([conversionPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      // Simple streaming
      const downloadName = format === 'mp3' ? 'audio.mp3' : 'video.mp4';
      const contentType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

      res.download(finalFile, downloadName, (err) => {
        clearTimeout(timeoutId);
        removeFile(audioFile);
        removeFile(videoFile);
        if (tempCookiesFile) removeFile(tempCookiesFile);
        if (err && !res.headersSent) {
          console.error('Download send error:', err);
        }
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      removeFile(audioFile);
      removeFile(videoFile);
      if (tempCookiesFile) removeFile(tempCookiesFile);
      const stderr = error.stderr || error.message || 'Unknown yt-dlp error';
      console.error(`[${reqId}] Conversion error trace:`, stderr);

      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Conversion failed',
          code: error.code || 1,
          details: stderr,
          requestId: reqId
        });
      }
    }
  };

  runWithConcurrencyLimit(run).catch((err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Concurrency limit reached' });
  });
});

app.post('/api/check-domain', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Missing domain name' });

    // Ensure Dynadot key is set in Render environment variables
    const apiKey = process.env.DYNADOT_API_KEY || '8z9R6Z7D8i8JF84LE7P8g7j9J9W706n9R9F6YRa7E7X';

    // Call the Dynadot API
    const dynadotRes = await fetch('https://api.dynadot.com/api3.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        key: apiKey,
        command: 'search',
        domain0: domain,
        currency: 'USD'
      })
    });

    const data = await dynadotRes.json();
    if (data.Status === 'success') {
      const searchResult = data.SearchResponse.SearchResults[0];
      res.json({
        domain: domain,
        available: searchResult.Available === 'yes',
        price: searchResult.Price ? parseFloat(searchResult.Price) : null,
        currency: 'USD',
        message: searchResult.Available === 'yes' ? 'Domain is available for registration' : 'Domain is not available'
      });
    } else {
      throw new Error(data.ErrorMessage || 'Dynadot API error');
    }
  } catch (error) {
    console.error('Domain check error:', error);
    // Fallback demo response if it fails
    res.json({
      domain: req.body.domain,
      available: Math.random() > 0.5,
      price: Math.floor(Math.random() * 20) + 10,
      currency: 'USD',
      message: 'Demo mode - API unavailable'
    });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { domain, price } = req.body;
    if (!domain || !price) {
      return res.status(400).json({ error: 'Missing domain name or price' });
    }

    if (!stripe) {
      console.warn('Stripe secret key is not set. Payments will fail.');
      return res.status(500).json({ error: 'Stripe is not configured perfectly. Missing STRIPE_API environment variable.' });
    }

    // Dynadot gives us the price, we pass it to Stripe in cents
    const unitAmount = Math.round(parseFloat(price) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Domain Registration: ${domain}`,
              description: '1 Year Registration',
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}?success=true&domain=${domain}`,
      cancel_url: `${req.headers.origin}?canceled=true`,
      metadata: {
        domain: domain,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/parse-epub', upload.single('epubFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const epubPath = req.file.path;
  const epub = new EPub(epubPath, '/imagewebroot/', '/articlewebroot/');

  epub.on('end', () => {
    const chapters = [];
    let count = 0;

    const processNext = (index) => {
      if (index >= epub.flow.length) {
        fs.unlink(epubPath, () => { });
        return res.json(chapters);
      }

      const chapterMetadata = epub.flow[index];
      epub.getChapter(chapterMetadata.id, (err, text) => {
        if (!err && text) {
          // Strip HTML tags for clean TTS reading
          const cleanText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
          if (cleanText.length > 0) {
            chapters.push({
              id: chapterMetadata.id,
              title: chapterMetadata.title || `Chapter ${count + 1}`,
              text: cleanText
            });
            count++;
          }
        }
        processNext(index + 1);
      });
    };

    processNext(0);
  });

  epub.on('error', (err) => {
    fs.unlink(epubPath, () => { });
    res.status(500).json({ error: 'Failed to parse EPUB file' });
  });

  epub.parse();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
