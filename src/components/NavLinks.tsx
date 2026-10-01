"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="flex md:flex-col gap-1 overflow-x-auto">
      {items.map((it) => {
        const active = it.href === "/" || it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <li key={it.href} className="flex-none">
            <Link href={it.href} className="nav-link" aria-current={active ? "page" : undefined}>
              <span className="sq" aria-hidden /> {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
