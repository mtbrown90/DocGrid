"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export const FIELD =
  "w-full rounded-md border border-black/20 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/25";
export const BTN_PRIMARY =
  "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40";
export const BTN_GHOST =
  "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10";
export const BTN_DANGER =
  "rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950";

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
      {message}
    </p>
  );
}

export function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{text}</span>
      {children}
    </label>
  );
}

/** Runs a server action, tracking pending state and surfacing its error. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return { pending, error, setError, run };
}

export function Modal({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onSubmit={onSubmit}
        className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
      >
        <h2 id="modal-title" className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </form>
    </div>
  );
}
