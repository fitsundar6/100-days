-- ============================================================
-- ALPHA X GYM — PUBLIC CHALLENGE & WORKOUT TRACKING SYSTEM
-- Complete PostgreSQL Database Schema for Supabase
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. TABLE: challenges
-- Stores all gym challenges (e.g. 100-Day Challenge, 30-Day Shred)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL DEFAULT 100,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by status and start date
CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_start_date ON public.challenges(start_date);

-- ------------------------------------------------------------
-- 2. TABLE: participants
-- Stores athletes who join public challenges via shared link
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  starting_weight NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_phone ON public.participants(phone);

-- ------------------------------------------------------------
-- 3. TABLE: challenge_participants
-- Junction table linking participants to challenges
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
  CONSTRAINT uq_challenge_participant UNIQUE (challenge_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_challenge ON public.challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_cp_participant ON public.challenge_participants(participant_id);

-- ------------------------------------------------------------
-- 4. TABLE: challenge_days
-- Stores the specific workout theme/title for each challenge day
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number >= 1),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_challenge_day_num UNIQUE (challenge_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_cd_challenge_day ON public.challenge_days(challenge_id, day_number);

-- ------------------------------------------------------------
-- 5. TABLE: exercises
-- Master exercise database library (customizable by Admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instructions TEXT,
  image_url TEXT,
  video_url TEXT,
  category TEXT DEFAULT 'Full Body',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. TABLE: challenge_day_exercises
-- Workout builder: Links exercises to specific challenge days
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_day_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_day_id UUID NOT NULL REFERENCES public.challenge_days(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  exercise_order INTEGER NOT NULL DEFAULT 1,
  target_type TEXT NOT NULL DEFAULT 'reps' CHECK (target_type IN ('reps', 'seconds', 'minutes')),
  target_value INTEGER NOT NULL DEFAULT 10,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cde_day_order ON public.challenge_day_exercises(challenge_day_id, exercise_order);

-- ------------------------------------------------------------
-- 7. TABLE: workout_sessions
-- Logs every workout session from start to finish
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  challenge_day_id UUID REFERENCES public.challenge_days(id) ON DELETE SET NULL,
  day_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index ensuring ONE completed session per participant per challenge day
CREATE UNIQUE INDEX IF NOT EXISTS uq_completed_workout_session 
  ON public.workout_sessions (challenge_id, participant_id, day_number) 
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_ws_challenge_day ON public.workout_sessions(challenge_id, day_number);
CREATE INDEX IF NOT EXISTS idx_ws_participant ON public.workout_sessions(participant_id);
CREATE INDEX IF NOT EXISTS idx_ws_status ON public.workout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ws_started_at ON public.workout_sessions(started_at DESC);

-- ------------------------------------------------------------
-- 8. TABLE: exercise_completions
-- Logs completion of individual exercises inside a session
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercise_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_session_exercise UNIQUE (workout_session_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_ec_session ON public.exercise_completions(workout_session_id);

-- ============================================================
-- 9. TRIGGER: Auto-calculate Workout Duration in Seconds
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_workout_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  -- If finished_at is set, compute exact duration from raw timestamps
  IF NEW.finished_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at))));
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_workout_duration ON public.workout_sessions;
CREATE TRIGGER trg_calculate_workout_duration
BEFORE INSERT OR UPDATE ON public.workout_sessions
FOR EACH ROW
EXECUTE FUNCTION public.calculate_workout_session_duration();

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_day_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_completions ENABLE ROW LEVEL SECURITY;

-- Anonymous / Public access policies for public participation
CREATE POLICY "Allow public read challenges" ON public.challenges FOR SELECT USING (true);
CREATE POLICY "Allow public insert challenges" ON public.challenges FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update challenges" ON public.challenges FOR UPDATE USING (true);
CREATE POLICY "Allow public delete challenges" ON public.challenges FOR DELETE USING (true);

CREATE POLICY "Allow public read challenge_days" ON public.challenge_days FOR SELECT USING (true);
CREATE POLICY "Allow public insert challenge_days" ON public.challenge_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update challenge_days" ON public.challenge_days FOR UPDATE USING (true);
CREATE POLICY "Allow public delete challenge_days" ON public.challenge_days FOR DELETE USING (true);

CREATE POLICY "Allow public read exercises" ON public.exercises FOR SELECT USING (true);
CREATE POLICY "Allow public insert exercises" ON public.exercises FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update exercises" ON public.exercises FOR UPDATE USING (true);
CREATE POLICY "Allow public delete exercises" ON public.exercises FOR DELETE USING (true);

CREATE POLICY "Allow public read challenge_day_exercises" ON public.challenge_day_exercises FOR SELECT USING (true);
CREATE POLICY "Allow public insert challenge_day_exercises" ON public.challenge_day_exercises FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update challenge_day_exercises" ON public.challenge_day_exercises FOR UPDATE USING (true);
CREATE POLICY "Allow public delete challenge_day_exercises" ON public.challenge_day_exercises FOR DELETE USING (true);

CREATE POLICY "Allow public read participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Allow public insert participants" ON public.participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update participants" ON public.participants FOR UPDATE USING (true);

CREATE POLICY "Allow public read challenge_participants" ON public.challenge_participants FOR SELECT USING (true);
CREATE POLICY "Allow public insert challenge_participants" ON public.challenge_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update challenge_participants" ON public.challenge_participants FOR UPDATE USING (true);

CREATE POLICY "Allow public read workout_sessions" ON public.workout_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert workout_sessions" ON public.workout_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update workout_sessions" ON public.workout_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public read exercise_completions" ON public.exercise_completions FOR SELECT USING (true);
CREATE POLICY "Allow public insert exercise_completions" ON public.exercise_completions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update exercise_completions" ON public.exercise_completions FOR UPDATE USING (true);

-- ============================================================
-- 11. DEFAULT SEED DATA (EXERCISES & 100-DAY CHALLENGE)
-- ============================================================

-- Insert default exercise library
INSERT INTO public.exercises (name, instructions, category) VALUES
  ('Push-Ups', 'Keep elbows at 45 degrees, core tight, and chest touches ground.', 'Chest / Arms'),
  ('Bodyweight Squats', 'Feet shoulder-width apart, knees track over toes, drop hips below parallel.', 'Legs / Quads'),
  ('Mountain Climbers', 'High plank position, drive knees to chest rhythmically.', 'Core / Cardio'),
  ('Plank', 'Forearms on floor, maintain straight line from head to heels.', 'Core / Stability'),
  ('Burpees', 'Drop to chest, kick feet in, explode upward with overhead clap.', 'Full Body / HIIT'),
  ('Jumping Jacks', 'Full arm extension overhead with rhythmic jumping.', 'Cardio / Warmup'),
  ('Lunges', 'Step forward, lower rear knee to 1 inch above floor, alternate legs.', 'Legs / Glutes'),
  ('Crunches', 'Contract abs, lift shoulder blades off ground, control the descent.', 'Core / Abs'),
  ('High Knees', 'Run in place bringing knees to hip height explosively.', 'Cardio / Agility'),
  ('Glute Bridges', 'Drive through heels, squeeze glutes at the top for 1 second.', 'Glutes / Posterior')
ON CONFLICT DO NOTHING;

-- Insert sample Alpha X 100-Day Challenge
DO $$
DECLARE
  v_challenge_id UUID;
  v_day1_id UUID;
  v_pushups_id UUID;
  v_squats_id UUID;
  v_climbers_id UUID;
  v_plank_id UUID;
  v_burpees_id UUID;
BEGIN
  -- Create or get challenge
  SELECT id INTO v_challenge_id FROM public.challenges WHERE title = 'Alpha X 100-Day Challenge' LIMIT 1;
  IF v_challenge_id IS NULL THEN
    INSERT INTO public.challenges (title, description, start_date, end_date, total_days, status)
    VALUES (
      'Alpha X 100-Day Challenge',
      'The ultimate 100-day discipline transformation challenge. Daily workout accountability, body composition progression, and athlete performance tracking.',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '99 days',
      100,
      'active'
    ) RETURNING id INTO v_challenge_id;
  END IF;

  -- Create Day 1
  SELECT id INTO v_day1_id FROM public.challenge_days WHERE challenge_id = v_challenge_id AND day_number = 1 LIMIT 1;
  IF v_day1_id IS NULL THEN
    INSERT INTO public.challenge_days (challenge_id, day_number, title, description)
    VALUES (
      v_challenge_id,
      1,
      'Day 1 — Foundation & Core Ignition',
      'Kick off your 100-day transformation with bodyweight muscular endurance and core stability.'
    ) RETURNING id INTO v_day1_id;
  END IF;

  -- Get exercise IDs
  SELECT id INTO v_pushups_id FROM public.exercises WHERE name = 'Push-Ups' LIMIT 1;
  SELECT id INTO v_squats_id FROM public.exercises WHERE name = 'Bodyweight Squats' LIMIT 1;
  SELECT id INTO v_climbers_id FROM public.exercises WHERE name = 'Mountain Climbers' LIMIT 1;
  SELECT id INTO v_plank_id FROM public.exercises WHERE name = 'Plank' LIMIT 1;
  SELECT id INTO v_burpees_id FROM public.exercises WHERE name = 'Burpees' LIMIT 1;

  -- Attach exercises to Day 1
  IF NOT EXISTS (SELECT 1 FROM public.challenge_day_exercises WHERE challenge_day_id = v_day1_id) THEN
    INSERT INTO public.challenge_day_exercises (challenge_day_id, exercise_id, exercise_order, target_type, target_value, required) VALUES
      (v_day1_id, v_pushups_id, 1, 'reps', 20, TRUE),
      (v_day1_id, v_squats_id, 2, 'reps', 30, TRUE),
      (v_day1_id, v_climbers_id, 3, 'seconds', 30, TRUE),
      (v_day1_id, v_plank_id, 4, 'seconds', 45, TRUE),
      (v_day1_id, v_burpees_id, 5, 'reps', 10, TRUE);
  END IF;
END $$;
