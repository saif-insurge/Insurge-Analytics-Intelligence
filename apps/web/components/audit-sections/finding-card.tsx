"use client";

import { useState } from "react";
import type { Finding } from "./types";

export function FindingCard({ finding, platform }: { finding: Finding; platform: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const severityClass: Record<string, string> = {
    critical: "text-severity-critical",
    high: "text-severity-high",
    medium: "text-severity-medium",
    low: "text-severity-low",
    info: "text-severity-info",
  };

  type StatusStyle = { bg: string; border: string; borderLeft: string; status: string; hover: string };
  const statusStyle: Record<string, StatusStyle> = {
    pass:     { bg: "bg-success/[0.04]", border: "border-success/20",  borderLeft: "border-l-success", status: "text-success", hover: "hover:bg-success/[0.07]" },
    evaluate: { bg: "bg-warning/[0.04]", border: "border-warning/20",  borderLeft: "border-l-warning", status: "text-warning", hover: "hover:bg-warning/[0.07]" },
    fail:     { bg: "bg-danger/[0.04]",  border: "border-danger/20",   borderLeft: "border-l-danger",  status: "text-danger",  hover: "hover:bg-danger/[0.07]" },
  };
  const s = statusStyle[finding.status] ?? statusStyle.fail!;

  return (
    <div className={`rounded-lg border ${s.border} border-l-2 ${s.borderLeft} ${s.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left px-3 sm:px-4 py-3 flex items-center justify-between gap-2 transition-colors cursor-pointer ${s.hover}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${severityClass[finding.severity] ?? "text-text-muted"}`}>
            {finding.severity}
          </span>
          <span className="text-sm font-medium min-w-0">{finding.title}</span>
        </div>
        <span className={`text-xs font-medium shrink-0 ${s.status}`}>
          {finding.status}
        </span>
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-4 border-t border-border-subtle">
          <p className="text-sm text-text-muted mt-3">{finding.summary}</p>
          {finding.impact && (
            <p className="text-sm text-text-faint mt-2 italic">{finding.impact}</p>
          )}
          {finding.fix?.platformSpecific && platform && finding.fix.platformSpecific[platform] && (
            <div className="mt-3 p-3 bg-bg-subtle rounded-md">
              <div className="text-xs font-medium text-accent mb-1">Fix for {platform}:</div>
              <p className="text-sm text-text-muted">{finding.fix.platformSpecific[platform]}</p>
              {finding.fix.estimatedEffort && (
                <p className="text-xs text-text-faint mt-1">Estimated effort: {finding.fix.estimatedEffort}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
