/** Small "i" that reveals an explanation on hover, keyboard focus or tap. No client JS needed. */
export function InfoTip({ title, children, label }: { title: string; children: React.ReactNode; label?: string }) {
  return (
    <span className="infotip">
      <button type="button" className="infotip-btn" aria-label={label ?? title}>i</button>
      <span role="tooltip" className="infotip-panel">
        <span className="eyebrow block">{title}</span>
        <span className="block mt-1.5">{children}</span>
      </span>
    </span>
  );
}
