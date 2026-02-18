# Face + Fingerprint Attendance System

A web-based attendance system using face recognition, fingerprint support, and Supabase as the backend.

## Features

- Face Recognition Attendance using `face-api.js`
- Optional Fingerprint support
- Student registration (ID, Name, Major)
- Multiple face descriptors per user
- Duplicate face prevention
- Daily attendance limit (1 per day)
- Attendance dashboard
- Row-Level Security (RLS) via Supabase
- Auth integration (login/signup/logout)

## Tech Stack

- Frontend: HTML, CSS, JavaScript (ES Modules)
- Face Recognition: [face-api.js](https://github.com/justadudewhohacks/face-api.js)
- Backend: Supabase (PostgreSQL)
- Optional: Fingerprint module

## Supabase Setup

1. Create a project at [Supabase](https://app.supabase.io)
2. Enable the SQL Editor and run `schema.sql` to create tables and policies
3. Get your Supabase URL and anon/public key
4. Update `supabase.js` in your frontend project:

## File Structure



```js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://YOUR-PROJECT.supabase.co",
  "YOUR_ANON_PUBLIC_KEY"
);
