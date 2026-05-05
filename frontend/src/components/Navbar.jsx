export default function Navbar({ theme, onToggleTheme }) {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="brand-icon">
          <i className="fa-solid fa-scroll"></i>
        </span>
        <span className="brand-name">CV<em>ision</em></span>
      </div>
      <div className="nav-actions">
        <button
          className="theme-toggle"
          id="themeToggle"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
        >
          <i className={theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'}></i>
        </button>
      </div>
    </nav>
  )
}
