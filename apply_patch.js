// Usage: put this file in C:\CV-Analyzer (next to the other apply_patch files), then run:  node apply_patch11.js
// Needs patches 5 and 10 (pipeline) already applied.
//   5) Dashboard: compare 2-3 candidates side by side
//   7) Dashboard: analytics (activity over time, score distribution, top job offers)
//   6) Learning plan generated from the skill gaps of an analysis
// All new texts exist in English, French and Arabic. Backups: *.bak. Safe to run twice.

const fs = require('fs');
const path = require('path');

const self = fs.readFileSync(__filename, 'utf8');
const startMark = self.lastIndexOf('/*@@SNIPPETS');
const endMark = self.lastIndexOf('@@END@@');
const parts = self.slice(startMark, endMark).split(/^=====(\w+)\r?\n/m);
const S = {};
for (let i = 1; i < parts.length; i += 2) S[parts[i]] = parts[i + 1].replace(/\s+$/, '');

const ROOT = process.env.PATCH_ROOT || __dirname;

function patch(file, doneMarker, edits) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) throw new Error('File not found: ' + p);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');
  if (src.includes(doneMarker)) { console.log('= ' + file + ': already patched, skipped'); return; }
  for (const [find, repl] of edits) {
    const count = src.split(find).length - 1;
    if (count !== 1) throw new Error(file + ': anchor found ' + count + ' times (expected 1):\n  ' + find);
    src = src.replace(find, () => repl);
  }
  fs.writeFileSync(p + '.bak', raw);
  fs.writeFileSync(p, crlf ? src.replace(/\n/g, '\r\n') : src);
  console.log('✓ ' + file + ' patched (' + edits.length + ' edits)');
}

function overwrite(file, marker, content) {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.includes(marker)) { console.log('= ' + file + ': already up to date, skipped'); return; }
    fs.writeFileSync(p + '.bak', raw);
  } else {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
  fs.writeFileSync(p, content + '\n');
  console.log('✓ ' + file + ' written');
}

// ---------------- backend ----------------
overwrite('backend/utils/ai_learning.js', 'buildLearningPlan', S.AI_LEARNING);
overwrite('backend/routes/learning.js', 'MAX_ITEMS', S.LEARNING_ROUTE);

patch('backend/routes/recruiter.js', 'activity', [
  ["const express = require('express');", "const express = require('express');\nconst crypto = require('crypto');"],
  ["result.skills status note createdAt')", "result.skills status note createdAt +jobDescription')"],
  ["status: it.status || 'new',", S.OFFER_FIELDS + "\n      status: it.status || 'new',"],
  ['const strong = candidates.filter(', S.ANALYTICS_CODE + '\n  const strong = candidates.filter('],
  ['topSkills: [...skillCount.values()]', 'activity,\n    offers,\n    topSkills: [...skillCount.values()]']
]);

patch('backend/server.js', '/api/learning', [
  ["app.use('/api/jobs', require('./routes/jobs'));",
    "app.use('/api/jobs', require('./routes/jobs'));\napp.use('/api/learning', require('./routes/learning'));"]
]);

// ---------------- frontend/index.html ----------------
patch('frontend/index.html', 'lpOverlay', [
  ['<!-- Vercel Analytics -->', S.CSS + '\n\n  <!-- Vercel Analytics -->'],
  ['<button class="btn-export hidden" id="rewriteBtn">',
    '<button class="btn-export hidden" id="learnBtn"></button>\n          <button class="btn-export hidden" id="rewriteBtn">'],
  ['<!-- AUTH MODAL -->', S.MODALS + '\n\n  <!-- AUTH MODAL -->'],
  ['window._lastResult = data;', 'window._lastResult = data;\n      updateLearnBtn(data);'],
  ['${pipelineHtml(d)}', '${analyticsHtml(d)}\n        ${pipelineHtml(d)}\n        <div class="cmp-bar hidden" id="cmpBar"></div>'],
  ['<div class="dash-pipe"><select class="pipe-status', S.PICK + '<select class="pipe-status'],
  ['bindPipe(box);', 'bindPipe(box);\n      updateCmpBar();'],
  ["document.getElementById('year').textContent", S.JS + "\n\n    document.getElementById('year').textContent"]
]);

console.log('\nDone. Restart the backend and refresh the frontend (Ctrl+F5).');

/*@@SNIPPETS
=====AI_LEARNING
const Groq = require('groq-sdk');

// Same model setting as the analyzer (GROQ_MODEL in .env)
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const LANGS = { en: 'English', fr: 'French', ar: 'Arabic' };
const pickLang = (v) => (Object.prototype.hasOwnProperty.call(LANGS, v) ? v : 'en');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseJSON(raw) {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI returned an invalid response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function askJSON({ system, user, maxTokens = 4000, temperature = 0.3 }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const params = {
    model: MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  };
  if (MODEL.includes('gpt-oss')) params.reasoning_effort = 'low';

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await groq.chat.completions.create(params);
      return parseJSON((response.choices[0].message.content || '').trim());
    } catch (err) {
      lastErr = err;
      const retryable = err.status === 429 || err instanceof SyntaxError;
      if (!retryable || attempt === 3) break;
      await sleep(err.status === 429 ? 8000 * attempt : 500);
    }
  }
  throw lastErr;
}

const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const list = (a, n, max) => (Array.isArray(a) ? a.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);

// input: { level, years, skills[], missing[], weaknesses[], suggestions[], hasJob, language }
async function buildLearningPlan(input) {
  const lang = pickLang(input.language);
  const prompt = `Build a realistic self-study learning plan for a job candidate.

CANDIDATE
- Level: ${input.level || 'unknown'}${input.years != null ? ', ' + input.years + ' years of experience' : ''}
- Current skills: ${input.skills.join(', ') || 'not listed'}
- ${input.hasJob ? 'Skills required by the target job that the candidate is missing (top priority)' : 'Skills the analysis found missing'}: ${input.missing.join(', ') || 'none'}
- Weaknesses found in the CV: ${input.weaknesses.join(' | ') || 'none'}
- Suggestions already given: ${input.suggestions.join(' | ') || 'none'}

RULES
- 3 to 6 steps, ordered by impact: the missing skills first, then the weaknesses that can be fixed by learning.
- Each step: "skill" (short name, keep technology names unchanged), "why" (one sentence), "weeks" (integer from 1 to 6, assume about 8 hours of study per week), "actions" (2 to 4 concrete tasks, including one small practice project), "resources" (2 to 3 names of well-known FREE resources such as official documentation or a named learning platform; NO URLs and no invented course titles).
- Never invent facts about the candidate.
- Write "summary", "why", "actions" and "resources" in ${LANGS[lang]}.

OUTPUT: valid JSON only:
{ "summary": "two sentences", "steps": [ { "skill": "", "why": "", "weeks": 2, "actions": [""], "resources": [""] } ] }`;

  const out = await askJSON({
    system: 'You are an experienced career coach. You never invent facts. Respond with valid JSON only.',
    user: prompt,
    maxTokens: 4000
  });

  const steps = (Array.isArray(out.steps) ? out.steps : []).slice(0, 6).map((s) => ({
    skill: text(s && s.skill, 80),
    why: text(s && s.why, 300),
    weeks: Math.min(6, Math.max(1, Math.round(Number(s && s.weeks)) || 1)),
    actions: list(s && s.actions, 4, 250),
    resources: list(s && s.resources, 3, 120)
  })).filter((s) => s.skill);

  if (!steps.length) throw new Error('AI returned an empty plan, please try again');
  return {
    summary: text(out.summary, 500),
    total_weeks: steps.reduce((sum, s) => sum + s.weeks, 0),
    steps
  };
}

module.exports = { buildLearningPlan, pickLang };
=====LEARNING_ROUTE
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
=====OFFER_FIELDS
offer: it.hasJobDescription && it.jobDescription ? String(it.jobDescription).trim().split('\n')[0].slice(0, 60) : '',
      offerKey: it.hasJobDescription && it.jobDescription
        ? crypto.createHash('sha1').update(String(it.jobDescription).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500)).digest('hex').slice(0, 12)
        : '',
=====ANALYTICS_CODE
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
=====CSS
<style>
    .cmp-pick { display: inline-flex; align-items: center; gap: 6px; font-size: .78rem; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
    .cmp-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 12px; padding: 10px 14px; background: var(--gold-dim); border: 1px solid var(--border-hover); border-radius: 12px; font-size: .85rem; color: var(--text-secondary); }
    .cmp-wrap { overflow-x: auto; }
    .cmp-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .cmp-table th, .cmp-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: start; vertical-align: top; }
    .cmp-table thead th { font-family: 'Cormorant Garamond', serif; font-size: 1.05rem; color: var(--text-primary); }
    .cmp-table tbody th { color: var(--text-muted); font-weight: 500; white-space: nowrap; }
    .cmp-table td.cmp-best { color: var(--gold); font-weight: 700; }
    .cmp-table .skill-tag { display: inline-block; margin: 0 4px 4px 0; padding: 3px 9px; font-size: .75rem; }
    .cmp-best-line { margin: 0 0 12px; font-size: .9rem; color: var(--text-secondary); }
    .cmp-best-line b { color: var(--gold); }
    .an-chart { display: flex; align-items: flex-end; gap: 4px; height: 96px; }
    .an-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; font-size: .6rem; color: var(--text-muted); }
    .an-bar { width: 100%; min-height: 2px; background: var(--gold); border-radius: 4px 4px 0 0; }
    .an-offer { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: .82rem; color: var(--text-secondary); }
    .an-offer:last-child { border-bottom: none; }
    .an-offer b { color: var(--text-primary); display: block; }
    .lp-step { background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
    .lp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .lp-weeks { color: var(--gold); font-size: .8rem; white-space: nowrap; }
    .lp-why { margin: 6px 0 0; font-size: .85rem; color: var(--text-secondary); line-height: 1.5; }
    .lp-total { margin: 0 0 6px; font-size: .9rem; color: var(--text-secondary); }
    .lp-total b { color: var(--gold); }
  </style>
=====PICK
<label class="cmp-pick"><input type="checkbox" class="cmp-check" data-id="${esc(c.id)}"${window._cmpSel && window._cmpSel.has(String(c.id)) ? ' checked' : ''}> ${esc(t11('pick'))}</label>
          
=====MODALS
<!-- COMPARE + LEARNING PLAN MODALS -->
  <div class="auth-overlay hidden" id="cmpOverlay">
    <div class="rw-modal" style="max-width:920px">
      <button class="auth-close" id="cmpClose"><i class="fa-solid fa-xmark"></i></button>
      <h3 id="cmpTitle"></h3>
      <div id="cmpBody"></div>
    </div>
  </div>
  <div class="auth-overlay hidden" id="lpOverlay">
    <div class="rw-modal" style="max-width:720px">
      <button class="auth-close" id="lpClose"><i class="fa-solid fa-xmark"></i></button>
      <h3 id="lpTitle"></h3>
      <div id="lpBody"></div>
    </div>
  </div>
=====JS
// Texts for the comparison, analytics and learning plan (English / French / Arabic)
    const T11 = {
      en: {
        learn: 'Learning plan', lpTitle: 'Your learning plan', lpBuilding: 'Building your plan…', lpWeeks: 'weeks', lpTotal: 'Estimated total',
        lpDo: 'What to do', lpRes: 'Where to learn',
        actTitle: 'Activity (last 14 days)', distTitle: 'ATS score distribution', offersTitle: 'Top job offers',
        noOffers: 'Analyze or rank CVs with a job description to see your offers here.', cands: 'candidates', avgMatch: 'avg match', best: 'Best',
        pick: 'Compare', cmpHint: 'Pick one more candidate to compare', cmpBtn: 'Compare selected', cmpClear: 'Clear',
        cmpMax: 'You can compare up to 3 candidates', cmpTitle: 'Candidate comparison', cmpLoading: 'Loading the comparison…', cmpOverall: 'Highest overall',
        rATS: 'ATS score', rMatch: 'Job match', rCoverage: 'Skills coverage', rYears: 'Years of experience', rLevel: 'Level', rEdu: 'Education',
        rStatus: 'Status', rCommon: 'Skills in common', rUnique: 'Only this candidate', rMissing: 'Missing for the job', rStrength: 'Top strength', rGap: 'Main gap',
        bFormat: 'Format', bKeywords: 'Keywords', bExperience: 'Experience', bEducation: 'Education', bSkills: 'Skills',
        st_new: 'New', st_shortlisted: 'Shortlisted', st_interview: 'Interview', st_rejected: 'Rejected'
      },
      fr: {
        learn: "Plan d'apprentissage", lpTitle: "Votre plan d'apprentissage", lpBuilding: 'Création du plan…', lpWeeks: 'semaines', lpTotal: 'Durée totale estimée',
        lpDo: 'À faire', lpRes: 'Où apprendre',
        actTitle: 'Activité (14 derniers jours)', distTitle: 'Répartition des scores ATS', offersTitle: 'Principales offres',
        noOffers: 'Analysez ou classez des CV avec une description de poste pour voir vos offres ici.', cands: 'candidats', avgMatch: 'adéquation moy.', best: 'Meilleur',
        pick: 'Comparer', cmpHint: 'Choisissez un autre candidat à comparer', cmpBtn: 'Comparer la sélection', cmpClear: 'Effacer',
        cmpMax: "Vous pouvez comparer jusqu'à 3 candidats", cmpTitle: 'Comparaison des candidats', cmpLoading: 'Chargement de la comparaison…', cmpOverall: 'Meilleur au global',
        rATS: 'Score ATS', rMatch: 'Adéquation au poste', rCoverage: 'Couverture des compétences', rYears: "Années d'expérience", rLevel: 'Niveau', rEdu: 'Formation',
        rStatus: 'Statut', rCommon: 'Compétences en commun', rUnique: 'Uniquement ce candidat', rMissing: 'Manquantes pour le poste', rStrength: 'Principal atout', rGap: 'Principale lacune',
        bFormat: 'Format', bKeywords: 'Mots-clés', bExperience: 'Expérience', bEducation: 'Formation', bSkills: 'Compétences',
        st_new: 'Nouveau', st_shortlisted: 'Présélectionné', st_interview: 'Entretien', st_rejected: 'Refusé'
      },
      ar: {
        learn: 'خطة التعلّم', lpTitle: 'خطتك للتعلّم', lpBuilding: 'جارٍ إنشاء الخطة…', lpWeeks: 'أسابيع', lpTotal: 'المدة الإجمالية المقدّرة',
        lpDo: 'ما يجب فعله', lpRes: 'أين تتعلّم',
        actTitle: 'النشاط (آخر 14 يومًا)', distTitle: 'توزيع درجات ATS', offersTitle: 'أهم عروض العمل',
        noOffers: 'حلّل أو رتّب سيرًا ذاتية مع وصف وظيفة لتظهر عروضك هنا.', cands: 'مرشحون', avgMatch: 'متوسط الملاءمة', best: 'الأفضل',
        pick: 'مقارنة', cmpHint: 'اختر مرشحًا آخر للمقارنة', cmpBtn: 'قارن المحدّدين', cmpClear: 'مسح',
        cmpMax: 'يمكنك مقارنة 3 مرشحين كحد أقصى', cmpTitle: 'مقارنة المرشحين', cmpLoading: 'جارٍ تحميل المقارنة…', cmpOverall: 'الأفضل إجمالًا',
        rATS: 'درجة ATS', rMatch: 'ملاءمة الوظيفة', rCoverage: 'تغطية المهارات', rYears: 'سنوات الخبرة', rLevel: 'المستوى', rEdu: 'التعليم',
        rStatus: 'الحالة', rCommon: 'مهارات مشتركة', rUnique: 'خاصة بهذا المرشح فقط', rMissing: 'مهارات ناقصة للوظيفة', rStrength: 'أبرز نقاط القوة', rGap: 'أبرز نقطة ضعف',
        bFormat: 'التنسيق', bKeywords: 'الكلمات المفتاحية', bExperience: 'الخبرة', bEducation: 'التعليم', bSkills: 'المهارات',
        st_new: 'جديد', st_shortlisted: 'ضمن القائمة المختصرة', st_interview: 'مقابلة', st_rejected: 'مرفوض'
      }
    };
    function lang11() {
      const l = (document.documentElement.lang || '').toLowerCase();
      if (l.startsWith('ar') || document.documentElement.dir === 'rtl') return 'ar';
      if (l.startsWith('fr')) return 'fr';
      return 'en';
    }
    function t11(k) { return (T11[lang11()] || T11.en)[k] || T11.en[k] || k; }

    // Dashboard analytics: activity, score distribution, top job offers
    function analyticsHtml(d) {
      const act = d.activity || [];
      const maxAct = Math.max(1, ...act.map(a => a.count));
      const bars = act.map(a =>
        `<div class="an-col" title="${esc(a.day)}: ${a.count}"><div class="an-bar" style="height:${Math.round(a.count / maxAct * 100)}%"></div><span>${esc(a.day.slice(8))}</span></div>`
      ).join('');

      const buckets = [['0-49', 0, 49], ['50-69', 50, 69], ['70-84', 70, 84], ['85-100', 85, 100]];
      const dist = buckets.map(b => [b[0], d.candidates.filter(c => typeof c.ats === 'number' && c.ats >= b[1] && c.ats <= b[2]).length]);

      const offers = (d.offers || []).map(o =>
        `<div class="an-offer"><b dir="auto">${esc(o.offer || '—')}</b>${o.count} ${esc(t11('cands'))}${o.avgMatch != null ? ' · ' + o.avgMatch + ' ' + esc(t11('avgMatch')) : ''}${o.best ? ' · ' + esc(t11('best')) + ': ' + esc(o.best.name) + ' (' + o.best.match + ')' : ''}</div>`
      ).join('') || `<span class="dash-sub">${esc(t11('noOffers'))}</span>`;

      return `<div class="dash-grid">
        <div class="dash-box"><h4>${esc(t11('actTitle'))}</h4><div class="an-chart">${bars}</div></div>
        <div class="dash-box"><h4>${esc(t11('distTitle'))}</h4>${barRows(dist)}</div>
      </div>
      <div class="dash-box" style="margin-bottom:20px"><h4>${esc(t11('offersTitle'))}</h4>${offers}</div>`;
    }

    // Compare 2 to 3 candidates side by side
    window._cmpSel = new Set();

    function updateCmpBar() {
      const bar = document.getElementById('cmpBar');
      if (!bar) return;
      const n = window._cmpSel.size;
      bar.classList.toggle('hidden', n === 0);
      if (n === 0) { bar.innerHTML = ''; return; }
      bar.innerHTML = (n < 2
        ? `<span>${esc(t11('cmpHint'))}</span>`
        : `<button type="button" class="rank-view-btn" id="cmpGo" style="margin:0"><i class="fa-solid fa-code-compare"></i> ${esc(t11('cmpBtn'))} (${n})</button>`)
        + `<button type="button" class="jobs-btn" id="cmpClear">${esc(t11('cmpClear'))}</button>`;
    }

    function buildCompareHtml(cols) {
      const lc = s => String(s).trim().toLowerCase();
      const dash = '—';
      const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
      const maps = cols.map(c => new Map((c.r.skills || []).map(s => [lc(s), s])));
      const chips = arr => arr.length ? arr.map(s => `<span class="skill-tag">${esc(s)}</span>`).join('') : dash;

      const numRow = (label, vals) => {
        const nums = vals.map(num);
        const present = nums.filter(v => v !== null);
        const max = Math.max(...present);
        const differ = new Set(present).size > 1;
        return `<tr><th>${esc(label)}</th>${nums.map(v => `<td class="${differ && v === max ? 'cmp-best' : ''}">${v === null ? dash : esc(v)}</td>`).join('')}</tr>`;
      };
      const textRow = (label, vals) =>
        `<tr><th>${esc(label)}</th>${vals.map(v => `<td dir="auto">${esc(v || dash)}</td>`).join('')}</tr>`;
      const chipRow = (label, arrs) =>
        `<tr><th>${esc(label)}</th>${arrs.map(a => `<td>${chips(a)}</td>`).join('')}</tr>`;

      const common = [...maps[0].keys()].filter(k => maps.every(m => m.has(k))).map(k => maps[0].get(k));
      const unique = maps.map((m, i) => [...m.entries()].filter(([k]) => !maps.some((o, j) => j !== i && o.has(k))).map(e => e[1]));
      const score = c => (num(c.r.match_score) !== null ? c.r.match_score : (num(c.r.ats_score) !== null ? c.r.ats_score : -1));
      const top = cols.reduce((a, b) => (score(b) > score(a) ? b : a));
      const bd = k => cols.map(c => (c.r.breakdown || {})[k]);

      const rows = [
        numRow(t11('rATS'), cols.map(c => c.r.ats_score)),
        numRow(t11('rMatch'), cols.map(c => c.r.match_score)),
        numRow(t11('rCoverage'), cols.map(c => c.r.skill_coverage)),
        numRow(t11('rYears'), cols.map(c => c.r.experience_years)),
        textRow(t11('rLevel'), cols.map(c => c.r.experience_level)),
        textRow(t11('rEdu'), cols.map(c => c.r.education)),
        textRow(t11('rStatus'), cols.map(c => t11('st_' + c.status))),
        numRow(t11('bFormat'), bd('format')),
        numRow(t11('bKeywords'), bd('keywords')),
        numRow(t11('bExperience'), bd('experience')),
        numRow(t11('bEducation'), bd('education')),
        numRow(t11('bSkills'), bd('skills')),
        `<tr><th>${esc(t11('rCommon'))}</th><td colspan="${cols.length}">${chips(common)}</td></tr>`,
        chipRow(t11('rUnique'), unique),
        chipRow(t11('rMissing'), cols.map(c => c.r.missing_skills || [])),
        textRow(t11('rStrength'), cols.map(c => (c.r.strengths || [])[0])),
        textRow(t11('rGap'), cols.map(c => (c.r.weaknesses || [])[0]))
      ];
      return `<p class="cmp-best-line">${esc(t11('cmpOverall'))}: <b dir="auto">${esc(top.name)}</b></p>
        <div class="cmp-wrap"><table class="cmp-table"><thead><tr><th></th>${cols.map(c => `<th dir="auto">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    const cmpOverlay = document.getElementById('cmpOverlay');
    document.getElementById('cmpClose').addEventListener('click', () => cmpOverlay.classList.add('hidden'));
    cmpOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) cmpOverlay.classList.add('hidden'); });

    async function openCompare() {
      const ids = [...window._cmpSel];
      if (ids.length < 2) return;
      const title = document.querySelector('.loading-title');
      const before = title.textContent;
      title.textContent = t11('cmpLoading');
      showLoading();
      try {
        const fulls = await Promise.all(ids.map(async id => {
          const res = await fetch(API + '/api/history/' + id, { headers: authHeaders() });
          if (res.status === 401) { logout(true); throw new Error('Session expired, please login again'); }
          if (!res.ok) throw new Error('Could not load a candidate');
          return res.json();
        }));
        const cols = fulls.map((f, i) => {
          const c = findCand(ids[i]) || {};
          return { r: f.result || {}, status: c.status || 'new', name: (f.result && f.result.candidate_name) || c.name || '—' };
        });
        document.getElementById('cmpTitle').textContent = t11('cmpTitle');
        document.getElementById('cmpBody').innerHTML = buildCompareHtml(cols);
        cmpOverlay.classList.remove('hidden');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        hideLoading();
        title.textContent = before;
      }
    }

    dashBody.addEventListener('change', e => {
      const box = e.target.closest('.cmp-check');
      if (!box) return;
      if (box.checked && window._cmpSel.size >= 3) {
        box.checked = false;
        toast(t11('cmpMax'), 'error');
        return;
      }
      if (box.checked) window._cmpSel.add(box.dataset.id); else window._cmpSel.delete(box.dataset.id);
      updateCmpBar();
    });
    dashBody.addEventListener('click', e => {
      if (e.target.closest('#cmpGo')) openCompare();
      else if (e.target.closest('#cmpClear')) {
        window._cmpSel.clear();
        dashBody.querySelectorAll('.cmp-check').forEach(b => { b.checked = false; });
        updateCmpBar();
      }
    });

    // Learning plan from the skill gaps of the analysis on screen
    function updateLearnBtn(data) {
      const btn = document.getElementById('learnBtn');
      if (!btn) return;
      const hasGaps = ((data.missing_skills || []).length + (data.weaknesses || []).length) > 0;
      btn.classList.toggle('hidden', !(hasGaps && !(window._user && window._user.role === 'recruiter')));
    }
    function refreshLabels11() {
      const btn = document.getElementById('learnBtn');
      if (btn) btn.innerHTML = '<i class="fa-solid fa-graduation-cap"></i> ' + esc(t11('learn'));
      if (window._dash && document.getElementById('tab-dashboard').classList.contains('active')) renderDashboard(window._dash);
    }
    refreshLabels11();
    new MutationObserver(refreshLabels11).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });

    const lpOverlay = document.getElementById('lpOverlay');
    document.getElementById('lpClose').addEventListener('click', () => lpOverlay.classList.add('hidden'));
    lpOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) lpOverlay.classList.add('hidden'); });

    function showPlan(p) {
      const block = (label, arr) => arr.length
        ? `<p class="rw-h">${esc(t11(label))}</p><ul class="rw-list">${arr.map(a => `<li dir="auto">${esc(a)}</li>`).join('')}</ul>` : '';
      const steps = (p.steps || []).map((s, i) =>
        `<div class="lp-step"><div class="lp-head"><b dir="auto">${i + 1}. ${esc(s.skill)}</b><span class="lp-weeks">${esc(s.weeks)} ${esc(t11('lpWeeks'))}</span></div>` +
        `<p class="lp-why" dir="auto">${esc(s.why)}</p>${block('lpDo', s.actions || [])}${block('lpRes', s.resources || [])}</div>`
      ).join('');
      document.getElementById('lpTitle').textContent = t11('lpTitle');
      document.getElementById('lpBody').innerHTML =
        `<p class="acc-note" dir="auto">${esc(p.summary || '')}</p><p class="lp-total">${esc(t11('lpTotal'))}: <b>${esc(p.total_weeks)} ${esc(t11('lpWeeks'))}</b></p>` + steps;
      lpOverlay.classList.remove('hidden');
    }

    document.getElementById('learnBtn').addEventListener('click', async () => {
      const r = window._lastResult;
      if (!r) return;
      const title = document.querySelector('.loading-title');
      const before = title.textContent;
      title.textContent = t11('lpBuilding');
      showLoading();
      try {
        const res = await fetch(API + '/api/learning/plan', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            missing_skills: r.missing_skills || [], skills: r.skills || [], weaknesses: r.weaknesses || [],
            suggestions: r.suggestions || [], level: r.experience_level || '', years: r.experience_years,
            has_job: typeof r.match_score === 'number', language: getLang('langSelect')
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { logout(true); throw new Error('Session expired, please login again'); }
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showPlan(data);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        hideLoading();
        title.textContent = before;
      }
    });
@@END@@*/