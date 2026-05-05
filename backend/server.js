const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
require('dotenv').config();

const { extractText } = require('./utils/pdf_reader');
const { analyzeCV }   = require('./utils/ai_analyzer');


const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

app.use(cors({
  origin: [
    'https://cv-analyzer-lovat.vercel.app',
    'http://localhost:3000'
  ]
}));
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!['pdf','doc','docx'].includes(ext))
      return res.status(400).json({ error: 'Invalid file type' });

    const cvText = await extractText(req.file.buffer, req.file.originalname);
    const result = await analyzeCV(cvText, req.body.job_description || '');

    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));