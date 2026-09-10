export function OpenInAirtable({ href, label = "Open in Airtable", small }: { href?: string; label?: string; small?: boolean }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`btn btn-ghost ${small ? "!px-2 !py-1 !text-xs" : ""}`}>
      {label} <span aria-hidden>↗</span>
    </a>
  );
}
