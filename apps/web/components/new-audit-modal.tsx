"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { toast } from "sonner";

function normalizeUrl(raw: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/\/+$/, "");
  return v ? `https://${v}` : "";
}

function stripProtocol(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "");
}

export function NewAuditModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [url, setUrl] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the right input after the dialog opens, without scrolling the page.
  // (Radix's default auto-focus + browser native scroll-into-view would scroll
  // the underlying page because the portal-mounted node sits at end-of-body.)
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (mode === "single") urlInputRef.current?.focus({ preventScroll: true });
      else bulkTextareaRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, mode]);

  const userEmail = user?.primaryEmailAddress?.emailAddress;

  const parsedBulkUrls = bulkUrls
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(normalizeUrl)
    .filter((line) => line.length > 0);

  const bulkCount = parsedBulkUrls.length;
  const bulkOverLimit = bulkCount > 100;

  function reset() {
    setMode("single");
    setUrl("");
    setBulkUrls("");
    setNotes("");
    setNotify(false);
    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && !loading) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        toast.error(data.error ?? "Failed to start audit");
        return;
      }

      if (mode === "bulk") {
        toast.success(`${bulkCount} audit${bulkCount !== 1 ? "s" : ""} queued`);
      } else {
        toast.success("Audit started");
      }

      reset();
      onOpenChange(false);
      router.push("/audits");
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 anim-overlay" />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto bg-bg-elevated border border-border rounded-md shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] anim-dialog"
        >
          {/* Top hairline header */}
          <div className="flex items-center gap-2 px-6 pt-5 pb-2">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
              [ NEW AUDIT ]
            </span>
            <div className="flex-1 h-px bg-border" />
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-text-faint hover:text-text font-mono text-sm cursor-pointer"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 pb-6">
            <Dialog.Title className="font-display text-2xl font-semibold tracking-tight text-text mt-3">
              Run a synthetic shopper<span className="text-accent">.</span>
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-3 leading-relaxed">
              Submit one site or up to one hundred. The audit walks each funnel,
              captures every GA4 event, and returns a verdict.
            </Dialog.Description>

            {/* Mode toggle */}
            <div className="flex items-center gap-1 mt-6 mb-6 p-1 bg-bg border border-border rounded-sm w-fit">
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

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === "single" ? (
                <FieldGroup label="Website URL" hint="The homepage URL. We navigate the funnel automatically." section="01">
                  <div className="flex w-full rounded-sm border border-border bg-bg focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/50 transition-colors">
                    <span className="flex items-center pl-4 pr-1 font-mono text-text-faint text-[13px] select-none shrink-0">
                      https://
                    </span>
                    <input
                      ref={urlInputRef}
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
                    ref={bulkTextareaRef}
                    value={bulkUrls}
                    onChange={(e) => setBulkUrls(e.target.value)}
                    placeholder={"store1.com\nstore2.com\nstore3.com"}
                    rows={6}
                    required
                    className="w-full px-4 py-3 bg-bg border border-border rounded-sm text-text placeholder:text-text-faint/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors resize-y font-mono text-sm leading-relaxed"
                  />
                </FieldGroup>
              )}

              <FieldGroup label="Notes" hint="Context — platform, known issues, specific pages." section="02" optional>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Shopify · Recharge subscriptions · check checkout step 2…"
                  rows={2}
                  className="w-full px-4 py-3 bg-bg border border-border rounded-sm text-text placeholder:text-text-faint/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors resize-y text-sm leading-relaxed"
                />
              </FieldGroup>

              {/* Email notification */}
              <div className="flex items-center justify-between py-3 px-4 bg-bg border border-border rounded-sm">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-[10px] tracking-wider text-accent mt-0.5">§03</span>
                  <div>
                    <label htmlFor="modal-notify-toggle" className="text-sm font-medium cursor-pointer">
                      Email me when complete
                    </label>
                    <p className={`text-[11px] mt-0.5 ${notify && userEmail ? "text-accent font-mono" : "text-text-faint"}`}>
                      {notify && userEmail ? userEmail : "Disabled — check the dashboard for status."}
                    </p>
                  </div>
                </div>
                <Switch.Root
                  id="modal-notify-toggle"
                  checked={notify}
                  onCheckedChange={setNotify}
                  className="w-10 h-[22px] rounded-full bg-bg-subtle border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors cursor-pointer relative"
                >
                  <Switch.Thumb className="block w-4 h-4 rounded-full bg-text-muted data-[state=checked]:bg-accent-ink transition-transform translate-x-0.5 data-[state=checked]:translate-x-[20px]" />
                </Switch.Root>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="text-sm px-4 py-2 text-text-muted hover:text-text border border-border hover:border-rule rounded-sm transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={loading || (mode === "bulk" && (bulkCount === 0 || bulkOverLimit))}
                  className="text-sm font-semibold px-5 py-2 bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:text-accent-ink/50 text-accent-ink rounded-sm transition-all cursor-pointer disabled:cursor-not-allowed hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] disabled:shadow-none flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {mode === "bulk" ? `Submitting ${bulkCount}…` : "Starting…"}
                    </>
                  ) : mode === "bulk" ? (
                    <>Start {bulkCount} Audit{bulkCount !== 1 ? "s" : ""}</>
                  ) : (
                    <>Begin Audit</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
