"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";

const BRAND_TEXT = (
  <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-accent">
    Tracking Intelligence
  </span>
);

export { BRAND_TEXT };

export function Navbar() {
  const pathname = usePathname();

  // Hide navbar on auth pages
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="content-container py-3 flex items-center justify-between">
          <a href="/audits" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <Image src="/logo.png" alt="Insurge" width={90} height={90} />
            {BRAND_TEXT}
          </a>
          <div className="flex items-center gap-4">
            <Show when="signed-in">
              <a href="/audits" className="text-sm text-text-muted hover:text-text transition-colors">
                Dashboard
              </a>
              <a href="/settings" className="text-sm text-text-muted hover:text-text transition-colors">
                Settings
              </a>
              <a href="/audits/new" className="text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md transition-colors">
                New Audit
              </a>
              <UserButton />
            </Show>
          </div>
        </div>
      </nav>
      <div className="pt-28" />
    </>
  );
}
