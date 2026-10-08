const { buildPrompt } = require('./prompt');
const Groq = require('groq-sdk');

// Change the model from .env (GROQ_MODEL=...) without touching the code.
// llama-3.3-70b-versatile was retired by Groq on 16 Aug 2026.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const MAX_CV_CHARS = 12000;
const MAX_JD_CHARS = 4000;

const LANGS = { en: 'English', fr: 'French', ar: 'Arabic' };
const pickLang = (v) => (Object.prototype.hasOwnProperty.call(LANGS, v) ? v : 'en');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseJSON(raw) {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json|```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI returned an invalid response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/* One Groq call that returns parsed JSON, with retries on rate limit / bad JSON */
async function askJSON({ system, user, maxTokens = 4000, temperature = 0.2 }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const params = {
    model: MODEL,
    temperature,
    // reasoning models spend part of this budget on thinking, so keep it generous
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
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

/* ── Analysis ── */
// Only the free-text fields are translated. Skills and names stay as written in the CV,
// because scoring.js checks them against the CV text.
function languageNote(lang) {
  return (
    `\n\nOUTPUT LANGUAGE: write the free-text fields "strengths", "weaknesses" and "suggestions" in ${LANGS[lang]}. ` +
    `Keep all JSON keys in English. Do NOT translate "candidate_name", "skills", "matched_skills", "missing_skills", ` +
    `"experience_level" or "education": keep them as they appear in the CV or the job description. Respond with valid JSON only.`
  );
}

async function analyzeCV(cvText, jobDescription = '', language = 'en') {
  const lang = pickLang(language);
  const prompt =
    buildPrompt(cvText.slice(0, MAX_CV_CHARS), jobDescription.slice(0, MAX_JD_CHARS)) + languageNote(lang);

  return askJSON({
    system: 'You are an expert HR analyst. Respond with valid JSON only.',
    user: prompt
  });
}

/* ── CV rewriting ── */
async function rewriteCV(cvText, jobDescription = '', language = 'en', suggestions = []) {
  const lang = pickLang(language);
  const tips = (Array.isArray(suggestions) ? suggestions : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 10);

  const prompt = `Rewrite the CV below so it is stronger, clearer and ATS-friendly.

STRICT RULES
- Use ONLY facts that are in the CV. Never invent employers, job titles, dates, degrees, grades, numbers, skills, links or contact details.
- Do not add a metric unless it already appears in the CV. If a metric would help, list it in "missing_info" instead.
- Use short bullet points that start with a strong action verb. Fix grammar and keep a consistent tense and style.
- Keep proper nouns, company names and technology names unchanged.
- Never output a section title that has no content under it (for example, no EXPERIENCE title if the CV has no work experience).
- The SUMMARY may only restate what the CV already says. Do not add a career goal, target role or job-search intent unless the CV itself states it.
- Sections, only if the CV has the content: header (name and contact exactly as in the CV), SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS, LANGUAGES.
- Write the CV in ${LANGS[lang]}.
${jobDescription ? '- A job description is given: put the most relevant existing experience and skills first, and reuse its keywords ONLY where the CV genuinely supports them.\n' : ''}${tips.length ? `- Apply these improvement suggestions where the CV allows it:\n${tips.map((t) => '  * ' + t).join('\n')}\n` : ''}
OUTPUT: valid JSON only, with exactly these keys:
{
  "rewritten_cv": ["one line of the CV per array item", "..."],
  "changes": ["3 to 6 short sentences describing the main improvements"],
  "missing_info": ["0 to 5 things the candidate should add (metrics, links, dates...)"]
}
Rules for "rewritten_cv": plain text only, no markdown. Section titles in CAPITAL LETTERS on their own line. Bullet lines start with "- ". Use an empty string "" for blank lines between sections. "changes" and "missing_info" must be written in ${LANGS[lang]}.

${jobDescription ? `JOB DESCRIPTION:\n${jobDescription.slice(0, MAX_JD_CHARS)}\n\n` : ''}CV:
${cvText.slice(0, MAX_CV_CHARS)}`;

  const out = await askJSON({
    system: 'You are an expert CV writer and recruiter. You never invent facts. Respond with valid JSON only.',
    user: prompt,
    maxTokens: 6000,
    temperature: 0.3
  });

  const lines = Array.isArray(out.rewritten_cv) ? out.rewritten_cv.map((l) => String(l)) : [];
  const text = lines.join('\n').trim();
  if (text.length < 100) throw new Error('AI returned an empty CV, please try again');

  const list = (a, max) =>
    Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [];

  return { rewritten_cv: text, changes: list(out.changes, 6), missing_info: list(out.missing_info, 5) };
}

module.exports = { analyzeCV, rewriteCV, pickLang };