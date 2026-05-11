import { CATEGORY_LABELS, type Finding } from "./types";

export function CategoryScores({ findings }: { findings: Finding[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
      {Object.entries(CATEGORY_LABELS).map(([key, { label, maxScore }], idx) => {
        const catFindings = findings.filter((f) => f.category === key);
        const failures = catFindings.filter((f) => f.status === "fail").length;
        const reviews = catFindings.filter((f) => f.status === "evaluate").length;
        const passes = catFindings.filter((f) => f.status === "pass").length;
        const clear = failures === 0;

        const accent = clear ? "success" : failures > 0 ? "danger" : "warning";
        // Tailwind needs literal class names (no dynamic interpolation), so map.
        const accentStyles = {
          success: {
            bar: "bg-success",
            glowColor: "rgba(74, 222, 128, 0.10)", // success token at low alpha
            ring: "group-hover:border-success/40",
            text: "text-success",
          },
          danger: {
            bar: "bg-danger",
            glowColor: "rgba(248, 113, 113, 0.10)",
            ring: "group-hover:border-danger/40",
            text: "text-danger",
          },
          warning: {
            bar: "bg-warning",
            glowColor: "rgba(251, 191, 36, 0.10)",
            ring: "group-hover:border-warning/40",
            text: "text-warning",
          },
        }[accent];

        return (
          <div
            key={key}
            className={`group relative overflow-hidden rounded-lg border border-border bg-bg-elevated/80 backdrop-blur p-5 transition-all hover:translate-y-[-2px] hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] ${accentStyles.ring}`}
          >
            {/* Top accent bar */}
            <div aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${accentStyles.bar}`} />
            {/* Subtle radial glow in the corner */}
            <div
              aria-hidden
              className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle at center, ${accentStyles.glowColor}, transparent 70%)` }}
            />

            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[10px] tracking-[0.22em] text-text-faint uppercase">
                  §{String(idx + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-[10px] text-text-faint tnum">/{maxScore}</span>
              </div>

              <div className="text-xs text-text-muted mb-2 leading-snug">{label}</div>

              <div className="font-display text-2xl font-semibold leading-tight mb-3">
                {clear ? (
                  <span className={accentStyles.text}>All clear</span>
                ) : (
                  <span className={accentStyles.text}>
                    {failures}
                    <span className="font-normal text-text-muted text-sm ml-1.5">
                      issue{failures > 1 ? "s" : ""}
                    </span>
                  </span>
                )}
              </div>

              {/* Breakdown chips */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono tracking-wider uppercase">
                {passes > 0 && (
                  <span className="text-success">
                    <span className="tnum">{passes}</span> pass
                  </span>
                )}
                {reviews > 0 && (
                  <span className="text-warning">
                    <span className="tnum">{reviews}</span> review
                  </span>
                )}
                {failures > 0 && (
                  <span className="text-danger">
                    <span className="tnum">{failures}</span> fail
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
