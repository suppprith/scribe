"use client";

/**
 * Top navigation. Links to the app's main surfaces (built out over the rest of
 * Phase 4) with an active-route highlight, plus the live connection indicator.
 */
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectionStatus } from "./ConnectionStatus";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/sessions", label: "Sessions" },
  { href: "/search", label: "Search" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          scribe
        </Link>
        <ul className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto">
          <ConnectionStatus />
        </div>
      </nav>
    </header>
  );
}
