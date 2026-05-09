"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import * as Switch from "@radix-ui/react-switch";

/** Strip protocol and trailing slash, then prepend https:// */
function normalizeUrl(raw: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/\/+$/, "");
  return v ? `https://${v}` : "";
}

/** Strip protocol for display in the input field (the prefix shows https://) */
function stripProtocol(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "");
}

export default function NewAuditPage() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [url, setUrl] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user } = useUser();

  const userEmail = user?.primaryEmailAddress?.emailAddress;

  const parsedBulkUrls = bulkUrls
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(normalizeUrl)
    .filter((line) => line.length > 0);

  const bulkCount = parsedBulkUrls.length;
  const bulkOverLimit = bulkCount > 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body =
        mode === "single"
          ? {
              url,
              notes: notes || undefined,
              notifyEmail: notify && userEmail ? userEmail : undefined,
            }
          : {
              urls: parsedBulkUrls,
              notes: notes || undefined,
              notifyEmail: notify && userEmail ? userEmail : undefined,
            };

      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create audit");
        return;
      }

      if (mode === "single" && data.auditId) {
        router.push(`/audits/${data.auditId}`);
      } else {
        router.push("/audits");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content-container py-12 max-w-2xl">
      {/* Editorial header */}
      <Link href="/audits" className="inline-flex items-center gap-2 font-mono text-[11px] text-text-faint hover:text-accent transition-colors mb-8">
        ← Back to log
      </Link>

      <header className="mb-10 rise">
        <div className="flex items-baseline justify-between gap-6 mb-1">
          <span className="eyebrow">/ New Submission · §02</span>
          <span className="eyebrow">Form-A</span>
        </div>
        <div className="hairline mb-6" />
        <h1 className="font-display text-[3rem] leading-[0.95] font-semibold tracking-[-0.03em]">
          Run a synthetic shopper<span className="text-accent">.</span>
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-lg leading-relaxed">
          Submit one site or up to one hundred. The audit walks each funnel,
          captures every GA4 event, and returns a verdict you can ship to your
          stakeholders.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-8 p-1 bg-bg-elevated border border-border rounded-sm w-fit rise" style={{ animationDelay: "0.05s" }}>
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`text-[13px] font-medium px-5 py-2 rounded-sm transition-colors cursor-pointer ${
            mode === "single"
              ? "bg-accent text-accent-ink"
              : "text-text-muted hover:text-text"
          }`}
        >
          Single URL
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={`text-[13px] font-medium px-5 py-2 rounded-sm transition-colors cursor-pointer ${
            mode === "bulk"
              ? "bg-accent text-accent-ink"
              : "text-text-muted hover:text-text"
          }`}
        >
          Bulk Import
          {bulkCount > 0 && (
            <span className="ml-2 font-mono text-[10px] opacity-70">({bulkCount})</span>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rise" style={{ animationDelay: "0.1s" }}>
        {mode === "single" ? (
          <FieldGroup label="Website URL" hint="The homepage URL. We navigate the funnel automatically." section="01">
            <div className="flex w-full rounded-sm border border-border bg-bg-elevated focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/50 transition-colors">
              <span className="flex items-center pl-4 pr-1 font-mono text-text-faint text-[13px] select-none shrink-0">
                https://
              </span>
              <input
                type="text"
                value={stripProtocol(url)}
                onChange={(e) => setUrl(normalizeUrl(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text");
                  setUrl(normalizeUrl(pasted));
                }}
                placeholder="example.com"
                required
                className="flex-1 py-3 pr-4 bg-transparent text-text font-mono text-sm placeholder:text-text-faint/60 focus:outline-none"
              />
            </div>
          </FieldGroup>
        ) : (
          <FieldGroup
            label={`URLs · one per line · max 100`}
            hint="Paste a list of homepage URLs. We add https:// automatically."
            section="01"
            trailing={
              <span className={`font-mono text-[11px] tabular-nums ${bulkOverLimit ? "text-danger" : bulkCount > 0 ? "text-accent" : "text-text-faint"}`}>
                {bulkCount}/100
              </span>
            }
          >
            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder={"store1.com\nstore2.com\nstore3.com"}
              rows={9}
              required
              className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-sm text-text placeholder:text-text-faint/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors resize-y font-mono text-sm leading-relaxed"
            />
          </FieldGroup>
        )}

        <FieldGroup label="Notes" hint="Context — platform, known issues, specific pages." section="02" optional>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Shopify · Recharge subscriptions · check checkout step 2…"
            rows={3}
            className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-sm text-text placeholder:text-text-faint/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors resize-y text-sm leading-relaxed"
          />
        </FieldGroup>

        {/* Email notification */}
        <div className="flex items-center justify-between py-3.5 px-4 bg-bg-elevated border border-border rounded-sm">
          <div className="flex items-start gap-3">
            <span className="font-mono text-[10px] tracking-wider text-accent mt-0.5">§03</span>
            <div>
              <label htmlFor="notify-toggle" className="text-sm font-medium cursor-pointer">
                Email me when complete
              </label>
              <p className={`text-[11px] mt-0.5 ${notify && userEmail ? "text-accent font-mono" : "text-text-faint"}`}>
                {notify && userEmail ? userEmail : "Disabled — check the dashboard for status."}
              </p>
            </div>
          </div>
          <Switch.Root
            id="notify-toggle"
            checked={notify}
            onCheckedChange={setNotify}
            className="w-10 h-[22px] rounded-full bg-bg-subtle border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors cursor-pointer relative"
          >
            <Switch.Thumb className="block w-4 h-4 rounded-full bg-text-muted data-[state=checked]:bg-accent-ink transition-transform translate-x-0.5 data-[state=checked]:translate-x-[20px]" />
          </Switch.Root>
        </div>

        {error && (
          <div className="px-4 py-3 bg-danger/[0.07] border border-danger/30 rounded-sm text-sm text-danger flex items-start gap-2">
            <span className="font-mono text-xs mt-0.5">!</span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "bulk" && (bulkCount === 0 || bulkOverLimit))}
          className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:text-accent-ink/50 text-accent-ink font-semibold rounded-sm transition-all cursor-pointer disabled:cursor-not-allowed hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] disabled:shadow-none"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {mode === "bulk" ? `Submitting ${bulkCount} audits…` : "Starting audit…"}
            </span>
          ) : mode === "bulk" ? (
            <>
              Start {bulkCount} Audit{bulkCount !== 1 ? "s" : ""}
              <span className="font-mono text-xs opacity-60 ml-2">↵</span>
            </>
          ) : (
            <>
              Begin Audit
              <span className="font-mono text-xs opacity-60 ml-2">↵</span>
            </>
          )}
        </button>
      </form>
    </main>
  );
}

function FieldGroup({
  label,
  hint,
  section,
  optional,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  section: string;
  optional?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] tracking-wider text-accent">§{section}</span>
          <label className="text-sm font-medium text-text">
            {label}
            {optional && <span className="text-text-faint font-normal ml-2">(optional)</span>}
          </label>
        </div>
        {trailing}
      </div>
      {children}
      {hint && <p className="text-[11px] text-text-faint mt-2 ml-7">{hint}</p>}
    </div>
  );
}
