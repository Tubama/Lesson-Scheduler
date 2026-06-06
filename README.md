# Lesson Scheduler

A prototype web app for yearly and summer music lesson placement.

## Current scope

- Returning student registration with private access-code placeholder
- School year and summer schedule modes
- Location-based availability for Vacaville and Davis
- 30, 45, and 60 minute lesson choices with displayed prices
- First, second, and third choice requests
- Pending approval workflow preview
- New student waitlist and 4-lesson trial process
- Admin preview for pending, approved, trial, and waitlist records

## Run locally

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example` and add your Supabase project URL and publishable key.

Run the app:

```bash
npm run dev
```

Then visit:

```text
http://localhost:3000
```

## Supabase setup

Run `supabase/schema.sql` in the Supabase SQL editor before testing real form submissions.

## Planned next steps

- Add admin login
- Add Google Calendar sync for approved recurring lessons
- Add email confirmations
- Deploy through Vercel
