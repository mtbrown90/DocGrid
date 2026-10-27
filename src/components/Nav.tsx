"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";

const LINKS = [
  { href: "/", label: "Schedule" },
  { href: "/doctors", label: "Doctors" },
  { href: "/setup", label: "Setup" },
];

export function Nav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">DocGrid</span>
        <nav className="flex gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-foreground text-background" : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
