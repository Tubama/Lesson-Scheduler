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

Open `index.html` in a browser, or run a simple local server:

```bash
python3 -m http.server 5188
```

Then visit:

```text
http://localhost:5188
```

## Planned next steps

- Convert to Next.js when the workflow is approved
- Add Supabase database and admin login
- Add Google Calendar sync for approved recurring lessons
- Add email confirmations
- Deploy through Vercel
