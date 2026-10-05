require('express-async-errors');
const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ override: true });

const { extractText } = require('./utils/pdf_reader');
const { analyzeCV }   = require('./utils/ai_analyzer');
const { optionalAuth } = require('./middleware/auth');
const Analysis = require('./models/Analysis');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

app.use(cors({
  origin: [
    'https://cv-analyzer-nu-lemon.vercel.app',
    'https://cv-analyzer-lovat.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ]
}));

app.use(express.json());

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/history', require('./routes/history'));

const ALLOWED_EXT = ['pdf', 'docx'];
const extOf = (name) => name.split('.').pop().toLowerCase();

app.post('/api/analyze', upload.single('file'), optionalAuth, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    if (!ALLOWED_EXT.includes(extOf(req.file.originalname)))
      return res.status(400).json({ error: 'Invalid file type (PDF or DOCX only)' });

    const jobDescription = req.body.job_description || '';
    const cvText = await extractText(req.file.buffer, req.file.originalname);
    const result = await analyzeCV(cvText, jobDescription);

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
    res.status(500).json({ error: err.message });
  }
});

/* ── Rank several CVs against one job description ── */
const uploadMany = upload.array('files', 5);

app.post(
  '/api/compare',
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
          if (!ALLOWED_EXT.includes(extOf(file.originalname)))
            throw new Error('Invalid file type (PDF or DOCX only)');

          const text = await extractText(file.buffer, file.originalname);
          if (!text || text.trim().length < 50)
            throw new Error('Could not read text from this file (scanned PDF?)');

          const result = await analyzeCV(text, jobDescription);
          ok.push({ fileName: file.originalname, ...result });
        } catch (err) {
          console.error(file.originalname, '-', err.message);
          failed.push({ fileName: file.originalname, error: err.message });
        }
      }

      const score = (x) => (typeof x.match_score === 'number' ? x.match_score : -1);
      ok.sort((a, b) => score(b) - score(a) || (b.ats_score || 0) - (a.ats_score || 0));
      const ranking = ok.map((c, i) => ({ rank: i + 1, ...c }));

      if (req.userId && ok.length) {
        await Analysis.insertMany(ok.map(({ fileName, ...result }) => ({
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