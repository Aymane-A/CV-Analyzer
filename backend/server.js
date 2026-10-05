require('express-async-errors');
const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ override: true });

const { extractText } = require('./utils/pdf_reader');
const { analyzeCV }   = require('./utils/ai_analyzer');
const { refineResult, compareCandidates } = require('./utils/scoring');
const { optionalAuth } = require('./middleware/auth');
const Analysis = require('./models/Analysis');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET is missing or too short (min 16 chars) in .env');
  process.exit(1);
}

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

app.set('trust proxy', 1); // Render / Vercel sit behind a proxy

app.use(cors({
  origin: [
    'https://cv-analyzer-nu-lemon.vercel.app',
    'https://cv-analyzer-lovat.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ]
}));

app.use(express.json({ limit: '100kb' }));

/* ── Rate limiting (protects your Groq key and the login routes) ── */
const limiter = (max, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message }
});
const authLimiter    = limiter(30, 'Too many attempts, try again in 15 minutes');
const analyzeLimiter = limiter(30, 'Too many analyses, try again in 15 minutes');
const compareLimiter = limiter(10, 'Too many rankings, try again in 15 minutes');

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/auth',    authLimiter, require('./routes/auth'));
app.use('/api/history', require('./routes/history'));

const ALLOWED_EXT = ['pdf', 'docx'];
const extOf = (name) => name.split('.').pop().toLowerCase();

async function readCV(file) {
  if (!ALLOWED_EXT.includes(extOf(file.originalname)))
    throw Object.assign(new Error('Invalid file type (PDF or DOCX only)'), { status: 400 });
  const text = await extractText(file.buffer, file.originalname);
  if (!text || text.trim().length < 50)
    throw Object.assign(new Error('Could not read text from this file (scanned PDF or image?)'), { status: 422 });
  return text;
}

app.post('/api/analyze', analyzeLimiter, upload.single('file'), optionalAuth, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const jobDescription = (req.body.job_description || '').trim();
    const cvText = await readCV(req.file);
    const result = refineResult(await analyzeCV(cvText, jobDescription), !!jobDescription);

    if (req.userId) {
      await Analysis.create({
        user: req.userId,
        fileName: req.file.originalname,
        hasJobDescription: !!jobDescription,
        result
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.message });
  }
});

/* ── Rank several CVs against one job description ── */
const uploadMany = upload.array('files', 5);

app.post(
  '/api/compare',
  compareLimiter,
  (req, res, next) => uploadMany(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Maximum 5 CVs at a time' : err.message;
    res.status(400).json({ error: msg });
  }),
  optionalAuth,
  async (req, res) => {
    try {
      const files = req.files || [];
      const jobDescription = (req.body.job_description || '').trim();

      if (files.length < 2) return res.status(400).json({ error: 'Upload at least 2 CVs' });
      if (jobDescription.length < 20) return res.status(400).json({ error: 'Job description is too short' });

      const ok = [];
      const failed = [];

      // Sequential on purpose: avoids Groq rate limits (429)
      for (const file of files) {
        try {
          const text = await readCV(file);
          const result = refineResult(await analyzeCV(text, jobDescription), true);
          ok.push({ fileName: file.originalname, ...result });
        } catch (err) {
          console.error(file.originalname, '-', err.message);
          failed.push({ fileName: file.originalname, error: err.message });
        }
      }

      ok.sort(compareCandidates);
      const ranking = ok.map((c, i) => ({ rank: i + 1, ...c }));

      if (req.userId && ok.length) {
        await Analysis.insertMany(ok.map(({ fileName, rank, ...result }) => ({
          user: req.userId, fileName, hasJobDescription: true, result
        })));
      }

      res.json({ ranking: [...ranking, ...failed] });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// Any error that escapes a route: answer instead of crashing the process
app.use((err, req, res, next) => {
  console.error('Route error:', err.message);
  res.status(503).json({ error: 'Service temporarily unavailable' });
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`✅ Backend → http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });