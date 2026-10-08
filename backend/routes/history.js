const express = require('express');
const Analysis = require('../models/Analysis');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const items = await Analysis.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('fileName hasJobDescription result.candidate_name result.ats_score result.experience_level createdAt');
  res.json(items);
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Analysis.findOne({ _id: req.params.id, user: req.userId });
    if (!item) return res.status(404).json({ error: 'Not found' });
    const obj = item.toObject();
    obj.result = { ...obj.result, _analysisId: String(item._id) }; // lets the page offer "Improve my CV" from History
    res.json(obj);
  } catch {
    res.status(400).json({ error: 'Invalid id' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await Analysis.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Invalid id' });
  }
});

module.exports = router;