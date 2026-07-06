"use client";

/**
 * Top navigation. A solid, opaque bar (no translucency) that links to the app's
 * main surfaces with an active-route highlight, plus the live connection
 * indicator. The wordmark pairs a coral brand mark with the lowercase name.
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
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <nav className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[17px] font-semibold tracking-tight text-fg">scribe</span>
        </Link>

        <ul className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />
                  )}
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

/** The scribe mark: a coral rounded tile with an ink stroke. */
function BrandMark() {
  return (
    <span
      className="grid size-8 place-items-center rounded-lg bg-accent text-accent-contrast shadow-sm transition-transform group-hover:-rotate-6"
      aria-hidden
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3 12.5c2-6 3-9 5.5-9 1.6 0 2.2 1.1 1.4 2.4C8.7 8 5.5 8.6 5.5 10.3c0 1 .9 1.6 2 1.6 1.6 0 2.8-.9 3.5-2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
