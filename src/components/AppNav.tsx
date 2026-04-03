"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function linkClass(active: boolean) {
  return [
    "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-4 sm:text-sm",
    active
      ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
      : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200",
  ].join(" ");
}

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
  { href: "/health", label: "Health" },
] as const;

export function AppNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 leading-tight">
          <p className="text-base font-semibold uppercase tracking-[0.14em] text-sky-400 sm:text-lg">
            JEYS CARWASH
          </p>
          <p className="text-sm font-medium text-slate-300 sm:text-base">Vendo</p>
        </Link>
        <nav className="flex flex-wrap gap-2" aria-label="Main">
          {items.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" || pathname === "" : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={linkClass(active)} prefetch>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
