"use client";

import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export type TocSection = { id: string; label: string };

/**
 * Audit-page Table of Contents.
 *
 * Desktop (lg+): a sticky sidebar with section anchors, active-section highlight
 *   driven by IntersectionObserver.
 * Mobile (<lg):  a sticky bar at the top of the content with a dropdown menu
 *   listing the same sections.
 *
 * Sections must have matching `id` attributes on the audit page. Pass only
 * sections that actually exist on this audit (e.g. don't include "AI Analysis"
 * when the audit has no AI data).
 */
export function AuditTocSidebar({ sections }: { sections: TocSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  // Track which sections are currently in the viewport so we can pick the
  // topmost one as "active" even when several intersect at once.
  const visibleIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.current.add(entry.target.id);
          else visibleIds.current.delete(entry.target.id);
        }
        // Pick the first section in document order that is currently visible.
        const firstVisible = sections.find((s) => visibleIds.current.has(s.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      // rootMargin: nudge the trigger band a bit below the top of the viewport
      // so the active item updates when a section's heading crosses ~25% down.
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      {/* Desktop sidebar — sticky next to the main content */}
      <nav
        aria-label="On this page"
        className="hidden lg:block sticky top-8 self-start max-h-[calc(100vh-4rem)] overflow-y-auto pr-4"
      >
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-text-faint mb-3">
          On this page
        </div>
        <div className="hairline mb-3" />
        <ul className="space-y-1">
          {sections.map((s) => {
            const isActive = s.id === activeId;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`group flex items-center gap-2 py-1.5 text-sm transition-colors ${
                    isActive ? "text-accent" : "text-text-muted hover:text-text"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`w-1 h-1 rounded-full transition-all ${
                      isActive ? "bg-accent scale-150" : "bg-text-faint/40 group-hover:bg-text-muted"
                    }`}
                  />
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile dropdown — sticky bar above content */}
      <div className="lg:hidden sticky top-0 z-30 -mx-3 sm:-mx-5 mb-6 px-3 sm:px-5 py-2 bg-bg/90 backdrop-blur border-b border-border">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-bg-elevated border border-border rounded-md hover:border-accent/40 hover:bg-bg-subtle/60 transition-colors text-sm text-text-muted hover:text-text">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-text-faint shrink-0">Jump to</span>
                <span className="truncate text-text">
                  {sections.find((s) => s.id === activeId)?.label ?? sections[0]?.label}
                </span>
              </span>
              <span aria-hidden className="text-text-faint shrink-0">▾</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[14rem] bg-bg-elevated border border-border rounded-md shadow-2xl p-1"
            >
              {sections.map((s) => (
                <DropdownMenu.Item key={s.id} asChild>
                  <a
                    href={`#${s.id}`}
                    className={`block px-3 py-2 text-sm rounded-sm cursor-pointer outline-none ${
                      s.id === activeId
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:bg-bg-subtle hover:text-text"
                    }`}
                  >
                    {s.label}
                  </a>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </>
  );
}
