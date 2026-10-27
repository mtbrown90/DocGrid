"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

const FIELD =
  "w-full rounded-md border border-black/20 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/25";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <div className="mx-auto mt-16 w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form action={formAction} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input name="email" type="email" required autoComplete="email" className={FIELD} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD}
          />
        </label>
        {state?.error && (
          <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
