// Cleans the AI output and computes a more stable match score.

const clamp = (n, lo = 0, hi = 100) => {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};

const strArr = (a, max = 20) =>
  Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [];

/* ── Verify AI skill claims against the real CV text ── */
const ALIASES = {
  git: ['github', 'gitlab', 'bitbucket'],
  github: ['git'],
  'rest apis': ['rest', 'restful', 'rest api'],
  'rest api': ['rest', 'restful', 'rest apis'],
  postgresql: ['postgres'],
  mongodb: ['mongo'],
  javascript: ['js'],
  typescript: ['ts'],
  'node.js': ['node', 'nodejs'],
  nodejs: ['node', 'node.js'],
  react: ['reactjs', 'react.js'],
  'react.js': ['react', 'reactjs'],
  express: ['express.js', 'expressjs'],
  'express.js': ['express', 'expressjs'],
  'machine learning': ['ml'],
  'artificial intelligence': ['ai'],
  'ci/cd': ['cicd', 'github actions', 'gitlab ci', 'jenkins'],
};

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function skillVariants(skill) {
  const base = skill.toLowerCase().trim();
  const set = new Set([base, base.replace(/\s+/g, ''), base.replace(/\./g, '')]);
  (ALIASES[base] || []).forEach((a) => set.add(a));
  return [...set].filter(Boolean);
}

function textHasSkill(textLower, skill) {
  return skillVariants(skill).some((v) =>
    new RegExp('(?<![a-z0-9])' + escapeRe(v) + '(?![a-z0-9+#])').test(textLower)
  );
}

function refineResult(raw, hasJD, cvText = '') {
  const r = { ...raw };

  r.candidate_name = String(r.candidate_name || '').trim() || 'Unknown';
  r.experience_level = String(r.experience_level || '').trim() || '—';
  r.education = String(r.education || '').trim() || '—';
  const yrs = Number(r.experience_years);
  r.experience_years = Number.isFinite(yrs) ? Math.round(Math.min(60, Math.max(0, yrs)) * 10) / 10 : null;
  r.ats_score = clamp(r.ats_score) ?? 0;

  for (const k of ['skills', 'strengths', 'weaknesses', 'suggestions']) r[k] = strArr(r[k]);

  if (r.breakdown && typeof r.breakdown === 'object') {
    const b = {};
    for (const k of ['format', 'keywords', 'experience', 'education', 'skills']) {
      const v = clamp(r.breakdown[k]);
      if (v !== null) b[k] = v;
    }
    r.breakdown = Object.keys(b).length === 5 ? b : undefined;
  } else {
    r.breakdown = undefined;
  }

  if (!hasJD) {
    r.match_score = null;
    r.matched_skills = [];
    r.missing_skills = [];
    return r;
  }

  let matched = strArr(r.matched_skills);
  const matchedKeys = new Set(matched.map((x) => x.toLowerCase()));
  let missing = strArr(r.missing_skills).filter((x) => !matchedKeys.has(x.toLowerCase()));

  // The AI sometimes lists a skill as missing although it is written in the CV: check the text
  if (cvText) {
    const lower = cvText.toLowerCase();
    const found = missing.filter((sk) => textHasSkill(lower, sk));
    if (found.length) {
      matched = [...matched, ...found];
      missing = missing.filter((sk) => !found.includes(sk));
    }
  }
  r.matched_skills = matched;
  r.missing_skills = missing;

  const ai = clamp(r.match_score);
  const total = matched.length + missing.length;

  if (total > 0) {
    // 60% AI judgement + 40% objective skill coverage => fewer ties, more stable
    const coverage = Math.round((matched.length / total) * 100);
    r.skill_coverage = coverage;
    r.ai_match_score = ai;
    r.match_score = ai === null ? coverage : Math.round(ai * 0.6 + coverage * 0.4);
  } else {
    r.match_score = ai;
  }
  return r;
}

// Sort helper: match, then skill coverage, then ATS, then experience
function compareCandidates(a, b) {
  const num = (x) => (typeof x === 'number' ? x : -1);
  return (
    num(b.match_score) - num(a.match_score) ||
    num(b.skill_coverage) - num(a.skill_coverage) ||
    num(b.ats_score) - num(a.ats_score) ||
    num(b.experience_years) - num(a.experience_years)
  );
}

module.exports = { refineResult, compareCandidates, textHasSkill };