import type { AiAnalysisData, DetectedPlatformData } from "./types";

export function AiAnalysisSection({
  aiAnalysis,
  detectedPlatforms,
  onReanalyze,
  analyzing,
  heading = "Tracking Intelligence",
}: {
  aiAnalysis: AiAnalysisData | null;
  detectedPlatforms: DetectedPlatformData[] | null;
  onReanalyze?: () => void;
  analyzing?: boolean;
  /** Section heading. Defaults to "Tracking Intelligence" (internal view). */
  heading?: string;
}) {
  const categoryIcons: Record<string, { icon: string; color: string }> = {
    observation: { icon: "🔍", color: "text-info" },
    issue: { icon: "⚠", color: "text-warning" },
    recommendation: { icon: "💡", color: "text-accent" },
  };

  const categoryColors: Record<string, string> = {
    cdp: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    analytics: "bg-info/10 text-info border-info/20",
    ads: "bg-warning/10 text-warning border-warning/20",
    pixel: "bg-danger/10 text-danger border-danger/20",
    tag_manager: "bg-success/10 text-success border-success/20",
  };

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{heading}</h2>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            disabled={analyzing}
            className="text-xs px-3 py-1.5 bg-bg-elevated border border-border hover:border-accent/50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            {analyzing ? "Analyzing..." : "Re-run Analysis"}
          </button>
        )}
      </div>

      {/* AI Summary */}
      {aiAnalysis && (
        <div className="glass rounded-lg p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent">✦</span>
            <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted">AI Analysis</h3>
            {!aiAnalysis.ga4Present && (
              <span className="text-[10px] px-2 py-0.5 bg-danger/10 text-danger border border-danger/20 rounded-full">No GA4 detected</span>
            )}
          </div>
          <p className="text-sm text-text leading-relaxed mb-4">{aiAnalysis.summary}</p>

          {aiAnalysis.insights.length > 0 && (
            <div className="space-y-2">
              {aiAnalysis.insights.map((insight, i) => {
                const style = categoryIcons[insight.category] ?? categoryIcons.observation!;
                return (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border-subtle last:border-0">
                    <span className={`mt-0.5 ${style.color}`}>{style.icon}</span>
                    <div>
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${style.color}`}>
                        {insight.category}
                      </span>
                      <p className="text-sm text-text-muted mt-0.5">{insight.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {aiAnalysis.tokensUsed > 0 && (
            <div className="flex items-center justify-end gap-3 mt-3 text-[10px] text-text-faint">
              <span>{aiAnalysis.inputTokens?.toLocaleString() ?? "?"} in / {aiAnalysis.outputTokens?.toLocaleString() ?? "?"} out tokens</span>
              {aiAnalysis.estimatedCostUsd !== undefined && aiAnalysis.estimatedCostUsd > 0 && (
                <span className="px-1.5 py-0.5 bg-bg-subtle rounded">
                  ${aiAnalysis.estimatedCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detected Platforms */}
      {detectedPlatforms && detectedPlatforms.length > 0 && (
        <div className="glass rounded-lg p-4 sm:p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted mb-3">
            Detected Tracking Platforms ({detectedPlatforms.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {detectedPlatforms.map((platform) => (
              <div
                key={platform.name}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-md border ${categoryColors[platform.category] ?? "bg-bg-subtle text-text-muted border-border"}`}
              >
                <div>
                  <div className="text-sm font-medium">{platform.name}</div>
                  <div className="text-[10px] opacity-70 capitalize">{platform.category.replace("_", " ")}</div>
                  {platform.detectedEvents.length > 0 && (
                    <div className="text-[10px] opacity-60 mt-0.5">
                      Events: {platform.detectedEvents.slice(0, 4).join(", ")}
                      {platform.detectedEvents.length > 4 && "..."}
                    </div>
                  )}
                </div>
                <div className="sm:text-right shrink-0">
                  <span className="text-sm font-semibold">{platform.requestCount}</span>
                  <span className="text-[10px] opacity-60 ml-1 sm:ml-0 sm:block">requests</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
