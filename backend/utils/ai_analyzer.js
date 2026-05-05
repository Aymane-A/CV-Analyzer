const { buildPrompt } = require('./prompt');
const Groq = require('groq-sdk');

async function analyzeCV(cvText, jobDescription = '') {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    temperature: 0.3,
    max_tokens:  1500,
    messages: [
      { role: 'system', content: 'You are an expert HR analyst. Respond with valid JSON only.' },
      { role: 'user',   content: buildPrompt(cvText, jobDescription) }
    ]
  });

  const raw     = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { analyzeCV };