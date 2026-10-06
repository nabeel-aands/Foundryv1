import type { ReactNode } from "react";

/** Shows the first `initial` items, and the rest behind a "Show more" toggle. No client JS. */
export function MoreList({ items, initial = 5, className }: { items: ReactNode[]; initial?: number; className: string }) {
  const rest = items.slice(initial);
  return (
    <>
      <div className={className}>{items.slice(0, initial)}</div>
      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="btn btn-ghost !text-xs cursor-pointer list-none inline-flex">
            <span className="group-open:hidden">Show {rest.length} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className={`${className} mt-2 max-h-[28rem] overflow-y-auto`}>{rest}</div>
        </details>
      )}
    </>
  );
}
