import { requestAccess } from "@/app/actions";
import { PERMISSIONS } from "@/lib/access";

/**
 * Inline request-access form behind a <details>, usable from any server component.
 * Shows "Requested · pending" instead when the caller found an open request.
 */
export function RequestAccess({ baseId, interfaceId, back, pending, available, small }: {
  baseId?: string; interfaceId?: string; back: string; pending: boolean; available: boolean; small?: boolean;
}) {
  if (pending) return <span className="chip chip-neutral !text-xs" title="An admin will review it">Requested · pending</span>;
  if (!available) return <button className={`btn btn-ghost ${small ? "!px-2 !py-1" : ""} !text-xs`} disabled title="Create the Access Requests table in Airtable and run npm run sync">Request access</button>;
  return (
    <details className="relative inline-block text-left">
      <summary className={`btn btn-ghost ${small ? "!px-2 !py-1" : ""} !text-xs cursor-pointer list-none`}>Request access</summary>
      <form action={requestAccess} className="absolute right-0 z-10 mt-1 card p-3 w-64 flex flex-col gap-2 text-xs shadow-lg">
        {baseId && <input type="hidden" name="baseId" value={baseId} />}
        {interfaceId && <input type="hidden" name="interfaceId" value={interfaceId} />}
        <input type="hidden" name="back" value={back} />
        <label className="font-medium">Permission
          <select name="permission" defaultValue="Read" className="mt-1 !py-1 !text-xs">
            {PERMISSIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="font-medium">Why do you need it?
          <textarea name="justification" required rows={2} className="mt-1 !text-xs" placeholder="One or two sentences an admin can act on" />
        </label>
        <button className="btn btn-primary !text-xs !py-1" type="submit">Submit request</button>
      </form>
    </details>
  );
}
