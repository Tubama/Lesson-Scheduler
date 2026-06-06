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
- Admin sign-in for reading and updating real Supabase requests

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

The schema adds:

- `registration_requests`
- `waitlist_entries`
- `studio_admins`
- Row level security policies for public inserts
- Authenticated admin read/update policies

The starter admin email is `moorejacob22@yahoo.com`. Create a Supabase Auth user with that email, or update `studio_admins` to match the email you want to use for admin login.

## Planned next steps

- Add a real schedule builder
- Add Google Calendar sync for approved recurring lessons
- Add email confirmations
- Deploy through Vercel
