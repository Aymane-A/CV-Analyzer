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
