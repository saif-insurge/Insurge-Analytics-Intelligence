"use client";

import { useState } from "react";
import type { FunnelStepLogData } from "./types";

export function FunnelLogSection({ steps }: { steps: FunnelStepLogData[] }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Funnel Walk Log</h2>
      <div className="glass rounded-lg overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {steps.map((step) => {
            const expanded = expandedStep === step.step;
            const navigated = step.urlBefore !== step.urlAfter;

            return (
              <div key={step.step}>
                <button
                  onClick={() => setExpandedStep(expanded ? null : step.step)}
                  className="w-full text-left px-3 sm:px-5 py-3 hover:bg-bg-subtle/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${step.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {step.success ? "✓" : "✗"}
                    </span>
                    <span className="text-sm font-medium capitalize">{step.name.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-text-faint font-mono">{(step.durationMs / 1000).toFixed(1)}s</span>
                    {step.eventsCaptureDuringStep > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                        {step.eventsCaptureDuringStep} events
                      </span>
                    )}
                    {!step.success && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-danger/10 text-danger rounded">failed</span>
                    )}
                    <span className="ml-auto text-text-faint text-[10px]">{expanded ? "▲" : "▼"}</span>
                  </div>

                  <div className="ml-8 mt-1 text-xs text-text-muted">
                    {step.observation ? (
                      <span className="line-clamp-1">{step.observation}</span>
                    ) : navigated ? (
                      <span>
                        Navigated to <span className="text-accent font-mono">{new URL(step.urlAfter).pathname}</span>
                      </span>
                    ) : (
                      <span>
                        Stayed on <span className="text-text-faint font-mono">{step.urlBefore === "about:blank" ? "blank page" : new URL(step.urlBefore).pathname}</span>
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="px-3 sm:px-5 pb-4 ml-3 sm:ml-8 space-y-3 border-t border-border-subtle pt-3">
                    <div>
                      <div className="text-[10px] text-text-faint uppercase tracking-wide mb-1">Action</div>
                      <p className="text-xs text-text-muted">{step.instruction}</p>
                    </div>

                    {step.observation && (
                      <div>
                        <div className="text-[10px] text-text-faint uppercase tracking-wide mb-1">Agent Observation</div>
                        <p className="text-xs text-text leading-relaxed bg-bg-subtle rounded-md p-2.5">{step.observation}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] text-text-faint uppercase tracking-wide mb-1">Page Before Action</div>
                        <p className="text-xs font-mono text-text-muted break-all">{step.urlBefore}</p>
                      </div>
                      <div>
                        <div className="text-[10px] text-text-faint uppercase tracking-wide mb-1">Page After Action</div>
                        <p className={`text-xs font-mono break-all ${navigated ? "text-accent" : "text-text-faint"}`}>
                          {step.urlAfter}
                          {navigated && <span className="text-success ml-1">(navigated)</span>}
                          {!navigated && <span className="text-text-faint ml-1">(same page)</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
                      <span className="text-text-faint">Duration: <span className="text-text-muted font-mono">{step.durationMs}ms</span></span>
                      <span className="text-text-faint">Events captured: <span className="text-text-muted font-mono">{step.eventsCaptureDuringStep}</span></span>
                      <span className="text-text-faint">Timestamp: <span className="text-text-muted font-mono">{new Date(step.timestamp).toLocaleTimeString()}</span></span>
                    </div>

                    {step.error && (
                      <div className="p-3 bg-danger/5 border border-danger/20 rounded-md">
                        <div className="text-[10px] text-danger uppercase tracking-wide mb-1">Error</div>
                        <p className="text-xs text-danger/80 font-mono">{step.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
