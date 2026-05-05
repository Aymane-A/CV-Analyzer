function buildPrompt(cvText, jobDescription = '') {
  const jdSection = jobDescription
    ? `\n\nJOB DESCRIPTION:\n${jobDescription}\n\nAlso calculate match_score (0-100).`
    : '';

  return `You are an expert HR recruiter and ATS specialist.
Analyze the CV below and return ONLY this JSON structure:
{
  "candidate_name": "string",
  "experience_level": "Junior | Mid | Senior | Lead",
  "experience_years": number,
  "education": "string",
  "ats_score": number (0-100),
  "match_score": number or null,
  "skills": ["skill1", "skill2"],
  "strengths": ["s1", "s2", "s3"],
  "weaknesses": ["w1", "w2"],
  "suggestions": ["s1", "s2", "s3"]
}
Return ONLY valid JSON. No markdown.${jdSection}

CV:
${cvText}`;
}

module.exports = { buildPrompt }; 