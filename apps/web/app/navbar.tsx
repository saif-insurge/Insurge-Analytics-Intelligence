"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { NewAuditModal } from "@/components/new-audit-modal";

export function Navbar() {
  const pathname = usePathname();
  const [auditModalOpen, setAuditModalOpen] = useState(false);

  // Hide navbar on auth pages and on the public /report/:id page (it's a
  // marketing surface for prospects — no internal app chrome).
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/report/")
  ) {
    return null;
  }

  const navItems = [
    { href: "/audits", label: "Field Log", index: "01" },
    { href: "/settings", label: "Settings", index: "02" },
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/85 backdrop-blur-xl border-b border-border">
        <div className="content-container h-20 flex items-center justify-between gap-6">
          {/* Brand */}
          <Link href="/audits" className="flex items-center gap-4 group shrink-0">
            <Image
              src="/logo.png"
              alt="Insurge"
              width={72}
              height={72}
              className="rounded-sm transition-transform group-hover:scale-[1.04]"
            />
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.22em] uppercase text-text-faint">
              Tracking Intelligence
            </span>
          </Link>

          {/* Center divider */}
          <Show when="signed-in">
            <div className="hidden md:flex items-center gap-1 ml-6">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "text-text" : "text-text-muted hover:text-text"
                    }`}
                  >
                    <span className={`font-mono text-[10px] ${active ? "text-accent" : "text-text-faint group-hover:text-accent"}`}>
                      /{item.index}
                    </span>
                    {item.label}
                    {active && <span className="ml-1 w-1 h-1 rounded-full bg-accent" />}
                  </Link>
                );
              })}
            </div>
          </Show>

          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-3">
            <Show when="signed-in">
              <button
                type="button"
                onClick={() => setAuditModalOpen(true)}
                className="group relative flex items-center gap-2 bg-accent hover:bg-accent-hover text-accent-ink px-4 py-2 rounded-sm text-[13px] font-semibold tracking-tight transition-all hover:translate-y-[-1px] cursor-pointer"
              >
                <span className="font-mono text-[11px] opacity-70">+</span>
                New Audit
              </button>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8 rounded-sm border border-border",
                  },
                }}
              />
            </Show>
          </div>
        </div>
      </nav>
      <div className="pt-24" />
      <NewAuditModal open={auditModalOpen} onOpenChange={setAuditModalOpen} />
    </>
  );
}
