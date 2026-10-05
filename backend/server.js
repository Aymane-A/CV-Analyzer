const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

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

app.post('/api/analyze', upload.single('file'), optionalAuth, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext))
      return res.status(400).json({ error: 'Invalid file type' });

    const jobDescription = req.body.job_description || '';
    const cvText = await extractText(req.file.buffer, req.file.originalname);
    const result = await analyzeCV(cvText, jobDescription);

    // Ila l-user connecté, n7fdo l-analyse f database
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

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`✅ Backend → http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });