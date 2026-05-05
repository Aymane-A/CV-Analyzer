const API_URL = 'http://localhost:5000';

export async function analyzeCVApi(file, jobDescription = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (jobDescription) formData.append('job_description', jobDescription);

  const res = await fetch(`${API_URL}/api/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Analysis failed');
  }

  return res.json();
}