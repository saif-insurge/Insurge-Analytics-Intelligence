"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type CreatedKey = ApiKey & { plaintext: string; warning: string };

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()) as { keys: ApiKey[] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return (await res.json()) as CreatedKey;
    },
    onSuccess: (key) => {
      setCreatedKey(key);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    onSuccess: () => {
      toast.success("Key revoked");
      setRevokeId(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <main className="content-container py-12">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 font-mono text-[11px] text-text-faint hover:text-accent transition-colors"
      >
        ← Back to settings
      </Link>

      <header className="mt-6 mb-10 rise">
        <div className="flex items-baseline justify-between gap-6 mb-1">
          <span className="eyebrow">/ Configuration · §03</span>
          <span className="eyebrow">Programmatic Access</span>
        </div>
        <div className="hairline mb-6" />
        <h1 className="font-display text-[3rem] leading-[0.95] font-semibold tracking-[-0.03em]">
          API Keys<span className="text-accent">.</span>
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-lg leading-relaxed">
          Tokens for submitting audits programmatically from external tools (n8n, custom scripts, integrations).
          Each key is scoped to your organization. Revoke any time.
        </p>
      </header>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold">Active Keys</h2>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-accent-ink font-medium rounded-sm transition-colors cursor-pointer"
        >
          + Create New Key
        </button>
      </div>

      <div className="border border-border rounded-md bg-bg-elevated/40 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading…</div>
        ) : !data?.keys.length ? (
          <div className="p-12 text-center text-sm text-text-muted">
            No API keys yet. Create one to start using the API.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-faint">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.keys.map((k) => (
                <tr key={k.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-text-muted">{k.prefix}…</td>
                  <td className="px-4 py-3 text-text-muted">
                    {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{relativeTime(k.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setRevokeId(k.id)}
                      className="text-xs px-3 py-1.5 text-danger hover:bg-danger/10 border border-danger/20 rounded-sm transition-colors cursor-pointer"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick reference */}
      <div className="mt-10 border-l-2 border-l-accent pl-5 py-1">
        <h3 className="font-display text-base font-semibold mb-2">Using the API</h3>
        <p className="text-sm text-text-muted mb-3">
          Submit an audit:
        </p>
        <pre className="text-xs font-mono bg-bg p-3 rounded border border-border overflow-x-auto">
{`curl -X POST https://analytics-intel.insurge.io/api/v1/audits \\
  -H "Authorization: Bearer <your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com"}'`}
        </pre>
        <p className="text-sm text-text-muted mt-4 mb-2">Poll for results:</p>
        <pre className="text-xs font-mono bg-bg p-3 rounded border border-border overflow-x-auto">
{`curl https://analytics-intel.insurge.io/api/v1/audits/<auditId> \\
  -H "Authorization: Bearer <your-key>"`}
        </pre>
      </div>

      {/* Create modal */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,28rem)] bg-bg-elevated border border-border rounded-md p-6 shadow-2xl">
            <Dialog.Title className="font-display text-xl font-semibold">Create API Key</Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-2">
              Give it a name so you can identify it later.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value;
                if (name) createMutation.mutate(name);
              }}
              className="mt-5"
            >
              <input
                type="text"
                name="name"
                placeholder="e.g. n8n production, my-script"
                autoFocus
                required
                className="w-full px-3 py-2.5 bg-bg border border-border rounded-sm text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
              />
              <div className="flex items-center justify-end gap-2 mt-5">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="text-sm px-4 py-2 text-text-muted hover:text-text border border-border rounded-sm transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-ink font-medium rounded-sm transition-colors cursor-pointer"
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Created key reveal — shown ONCE */}
      <Dialog.Root open={!!createdKey} onOpenChange={(o) => !o && setCreatedKey(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,32rem)] bg-bg-elevated border border-border rounded-md p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
                [ KEY CREATED — SHOWN ONCE ]
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Dialog.Title className="font-display text-xl font-semibold">
              {createdKey?.name}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-2">
              Copy this key now. It won&apos;t be shown again — only the prefix will be visible.
            </Dialog.Description>
            <div className="mt-4 p-3 bg-bg border border-border rounded-sm font-mono text-xs break-all">
              {createdKey?.plaintext}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => {
                  if (createdKey) {
                    navigator.clipboard.writeText(createdKey.plaintext);
                    toast.success("Copied to clipboard");
                  }
                }}
                className="text-sm px-4 py-2 border border-border hover:bg-bg-subtle rounded-sm transition-colors cursor-pointer"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-accent-ink font-medium rounded-sm transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Revoke confirm */}
      <Dialog.Root open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,28rem)] bg-bg-elevated border border-border rounded-md p-6 shadow-2xl">
            <Dialog.Title className="font-display text-lg font-semibold">Revoke this key?</Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-2">
              Any tools using this key will immediately stop working. This cannot be undone.
            </Dialog.Description>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="text-sm px-4 py-2 text-text-muted hover:text-text border border-border rounded-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => revokeId && revokeMutation.mutate(revokeId)}
                disabled={revokeMutation.isPending}
                className="text-sm px-4 py-2 bg-danger hover:bg-danger/90 disabled:opacity-50 text-white font-medium rounded-sm transition-colors cursor-pointer"
              >
                {revokeMutation.isPending ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}
