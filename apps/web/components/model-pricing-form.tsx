"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type ModelPrice = {
  model: string;
  inputPerMTok: number;
  outputPerMTok: number;
  displayName: string | null;
  provider: string | null;
  notes: string | null;
};

type ApiResponse = {
  prices: ModelPrice[];
  missing: string[];
};

/**
 * Settings → Model Pricing.
 *
 * Editable table of per-model rates (USD per 1M tokens). Each row saves
 * independently. Models from recent audits without a price row appear at
 * the top as a "needs configuration" banner with a one-click add link.
 */
export function ModelPricingForm() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState<string | null>(null); // when set, the add form is prefilled with this model

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/model-prices");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData({ prices: Array.isArray(json.prices) ? json.prices : [], missing: Array.isArray(json.missing) ? json.missing : [] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function deleteRow(model: string) {
    if (!confirm(`Delete pricing for "${model}"?`)) return;
    try {
      const res = await fetch(`/api/settings/model-prices/${encodeURIComponent(model)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Removed ${model}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading && !data) {
    return (
      <div className="border border-border rounded-md bg-bg-elevated/40 p-12 text-center text-text-muted text-sm">
        <div className="animate-pulse font-mono text-[11px] tracking-wider uppercase">Loading prices…</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="border border-danger/30 bg-danger/[0.05] rounded-md p-6 text-sm text-danger">
        Failed to load prices: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.missing.length > 0 && (
        <div className="border border-warning/30 bg-warning/[0.05] rounded-md p-4">
          <div className="text-xs uppercase tracking-wider font-mono text-warning mb-2">
            {data.missing.length} model{data.missing.length > 1 ? "s" : ""} used in recent audits without a price set
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.missing.map((m) => (
              <button
                key={m}
                onClick={() => setAddingModel(m)}
                className="text-xs px-2 py-1 bg-bg border border-warning/30 text-warning hover:bg-warning/10 rounded-sm font-mono cursor-pointer transition-colors"
              >
                + {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.prices.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden bg-bg-elevated/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-subtle/40">
                <th className="text-left px-4 py-2.5"><span className="eyebrow">Model</span></th>
                <th className="text-left px-3 py-2.5"><span className="eyebrow">Provider</span></th>
                <th className="text-right px-3 py-2.5"><span className="eyebrow">Input $ / MTok</span></th>
                <th className="text-right px-3 py-2.5"><span className="eyebrow">Output $ / MTok</span></th>
                <th className="text-left px-3 py-2.5"><span className="eyebrow">Notes</span></th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.prices.map((row) => (
                <PriceRow key={row.model} row={row} onSaved={refresh} onDelete={() => deleteRow(row.model)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddPriceForm
        seedModel={addingModel ?? data.missing[0] ?? ""}
        existingModels={new Set(data.prices.map((p) => p.model))}
        onCreated={() => {
          setAddingModel(null);
          void refresh();
        }}
      />
    </div>
  );
}

function PriceRow({ row, onSaved, onDelete }: { row: ModelPrice; onSaved: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState<ModelPrice>(row);
  const [saving, setSaving] = useState(false);
  const dirty =
    draft.inputPerMTok !== row.inputPerMTok ||
    draft.outputPerMTok !== row.outputPerMTok ||
    (draft.displayName ?? "") !== (row.displayName ?? "") ||
    (draft.provider ?? "") !== (row.provider ?? "") ||
    (draft.notes ?? "") !== (row.notes ?? "");

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/model-prices/${encodeURIComponent(row.model)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputPerMTok: draft.inputPerMTok,
          outputPerMTok: draft.outputPerMTok,
          displayName: draft.displayName || null,
          provider: draft.provider || null,
          notes: draft.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Saved ${row.model}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-border-subtle last:border-0 hover:bg-bg-subtle/30 transition-colors">
      <td className="px-4 py-2.5">
        <div className="font-mono text-xs text-text break-all">{row.model}</div>
        <input
          type="text"
          value={draft.displayName ?? ""}
          onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          placeholder="Display name (optional)"
          className="mt-1 w-full bg-transparent border-b border-transparent focus:border-accent/50 text-[11px] text-text-faint placeholder:text-text-faint/40 focus:outline-none focus-visible:outline-none!"
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={draft.provider ?? ""}
          onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
          placeholder="—"
          className="w-20 bg-transparent border border-border focus:border-accent rounded-sm px-2 py-1 text-xs font-mono text-text-muted focus:outline-none focus-visible:outline-none!"
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <input
          type="number"
          step="0.001"
          min="0"
          value={draft.inputPerMTok}
          onChange={(e) => setDraft({ ...draft, inputPerMTok: parseFloat(e.target.value) || 0 })}
          className="w-24 bg-transparent border border-border focus:border-accent rounded-sm px-2 py-1 text-xs font-mono tnum text-right focus:outline-none focus-visible:outline-none!"
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <input
          type="number"
          step="0.001"
          min="0"
          value={draft.outputPerMTok}
          onChange={(e) => setDraft({ ...draft, outputPerMTok: parseFloat(e.target.value) || 0 })}
          className="w-24 bg-transparent border border-border focus:border-accent rounded-sm px-2 py-1 text-xs font-mono tnum text-right focus:outline-none focus-visible:outline-none!"
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="—"
          className="w-full bg-transparent border border-border focus:border-accent rounded-sm px-2 py-1 text-xs text-text-muted focus:outline-none focus-visible:outline-none!"
        />
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-[11px] px-2 py-1 bg-accent hover:bg-accent-hover disabled:bg-bg-subtle disabled:text-text-faint text-accent-ink font-medium rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={onDelete}
          className="ml-1 text-[11px] px-2 py-1 text-text-faint hover:text-danger transition-colors cursor-pointer"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function AddPriceForm({
  seedModel,
  existingModels,
  onCreated,
}: {
  seedModel: string;
  existingModels: Set<string>;
  onCreated: () => void;
}) {
  const [model, setModel] = useState(seedModel);
  const [inputPerMTok, setInputPerMTok] = useState("");
  const [outputPerMTok, setOutputPerMTok] = useState("");
  const [provider, setProvider] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModel(seedModel);
  }, [seedModel]);

  const valid =
    model.trim().length > 0 &&
    !existingModels.has(model.trim()) &&
    parseFloat(inputPerMTok) >= 0 &&
    parseFloat(outputPerMTok) >= 0 &&
    inputPerMTok !== "" &&
    outputPerMTok !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/model-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.trim(),
          inputPerMTok: parseFloat(inputPerMTok),
          outputPerMTok: parseFloat(outputPerMTok),
          provider: provider.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Added ${model}`);
      setModel("");
      setInputPerMTok("");
      setOutputPerMTok("");
      setProvider("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-md bg-bg-elevated/40 p-4"
    >
      <div className="eyebrow mb-3">Add model price</div>
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-end">
        <Field
          label="Model"
          value={model}
          onChange={setModel}
          placeholder="e.g. google/gemini-3-flash-preview"
          mono
        />
        <Field
          label="Input $ / MTok"
          value={inputPerMTok}
          onChange={setInputPerMTok}
          placeholder="0.10"
          type="number"
        />
        <Field
          label="Output $ / MTok"
          value={outputPerMTok}
          onChange={setOutputPerMTok}
          placeholder="0.40"
          type="number"
        />
        <Field
          label="Provider"
          value={provider}
          onChange={setProvider}
          placeholder="google"
        />
        <button
          type="submit"
          disabled={!valid || saving}
          className="h-9 text-xs font-semibold px-4 bg-accent hover:bg-accent-hover disabled:bg-bg-subtle disabled:text-text-faint text-accent-ink rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {existingModels.has(model.trim()) && model.trim().length > 0 && (
        <p className="text-[10px] text-text-faint mt-2">
          A row for <span className="font-mono">{model.trim()}</span> already exists — edit it above instead.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-wider uppercase text-text-faint mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={type === "number" ? "0.001" : undefined}
        min={type === "number" ? "0" : undefined}
        className={`w-full h-9 bg-bg border border-border rounded-sm px-2 text-xs ${mono ? "font-mono" : ""} text-text placeholder:text-text-faint/60 focus:border-accent focus:outline-none focus-visible:outline-none!`}
      />
    </label>
  );
}
