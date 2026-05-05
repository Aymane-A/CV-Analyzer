import { useState, useEffect } from 'react'

const STEPS = [
  'Parsing document',
  'Extracting skills & experience',
  'Calculating ATS score',
  'Generating insights',
]

export default function LoadingOverlay() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < STEPS.length - 1 ? prev + 1 : prev))
    }, 600)
    return () => {
      clearInterval(interval)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="loading-overlay" id="loadingOverlay">
      <div className="loading-card">
        <div className="loader-rings">
          <div className="ring ring-1"></div>
          <div className="ring ring-2"></div>
          <div className="ring ring-3"></div>
          <i className="fa-solid fa-scroll loader-center-icon"></i>
        </div>
        <p className="loading-title">Analyzing CV…</p>
        <div className="loading-steps" id="loadingSteps">
          {STEPS.map((label, i) => {
            let cls = 'step'
            if (i < currentStep) cls += ' done'
            else if (i === currentStep) cls += ' active'
            return (
              <p key={i} className={cls} data-step={i}>
                <i className="fa-solid fa-check-circle"></i> {label}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}
