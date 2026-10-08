# CVision — AI-Powered CV Analyzer

Upload a résumé (PDF or DOCX) and get a structured analysis in seconds: ATS score, job-match score, skills mapping, strengths, weaknesses and concrete suggestions. Recruiters can rank several candidates against one job description and follow their pipeline in a dashboard.

**Live demo:** https://cv-analyzer-nu-lemon.vercel.app

<!-- Add screenshots here, for example:
![Analysis](docs/screenshot-analysis.png)
![Ranking](docs/screenshot-ranking.png)
![Dashboard](docs/screenshot-dashboard.png)
-->

## Features

**Analysis**
- ATS score with a 5-part breakdown: format, keywords, experience, education, skills
- Optional job description: match score, matched and missing skills
- Strengths, weaknesses and suggestions written by the AI
- Report language: English, French or Arabic (right-to-left layout supported)
- Export the report to PDF

**Improve my CV**
- Rewrites the CV in the chosen language with stronger wording and a clean ATS-friendly structure
- Never invents facts: anything missing (metrics, links, dates) is listed as "Add this yourself"
- Copy, download as `.txt` or print to PDF
- Also available from History (the CV text is stored with the analysis)

**Rank candidates**
- Upload 2 to 5 CVs and one job description, get a ranking with scores and skill gaps
- "View full analysis" opens the complete report of any candidate

**Accounts and history**
- Register and login with JWT, email verification by a 6-digit code
- History saved in the database for logged-in users (local history for guests)

**Recruiter dashboard**
- Choose the *recruiter* role at registration
- Stats: candidates, average ATS, average job match, strong candidates (70+)
- Experience-level distribution, top skills, searchable and sortable candidate list

Light and dark themes are included.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS and vanilla JavaScript (single page), hosted on Vercel |
| Backend | Node.js, Express, hosted on Render |
| Database | MongoDB Atlas with Mongoose |
| AI | Groq API (default model `openai/gpt-oss-120b`, configurable) |
| Auth | JWT, bcryptjs |
| Files | multer (memory storage), PDF and DOCX text extraction |
| Emails | Google Apps Script relay (Mailjet and Brevo also supported) |

## Project structure

```
CV-Analyzer/
├── backend/
│   ├── server.js              # routes, rate limits, upload handling
│   ├── models/                # User, Analysis
│   ├── routes/                # auth, history, recruiter
│   ├── middleware/auth.js     # requireAuth, optionalAuth, requireRecruiter
│   ├── utils/                 # ai_analyzer, prompt, scoring, pdf_reader, mailer
│   └── .env.example
└── frontend/
    └── index.html
```

## Run it locally

Requirements: Node.js 18 or newer, a MongoDB Atlas connection string, a Groq API key.

```bash
# 1. Install dependencies (at the repository root)
npm install

# 2. Configure the backend
cd backend
cp .env.example .env        # Windows: copy .env.example .env
# then edit .env (see the table below)

# 3. Start the backend (it must be started from the backend folder)
node server.js              # or: npx nodemon server.js
```

Start the frontend with any static server on port 5173 or 3000, for example:

```bash
cd frontend
npx vite
```

The page talks to `http://localhost:5000` on localhost and to the Render URL otherwise (constant `API` at the bottom of `frontend/index.html`).

In local development you do not need an email provider: the verification code is printed in the backend terminal.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | yes | Key from https://console.groq.com/keys |
| `GROQ_MODEL` | no | Override the default model without changing the code |
| `PORT` | no | Defaults to 5000 |
| `MONGO_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | At least 16 characters. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MAIL_WEBHOOK_URL` | production | URL of the Google Apps Script web app (ends with `/exec`) |
| `MAIL_WEBHOOK_SECRET` | production | Same secret as in the Apps Script |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAIL_FROM` | optional | Alternative provider |
| `BREVO_API_KEY`, `MAIL_FROM` | optional | Alternative provider |

## Sending verification emails for free

Free Render services block SMTP ports, so emails are sent over HTTPS. The simplest free option is a small Google Apps Script that sends from your own Gmail account:

1. Open https://script.google.com with the Gmail account that will send the emails and create a project.
2. Paste the relay script (`docs/mail-relay.gs`) and replace `SECRET` with a long random string.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*.
4. Copy the Web app URL into `MAIL_WEBHOOK_URL` and the secret into `MAIL_WEBHOOK_SECRET`.

After any change to the script, create a **new version** in *Manage deployments*. Gmail allows roughly 100 recipients per day on a regular account.

## Deployment

- **Backend (Render):** create a Web Service, set the environment variables above, deploy.
- **Frontend (Vercel):** deploy the `frontend` folder as a static site.
- Add the Vercel domain to the CORS allow-list in `backend/server.js` and the Render URL to the `API` constant in `frontend/index.html`.
- On Render's free plan the service sleeps when idle, so the first request can take 30 to 50 seconds.

## API overview

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Create an account, sends a verification code |
| POST | `/api/auth/verify` | Confirm the code, returns a token |
| POST | `/api/auth/resend` | Send a new code (60 s cooldown) |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/analyze` | Analyze one CV (`file`, `job_description`, `language`) |
| POST | `/api/compare` | Rank 2 to 5 CVs (`files`, `job_description`, `language`) |
| POST | `/api/rewrite` | Rewrite an uploaded CV |
| POST | `/api/history/:id/rewrite` | Rewrite a CV from a saved analysis |
| GET / DELETE | `/api/history`, `/api/history/:id` | History of the logged-in user |
| GET | `/api/recruiter/stats` | Dashboard data (recruiter role only) |

## Security

- Passwords: at least 8 characters with uppercase, lowercase, digit and special character, hashed with bcrypt
- Email verification: random 6-digit code, stored only as a keyed hash, valid 10 minutes, 5 attempts, 60-second resend cooldown; accounts that never verify are deleted after 24 hours
- JWT sessions (7 days); the recruiter role is read from the database on every request
- Rate limiting on login, registration, verification, analysis, ranking and rewriting
- Uploads: PDF and DOCX only, 16 MB maximum, processed in memory and never written to disk
- CORS allow-list, input type checks on the auth routes
- Privacy: for logged-in users the extracted CV text is stored so that "Improve my CV" works from History. It is never returned by the history endpoints and is deleted with the analysis.

## Known limitations

- Scanned PDFs and images are not supported (no OCR)
- Ranking is limited to 5 CVs per request
- Analyses saved before CV storage was added cannot be rewritten from History

## Author

Built by Aymane Khiar.