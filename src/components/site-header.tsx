import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/upload", label: "Upload", short: "Upload" },
  { href: "/compare", label: "Compare", short: "Compare" },
  { href: "/about", label: "How it works", short: "About" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="container-page flex h-14 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-text no-underline hover:no-underline">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="whitespace-nowrap font-mono text-[14px] max-[419px]:sr-only sm:text-[15px]">agent-scorecard</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <ul className="flex items-center gap-1 sm:gap-3">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="rounded px-1.5 py-1 text-[14px] text-muted hover:text-text sm:px-2">
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
