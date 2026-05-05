import { useEffect, useRef } from 'react'

/* ── Helpers ── */
function getInitials(name = 'UN') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function ratingLabel(score) {
  if (score >= 85) return '✦ Excellent'
  if (score >= 70) return '◈ Good'
  if (score >= 50) return '◇ Average'
  return '△ Needs Work'
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3) }

/* ── Animated counter hook ── */
function useCounter(target, suffix = '') {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const duration = 1200
    const start = performance.now()
    function step(now) {
      const progress = Math.min((now - start) / duration, 1)
      el.textContent = Math.round(easeOut(progress) * target) + suffix
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, suffix])
  return ref
}

/* ── Circular chart ── */
function CircularScore({ score, fillClass = 'circle-fill', textId, suffix = '' }) {
  const textRef = useCounter(score, suffix)
  const fillRef = useRef(null)

  useEffect(() => {
    if (!fillRef.current) return
    const el = fillRef.current
    el.style.strokeDasharray = '0, 100'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.strokeDasharray = `${score}, 100`
    }))
  }, [score])

  return (
    <div className="circular-chart-wrap">
      <svg className="circular-chart" viewBox="0 0 36 36">
        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        <path
          ref={fillRef}
          className={`circle-fill ${fillClass}`}
          id={textId + 'Fill'}
          strokeDasharray="0, 100"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <text x="18" y="20.35" className="percentage" ref={textRef}>0</text>
      </svg>
    </div>
  )
}

/* ── ATS Bar ── */
function ATSBar({ score }) {
  const barRef = useRef(null)
  const pctRef = useCounter(score, '%')

  useEffect(() => {
    if (!barRef.current) return
    const timeout = setTimeout(() => {
      barRef.current.style.width = `${score}%`
    }, 100)
    return () => clearTimeout(timeout)
  }, [score])

  return (
    <div className="score-bar-card">
      <p className="score-label">ATS Compatibility</p>
      <div className="ats-bar-wrap">
        <div className="ats-bar-track">
          <div ref={barRef} className="ats-bar-fill" id="atsBarFill"></div>
        </div>
        <span className="ats-bar-pct" ref={pctRef} id="atsBarPct">0%</span>
      </div>
      <div className="ats-bar-labels">
        <span>Poor</span><span>Average</span><span>Excellent</span>
      </div>
    </div>
  )
}

/* ── Insight List ── */
function InsightList({ items, iconClass, bulletClass }) {
  return (
    <ul className="insight-list">
      {items.map((text, i) => (
        <li key={i} className="insight-item" style={{ animationDelay: `${i * 80}ms` }}>
          <span className={`insight-bullet ${bulletClass}`}>
            <i className={`fa-solid ${iconClass}`}></i>
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Main Dashboard ── */
export default function ResultsDashboard({ data, hasJD, onReset }) {
  const initials = getInitials(data.candidate_name)

  return (
    <section className="results" id="resultsSection">

      {/* Identity bar */}
      <div className="identity-bar">
        <div className="avatar" id="avatarInitials">{initials}</div>
        <div className="identity-info">
          <h2 className="candidate-name" id="candidateName">{data.candidate_name || '—'}</h2>
          <div className="identity-meta">
            <span className="badge badge-exp" id="expLevel">{data.experience_level || '—'}</span>
            <span className="identity-edu" id="educationText">{data.education || '—'}</span>
          </div>
        </div>
        <button className="btn-reset" id="resetBtn" onClick={onReset}>
          <i className="fa-solid fa-rotate-left"></i> New Analysis
        </button>
      </div>

      {/* Scores row */}
      <div className="scores-row">
        {/* ATS circular */}
        <div className="score-card" id="atsScoreCard">
          <p className="score-label">ATS Score</p>
          <CircularScore score={data.ats_score} textId="atsScore" />
          <p className="score-sublabel" id="atsRating">{ratingLabel(data.ats_score)}</p>
        </div>

        {/* Match circular — only if JD given */}
        {hasJD && data.match_score != null && (
          <div className="score-card" id="matchScoreCard">
            <p className="score-label">Job Match</p>
            <CircularScore score={data.match_score} fillClass="circle-fill circle-fill-match" textId="matchScore" />
            <p className="score-sublabel" id="matchRating">{ratingLabel(data.match_score)}</p>
          </div>
        )}

        {/* ATS linear bar */}
        <ATSBar score={data.ats_score} />
      </div>

      {/* Skills */}
      <div className="card result-card">
        <div className="card-header">
          <i className="fa-solid fa-microchip card-header-icon"></i>
          <h3>Detected Skills</h3>
        </div>
        <div className="skills-cloud" id="skillsCloud">
          {(data.skills || []).map((skill, i) => (
            <span key={i} className="skill-tag" style={{ animationDelay: `${i * 40}ms` }}>
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Strengths / Weaknesses / Suggestions */}
      <div className="swipe-grid">
        <div className="card result-card swipe-card strengths-card">
          <div className="card-header">
            <i className="fa-solid fa-circle-check card-header-icon icon-green"></i>
            <h3>Strengths</h3>
          </div>
          <InsightList items={data.strengths || []} iconClass="fa-check" bulletClass="bullet-green" />
        </div>

        <div className="card result-card swipe-card weaknesses-card">
          <div className="card-header">
            <i className="fa-solid fa-triangle-exclamation card-header-icon icon-amber"></i>
            <h3>Areas to Address</h3>
          </div>
          <InsightList items={data.weaknesses || []} iconClass="fa-minus" bulletClass="bullet-amber" />
        </div>

        <div className="card result-card swipe-card suggestions-card">
          <div className="card-header">
            <i className="fa-solid fa-lightbulb card-header-icon icon-gold"></i>
            <h3>Improvement Suggestions</h3>
          </div>
          <InsightList items={data.suggestions || []} iconClass="fa-arrow-up-right" bulletClass="bullet-gold" />
        </div>
      </div>

    </section>
  )
}
