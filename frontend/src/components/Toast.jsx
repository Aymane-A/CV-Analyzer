import { useEffect, useRef } from 'react'

export default function Toast({ message, type, onDone }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1'
      el.style.transform = 'translateX(-50%) translateY(0)'
    })

    // Animate out then notify parent
    const timer = setTimeout(() => {
      el.style.opacity = '0'
      el.style.transform = 'translateX(-50%) translateY(8px)'
      setTimeout(onDone, 300)
    }, 3500)

    return () => clearTimeout(timer)
  }, [onDone])

  const borderColor = type === 'error' ? 'var(--red)' : 'var(--gold)'

  return (
    <div
      ref={ref}
      className="toast"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%) translateY(8px)',
        background: 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        color: 'var(--text-primary)',
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.88rem',
        boxShadow: 'var(--shadow-card)',
        zIndex: 9999,
        opacity: 0,
        transition: 'all 0.3s ease',
        whiteSpace: 'nowrap',
        maxWidth: '90vw',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {message}
    </div>
  )
}
