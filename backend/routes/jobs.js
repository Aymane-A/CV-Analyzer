const express = require('express');
const JobOffer = require('../models/JobOffer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const MAX_JOBS = 20;
const MAX_TEXT = 4000; // the analyzer only reads the first 4000 characters anyway

router.get('/', async (req, res) => {
  const items = await JobOffer.find({ user: req.userId }).sort({ createdAt: -1 }).limit(MAX_JOBS).select('title text createdAt');
  res.json(items);
});

router.post('/', async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!title) return res.status(400).json({ error: 'Give the job offer a name' });
  if (text.length < 20) return res.status(400).json({ error: 'Job description is too short' });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: 'Job description is too long (max ' + MAX_TEXT + ' characters)' });

  const count = await JobOffer.countDocuments({ user: req.userId });
  if (count >= MAX_JOBS) return res.status(400).json({ error: 'Limit of ' + MAX_JOBS + ' saved offers reached, delete one first' });

  const job = await JobOffer.create({ user: req.userId, title, text });
  res.status(201).json({ id: job._id, title: job.title });
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await JobOffer.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Invalid id' });
  }
});

module.exports = router;
