// Design-system components as JSX (React) page components.
// Styling comes entirely from the DTCG-derived CSS custom properties; the class
// names map to rules in styles.css that reference `var(--token)`.

export function Button({ variant = "solid", disabled = false, children }) {
  return (
    <button className={`ds-button ds-button--${variant}`} disabled={disabled}>
      {children}
    </button>
  );
}

export function Card({ eyebrow, heading, children }) {
  return (
    <article className="ds-card">
      {eyebrow && <p className="ds-card__eyebrow">{eyebrow}</p>}
      {heading && <h3 className="ds-card__heading">{heading}</h3>}
      <div className="ds-card__body">{children}</div>
    </article>
  );
}
