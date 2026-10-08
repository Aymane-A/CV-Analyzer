// Usage: put this file in C:\CV-Analyzer, then run:  node apply_patch3.js
// 1) strong password policy  2) email verification code  3) Export PDF RTL fix
// 4) "Improve my CV" from History (CV text saved in the DB).
// Backups: *.bak. A file is never half-patched (all anchors are checked first). Safe to run twice.

const fs = require('fs');
const path = require('path');

const self = fs.readFileSync(__filename, 'utf8');
const startMark = self.lastIndexOf('/*@@SNIPPETS');
const endMark = self.lastIndexOf('@@END@@');
const parts = self.slice(startMark, endMark).split(/^=====(\w+)\r?\n/m);
const S = {};
for (let i = 1; i < parts.length; i += 2) S[parts[i]] = parts[i + 1].replace(/\s+$/, '');

function patch(file, doneMarker, edits) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) throw new Error('File not found: ' + p);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');
  if (src.includes(doneMarker)) { console.log('= ' + file + ': already patched, skipped'); return; }
  for (const [find, repl] of edits) {
    const count = src.split(find).length - 1;
    if (count !== 1) throw new Error(file + ': anchor found ' + count + ' times (expected 1):\n  ' + find);
    src = src.replace(find, () => repl);
  }
  fs.writeFileSync(p + '.bak', raw);
  fs.writeFileSync(p, crlf ? src.replace(/\n/g, '\r\n') : src);
  console.log('✓ ' + file + ' patched (' + edits.length + ' edits)');
}

function overwrite(file, marker, content) {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.includes(marker)) { console.log('= ' + file + ': already up to date, skipped'); return; }
    fs.writeFileSync(p + '.bak', raw);
  } else {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
  fs.writeFileSync(p, content + '\n');
  console.log('✓ ' + file + ' written');
}

// ---------------- backend ----------------
overwrite('backend/models/User.js', 'emailVerified', S.USER_MODEL);
overwrite('backend/models/Analysis.js', 'cvText', S.ANALYSIS_MODEL);
overwrite('backend/utils/mailer.js', 'sendVerificationEmail', S.MAILER);
overwrite('backend/routes/auth.js', 'verifyCodeHash', S.AUTH_ROUTE);

patch('backend/routes/history.js', '_analysisId', [
  ['res.json(item);', S.HISTORY_REPL]
]);

patch('backend/server.js', 'history/:id/rewrite', [
  ["const { optionalAuth } = require('./middleware/auth');", "const { optionalAuth, requireAuth } = require('./middleware/auth');"],
  ['hasJobDescription: !!jobDescription,',
    'hasJobDescription: !!jobDescription,\n        cvText: cvText.slice(0, 12000),\n        jobDescription: jobDescription.slice(0, 4000),'],
  ['const ok = [];', 'const ok = [];\n      const cvTexts = new Map();'],
  ['ok.push({ fileName: file.originalname, ...result });',
    'cvTexts.set(file.originalname, text.slice(0, 12000));\n          ok.push({ fileName: file.originalname, ...result });'],
  ['user: req.userId, fileName, hasJobDescription: true, result',
    'user: req.userId, fileName, hasJobDescription: true, result,\n          cvText: cvTexts.get(fileName), jobDescription: jobDescription.slice(0, 4000)'],
  ["const uploadMany = upload.array('files', 5);", S.SERVER_HISTORY_ROUTE + "\n\nconst uploadMany = upload.array('files', 5);"]
]);

// ---------------- frontend/index.html ----------------
patch('frontend/index.html', 'authCode', [
  ['<!-- Vercel Analytics -->', S.CSS + '\n\n  <!-- Vercel Analytics -->'],
  ['<input class="auth-field" id="authPassword" type="password" placeholder="Password (min 6 characters)" autocomplete="current-password" />', S.PW_HTML],
  ["document.getElementById('authRole').classList.toggle('hidden', !reg);",
    "document.getElementById('authRole').classList.toggle('hidden', !reg);\n      document.getElementById('pwRules').classList.toggle('hidden', !reg);\n      updatePwRules();"],
  ['authMode = mode;', 'authMode = mode;\n      resetVerifyUI();'],
  ["if (!email || !password || (authMode === 'register' && !name)) { err.textContent = 'Please fill in all fields.'; return; }",
    "if (!email || !password || (authMode === 'register' && !name)) { err.textContent = 'Please fill in all fields.'; return; }\n      if (authMode === 'register') { const miss = pwProblems(password); if (miss.length) { err.textContent = 'Password needs: ' + miss.join(', '); return; } }"],
  ["if (!res.ok) throw new Error(data.error || 'Request failed');",
    "if (data.needsVerification) { showVerifyStep(data.email || email, authMode === 'register'); return; }\n        if (!res.ok) throw new Error(data.error || 'Request failed');"],
  ["const btn = document.getElementById('authSubmit');", "if (authMode === 'verify') return submitVerify();\n      const btn = document.getElementById('authSubmit');"],
  // Export PDF: right-to-left text for Arabic
  ['<li class="li-s">', '<li class="li-s" dir="auto">'],
  ['<li class="li-w">', '<li class="li-w" dir="auto">'],
  ['<li class="li-g">', '<li class="li-g" dir="auto">'],
  // Improve my CV: also from History
  ["document.getElementById('rewriteBtn').classList.toggle('hidden', !(window._src && window._src.data === data && window._src.file));",
    "document.getElementById('rewriteBtn').classList.toggle('hidden', !(((window._src && window._src.data === data && window._src.file) || data._analysisId) && !(window._user && window._user.role === 'recruiter')));"],
  ['if (!src || !src.file) return;',
    "if (!src || src.data !== window._lastResult || !src.file) {\n        if (window._lastResult && window._lastResult._analysisId) return rewriteFromHistory(window._lastResult._analysisId);\n        return;\n      }"],
  ["document.getElementById('year').textContent", S.JS + "\n\n    document.getElementById('year').textContent"]
]);

console.log('\nDone. Now set the email variables (see the message), restart the backend and refresh the frontend.');

/*@@SNIPPETS
=====USER_MODEL
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['candidate', 'recruiter'], default: 'candidate' },

  // Old accounts have no such field, so they count as verified. /register sets it to false explicitly.
  emailVerified:  { type: Boolean, default: true },
  verifyCodeHash: { type: String, select: false },
  verifyExpires:  Date,
  verifyAttempts: { type: Number, default: 0 },
  verifySentAt:   Date
}, { timestamps: true });

// Accounts that never verified their email are deleted after 24 hours
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { emailVerified: false } });

module.exports = mongoose.model('User', userSchema);
=====ANALYSIS_MODEL
const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName:          String,
  hasJobDescription: Boolean,
  result:            { type: mongoose.Schema.Types.Mixed, required: true },

  // Kept so "Improve my CV" works from History. Never returned unless explicitly selected.
  cvText:            { type: String, select: false },
  jobDescription:    { type: String, select: false }
}, { timestamps: true });

module.exports = mongoose.model('Analysis', analysisSchema);
=====MAILER
// Sends the verification code.
// - Production: Brevo HTTP API (BREVO_API_KEY + MAIL_FROM). Free Render services block SMTP ports, so no SMTP here.
// - Local development: with no Brevo config, the code is printed in the backend terminal instead.

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendVerificationEmail(to, name, code) {
  const subject = code + ' is your CVision verification code';
  const text =
    'Hi ' + name + ',\n\nYour CVision verification code is ' + code + '.\n' +
    'It expires in 10 minutes. If you did not create an account, ignore this email.';
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e8dcc8;border-radius:12px">' +
    '<h2 style="margin:0 0 12px;color:#a07830">CVision</h2>' +
    '<p>Hi ' + escapeHtml(name) + ',</p>' +
    '<p>Your verification code is:</p>' +
    '<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#1a1712">' + code + '</p>' +
    '<p style="color:#6b6355;font-size:13px">It expires in 10 minutes. If you did not create an account, ignore this email.</p>' +
    '</div>';

  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CVision', email: process.env.MAIL_FROM },
        to: [{ email: to, name }],
        subject,
        htmlContent: html,
        textContent: text
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Email provider error ' + res.status + ' ' + body.slice(0, 200));
    }
    return;
  }

  // No provider configured: only allowed on a developer machine, never on Render / in production
  if (!process.env.RENDER && process.env.NODE_ENV !== 'production') {
    console.log('\n📧 [DEV] Verification code for ' + to + ': ' + code + '\n');
    return;
  }
  throw new Error('Email is not configured (set BREVO_API_KEY and MAIL_FROM)');
}

module.exports = { sendVerificationEmail };
=====AUTH_ROUTE
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/mailer');

const router = express.Router();

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // keeps login timing the same for unknown emails

const str = (v) => (typeof v === 'string' ? v : '');
const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role || 'candidate' });

// Stricter limits on top of the global auth limiter in server.js
const strict = (max) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in 15 minutes' }
});

// Keep this list in sync with PW_RULES in index.html
function passwordProblems(p) {
  const out = [];
  if (p.length < 8) out.push('at least 8 characters');
  if (p.length > 72) out.push('at most 72 characters');
  if (!/[A-Z]/.test(p)) out.push('an uppercase letter');
  if (!/[a-z]/.test(p)) out.push('a lowercase letter');
  if (!/\d/.test(p)) out.push('a digit');
  if (!/[^A-Za-z0-9]/.test(p)) out.push('a special character');
  return out;
}

// The code is stored only as a keyed hash
const hashCode = (email, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(email + ':' + code).digest('hex');
const sameHash = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function issueCode(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  user.verifyCodeHash = hashCode(user.email, code);
  user.verifyExpires = new Date(Date.now() + CODE_TTL_MS);
  user.verifyAttempts = 0;
  user.verifySentAt = new Date();
  await user.save();
  await sendVerificationEmail(user.email, user.name, code);
}

const cooldownLeft = (user) =>
  user.verifySentAt ? Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - user.verifySentAt.getTime())) / 1000) : 0;

router.post('/register', strict(10), async (req, res) => {
  try {
    const name = str(req.body.name).trim();
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);

    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });
    if (name.length > 80) return res.status(400).json({ error: 'Name is too long' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });

    const problems = passwordProblems(password);
    if (problems.length)
      return res.status(400).json({ error: 'Password needs ' + problems.join(', '), problems });

    const role = req.body.role === 'recruiter' ? 'recruiter' : 'candidate'; // never accept any other role

    let user = await User.findOne({ email });
    if (user && user.emailVerified) return res.status(409).json({ error: 'Email already registered' });
    if (user && cooldownLeft(user) > 0)
      return res.status(429).json({ error: 'A code was just sent. Wait ' + cooldownLeft(user) + 's or check your inbox.' });

    const hash = await bcrypt.hash(password, 12);
    if (user) {
      // Pending account being re-submitted: it is replaced, only the mailbox owner can verify it
      user.name = name;
      user.password = hash;
      user.role = role;
    } else {
      user = new User({ name, email, password: hash, role, emailVerified: false });
    }

    try {
      await issueCode(user);
    } catch (err) {
      console.error('Verification email failed:', err.message);
      return res.status(502).json({ error: 'Could not send the verification email, try again later' });
    }
    res.status(201).json({ needsVerification: true, email });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/verify', strict(20), async (req, res) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    const code = str(req.body.code).trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code))
      return res.status(400).json({ error: 'Enter the 6-digit code' });

    // The attempt is counted BEFORE comparing, atomically, so parallel guesses cannot beat the limit
    const user = await User.findOneAndUpdate(
      { email, emailVerified: false, verifyAttempts: { $lt: MAX_CODE_ATTEMPTS } },
      { $inc: { verifyAttempts: 1 } },
      { new: true }
    ).select('+verifyCodeHash');

    if (!user) return res.status(400).json({ error: 'No valid code for this email. Request a new code.' });

    if (!user.verifyCodeHash || !user.verifyExpires || user.verifyExpires < new Date())
      return res.status(400).json({ error: 'Code expired. Request a new one.' });

    if (!sameHash(user.verifyCodeHash, hashCode(email, code))) {
      const left = MAX_CODE_ATTEMPTS - user.verifyAttempts;
      return res.status(400).json({
        error: left > 0 ? 'Wrong code, ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left' : 'Wrong code. Request a new one.'
      });
    }

    user.emailVerified = true;
    user.verifyCodeHash = undefined;
    user.verifyExpires = undefined;
    user.verifySentAt = undefined;
    user.verifyAttempts = 0;
    await user.save();

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/resend', strict(10), async (req, res) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });

    const user = await User.findOne({ email, emailVerified: false });
    if (user) {
      const wait = cooldownLeft(user);
      if (wait > 0) return res.status(429).json({ error: 'Please wait ' + wait + 's before asking for a new code' });
      try {
        await issueCode(user);
      } catch (err) {
        console.error('Verification email failed:', err.message);
        return res.status(502).json({ error: 'Could not send the verification email, try again later' });
      }
    }
    res.json({ ok: true }); // same answer whether or not a pending account exists
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Could not resend the code' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = await User.findOne({ email });
    const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.emailVerified === false)
      return res.status(403).json({ error: 'Please verify your email first', needsVerification: true, email: user.email });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
=====HISTORY_REPL
const obj = item.toObject();
    obj.result = { ...obj.result, _analysisId: String(item._id) }; // lets the page offer "Improve my CV" from History
    res.json(obj);
=====SERVER_HISTORY_ROUTE
// Improve my CV from History: uses the CV text saved with the analysis
app.post('/api/history/:id/rewrite', rewriteLimiter, requireAuth, async (req, res) => {
  try {
    const item = await Analysis.findOne({ _id: req.params.id, user: req.userId }).select('+cvText +jobDescription');
    if (!item) return res.status(404).json({ error: 'Analysis not found' });
    if (!item.cvText) {
      return res.status(409).json({ error: 'This analysis was saved before CV storage existed. Analyze the CV again to enable rewriting.' });
    }
    const language = pickLang(req.body && req.body.language);
    const suggestions = (item.result && item.result.suggestions) || [];
    res.json(await rewriteCV(item.cvText, item.jobDescription || '', language, suggestions));
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
    console.error(err.message);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.message });
  }
});
=====CSS
<style>
    .pw-rules { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 12px; margin: -2px 0 12px; font-size: .75rem; color: var(--text-muted); }
    .pw-rules li.ok { color: var(--green); }
    #authVerify { text-align: center; margin-bottom: 8px; }
    .auth-code { text-align: center; letter-spacing: .5em; font-size: 1.4rem; font-weight: 600; }
    #authResend:disabled { opacity: .6; cursor: default; text-decoration: none; }
  </style>
=====PW_HTML
<input class="auth-field" id="authPassword" type="password" placeholder="Password" autocomplete="current-password" />
      <ul class="pw-rules hidden" id="pwRules"></ul>
      <div class="hidden" id="authVerify">
        <input class="auth-field auth-code" id="authCode" type="text" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code" />
        <button type="button" class="inline-btn" id="authResend">Resend code</button>
      </div>
=====JS
// Password rules (keep in sync with passwordProblems in routes/auth.js)
    const PW_RULES = [
      ['8+ characters', p => p.length >= 8],
      ['Uppercase letter', p => /[A-Z]/.test(p)],
      ['Lowercase letter', p => /[a-z]/.test(p)],
      ['Digit', p => /\d/.test(p)],
      ['Special character', p => /[^A-Za-z0-9]/.test(p)]
    ];
    function pwProblems(p) { return PW_RULES.filter(r => !r[1](p)).map(r => r[0]); }
    function updatePwRules() {
      const p = document.getElementById('authPassword').value;
      document.getElementById('pwRules').innerHTML = PW_RULES
        .map(r => `<li class="${r[1](p) ? 'ok' : ''}">${r[1](p) ? '✓' : '○'} ${r[0]}</li>`).join('');
    }
    document.getElementById('authPassword').addEventListener('input', updatePwRules);
    updatePwRules();

    // Email verification step (inside the login/register modal)
    let resendTimer = null;
    function startResendCooldown(sec) {
      const b = document.getElementById('authResend');
      clearInterval(resendTimer);
      let left = sec;
      b.disabled = true;
      b.textContent = 'Resend code (' + left + 's)';
      resendTimer = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = 'Resend code'; }
        else b.textContent = 'Resend code (' + left + 's)';
      }, 1000);
    }
    function showVerifyStep(email, justSent) {
      authMode = 'verify';
      window._verifyEmail = email;
      ['authName', 'authRole', 'authEmail', 'authPassword', 'pwRules'].forEach(id => document.getElementById(id).classList.add('hidden'));
      document.querySelector('.auth-switch').classList.add('hidden');
      document.getElementById('authVerify').classList.remove('hidden');
      document.getElementById('authTitle').textContent = 'Verify your email';
      document.querySelector('.auth-modal .auth-sub').textContent = 'Enter the 6-digit code we sent to ' + email;
      document.getElementById('authSubmit').textContent = 'Verify';
      document.getElementById('authError').textContent = '';
      if (justSent) startResendCooldown(60);
      else { clearInterval(resendTimer); const b = document.getElementById('authResend'); b.disabled = false; b.textContent = 'Resend code'; }
      document.getElementById('authCode').focus();
    }
    function resetVerifyUI() {
      clearInterval(resendTimer);
      document.getElementById('authVerify').classList.add('hidden');
      ['authEmail', 'authPassword'].forEach(id => document.getElementById(id).classList.remove('hidden'));
      document.querySelector('.auth-switch').classList.remove('hidden');
      document.querySelector('.auth-modal .auth-sub').textContent = 'Save your analyses and access them from any device.';
      document.getElementById('authCode').value = '';
    }
    async function submitVerify() {
      const btn = document.getElementById('authSubmit');
      const err = document.getElementById('authError');
      const code = document.getElementById('authCode').value.trim();
      err.textContent = '';
      if (!/^\d{6}$/.test(code)) { err.textContent = 'Enter the 6-digit code.'; return; }
      btn.disabled = true;
      try {
        const res = await fetch(API + '/api/auth/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: window._verifyEmail, code })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Verification failed');
        authToken = data.token;
        try { localStorage.setItem('cvision-token', authToken); } catch (e) { }
        setUser(data.user);
        closeAuth();
        ['authName', 'authEmail', 'authPassword'].forEach(id => document.getElementById(id).value = '');
        toast('Email verified, welcome ' + data.user.name + ' 👋');
      } catch (e) {
        err.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    }
    document.getElementById('authResend').addEventListener('click', async () => {
      const err = document.getElementById('authError');
      err.textContent = '';
      try {
        const res = await fetch(API + '/api/auth/resend', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: window._verifyEmail })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not resend the code');
        toast('New code sent');
        startResendCooldown(60);
      } catch (e) { err.textContent = e.message; }
    });
    document.getElementById('authCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    document.getElementById('authCode').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });

    // Improve my CV from History (the CV text is stored with the analysis)
    async function rewriteFromHistory(id) {
      const title = document.querySelector('.loading-title');
      title.textContent = 'Rewriting your CV…';
      showLoading();
      try {
        const res = await fetch(API + '/api/history/' + id + '/rewrite', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ language: getLang('langSelect') })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showRewrite(data);
      } catch (err) {
        toast('Rewrite failed: ' + err.message, 'error');
      } finally {
        hideLoading();
        title.textContent = 'Analyzing CV…';
      }
    }
@@END@@*/