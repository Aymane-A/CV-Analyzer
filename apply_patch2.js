// Usage: put this file in C:\CV-Analyzer, then run:  node apply_patch2.js
// Adds the recruiter role + dashboard. Backups: *.bak. Nothing is written to a file
// if one of its anchors is not found. Safe to run twice.

const fs = require('fs');
const path = require('path');

const self = fs.readFileSync(__filename, 'utf8');
const startMark = self.lastIndexOf('/*@@SNIPPETS');
const endMark = self.lastIndexOf('@@END@@');
const parts = self.slice(startMark, endMark).split(/^=====(\w+)\r?\n/m);
const S = {};
for (let i = 1; i < parts.length; i += 2) S[parts[i]] = parts[i + 1].replace(/\s+$/, '');

function patch(file, doneMarker, edits) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) throw new Error('File not found: ' + p);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');

  if (src.includes(doneMarker)) {
    console.log('= ' + file + ': already patched, skipped');
    return;
  }
  for (const [find, repl] of edits) {
    const count = src.split(find).length - 1;
    if (count !== 1) throw new Error(file + ': anchor found ' + count + ' times (expected 1):\n  ' + find);
    src = src.replace(find, () => repl);
  }
  fs.writeFileSync(p + '.bak', raw);
  fs.writeFileSync(p, crlf ? src.replace(/\n/g, '\r\n') : src);
  console.log('✓ ' + file + ' patched (' + edits.length + ' edits)');
}

function createFile(file, content) {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) { console.log('= ' + file + ': exists, skipped'); return; }
  fs.writeFileSync(p, content + '\n');
  console.log('✓ ' + file + ' created');
}

// ---------------- backend ----------------
patch('backend/models/User.js', 'role:', [
  ['password: { type: String, required: true, minlength: 6 }',
    "password: { type: String, required: true, minlength: 6 },\n  role:     { type: String, enum: ['candidate', 'recruiter'], default: 'candidate' }"]
]);

patch('backend/routes/auth.js', 'recruiter', [
  ['const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });',
    "const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role || 'candidate' });"],
  ['const user = await User.create({ name, email, password: hash });',
    "const role = req.body.role === 'recruiter' ? 'recruiter' : 'candidate'; // never accept any other role\n    const user = await User.create({ name, email, password: hash, role });"]
]);

patch('backend/middleware/auth.js', 'requireRecruiter', [
  ['module.exports = { requireAuth, optionalAuth };', S.MIDDLEWARE]
]);

createFile('backend/routes/recruiter.js', S.RECRUITER_ROUTE);

patch('backend/server.js', '/api/recruiter', [
  ["app.use('/api/history', require('./routes/history'));",
    "app.use('/api/history', require('./routes/history'));\napp.use('/api/recruiter', require('./routes/recruiter'));"]
]);

// ---------------- frontend/index.html ----------------
patch('frontend/index.html', 'backDashBtn', [
  ['<!-- Vercel Analytics -->', S.CSS + '\n\n  <!-- Vercel Analytics -->'],
  ['<!-- LOADING -->', S.PANEL + '\n\n    <!-- LOADING -->'],
  ['<button class="btn-export hidden" id="rewriteBtn">', S.BACKBTN + '\n          <button class="btn-export hidden" id="rewriteBtn">'],
  ['<input class="auth-field" id="authEmail" type="email" placeholder="Email" autocomplete="email" />',
    S.ROLE_SELECT + '\n      <input class="auth-field" id="authEmail" type="email" placeholder="Email" autocomplete="email" />'],
  ["document.getElementById('authName').classList.toggle('hidden', !reg);",
    "document.getElementById('authName').classList.toggle('hidden', !reg);\n      document.getElementById('authRole').classList.toggle('hidden', !reg);"],
  ["const body = authMode === 'register' ? { name, email, password } : { email, password };",
    "const body = authMode === 'register' ? { name, email, password, role: document.getElementById('authRole').value } : { email, password };"],
  ["document.getElementById('userName').textContent = user ? user.name : '';", S.SETUSER],
  ['window._lastResult = data;', "window._lastResult = data;\n      document.getElementById('backDashBtn').classList.add('hidden');"],
  ["document.getElementById('year').textContent", S.JS + "\n\n    document.getElementById('year').textContent"]
]);

console.log('\nDone. Restart the backend (node server.js) and refresh the frontend.');

/*@@SNIPPETS
=====MIDDLEWARE
const User = require('../models/User');

// The role is read from the database (not from the token), so it cannot be forged or go stale
async function requireRecruiter(req, res, next) {
  try {
    const u = await User.findById(req.userId).select('role').lean();
    if (!u || u.role !== 'recruiter') return res.status(403).json({ error: 'Recruiter account required' });
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Could not verify account' });
  }
}

module.exports = { requireAuth, optionalAuth, requireRecruiter };
=====RECRUITER_ROUTE
const express = require('express');
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
    .select('fileName hasJobDescription result.candidate_name result.ats_score result.match_score result.experience_level result.experience_years result.skills createdAt')
    .lean();

  // One row per candidate + file: keep the most recent analysis
  const seen = new Set();
  const candidates = [];
  for (const it of items) {
    const r = it.result || {};
    const key = (r.candidate_name || '').toLowerCase() + '|' + it.fileName;
    if (seen.has(key)) continue;
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

  const strong = candidates.filter((c) => (c.match ?? c.ats ?? 0) >= 70).length;
  const byScore = (a, b) => (b.match ?? -1) - (a.match ?? -1) || (b.ats ?? 0) - (a.ats ?? 0);

  res.json({
    total: candidates.length,
    analyses: items.length,
    avgAts: avg(candidates.map((c) => c.ats).filter((v) => v !== null)),
    avgMatch: avg(candidates.map((c) => c.match).filter((v) => v !== null)),
    strong,
    levels,
    topSkills: [...skillCount.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    candidates: candidates.sort(byScore).slice(0, 100).map(({ skills, ...c }) => c)
  });
});

module.exports = router;
=====CSS
<style>
    .dash-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .dash-stat { background: var(--bg-input); border: 1px solid var(--border); border-radius: 14px; padding: 16px; text-align: center; }
    .dash-stat b { display: block; font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); line-height: 1.1; }
    .dash-stat span { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); }
    .dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    @media (max-width: 640px) { .dash-grid { grid-template-columns: 1fr; } }
    .dash-box { background: var(--bg-input); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
    .dash-box h4 { font-size: .8rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; }
    .dash-bar-row { display: flex; align-items: center; gap: 8px; font-size: .82rem; color: var(--text-secondary); margin-bottom: 8px; }
    .dash-bar-row .lbl { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dash-bar-track { flex: 1; height: 8px; background: var(--bg-card); border-radius: 99px; overflow: hidden; }
    .dash-bar-fill { height: 100%; background: var(--gold); border-radius: 99px; }
    .dash-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .dash-filters input, .dash-filters select { padding: 9px 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); font: inherit; font-size: .85rem; outline: none; }
    .dash-filters input { flex: 1; min-width: 160px; }
    .dash-filters input:focus, .dash-filters select:focus { border-color: var(--border-hover); }
    .dash-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 14px; align-items: center; padding: 12px 14px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; }
    .dash-name { font-weight: 600; font-size: .95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dash-sub { font-size: .75rem; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dash-num { text-align: center; min-width: 44px; }
    .dash-num b { display: block; font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; color: var(--gold); line-height: 1; }
    .dash-num small { font-size: .62rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
    @media (max-width: 640px) { .dash-row { grid-template-columns: 1fr auto auto; } .dash-row .rank-view-btn { grid-column: 1 / -1; justify-content: center; } }
  </style>
=====PANEL
<!-- TAB: DASHBOARD (recruiters) -->
    <div class="tab-panel" id="tab-dashboard">
      <div class="card">
        <div class="card-header">
          <i class="fa-solid fa-chart-pie card-header-icon"></i>
          <h2>Recruiter Dashboard</h2>
        </div>
        <div id="dashBody"></div>
      </div>
    </div>
=====BACKBTN
<button class="btn-reset hidden" id="backDashBtn"><i class="fa-solid fa-arrow-left"></i> Back to dashboard</button>
=====ROLE_SELECT
<select class="auth-field hidden" id="authRole"><option value="candidate">I am a candidate</option><option value="recruiter">I am a recruiter</option></select>
=====SETUSER
document.getElementById('userName').textContent = user ? user.name : '';
      window._user = user || null;
      const dtb = document.getElementById('dashTabBtn');
      if (dtb) {
        const isRec = !!user && user.role === 'recruiter';
        dtb.classList.toggle('hidden', !isRec);
        if (!isRec) {
          window._dash = null;
          if (document.getElementById('tab-dashboard').classList.contains('active')) document.querySelector('.tab-btn[data-tab="upload"]').click();
        }
      }
=====JS
// Recruiter dashboard
    const dashBtn = document.createElement('button');
    dashBtn.className = 'tab-btn hidden';
    dashBtn.id = 'dashTabBtn';
    dashBtn.dataset.tab = 'dashboard';
    dashBtn.innerHTML = '<i class="fa-solid fa-chart-pie"></i> Dashboard';
    document.querySelector('.main-tabs').appendChild(dashBtn);
    dashBtn.classList.toggle('hidden', !(window._user && window._user.role === 'recruiter'));
    dashBtn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      dashBtn.classList.add('active');
      document.getElementById('tab-dashboard').classList.add('active');
      document.getElementById('resultsSection').classList.add('hidden');
      loadDashboard();
    });

    const dashBody = document.getElementById('dashBody');

    async function loadDashboard() {
      dashBody.innerHTML = '<div class="history-empty">Loading…</div>';
      try {
        const res = await fetch(API + '/api/recruiter/stats', { headers: authHeaders() });
        if (res.status === 401) { logout(true); throw new Error('Session expired, please login again'); }
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
        window._dash = d;
        renderDashboard(d);
      } catch (e) {
        dashBody.innerHTML = `<div class="history-empty">${esc(e.message)}</div>`;
      }
    }

    function barRows(entries) {
      const max = Math.max(1, ...entries.map(e => e[1]));
      return entries.map(([label, n]) =>
        `<div class="dash-bar-row"><span class="lbl" title="${esc(label)}">${esc(label)}</span><div class="dash-bar-track"><div class="dash-bar-fill" style="width:${n / max * 100}%"></div></div><span>${n}</span></div>`
      ).join('');
    }

    function renderDashboard(d) {
      if (!d.total) {
        dashBody.innerHTML = '<div class="history-empty">No candidates yet. Analyze or rank CVs while logged in and they will appear here.</div>';
        return;
      }
      const stat = (v, l) => `<div class="dash-stat"><b>${esc(v)}</b><span>${l}</span></div>`;
      const levels = Object.keys(d.levels);
      dashBody.innerHTML = `
        <div class="dash-stats">
          ${stat(d.total, 'Candidates')}${stat(d.avgAts ?? '—', 'Avg ATS')}${stat(d.avgMatch ?? '—', 'Avg job match')}${stat(d.strong, 'Strong (70+)')}
        </div>
        <div class="dash-grid">
          <div class="dash-box"><h4>Experience levels</h4>${barRows(Object.entries(d.levels).sort((a, b) => b[1] - a[1]))}</div>
          <div class="dash-box"><h4>Top skills</h4>${barRows(d.topSkills.map(s => [s.name, s.count])) || '<span class="dash-sub">No skills yet</span>'}</div>
        </div>
        <div class="dash-filters">
          <input id="dashSearch" type="search" placeholder="Search name or file…" />
          <select id="dashLevel"><option value="">All levels</option>${levels.map(l => `<option>${esc(l)}</option>`).join('')}</select>
          <select id="dashSort"><option value="score">Best score first</option><option value="date">Newest first</option><option value="name">Name A-Z</option></select>
        </div>
        <div id="dashList"></div>`;
      ['dashSearch', 'dashLevel', 'dashSort'].forEach(id => document.getElementById(id).addEventListener('input', renderCands));
      renderCands();
    }

    function renderCands() {
      const d = window._dash;
      if (!d) return;
      const q = document.getElementById('dashSearch').value.trim().toLowerCase();
      const lvl = document.getElementById('dashLevel').value;
      const sort = document.getElementById('dashSort').value;
      const list = d.candidates.filter(c => (!lvl || c.level === lvl) && (!q || (c.name + ' ' + c.fileName).toLowerCase().includes(q)));
      if (sort === 'date') list.sort((a, b) => new Date(b.date) - new Date(a.date));
      else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      else list.sort((a, b) => (b.match ?? -1) - (a.match ?? -1) || (b.ats ?? 0) - (a.ats ?? 0));

      const box = document.getElementById('dashList');
      if (!list.length) { box.innerHTML = '<div class="history-empty">No candidate matches these filters.</div>'; return; }
      box.innerHTML = list.map(c => `
        <div class="dash-row">
          <div style="min-width:0"><div class="dash-name" dir="auto">${esc(c.name)}</div>
            <div class="dash-sub">${esc(c.level)}${c.years != null ? ' · ' + esc(c.years) + ' yrs' : ''} · ${esc(c.fileName)} · ${new Date(c.date).toLocaleDateString()}</div></div>
          <div class="dash-num"><b>${c.ats ?? '—'}</b><small>ATS</small></div>
          <div class="dash-num"><b>${c.match ?? '—'}</b><small>Match</small></div>
          <button class="rank-view-btn" style="margin:0" data-id="${esc(c.id)}"><i class="fa-solid fa-magnifying-glass-chart"></i> View</button>
        </div>`).join('');
      box.querySelectorAll('.rank-view-btn').forEach(b => b.addEventListener('click', () => dashView(b.dataset.id)));
    }

    async function dashView(id) {
      try {
        const res = await fetch(API + '/api/history/' + id, { headers: authHeaders() });
        if (!res.ok) throw new Error('Not found');
        const full = await res.json();
        document.getElementById('tab-dashboard').classList.remove('active');
        renderResults(full.result, !!full.hasJobDescription);
        document.getElementById('backDashBtn').classList.remove('hidden');
      } catch (e) { toast('Could not load this analysis', 'error'); }
    }

    document.getElementById('backDashBtn').addEventListener('click', () => {
      document.getElementById('resultsSection').classList.add('hidden');
      document.getElementById('backDashBtn').classList.add('hidden');
      document.getElementById('uploadSection').classList.remove('hidden');
      document.getElementById('tab-dashboard').classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Also fixes the upload card staying hidden after "Back to ranking"
    document.getElementById('backRankBtn').addEventListener('click', () => {
      document.getElementById('uploadSection').classList.remove('hidden');
    });
@@END@@*/