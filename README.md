# DocGrid

Internal tool for scheduling doctors: clinic shifts, on-call coverage and time off. Staff sign in, see a weekly grid of every doctor, and add or edit shifts. The database rejects double-booking a doctor.

**This app never stores patient data**, only doctor names, specialties and shift times.

Stack: Next.js (App Router) · Supabase (Postgres + Auth) · Tailwind · Vercel.

## Setup

1. **Supabase.** Create a new project (not BinderBuddy's). In the SQL editor, run `supabase/migrations/0001_init.sql`.
2. **Auth.** In Supabase → Authentication → Sign In / Providers, turn **off** "Allow new users to sign up". Add staff under Authentication → Users → Add user. Row Level Security treats any signed-in user as trusted staff.
3. **Env.** Copy `.env.local.example` to `.env.local` and fill in the project URL and anon key (Project Settings → API).
4. **Run.** `npm install`, then `npm run dev`.

## Layout

- `src/app/actions.ts`: server actions (all writes) and sign in/out
- `src/lib/data.ts`: server-side reads
- `src/lib/supabase/`: browser, server and proxy clients
- `src/proxy.ts`: redirects signed-out visitors to `/login`
- `supabase/migrations/`: numbered SQL migrations, run in order
