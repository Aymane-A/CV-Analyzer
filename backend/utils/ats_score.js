// backend/utils/ats_score.js
// Deterministic ATS-style score: same input -> same output, always. No LLM involved.

const HEADINGS = {
  experience: /(experience|expérience|work history|employment|internship|stage|stages|parcours professionnel|الخبرة|خبرة)/i,
  education: /(education|formation|études|etudes|diplôme|diplome|academic|التعليم|التكوين|الدراسة)/i,
  skills: /(skills|compétences|competences|technologies|tech stack|outils|tools|المهارات|مهارات)/i,
  summary: /(summary|profile|profil|about|objective|objectif|résumé|ملخص|نبذة)/i,
  projects: /(projects|projets|المشاريع)/i,
};

const STOP = new Set(('the and for with you your our are will have has from that this into able not but all any can '
  + 'une des les pour avec dans sur par que qui est sont vous nous votre notre aux ses son ces cet cette du de la le un et ou en au '
  + 'work team role job year years experience expérience plus more must should about their they them have been being '
  + 'need needs looking seeking required require requirements strong good great knowledge ability skills skill candidate position company join etc').split(/\s+/));

const ACTION_VERBS = ('built developed designed implemented led managed created improved reduced increased launched optimized '
  + 'automated deployed delivered analyzed analysed migrated integrated mentored coordinated achieved '
  + 'développé conçu réalisé dirigé géré créé amélioré réduit augmenté lancé optimisé automatisé déployé livré analysé migré intégré coordonné').split(/\s+/);

const DEGREE = /(bachelor|licence|master|mba|phd|doctorat|ing[ée]nieur|engineer(ing)? degree|diplôme|diploma|bac\s?\+\s?\d|dut|bts|deug|cycle|بكالوريوس|ماستر|إجازة|دكتوراه)/i;
const YEAR = /\b(19|20)\d{2}\b/g;
const DATE_RANGE = /((19|20)\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr|avr|juin|juil|août|sept|déc)[a-zéû.]*\s*[-–—to→à]+\s*((19|20)\d{2}|present|présent|aujourd|now|actuel|current|الآن|حاليا)/gi;

const SHORT = new Set(['ai', 'ml', 'bi', 'go', 'qa', 'ui', 'ux', 'it', 'c#']);
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const words = (t) => (t.match(/[\p{L}\p{N}+#.]+/gu) || []).map((w) => w.replace(/\.+$/, '').toLowerCase()).filter(Boolean);

function sectionsFound(text) {
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l.length === 0 || l.length > 40) continue; // headings are short lines
    for (const [k, re] of Object.entries(HEADINGS)) if (re.test(l)) found[k] = true;
  }
  return found;
}

function jdKeywords(jd, max = 25) {
  const freq = new Map();
  for (const w of words(jd)) {
    if ((w.length < 3 && !SHORT.has(w)) || STOP.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) // tie-break keeps it deterministic
    .slice(0, max)
    .map(([w]) => w);
}

function scoreFormat(text, sec) {
  let s = 0;
  const wc = words(text).length;
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) s += 20;
  if (/(\+?\d[\d\s().-]{7,}\d)/.test(text)) s += 15;
  s += ['experience', 'education', 'skills'].filter((k) => sec[k]).length * 12; // up to 36
  if (sec.summary) s += 7;
  if (wc >= 250 && wc <= 900) s += 15; else if (wc >= 150 && wc <= 1300) s += 8;
  const bullets = (text.match(/^\s*[•\-–*▪●◦]/gm) || []).length;
  if (bullets >= 5) s += 7; else if (bullets >= 2) s += 3;
  return clamp(s);
}

function scoreExperience(text, sec) {
  let s = sec.experience ? 25 : 0;
  const ranges = (text.match(DATE_RANGE) || []).length;
  s += Math.min(ranges, 3) * 10;
  const metrics = (text.match(/\d+\s?(%|k\b|m\b|\+|x\b|users|utilisateurs|clients|projects|projets|ms\b|dh|mad|€|\$)/gi) || []).length;
  s += Math.min(metrics, 4) * 7;
  const ws = new Set(words(text));
  const verbs = ACTION_VERBS.filter((v) => ws.has(v)).length;
  s += Math.min(verbs, 3) * 5;
  if (sec.projects) s += 2;
  return clamp(s);
}

function scoreEducation(text, sec) {
  let s = sec.education ? 35 : 0;
  if (DEGREE.test(text)) s += 40;
  if ((text.match(YEAR) || []).length >= 1) s += 25;
  return clamp(s);
}

function scoreSkills(text, sec, jdKw) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().length <= 40 && HEADINGS.skills.test(l));
  let items = 0;
  if (idx >= 0) {
    const block = lines.slice(idx + 1, idx + 12).join(' ');
    items = block.split(/[,;|•·\n]/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 30).length;
  }
  let s = (sec.skills ? 30 : 0) + Math.min(items, 10) * 4;
  if (jdKw.length) {
    const ws = new Set(words(text));
    const hit = jdKw.filter((k) => ws.has(k)).length;
    s = s * 0.5 + (hit / jdKw.length) * 50;
  } else s += 30;
  return clamp(s);
}

function scoreKeywords(text, jdKw) {
  const ws = new Set(words(text));
  if (jdKw.length) {
    const hit = jdKw.filter((k) => ws.has(k));
    return { score: clamp((hit.length / jdKw.length) * 100), matched: hit, missing: jdKw.filter((k) => !ws.has(k)) };
  }
  // No job description: reward concrete, searchable content instead.
  const verbs = ACTION_VERBS.filter((v) => ws.has(v)).length;
  const metrics = (text.match(/\d+\s?%/g) || []).length;
  const uniq = [...ws].filter((w) => w.length > 3 && !STOP.has(w)).length;
  return { score: clamp(Math.min(verbs, 6) * 8 + Math.min(metrics, 4) * 8 + Math.min(uniq / 3, 20)), matched: [], missing: [] };
}

function scoreCV(cvText, jobDescription = '') {
  const text = String(cvText || '').normalize('NFC');
  const sec = sectionsFound(text);
  const jdKw = jobDescription && jobDescription.trim().length > 30 ? jdKeywords(jobDescription) : [];
  const kw = scoreKeywords(text, jdKw);
  const breakdown = {
    format: Math.round(scoreFormat(text, sec)),
    keywords: Math.round(kw.score),
    experience: Math.round(scoreExperience(text, sec)),
    education: Math.round(scoreEducation(text, sec)),
    skills: Math.round(scoreSkills(text, sec, jdKw)),
  };
  const total = Math.round(
    breakdown.format * 0.2 + breakdown.keywords * 0.25 + breakdown.experience * 0.25 +
    breakdown.education * 0.1 + breakdown.skills * 0.2
  );
  return { total, breakdown, matchedKeywords: kw.matched, missingKeywords: kw.missing, sections: sec };
}

module.exports = { scoreCV, jdKeywords };