function buildPrompt(cvText, jobDescription = '') {
  const jdSection = jobDescription
    ? `\n\nJOB DESCRIPTION:\n${jobDescription}\n\nmatch_score (0-100) must reflect how well THIS CV fits THIS job description: required skills, years of experience, seniority and domain. Be strict and consistent: 90+ only for an almost perfect fit.\nmatched_skills = skills required by the job that the CV clearly shows.\nmissing_skills = important skills required by the job that the CV lacks.`
    : '';

  // The ATS score and its breakdown are computed by the server (utils/ats_score.js), not by the model.
  return `You are an expert HR recruiter and ATS specialist.
Analyze the CV below and return ONLY this JSON structure:
{
  "candidate_name": "string",
  "experience_level": "Junior | Mid | Senior | Lead",
  "experience_years": number,
  "education": "string",
  "match_score": number or null,
  "matched_skills": ["skill1"] (empty array if no job description),
  "missing_skills": ["skill1"] (empty array if no job description),
  "skills": ["skill1", "skill2"],
  "strengths": ["s1", "s2", "s3"],
  "weaknesses": ["w1", "w2"],
  "suggestions": ["s1", "s2", "s3"]
}
Do NOT output any ATS score or numeric breakdown. Never invent facts that are not in the CV.
Return ONLY valid JSON. No markdown.${jdSection}

CV:
${cvText}`;
}

module.exports = { buildPrompt };