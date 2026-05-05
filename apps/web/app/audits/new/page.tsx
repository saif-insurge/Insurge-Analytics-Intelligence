"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import * as Switch from "@radix-ui/react-switch";

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

  // Parse bulk URLs from textarea
  const parsedBulkUrls = bulkUrls
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && (line.startsWith("http://") || line.startsWith("https://")));

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
    <main className="content-container py-16 max-w-lg">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold">New Audit</h1>
        <p className="text-sm text-text-muted mt-1">
          Audit one site or submit up to 100 URLs at once.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-bg-elevated border border-border rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`text-sm px-4 py-1.5 rounded-md transition-colors cursor-pointer ${mode === "single" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
        >
          Single URL
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={`text-sm px-4 py-1.5 rounded-md transition-colors cursor-pointer ${mode === "bulk" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
        >
          Bulk Import
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "single" ? (
          <div>
            <label className="block text-sm font-medium mb-2">Website URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-lg text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
            <p className="text-xs text-text-faint mt-1.5">
              The homepage URL. We'll navigate through the shopping funnel automatically.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-2">
              URLs <span className="text-text-faint">(one per line, max 100)</span>
            </label>
            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder={"https://store1.com\nhttps://store2.com\nhttps://store3.com"}
              rows={8}
              required
              className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-lg text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-y font-mono text-sm"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-text-faint">
                Enter one URL per line. Each must start with http:// or https://
              </p>
              <span className={`text-xs font-mono ${bulkOverLimit ? "text-danger" : bulkCount > 0 ? "text-accent" : "text-text-faint"}`}>
                {bulkCount}/100
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Notes <span className="text-text-faint">(optional)</span></label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context — platform, known issues, specific pages to check..."
            rows={3}
            className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-lg text-text placeholder:text-text-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-y"
          />
        </div>

        {/* Email notification toggle */}
        <div className="flex items-center justify-between py-3 px-4 bg-bg-elevated border border-border rounded-lg">
          <div>
            <label htmlFor="notify-toggle" className="text-sm font-medium cursor-pointer">
              Email me when complete
            </label>
            {notify && userEmail && (
              <p className="text-xs text-text-faint mt-0.5">{userEmail}</p>
            )}
          </div>
          <Switch.Root
            id="notify-toggle"
            checked={notify}
            onCheckedChange={setNotify}
            className="w-9 h-5 rounded-full bg-bg-subtle data-[state=checked]:bg-accent transition-colors cursor-pointer relative"
          >
            <Switch.Thumb className="block w-4 h-4 rounded-full bg-text-muted data-[state=checked]:bg-white transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>

        {error && (
          <div className="px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "bulk" && (bulkCount === 0 || bulkOverLimit))}
          className="w-full py-3 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {mode === "bulk" ? `Submitting ${bulkCount} audits...` : "Starting audit..."}
            </span>
          ) : mode === "bulk" ? (
            `Start ${bulkCount} Audit${bulkCount !== 1 ? "s" : ""}`
          ) : (
            "Start Audit"
          )}
        </button>
      </form>
    </main>
  );
}
