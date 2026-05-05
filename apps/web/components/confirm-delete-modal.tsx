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
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-bg-elevated border border-border rounded-xl p-6 shadow-2xl">
          <Dialog.Title className="font-display text-lg font-semibold text-text">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-text-muted mt-2">
            {description}
          </Dialog.Description>

          <div className="mt-4">
            <label className="block text-xs text-text-faint mb-1.5">
              Type <span className="font-mono text-danger font-semibold">{confirmPhrase}</span> to confirm
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 mt-5">
            <Dialog.Close asChild>
              <button className="text-sm px-4 py-2 text-text-muted hover:text-text border border-border rounded-md transition-colors cursor-pointer">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => { onConfirm(); setInput(""); }}
              disabled={!matches || loading}
              className="text-sm px-4 py-2 bg-danger hover:bg-danger/90 disabled:bg-danger/30 text-white rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
