# Face + Fingerprint Attendance System

A web-based attendance system for student attendance tracking with face recognition, optional fingerprint verification, and an AI attendance assistant backed by Supabase.

## Features

- Face recognition attendance using `face-api.js`
- Optional fingerprint-based verification
- Student registration with student ID, full name, and major
- Login and signup flow
- Attendance dashboard for recent records
- AI attendance assistant through a Supabase Edge Function proxy
- Supabase backend with database policies

## Tech Stack

- Frontend: HTML, CSS, JavaScript (ES modules)
- Face Recognition: [face-api.js](https://github.com/justadudewhohacks/face-api.js)
- Backend: Supabase
- AI Proxy: Supabase Edge Functions + Hugging Face API

## Project Structure

```text
public/
  auth.js
  face.js
  fingerprint.js
  index.html
  llm.js
  script.js
  style.css
  supabase.js

supabase/
  functions/
    ai-proxy/
      index.ts

models/
schema.sql
GIT-CHEATSHEET.md
```

## Getting Started

1. Clone the repository:

```powershell
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

2. Install dependencies if needed:

```powershell
npm install
```

3. Set up Supabase:
- Create a project in Supabase.
- Open the SQL Editor.
- Run [`schema.sql`](./schema.sql) to create the required tables and policies.

4. Configure frontend Supabase access:
- Update [`public/supabase.js`](./public/supabase.js) with your Supabase project URL and anon key.
- Only use the Supabase `anon` key in frontend code.
- Never place a Supabase service role key in `public/` files.

5. Configure the AI proxy secret:
- Deploy the edge function in [`supabase/functions/ai-proxy/index.ts`](./supabase/functions/ai-proxy/index.ts)
- Set the Hugging Face token as a Supabase secret:

```powershell
supabase secrets set HF_TOKEN=your_token_here
supabase functions deploy ai-proxy --no-verify-jwt
```

6. Start or serve the frontend using your preferred local server.

## Secrets And Safety

- Do not commit real `.env` files.
- Do not commit API tokens or passwords.
- Keep secrets in platform-managed secrets such as Supabase secrets.
- The included [`.env.example`](./.env.example) contains placeholder values only.
- The included [`.gitignore`](./.gitignore) is set up to avoid pushing common local-only files.

## Notes

- `node_modules/` should not be committed.
- The `models/` folder is only needed if you decide to serve face-api model files locally.
- In the current frontend code, face-api models are loaded from a remote URL rather than from the local `models/` folder.

## Git Help

If you are still learning the Git workflow for this project, see [`GIT-CHEATSHEET.md`](./GIT-CHEATSHEET.md).

## Recommended Workflow

```powershell
git status
git pull origin main
git add public/index.html
git commit -m "Describe the change"
git push origin main
```
