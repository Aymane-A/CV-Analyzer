
const API_URL = '';

export async function analyzeCVApi(file, jobDescription = '') {
  const formData = new FormData();
  formData.append('file', file);

  if (jobDescription) {
    formData.append('job_description', jobDescription);
  }

  const res = await fetch(`${API_URL}/api/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorMessage = 'Analysis failed';

    try {
      const err = await res.json();
      errorMessage = err.error || errorMessage;
    } catch {
      errorMessage = res.statusText;
    }

    throw new Error(errorMessage);
  }

  return await res.json();
}