"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-lg border border-red-300 p-6 dark:border-red-800">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm">{error.message}</p>
      <p className="text-xs opacity-60">
        If this mentions a missing table, run supabase/migrations/0001_init.sql in the Supabase SQL
        editor.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
      >
        Try again
      </button>
    </div>
  );
}
