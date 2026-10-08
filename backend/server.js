require('express-async-errors');
const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const helmet    = require('helmet');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
// In production the host's environment variables win; locally the .env file wins
require('dotenv').config({ override: process.env.NODE_ENV !== 'production' });

const { extractText } = require('./utils/pdf_reader');
const { analyzeCV, rewriteCV, pickLang } = require('./utils/ai_analyzer');
const { refineResult, compareCandidates } = require('./utils/scoring');
const { optionalAuth, requireAuth } = require('./middleware/auth');
const Analysis = require('./models/Analysis');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET is missing or too short (min 32 chars)');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI is missing');
  process.exit(1);
}

const MAX_FILE_MB = 16;
const MAX_JD = 8000;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 5, fields: 10, fieldSize: 100 * 1024 }
});

app.set('trust proxy', 1); // Render / Vercel sit behind a proxy

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: [
    'https://cv-analyzer-nu-lemon.vercel.app',
    'https://cv-analyzer-lovat.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  maxAge: 86400
}));

app.use(express.json({ limit: '100kb' }));

// Drops keys like "$gt" or "a.b" from JSON bodies so they can never reach a Mongo query
// (multipart fields are plain strings, so they are not affected)
function stripOperators(o) {
  if (Array.isArray(o)) { o.forEach(stripOperators); return; }
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      if (k.startsWith('$') || k.includes('.')) delete o[k];
      else stripOperators(o[k]);
    }
  }
}
app.use((req, res, next) => { stripOperators(req.body); next(); });

/* ── Rate limiting (protects your Groq key and the login routes) ── */
const limiter = (max, message, extra = {}) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  ...extra
});
const authLimiter    = limiter(100, 'Too many attempts, try again in 15 minutes'); // also covers /auth/me on every page load
const loginLimiter   = limiter(10, 'Too many attempts, try again in 15 minutes', { skipSuccessfulRequests: true }); // only failures count
const analyzeLimiter = limiter(30, 'Too many analyses, try again in 15 minutes');
const compareLimiter = limiter(10, 'Too many rankings, try again in 15 minutes');
const rewriteLimiter = limiter(10, 'Too many rewrites, try again in 15 minutes');

// Never show internal error details (Groq, Mongo...) to the client
const publicMsg = (err) => (err.status && err.status < 500 ? err.message : 'Server error');
const statusOf  = (err) => (err.status && err.status < 500 ? err.status : 500);

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authLimiter, require('./routes/auth'));

// Login is mandatory: everything mounted below this line needs a valid token.
// /api/health and /api/auth/* are mounted above it, so they stay public (login, register, verify, reset).
app.use('/api', requireAuth);
app.use('/api/history', require('./routes/history'));
app.use('/api/recruiter', require('./routes/recruiter'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/learning', require('./routes/learning'));
app.use('/api/extras', require('./routes/extras')); // patch6

const ALLOWED_EXT = ['pdf', 'docx'];
const extOf = (name) => String(name || '').split('.').pop().toLowerCase();

// Checks the real content of the file, not just its extension
function looksLikeFile(buf, ext) {
  if (!buf || buf.length < 5) return false;
  if (ext === 'pdf') return buf.subarray(0, 1024).includes('%PDF-');
  if (ext === 'docx') return buf[0] === 0x50 && buf[1] === 0x4b; // "PK" (zip container)
  return false;
}

async function readCV(file) {
  const ext = extOf(file.originalname);
  if (!ALLOWED_EXT.includes(ext) || !looksLikeFile(file.buffer, ext))
    throw Object.assign(new Error('Invalid file type (PDF or DOCX only)'), { status: 400 });
  const text = await extractText(file.buffer, file.originalname);
  if (!text || text.trim().length < 50)
    throw Object.assign(new Error('Could not read text from this file (scanned PDF or image?)'), { status: 422 });
  return text;
}

const cleanJD = (v) => String(v || '').trim().slice(0, MAX_JD);
const cvHashOf = (t) => crypto.createHash('sha256')
  .update(String(t || '').slice(0, 12000).toLowerCase().replace(/\s+/g, ' ').trim())
  .digest('hex');

app.post('/api/analyze', analyzeLimiter, upload.single('file'), optionalAuth, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const jobDescription = cleanJD(req.body.job_description);
    const cvText = await readCV(req.file);
    const result = refineResult(await analyzeCV(cvText, jobDescription, pickLang(req.body.language)), !!jobDescription, cvText);

    if (req.userId) {
      await Analysis.create({
        user: req.userId,
        fileName: String(req.file.originalname).slice(0, 200),
        hasJobDescription: !!jobDescription,
        cvText: cvText.slice(0, 12000),
        cvHash: cvHashOf(cvText),
        jobDescription: jobDescription.slice(0, 4000),
        result
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(statusOf(err)).json({ error: publicMsg(err) });
  }
});

/* ── Rewrite a CV: improved version, same facts ── */
app.post('/api/rewrite', rewriteLimiter, upload.single('file'), optionalAuth, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const jobDescription = cleanJD(req.body.job_description);
    const language = pickLang(req.body.language);

    let suggestions = [];
    try { suggestions = JSON.parse(req.body.suggestions || '[]'); } catch { suggestions = []; }
    suggestions = Array.isArray(suggestions)
      ? suggestions.filter((s) => typeof s === 'string').slice(0, 10).map((s) => s.slice(0, 300))
      : [];

    const cvText = await readCV(req.file);
    res.json(await rewriteWithScore(cvText, jobDescription, language, suggestions));
  } catch (err) {
    console.error(err.message);
    res.status(statusOf(err)).json({ error: publicMsg(err) });
  }
});

// Improve my CV from History: uses the CV text saved with the analysis
app.post('/api/history/:id/rewrite', rewriteLimiter, requireAuth, async (req, res) => {
  try {
    const item = await Analysis.findOne({ _id: req.params.id, user: req.userId }).select('+cvText +jobDescription');
    if (!item) return res.status(404).json({ error: 'Analysis not found' });
    if (!item.cvText) {
      return res.status(409).json({ error: 'This analysis was saved before CV storage existed. Analyze the CV again to enable rewriting.' });
    }
    const language = pickLang(req.body && req.body.language);
    const suggestions = (item.result && item.result.suggestions) || [];
    res.json(await rewriteWithScore(item.cvText, item.jobDescription || '', language, suggestions));
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
    console.error(err.message);
    res.status(statusOf(err)).json({ error: publicMsg(err) });
  }
});

// Rewrites the CV, then scores the new version with the same analyzer so the page can show before / after
async function rewriteWithScore(cvText, jobDescription, language, suggestions) {
  const out = await rewriteCV(cvText, jobDescription, language, suggestions);
  let after = null;
  try {
    const r = refineResult(await analyzeCV(out.rewritten_cv, jobDescription, language), !!jobDescription, out.rewritten_cv);
    after = {
      ats_score: typeof r.ats_score === 'number' ? r.ats_score : null,
      match_score: jobDescription && typeof r.match_score === 'number' ? r.match_score : null
    };
  } catch (err) {
    console.error('After-score failed:', err.message);
  }
  return { ...out, after };
}

/* ── Rank several CVs against one job description ── */
const uploadMany = upload.array('files', 5);

app.post(
  '/api/compare',
  compareLimiter,
  (req, res, next) => uploadMany(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Maximum 5 CVs at a time'
      : err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds ' + MAX_FILE_MB + ' MB limit'
      : 'Invalid upload';
    res.status(400).json({ error: msg });
  }),
  optionalAuth,
  async (req, res) => {
    try {
      const files = req.files || [];
      const jobDescription = cleanJD(req.body.job_description);

      if (files.length < 2) return res.status(400).json({ error: 'Upload at least 2 CVs' });
      if (jobDescription.length < 20) return res.status(400).json({ error: 'Job description is too short' });

      const ok = [];
      const cvTexts = new Map();
      const failed = [];

      // Sequential on purpose: avoids Groq rate limits (429)
      for (const file of files) {
        try {
          const text = await readCV(file);
          const result = refineResult(await analyzeCV(text, jobDescription, pickLang(req.body.language)), true, text);
          cvTexts.set(file.originalname, text.slice(0, 12000));
          ok.push({ fileName: file.originalname, ...result });
        } catch (err) {
          console.error(file.originalname, '-', err.message);
          failed.push({ fileName: file.originalname, error: publicMsg(err) });
        }
      }

      ok.sort(compareCandidates);
      const ranking = ok.map((c, i) => ({ rank: i + 1, ...c }));

      if (req.userId && ok.length) {
        await Analysis.insertMany(ok.map(({ fileName, rank, ...result }) => ({
          user: req.userId,
          fileName: String(fileName).slice(0, 200),
          hasJobDescription: true,
          result,
          cvText: cvTexts.get(fileName),
          cvHash: cvHashOf(cvTexts.get(fileName)),
          jobDescription: jobDescription.slice(0, 4000)
        })));
      }

      res.json({ ranking: [...ranking, ...failed] });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Any error that escapes a route: answer instead of crashing the process
app.use((err, req, res, next) => {
  console.error('Route error:', err.message);
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds ' + MAX_FILE_MB + ' MB limit' : 'Invalid upload'
    });
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  res.status(503).json({ error: 'Service temporarily unavailable' });
});

process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r && r.message ? r.message : r));

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