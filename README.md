# Lesson Scheduler

A prototype web app for yearly and summer music lesson placement.

## Current scope

- Returning student registration with admin-managed access-code gate
- Admin-managed registration open/closed switch
- School year and summer schedule modes
- Location-based availability for Vacaville and Davis
- 30, 45, and 60 minute lesson choices with displayed prices
- Student birthdate and emergency contact collection
- Studio policy acknowledgment with typed parent/guardian name
- First, second, and third choice requests
- Duplicate active request prevention for the same student and email
- Pending approval workflow preview
- New student waitlist and 4-lesson trial process
- Admin sign-in for reading and updating real Supabase requests
- Admin search across student, parent, email, notes, and request details
- Admin tab counts for pending, approved, trial, and waitlist requests
- Submitted timestamps on admin request cards
- Admin schedule activity board for approved, pending, trial, and waitlist students
- Approved schedule summary grouped by term, location, day, and time
- CSV export for approved recurring placements
- CSV export for visible admin request lists
- Admin email draft links for parent follow-up
- Admin schedule builder for recurring weekly teaching blocks
- Admin move tool for rearranging pending or approved recurring times
- Confirmation before deleting custom teaching blocks

## Scheduling model

The app stores teaching blocks, not fixed lesson slots. Parent start-time options are generated on a 15-minute grid and filtered by the selected lesson length:

- 30-minute lessons can shift into 15-minute openings around existing holds
- 45-minute lessons can start on compatible 15-minute boundaries
- 60-minute lessons can shift when shorter or longer held lessons create openings

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
Run it again whenever schedule-hold policies or indexes change; admin approval and move actions depend on the latest `schedule_holds` policies.

The schema adds:

- `registration_requests`
- `waitlist_entries`
- `studio_admins`
- `schedule_rules`
- `schedule_holds`
- Row level security policies for public inserts
- Public schedule-rule reads
- Public privacy-safe hold reads
- Authenticated admin read/update/create policies for schedule management

The starter admin email is `moorejacob22@yahoo.com`. Create a Supabase Auth user with that email, or update `studio_admins` to match the email you want to use for admin login.

## Registration release code

Returning-family requests are checked by the Supabase `validate_returning_access_code` function.
Signed-in admins can change the current code and open or close registration from the admin dashboard.
`NEXT_PUBLIC_RETURNING_ACCESS_CODE` is only used as a local fallback before the Supabase setting is installed.

## Planned next steps

- Add Google Calendar sync for approved recurring lessons
- Add email confirmations
- Deploy through Vercel
