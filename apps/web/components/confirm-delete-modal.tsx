"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function ConfirmDeleteModal({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The exact text the user must type to confirm. */
  confirmPhrase: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [input, setInput] = useState("");
  const matches = input === confirmPhrase;

  function handleOpenChange(next: boolean) {
    if (!next) setInput("");
    onOpenChange(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 anim-overlay" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,30rem)] bg-bg-elevated border border-border rounded-md p-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden anim-dialog"
        >
          {/* Top hairline with bracket markers */}
          <div className="flex items-center gap-2 px-6 pt-5 pb-2">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-danger">
              [ CONFIRM DELETION ]
            </span>
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-text-faint">
              IRREVERSIBLE
            </span>
          </div>

          <div className="px-6 pb-6">
            <Dialog.Title className="font-display text-2xl font-semibold tracking-tight text-text mt-3">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-3 leading-relaxed">
              {description}
            </Dialog.Description>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (matches && !loading) {
                  onConfirm();
                  setInput("");
                }
              }}
            >
              <div className="mt-6">
                <label className="block eyebrow mb-2">
                  Type{" "}
                  <span className="font-mono text-danger font-semibold normal-case tracking-normal text-[11px]">
                    {confirmPhrase}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={confirmPhrase}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-bg border border-border rounded-sm text-sm font-mono text-text placeholder:text-text-faint/60 focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger/40 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
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
                  disabled={!matches || loading}
                  className="text-sm px-4 py-2 bg-danger hover:bg-danger/90 disabled:bg-danger/20 disabled:text-text-faint text-white font-medium rounded-sm transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Deleting…
                    </>
                  ) : (
                    "Delete"
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
