"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { NewAuditModal } from "@/components/new-audit-modal";

type Audit = {
  id: string;
  url: string;
  domain: string;
  status: string;
  overallScore: number | null;
  overallGrade: string | null;
  queuedAt: string;
  completedAt: string | null;
  platform: string | null;
};

type ApiResponse = {
  audits: Audit[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const STATUS_OPTIONS = ["PENDING", "RUNNING", "ANALYZING", "COMPLETE", "FAILED"];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function AuditsPage() {
  return (
    <Suspense fallback={null}>
      <AuditsPageContent />
    </Suspense>
  );
}

function AuditsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL params
  const [page, setPage] = useState(parseInt(searchParams.get("page") ?? "1"));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("pageSize") ?? "10"));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<string[]>(
    (searchParams.get("status") ?? "").split(",").filter(Boolean),
  );
  const [scoreMin, setScoreMin] = useState(searchParams.get("scoreMin") ?? "");
  const [scoreMax, setScoreMax] = useState(searchParams.get("scoreMax") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "queuedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    (searchParams.get("sortOrder") as "asc" | "desc") ?? "desc",
  );

  // Selection + delete state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowDelete, setRowDelete] = useState<Audit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [newAuditOpen, setNewAuditOpen] = useState(false);

  // Debounce search
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  // Build query params string
  const queryParams = (() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter.length > 0) params.set("status", statusFilter.join(","));
    if (scoreMin) params.set("scoreMin", scoreMin);
    if (scoreMax) params.set("scoreMax", scoreMax);
    return params.toString();
  })();

  // Track previous statuses for toast notifications
  const prevStatuses = useRef<Map<string, string>>(new Map());

  // TanStack Query with polling
  const { data, isLoading: loading, refetch: fetchData } = useQuery<ApiResponse>({
    queryKey: ["audits", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/audits?${queryParams}`);
      return res.json();
    },
    refetchInterval: (query) => {
      const audits = query.state.data?.audits;
      if (!audits) return false;
      const hasInProgress = audits.some((a) =>
        ["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(a.status),
      );
      return hasInProgress ? 5000 : false;
    },
  });

  // Toast on status changes
  useEffect(() => {
    if (!data?.audits) return;
    for (const audit of data.audits) {
      const prev = prevStatuses.current.get(audit.id);
      if (prev && prev !== audit.status) {
        if (audit.status === "COMPLETE") {
          toast.success(`Audit complete: ${audit.domain}`, {
            description: audit.overallScore !== null ? `Score: ${audit.overallScore}/100` : undefined,
            action: {
              label: "View",
              onClick: () => router.push(`/audits/${audit.id}`),
            },
          });
        } else if (audit.status === "FAILED") {
          toast.error(`Audit failed: ${audit.domain}`);
        } else if (audit.status === "RUNNING" && prev === "PENDING") {
          toast(`Audit started: ${audit.domain}`, { description: "Browser is walking the funnel..." });
        }
      }
      prevStatuses.current.set(audit.id, audit.status);
    }
  }, [data, router]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter.length > 0) params.set("status", statusFilter.join(","));
    if (scoreMin) params.set("scoreMin", scoreMin);
    if (scoreMax) params.set("scoreMax", scoreMax);
    if (sortBy !== "queuedAt") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    const qs = params.toString();
    router.replace(`/audits${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [page, pageSize, debouncedSearch, statusFilter, scoreMin, scoreMax, sortBy, sortOrder, router]);

  // Column sort handler
  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  // Selection handlers
  const allSelected = data?.audits.length ? data.audits.every((a) => selected.has(a.id)) : false;
  function toggleAll() {
    if (!data) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.audits.map((a) => a.id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleStatus(status: string) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
    setPage(1);
  }

  // Per-row actions
  async function handleRerun(audit: Audit) {
    setRerunningId(audit.id);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audit.url }),
      });
      const d = await res.json();
      if (d.auditId) {
        toast.success(`Re-running ${audit.domain}`);
        router.push(`/audits/${d.auditId}`);
      }
    } finally {
      setRerunningId(null);
    }
  }

  function handleCopyLink(audit: Audit) {
    const url = `${window.location.origin}/report/${audit.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  }

  const audits = data?.audits ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const filtersActive = !!(debouncedSearch || statusFilter.length > 0 || scoreMin || scoreMax);

  return (
    <main className="content-container py-6">
      {/* ─── Editorial Header ─────────────────────────────── */}
      <header className="mb-10 rise">
        <div className="flex items-baseline justify-end gap-6 mb-1">
          <span className="eyebrow tnum">
            <span className="text-text-muted">{total}</span> records on file
          </span>
        </div>
        <div className="hairline mb-6" />
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[2.5rem] sm:text-[3.5rem] leading-[0.95] font-semibold tracking-[-0.03em]">
              Field Log<span className="text-accent">.</span>
            </h1>
            <p className="text-sm text-text-muted mt-3 max-w-md">
              Synthetic shoppers. Real funnels. Every GA4 event captured, every misfire
              <span className="italic font-display"> noted</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewAuditOpen(true)}
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-3 bg-accent hover:bg-accent-hover text-accent-ink px-5 py-3 rounded-sm font-semibold tracking-tight transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] cursor-pointer"
          >
            <span className="font-mono text-sm">+</span>
            New Audit
            <span className="font-mono text-[10px] opacity-50 ml-1">↵</span>
          </button>
        </div>
      </header>

      {/* ─── Filter Bar ─────────────────────────────── */}
      <div className="mb-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 rise" style={{ animationDelay: "0.05s" }}>
        {/* Search */}
        <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-text-faint pointer-events-none select-none">
            /
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search domains"
            className="w-full h-9 pl-7 pr-3 py-0 bg-bg-elevated border border-border rounded-sm text-sm font-mono text-text placeholder:text-text-faint/60 focus:outline-none focus:border-accent focus:bg-bg-subtle transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-accent text-xs cursor-pointer"
              aria-label="clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap items-center gap-1 h-9 px-1 bg-bg-elevated border border-border rounded-sm">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`text-[10px] font-mono tracking-wider px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                statusFilter.includes(status)
                  ? statusActive(status)
                  : "text-text-faint hover:text-text"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Score range */}
        <div className="flex items-center gap-1.5 h-9 px-3 bg-bg-elevated border border-border rounded-sm">
          <span className="eyebrow">Score</span>
          <input
            type="number"
            value={scoreMin}
            onChange={(e) => { setScoreMin(e.target.value); setPage(1); }}
            placeholder="00"
            min={0}
            max={100}
            className="w-9 bg-transparent font-mono tnum text-xs text-text text-center focus:outline-none placeholder:text-text-faint/50"
          />
          <span className="text-text-faint">→</span>
          <input
            type="number"
            value={scoreMax}
            onChange={(e) => { setScoreMax(e.target.value); setPage(1); }}
            placeholder="100"
            min={0}
            max={100}
            className="w-9 bg-transparent font-mono tnum text-xs text-text text-center focus:outline-none placeholder:text-text-faint/50"
          />
        </div>

        {/* Page size */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="h-9 px-3 bg-bg-elevated border border-border rounded-sm text-xs font-mono text-text-muted focus:outline-none focus:border-accent cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}/page</option>
          ))}
        </select>

        {filtersActive && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter([]);
              setScoreMin("");
              setScoreMax("");
              setPage(1);
            }}
            className="text-[11px] font-mono text-text-faint hover:text-danger transition-colors px-2 cursor-pointer"
          >
            clear ✕
          </button>
        )}
      </div>

      {/* ─── Selection bar (fixed height to avoid jump) ─── */}
      <div className="h-9 mb-2 flex items-center gap-3">
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rise">
            <span className="font-mono text-[11px] tracking-wider uppercase text-accent bracketed">
              {String(selected.size).padStart(2, "0")} selected
            </span>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="text-xs font-medium px-3 py-1.5 bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 rounded-sm transition-colors cursor-pointer"
            >
              Delete selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-text-faint hover:text-text cursor-pointer"
            >
              deselect all
            </button>
          </div>
        )}
      </div>

      {/* New audit modal */}
      <NewAuditModal open={newAuditOpen} onOpenChange={setNewAuditOpen} />

      {/* Bulk delete modal */}
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} audit${selected.size > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All findings, captured events, and analysis data for the selected audits will be permanently deleted."
        confirmPhrase="DELETE"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            const res = await fetch("/api/audits", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [...selected] }),
            });
            if (res.ok) {
              toast.success(`${selected.size} audit${selected.size > 1 ? "s" : ""} deleted`);
              setSelected(new Set());
              setBulkDeleteOpen(false);
              fetchData();
            }
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Single-row delete modal */}
      <ConfirmDeleteModal
        open={!!rowDelete}
        onOpenChange={(o) => !o && setRowDelete(null)}
        title={`Delete this audit?`}
        description={
          rowDelete
            ? `This will permanently delete the audit for ${rowDelete.domain}, including all findings, captured events, and analysis data.`
            : ""
        }
        confirmPhrase={rowDelete?.domain ?? ""}
        loading={deleting}
        onConfirm={async () => {
          if (!rowDelete) return;
          setDeleting(true);
          try {
            const res = await fetch("/api/audits", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [rowDelete.id] }),
            });
            if (res.ok) {
              toast.success(`Deleted ${rowDelete.domain}`);
              setRowDelete(null);
              fetchData();
            }
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* ─── Mobile cards (below sm) ─────────────────── */}
      <div className="sm:hidden space-y-2 rise" style={{ animationDelay: "0.1s" }}>
        {loading ? (
          Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
            <div key={i} className="border border-border rounded-md bg-bg-elevated/40 p-4 animate-pulse">
              <div className="h-4 bg-bg-subtle rounded w-2/3 mb-3" />
              <div className="h-3 bg-bg-subtle rounded w-1/2" />
            </div>
          ))
        ) : audits.length === 0 ? (
          <div className="border border-border rounded-md bg-bg-elevated/40 text-center py-12 px-6">
            <div className="font-display text-2xl text-text-faint mb-2">
              {filtersActive ? "Nothing matches." : "No audits yet."}
            </div>
            <p className="text-sm text-text-muted">
              {filtersActive ? "Try a wider filter." : "The log is empty."}
            </p>
            <button
              type="button"
              onClick={() => setNewAuditOpen(true)}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover cursor-pointer"
            >
              <span className="font-mono">+</span>
              Run your first audit
              <span className="font-mono">→</span>
            </button>
          </div>
        ) : (
          audits.map((audit) => {
            const inProgress = ["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(audit.status);
            const isSelected = selected.has(audit.id);
            return (
              <div
                key={audit.id}
                className={`border rounded-md transition-colors ${
                  isSelected ? "border-accent/40 bg-accent/[0.04]" : "border-border bg-bg-elevated/40"
                }`}
              >
                {/* Top row: checkbox + domain + actions */}
                <div className="flex items-center gap-3 px-3 pt-3">
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(audit.id)} />
                  <Link
                    href={`/audits/${audit.id}`}
                    className="flex-1 min-w-0 text-sm font-medium text-text hover:text-accent transition-colors truncate"
                  >
                    {audit.domain}
                  </Link>
                  <RowActions
                    audit={audit}
                    rerunning={rerunningId === audit.id}
                    onRerun={() => handleRerun(audit)}
                    onCopyLink={() => handleCopyLink(audit)}
                    onDelete={() => setRowDelete(audit)}
                  />
                </div>
                {/* Bottom row: status + score + platform + date */}
                <Link
                  href={`/audits/${audit.id}`}
                  className="flex items-center justify-between gap-3 px-3 pb-3 pt-2 flex-wrap"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={audit.status} />
                    {audit.platform && (
                      <span className="text-[11px] text-text-faint capitalize">
                        · {audit.platform}
                      </span>
                    )}
                    <span
                      className="font-mono text-[10px] text-text-faint"
                      title={new Date(audit.queuedAt).toLocaleString()}
                    >
                      · {relativeTime(audit.queuedAt)}
                    </span>
                  </div>
                  {audit.overallScore !== null ? (
                    <span className={`font-display tnum text-lg font-semibold leading-none ${scoreColor(audit.overallGrade)}`}>
                      {audit.overallScore}
                      <span className="text-text-faint font-normal text-[10px] ml-0.5">
                        /100
                      </span>
                    </span>
                  ) : inProgress ? (
                    <span className="font-mono text-xs text-text-faint">…</span>
                  ) : (
                    <span className="font-mono text-xs text-text-faint">—</span>
                  )}
                </Link>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Table (sm+ only) ─────────────────────── */}
      <div className="hidden sm:block border border-border rounded-md overflow-hidden bg-bg-elevated/40 rise" style={{ animationDelay: "0.1s" }}>
        <table className="w-full">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[7.5rem]" />
            <col className="w-[6rem]" />
            <col className="w-[8rem] hidden md:table-column" />
            <col className="w-[7rem]" />
            <col className="w-[3rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-bg-subtle/40">
              <th className="px-3 py-3">
                <Checkbox checked={allSelected && audits.length > 0} onCheckedChange={toggleAll} />
              </th>
              <SortableHeader field="domain" label="Domain" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader field="status" label="Status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader field="overallScore" label="Score" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
              <SortableHeader field="platform" label="Platform" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
              <SortableHeader field="queuedAt" label="Logged" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-2 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => <SkeletonRow key={i} />)
            ) : audits.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-20 px-6">
                  <div className="inline-flex flex-col items-center">
                    <div className="font-display text-3xl text-text-faint mb-2">
                      {filtersActive ? "Nothing matches." : "No audits yet."}
                    </div>
                    <p className="text-sm text-text-muted">
                      {filtersActive
                        ? "Try a wider filter, or "
                        : "The log is empty. "}
                    </p>
                    <button
                      type="button"
                      onClick={() => setNewAuditOpen(true)}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover cursor-pointer"
                    >
                      <span className="font-mono">+</span>
                      Run your first audit
                      <span className="font-mono">→</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              audits.map((audit) => {
                const inProgress = ["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(audit.status);
                const isSelected = selected.has(audit.id);
                return (
                  <tr
                    key={audit.id}
                    className={`group border-b border-border-subtle last:border-0 transition-colors ${
                      isSelected ? "bg-accent/[0.04]" : "hover:bg-bg-subtle/40"
                    }`}
                  >
                    <td className="px-3 py-3.5">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(audit.id)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/audits/${audit.id}`}
                        className="inline-flex items-center gap-2 group/link"
                      >
                        <span className="text-sm font-medium text-text group-hover/link:text-accent transition-colors">
                          {audit.domain}
                        </span>
                        <span className="font-mono text-[10px] text-text-faint opacity-0 group-hover/link:opacity-100 transition-opacity">
                          →
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={audit.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {audit.overallScore !== null ? (
                        <span className={`font-display tnum text-xl font-semibold leading-none ${scoreColor(audit.overallGrade)}`}>
                          {audit.overallScore}
                          <span className="text-text-faint font-normal text-[11px] ml-0.5">
                            /100
                          </span>
                        </span>
                      ) : inProgress ? (
                        <span className="font-mono text-xs text-text-faint">…</span>
                      ) : (
                        <span className="font-mono text-xs text-text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-xs text-text-muted capitalize">{audit.platform ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="font-mono text-[11px] text-text-faint"
                        title={new Date(audit.queuedAt).toLocaleString()}
                      >
                        {relativeTime(audit.queuedAt)}
                      </span>
                    </td>
                    <td className="pr-3 py-3.5">
                      <RowActions
                        audit={audit}
                        rerunning={rerunningId === audit.id}
                        onRerun={() => handleRerun(audit)}
                        onCopyLink={() => handleCopyLink(audit)}
                        onDelete={() => setRowDelete(audit)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination ─────────────────────────────── */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5">
          <span className="font-mono text-[11px] text-text-faint tnum">
            Showing <span className="text-text-muted">{startItem}–{endItem}</span> of <span className="text-text-muted">{total}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 border border-border rounded-sm text-text-muted hover:text-text hover:border-rule disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              ← Prev
            </button>
            <span className="font-mono text-[11px] text-text-muted px-3 tnum">
              {String(page).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="text-xs px-3 py-1.5 border border-border rounded-sm text-text-muted hover:text-text hover:border-rule disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function RowActions({
  audit,
  rerunning,
  onRerun,
  onCopyLink,
  onDelete,
}: {
  audit: Audit;
  rerunning: boolean;
  onRerun: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-text-faint hover:text-text hover:bg-bg-subtle data-[state=open]:bg-bg-subtle data-[state=open]:text-accent transition-colors cursor-pointer"
          aria-label={`Actions for ${audit.domain}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="3" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="8" cy="13" r="1.4" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[200px] bg-bg-elevated border border-border rounded-sm shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] overflow-hidden p-1 anim-drop"
        >
          {/* Eyebrow */}
          <div className="px-2.5 pt-2 pb-1.5">
            <span className="eyebrow">Actions</span>
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href={`/audits/${audit.id}`}
              className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-text hover:bg-bg-subtle hover:text-accent rounded-sm cursor-pointer outline-none data-[highlighted]:bg-bg-subtle data-[highlighted]:text-accent"
            >
              <span className="flex items-center gap-2.5">
                <Glyph>↗</Glyph>
                Open audit
              </span>
              <span className="font-mono text-[10px] text-text-faint">↵</span>
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <a
              href={`/audits/${audit.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-text hover:bg-bg-subtle hover:text-accent rounded-sm cursor-pointer outline-none data-[highlighted]:bg-bg-subtle data-[highlighted]:text-accent"
            >
              <span className="flex items-center gap-2.5">
                <Glyph>↑</Glyph>
                Open in new tab
              </span>
              <span className="font-mono text-[10px] text-text-faint">⌘↵</span>
            </a>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={onCopyLink}
            className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-text hover:bg-bg-subtle hover:text-accent rounded-sm cursor-pointer outline-none data-[highlighted]:bg-bg-subtle data-[highlighted]:text-accent"
          >
            <span className="flex items-center gap-2.5">
              <Glyph>⌘</Glyph>
              Copy share link
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={(e) => { e.preventDefault(); onRerun(); }}
            disabled={rerunning}
            className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-text hover:bg-bg-subtle hover:text-accent rounded-sm cursor-pointer outline-none data-[highlighted]:bg-bg-subtle data-[highlighted]:text-accent data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
          >
            <span className="flex items-center gap-2.5">
              <Glyph>↻</Glyph>
              {rerunning ? "Re-running…" : "Re-run audit"}
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-border my-1" />

          <DropdownMenu.Item
            onSelect={(e) => { e.preventDefault(); onDelete(); }}
            className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-danger hover:bg-danger/10 rounded-sm cursor-pointer outline-none data-[highlighted]:bg-danger/10"
          >
            <span className="flex items-center gap-2.5">
              <Glyph>✕</Glyph>
              Delete
            </span>
            <span className="font-mono text-[10px] text-danger/60">irreversible</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] w-3.5 inline-flex justify-center text-text-faint">
      {children}
    </span>
  );
}

function SortableHeader({
  field, label, sortBy, sortOrder, onSort, className = "", align = "left",
}: {
  field: string;
  label: string;
  sortBy: string;
  sortOrder: string;
  onSort: (field: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-${align} px-4 py-3 cursor-pointer select-none transition-colors ${className}`}
    >
      <span
        className={`inline-flex items-center gap-1.5 eyebrow transition-colors ${
          active ? "text-accent" : "hover:text-text-muted"
        }`}
      >
        {label}
        {active && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            {sortOrder === "asc" ? <path d="M6 2l4 5H2z" /> : <path d="M6 10l4-5H2z" />}
          </svg>
        )}
      </span>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const inProgress = ["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(status);
  const styles: Record<string, string> = {
    PENDING: "bg-warning/[0.08] text-warning border-warning/30",
    RUNNING: "bg-info/[0.08] text-info border-info/30",
    ANALYZING: "bg-info/[0.08] text-info border-info/30",
    RENDERING: "bg-info/[0.08] text-info border-info/30",
    COMPLETE: "bg-accent/[0.08] text-accent border-accent/30",
    FAILED: "bg-danger/[0.08] text-danger border-danger/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider font-medium px-2 py-1 rounded-sm border ${
        styles[status] ?? "bg-bg-subtle text-text-muted border-border"
      }`}
    >
      {inProgress && <span className="w-1 h-1 rounded-full bg-current live-dot" />}
      {status}
    </span>
  );
}

function statusActive(status: string): string {
  const map: Record<string, string> = {
    PENDING: "bg-warning/15 text-warning",
    RUNNING: "bg-info/15 text-info",
    ANALYZING: "bg-info/15 text-info",
    COMPLETE: "bg-accent/15 text-accent",
    FAILED: "bg-danger/15 text-danger",
  };
  return map[status] ?? "bg-accent/15 text-accent";
}

function scoreColor(grade: string | null): string {
  if (grade === "pass") return "text-accent";
  if (grade === "evaluate") return "text-warning";
  return "text-danger";
}

function Checkbox({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="h-4 w-4 shrink-0 rounded-sm border border-border bg-bg-elevated data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors cursor-pointer flex items-center justify-center hover:border-rule"
    >
      <CheckboxPrimitive.Indicator>
        <svg className="h-3 w-3 text-accent-ink" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M2.5 6l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border-subtle">
      <td className="px-3 py-3.5"><div className="w-4 h-4 bg-bg-subtle rounded-sm animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="w-32 h-3.5 bg-bg-subtle rounded-sm animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-bg-subtle rounded-sm animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="w-12 h-4 bg-bg-subtle rounded-sm animate-pulse ml-auto" /></td>
      <td className="px-4 py-3.5 hidden md:table-cell"><div className="w-16 h-3.5 bg-bg-subtle rounded-sm animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="w-14 h-3.5 bg-bg-subtle rounded-sm animate-pulse" /></td>
      <td className="pr-3 py-3.5"><div className="w-6 h-6 bg-bg-subtle rounded-sm animate-pulse ml-auto" /></td>
    </tr>
  );
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}
