const { buildPrompt } = require('./prompt');
const Groq = require('groq-sdk');

// Change the model from .env (GROQ_MODEL=...) without touching the code.
// llama-3.3-70b-versatile was retired by Groq on 16 Aug 2026.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const MAX_CV_CHARS = 12000;
const MAX_JD_CHARS = 4000;

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

async function analyzeCV(cvText, jobDescription = '') {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const prompt = buildPrompt(
    cvText.slice(0, MAX_CV_CHARS),
    jobDescription.slice(0, MAX_JD_CHARS)
  );

  const params = {
    model: MODEL,
    temperature: 0.2,
    // reasoning models spend part of this budget on thinking, so keep it generous
    max_tokens: 4000,
    messages: [
      { role: 'system', content: 'You are an expert HR analyst. Respond with valid JSON only.' },
      { role: 'user', content: prompt }
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

module.exports = { analyzeCV };