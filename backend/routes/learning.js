const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { buildLearningPlan, pickLang } = require('../utils/ai_learning');

const router = express.Router();
router.use(requireAuth);

const MAX_ITEMS = 20;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many learning plans, try again in 15 minutes' }
});

const list = (v, n) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, n) : [];

router.post('/plan', limiter, async (req, res) => {
  try {
    const b = req.body || {};
    const missing = list(b.missing_skills, MAX_ITEMS);
    const weaknesses = list(b.weaknesses, 8);
    if (!missing.length && !weaknesses.length)
      return res.status(400).json({ error: 'No skill gaps or weaknesses to build a plan from' });

    const years = Number.isFinite(Number(b.years)) ? Number(b.years) : null;
    const plan = await buildLearningPlan({
      level: typeof b.level === 'string' ? b.level.slice(0, 40) : '',
      years,
      skills: list(b.skills, 30),
      missing,
      weaknesses,
      suggestions: list(b.suggestions, 8),
      hasJob: !!b.has_job,
      language: pickLang(b.language)
    });
    res.json(plan);
  } catch (err) {
    console.error('Learning plan failed:', err.message);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.message });
  }
});

module.exports = router;
