// Cover letter, interview questions and DOCX export (patch 6)
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { extractText } = require('../utils/pdf_reader');
const { pickLang } = require('../utils/ai_analyzer');
const { optionalAuth } = require('../middleware/auth');
const Analysis = require('../models/Analysis');
const { coverLetter, interviewQuestions } = require('../utils/ai_extras');
const { buildDocx } = require('../utils/docx_export');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const limiter = (max, message) => rateLimit({
  windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error: message }
});
const aiLimiter = limiter(10, 'Too many requests, try again in 15 minutes');
const docxLimiter = limiter(30, 'Too many exports, try again in 15 minutes');

const str = (v) => (typeof v === 'string' ? v : '');
const fail = (status, message) => Object.assign(new Error(message), { status });

// The CV comes from a fresh upload, or from a saved analysis of the logged-in user
async function loadSource(req) {
  const jd = str(req.body.job_description).trim();
  if (req.file) {
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) throw fail(400, 'Invalid file type (PDF or DOCX only)');
    const text = await extractText(req.file.buffer, req.file.originalname);
    if (!text || text.trim().length < 50) throw fail(422, 'Could not read text from this file');
    return { cvText: text, jd };
  }
  const id = str(req.body.analysis_id);
  if (!id) throw fail(400, 'No CV provided');
  if (!req.userId) throw fail(401, 'Please login again');
  let item;
  try {
    item = await Analysis.findOne({ _id: id, user: req.userId }).select('+cvText +jobDescription');
  } catch (e) {
    throw fail(400, 'Invalid id');
  }
  if (!item) throw fail(404, 'Analysis not found');
  if (!item.cvText) throw fail(409, 'This analysis was saved before CV storage existed. Analyze the CV again first.');
  return { cvText: item.cvText, jd: jd || item.jobDescription || '' };
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error('extras:', err.message);
    res.status(err.status && err.status < 500 ? err.status : err.status === 502 ? 502 : 500).json({ error: err.message });
  }
};

router.post('/cover-letter', aiLimiter, upload.single('file'), optionalAuth, handle(async (req) => {
  const { cvText, jd } = await loadSource(req);
  if (jd.length < 20) throw fail(400, 'A cover letter needs a job description. Paste one and analyze again.');
  return coverLetter(cvText, jd, pickLang(req.body.language));
}));

router.post('/interview', aiLimiter, upload.single('file'), optionalAuth, handle(async (req) => {
  const { cvText, jd } = await loadSource(req);
  return interviewQuestions(cvText, jd, pickLang(req.body.language));
}));

// Text -> .docx download. No AI involved.
router.post('/docx', docxLimiter, async (req, res) => {
  try {
    const text = str(req.body && req.body.text);
    if (!text.trim()) return res.status(400).json({ error: 'Nothing to export' });
    if (text.length > 40000) return res.status(400).json({ error: 'Text is too long' });
    const title = str(req.body.title).slice(0, 120);
    const buf = await buildDocx(title, text);
    const base = (title || 'cvision').replace(/[^\w؀-ۿ-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'cvision';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="cvision.docx"; filename*=UTF-8\'\'' + encodeURIComponent(base + '.docx')
    });
    res.send(buf);
  } catch (err) {
    console.error('docx:', err.message);
    res.status(500).json({ error: 'Could not build the document' });
  }
});

module.exports = router;
