const express = require('express');
const crypto = require('crypto');
const Analysis = require('../models/Analysis');
const { requireAuth, requireRecruiter } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRecruiter);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

// Stats + candidate list built from the recruiter's own saved analyses
router.get('/stats', async (req, res) => {
  const items = await Analysis.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .limit(500)
    .select('fileName hasJobDescription result.candidate_name result.ats_score result.match_score result.experience_level result.experience_years result.skills status note createdAt +jobDescription')
    .lean();

  // One row per candidate + file: keep the most recent analysis
  const seen = new Set();
  const candidates = [];
  for (const it of items) {
    const r = it.result || {};
    const key = (r.candidate_name || '').toLowerCase() + '|' + it.fileName;
    if (seen.has(key)) {
      // An older analysis of the same candidate may hold the pipeline status / note: carry them to the newest one
      const kept = candidates.find((c) => c._key === key);
      if (kept && kept.status === 'new' && !kept.note && ((it.status && it.status !== 'new') || it.note)) {
        kept.status = it.status || 'new';
        kept.note = it.note || '';
      }
      continue;
    }
    seen.add(key);
    candidates.push({
      id: it._id,
      name: r.candidate_name || it.fileName || 'Unknown',
      fileName: it.fileName || '',
      level: r.experience_level || 'Unknown',
      years: num(r.experience_years),
      ats: num(r.ats_score),
      match: it.hasJobDescription ? num(r.match_score) : null,
      skills: Array.isArray(r.skills) ? r.skills : [],
      _key: key,
      offer: it.hasJobDescription && it.jobDescription ? String(it.jobDescription).trim().split('\n')[0].slice(0, 60) : '',
      offerKey: it.hasJobDescription && it.jobDescription
        ? crypto.createHash('sha1').update(String(it.jobDescription).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500)).digest('hex').slice(0, 12)
        : '',
      status: it.status || 'new',
      note: it.note || '',
      date: it.createdAt
    });
  }

  const levels = {};
  const skillCount = new Map();
  for (const c of candidates) {
    levels[c.level] = (levels[c.level] || 0) + 1;
    const mine = new Map();
    for (const s of c.skills) {
      const name = String(s).trim();
      if (name) mine.set(name.toLowerCase(), name);
    }
    for (const [k, name] of mine) {
      const e = skillCount.get(k) || { name, count: 0 };
      e.count++;
      skillCount.set(k, e);
    }
  }

  // Analyses per day over the last 14 days (all analyses, duplicates included)
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const activity = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    activity.push({ day: dayKey(d), count: 0 });
  }
  const dayIndex = new Map(activity.map((a, i) => [a.day, i]));
  for (const it of items) {
    const i = dayIndex.get(dayKey(new Date(it.createdAt)));
    if (i !== undefined) activity[i].count++;
  }

  // Candidates and average match per job offer (the 5 busiest offers)
  const groups = new Map();
  for (const c of candidates) {
    if (!c.offerKey) continue;
    const g = groups.get(c.offerKey) || { offer: c.offer, count: 0, sum: 0, n: 0, best: null };
    g.count++;
    if (typeof c.match === 'number') {
      g.sum += c.match;
      g.n++;
      if (!g.best || c.match > g.best.match) g.best = { name: c.name, match: c.match };
    }
    groups.set(c.offerKey, g);
  }
  const offers = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((g) => ({ offer: g.offer, count: g.count, avgMatch: g.n ? Math.round(g.sum / g.n) : null, best: g.best }));
  const strong = candidates.filter((c) => (c.match ?? c.ats ?? 0) >= 70).length;
  const byScore = (a, b) => (b.match ?? -1) - (a.match ?? -1) || (b.ats ?? 0) - (a.ats ?? 0);

  res.json({
    total: candidates.length,
    analyses: items.length,
    avgAts: avg(candidates.map((c) => c.ats).filter((v) => v !== null)),
    avgMatch: avg(candidates.map((c) => c.match).filter((v) => v !== null)),
    strong,
    levels,
    activity,
    offers,
    topSkills: [...skillCount.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    candidates: candidates.sort(byScore).slice(0, 100).map(({ skills, _key, ...c }) => c)
  });
});

// Pipeline: change the status and/or the note of one candidate
const PIPELINE_STATUSES = ['new', 'shortlisted', 'interview', 'rejected'];

router.patch('/candidates/:id', async (req, res) => {
  const update = {};
  if (req.body.status !== undefined) {
    if (!PIPELINE_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    update.status = req.body.status;
  }
  if (req.body.note !== undefined) {
    if (typeof req.body.note !== 'string') return res.status(400).json({ error: 'Invalid note' });
    update.note = req.body.note.trim().slice(0, 1000);
  }
  if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const found = await Analysis.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { $set: update }).select('_id');
    if (!found) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Invalid id' });
  }
});

module.exports = router;
