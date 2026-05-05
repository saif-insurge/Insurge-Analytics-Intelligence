"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";

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

  // Data state
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Sync URL params
  const syncUrl = useCallback(() => {
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

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
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

    try {
      const res = await fetch(`/api/audits?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, scoreMin, scoreMax, sortBy, sortOrder]);

  useEffect(() => { fetchData(); syncUrl(); }, [fetchData, syncUrl]);

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
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.audits.map((a) => a.id)));
    }
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

  const audits = data?.audits ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <main className="content-container py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Audits</h1>
          {total > 0 && <p className="text-xs text-text-faint mt-1">{total} total</p>}
        </div>
        <Link
          href="/audits/new"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          + New Audit
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domains..."
            className="w-full pl-9 pr-3 py-2 bg-bg-elevated border border-border rounded-md text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                statusFilter.includes(status)
                  ? statusBorderActive(status)
                  : "border-border text-text-faint hover:border-border hover:text-text-muted"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Score range */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Score</span>
          <input
            type="number"
            value={scoreMin}
            onChange={(e) => { setScoreMin(e.target.value); setPage(1); }}
            placeholder="0"
            min={0}
            max={100}
            className="w-14 px-2 py-1.5 bg-bg-elevated border border-border rounded text-xs text-text text-center focus:outline-none focus:border-accent"
          />
          <span>–</span>
          <input
            type="number"
            value={scoreMax}
            onChange={(e) => { setScoreMax(e.target.value); setPage(1); }}
            placeholder="100"
            min={0}
            max={100}
            className="w-14 px-2 py-1.5 bg-bg-elevated border border-border rounded text-xs text-text text-center focus:outline-none focus:border-accent"
          />
        </div>

        {/* Page size */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="px-2 py-1.5 bg-bg-elevated border border-border rounded text-xs text-text-muted focus:outline-none focus:border-accent cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
      </div>

      {/* Selected count + bulk actions — fixed height to prevent layout shift */}
      <div className="h-8 mb-1 flex items-center gap-3">
        {selected.size > 0 && (
          <>
            <span className="text-xs text-accent">
              {selected.size} audit{selected.size > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="text-xs px-3 py-1 bg-danger/10 text-danger border border-danger/20 rounded-md hover:bg-danger/20 transition-colors cursor-pointer"
            >
              Delete Selected
            </button>
          </>
        )}
      </div>

      {/* Bulk delete confirmation modal */}
      <ConfirmDeleteModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title={`Delete ${selected.size} audit${selected.size > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All findings, events, and analysis data for the selected audits will be permanently deleted."
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
              setSelected(new Set());
              setDeleteModalOpen(false);
              fetchData();
            }
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-bg-elevated border-b border-border">
              <th className="w-10 px-3 py-3">
                <Checkbox checked={allSelected && audits.length > 0} onCheckedChange={toggleAll} />
              </th>
              <SortableHeader field="domain" label="Domain" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader field="status" label="Status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader field="overallScore" label="Score" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader field="platform" label="Platform" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
              <SortableHeader field="queuedAt" label="Date" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  <td className="px-3 py-3"><div className="w-4 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="w-32 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="w-16 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="w-12 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="w-16 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="w-16 h-4 bg-bg-subtle rounded animate-pulse" /></td>
                </tr>
              ))
            ) : audits.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <svg className="w-10 h-10 mx-auto mb-3 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm text-text-muted">
                    {debouncedSearch || statusFilter.length > 0 || scoreMin || scoreMax
                      ? "No audits match your filters"
                      : "No audits yet"}
                  </p>
                  {!debouncedSearch && statusFilter.length === 0 && (
                    <Link href="/audits/new" className="text-xs text-accent mt-2 inline-block">
                      Create your first audit →
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              audits.map((audit) => (
                <tr key={audit.id} className="border-b border-border-subtle hover:bg-bg-subtle/50 transition-colors">
                  <td className="px-3 py-3">
                    <Checkbox checked={selected.has(audit.id)} onCheckedChange={() => toggleOne(audit.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/audits/${audit.id}`} className="text-sm font-medium text-text hover:text-accent transition-colors">
                      {audit.domain}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={audit.status} />
                  </td>
                  <td className="px-4 py-3">
                    {audit.overallScore !== null ? (
                      <span className={`text-sm font-semibold ${scoreColor(audit.overallGrade)}`}>
                        {audit.overallScore}<span className="text-text-faint font-normal">/100</span>
                      </span>
                    ) : (
                      <span className="text-xs text-text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-text-muted capitalize">{audit.platform ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-faint" title={new Date(audit.queuedAt).toLocaleString()}>
                      {relativeTime(audit.queuedAt)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-text-faint">
            Showing {startItem}–{endItem} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="text-xs px-3 py-1.5 border border-border rounded-md text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="text-xs px-3 py-1.5 border border-border rounded-md text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function SortableHeader({
  field, label, sortBy, sortOrder, onSort, className = "",
}: {
  field: string; label: string; sortBy: string; sortOrder: string;
  onSort: (field: string) => void; className?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-left text-xs font-medium text-text-muted px-4 py-3 cursor-pointer hover:text-text select-none transition-colors ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {active && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            {sortOrder === "asc" ? (
              <path d="M6 2l4 5H2z" />
            ) : (
              <path d="M6 10l4-5H2z" />
            )}
          </svg>
        )}
      </span>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-warning/10 text-warning border-warning/20",
    RUNNING: "bg-info/10 text-info border-info/20",
    ANALYZING: "bg-info/10 text-info border-info/20",
    RENDERING: "bg-info/10 text-info border-info/20",
    COMPLETE: "bg-success/10 text-success border-success/20",
    FAILED: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles[status] ?? "bg-bg-subtle text-text-muted border-border"}`}>
      {status}
    </span>
  );
}

function statusBorderActive(status: string): string {
  const map: Record<string, string> = {
    PENDING: "border-warning/50 text-warning bg-warning/10",
    RUNNING: "border-info/50 text-info bg-info/10",
    ANALYZING: "border-info/50 text-info bg-info/10",
    COMPLETE: "border-success/50 text-success bg-success/10",
    FAILED: "border-danger/50 text-danger bg-danger/10",
  };
  return map[status] ?? "border-accent text-accent bg-accent/10";
}

function scoreColor(grade: string | null): string {
  if (grade === "pass") return "text-success";
  if (grade === "evaluate") return "text-warning";
  return "text-danger";
}

function Checkbox({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="h-4 w-4 shrink-0 rounded border border-border bg-bg-elevated data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors cursor-pointer flex items-center justify-center"
    >
      <CheckboxPrimitive.Indicator>
        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M2.5 6l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
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
