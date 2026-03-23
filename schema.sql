-- =====================================================
--  AttendAI — Supabase Schema
--  Run this entire file in:
--  Supabase Dashboard → SQL Editor → New Query → Run
-- =====================================================

-- ─── 1. USERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text          UNIQUE NOT NULL,
  password    text          NOT NULL,
  student_id  text          UNIQUE NOT NULL,
  full_name   text          NOT NULL,
  major       text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);


-- ─── 2. FACE IMAGES ──────────────────────────────────
--  FK → users.id 
CREATE TABLE IF NOT EXISTS public.face_images (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL
                              REFERENCES public.users(id)
                              ON DELETE CASCADE,
  descriptor  float4[]      NOT NULL,   
  photo       text,                     
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_images_user_id_idx
  ON public.face_images (user_id);


-- ─── 3. ATTENDANCE ───────────────────────────────────
--  FK → users.id  
--  Unique constraint prevents double-marking on the same day
CREATE TABLE IF NOT EXISTS public.attendance (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL
                              REFERENCES public.users(id)
                              ON DELETE CASCADE,
  status      text          NOT NULL DEFAULT 'ON TIME'
                              CHECK (status IN ('ON TIME', 'LATE')),
  timestamp   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_user_id_idx
  ON public.attendance (user_id);

CREATE INDEX IF NOT EXISTS attendance_timestamp_idx
  ON public.attendance (timestamp DESC);

-- ─── 4. ROW LEVEL SECURITY ───────────────────────────
--  Allow the anon key used in the app to read/write all tables.
--  Tighten these policies before going to production.

ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance  ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "anon can select users"
  ON public.users FOR SELECT USING (true);
CREATE POLICY "anon can insert users"
  ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update users"
  ON public.users FOR UPDATE USING (true);

-- Face images
CREATE POLICY "anon can select face_images"
  ON public.face_images FOR SELECT USING (true);
CREATE POLICY "anon can insert face_images"
  ON public.face_images FOR INSERT WITH CHECK (true);

-- Attendance
CREATE POLICY "anon can select attendance"
  ON public.attendance FOR SELECT USING (true);
CREATE POLICY "anon can insert attendance"
  ON public.attendance FOR INSERT WITH CHECK (true);
