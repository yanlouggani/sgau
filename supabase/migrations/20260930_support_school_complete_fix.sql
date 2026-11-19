-- ==============================================================================
-- FIX SQL GLOBAL : CENTRE DE SOUTIEN SCOLAIRE (SGAU)
-- À exécuter dans le SQL Editor de Supabase
-- Inclut :
-- 1. Rôle 'secretary' et colonnes de profil (taux profs, contact parents)
-- 2. Tarifs par séance & forfaits mensuels sur les matières (modules)
-- 3. Séances sans enseignant obligatoire (professorid nullable)
-- 4. Tables de gestion des paiements élèves & rémunérations enseignants
-- 5. Politiques de sécurité (RLS) incluant l'admin et la secrétaire
-- ==============================================================================

-- 1. MISE À JOUR DE LA TABLE USERS
-- ------------------------------------------------------------------------------
-- Mise à jour de la contrainte CHECK sur le rôle pour inclure 'secretary'
DO $$
BEGIN
  -- Supprime l'ancienne contrainte si elle existe
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  -- Ajoute la nouvelle contrainte incluant 'secretary'
  ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'secretary', 'professor', 'student'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Ajout des colonnes pour la rémunération prof et le contact parents
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('hourly', 'percentage')) DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage_rate numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS billing_notes text;


-- 2. TARIFICATION ET NIVEAUX SUR LES MATIÈRES (MODULES)
-- ------------------------------------------------------------------------------
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS price_per_session numeric(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS level_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;


-- 3. ASSOUPLISSEMENT POUR LES SÉANCES SANS ENSEIGNANT OBLIGATOIRE
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Rendre professorid optionnel dans session_masters
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'session_masters' AND column_name = 'professorid'
  ) THEN
    ALTER TABLE public.session_masters ALTER COLUMN professorid DROP NOT NULL;
  END IF;

  -- Rendre professorId optionnel dans sessions si présent
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'professorId'
  ) THEN
    ALTER TABLE public.sessions ALTER COLUMN "professorId" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'professorid'
  ) THEN
    ALTER TABLE public.sessions ALTER COLUMN professorid DROP NOT NULL;
  END IF;
END $$;


-- 4. TABLE DES PAIEMENTS ÉLÈVES (FRAIS DE COURS DE SOUTIEN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billing_period text NOT NULL, -- Format 'AAAA-MM', ex: '2026-09'
  amount_due numeric(10, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(10, 2) NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_at timestamptz,
  payment_method text CHECK (payment_method IN ('cash', 'transfer', 'check')) DEFAULT 'cash',
  status text CHECK (status IN ('paid', 'partial', 'late', 'unpaid')) NOT NULL DEFAULT 'unpaid',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_student_payments_student_id ON public.student_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_period ON public.student_payments(billing_period);
CREATE INDEX IF NOT EXISTS idx_student_payments_status ON public.student_payments(status);


-- 5. TABLE DES RÉMUNÉRATIONS ET HONORAIRES ENSEIGNANTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billing_period text NOT NULL, -- Format 'AAAA-MM'
  payment_type text NOT NULL CHECK (payment_type IN ('hourly', 'percentage')),
  rate_applied numeric(10, 2) NOT NULL DEFAULT 0,
  base_calculation jsonb NOT NULL DEFAULT '{}'::jsonb, -- Séances détaillées, volume d'heures, élèves cotisants
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  status text CHECK (status IN ('draft', 'validated', 'paid')) NOT NULL DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_professor_payments_prof_id ON public.professor_payments(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_payments_period ON public.professor_payments(billing_period);
CREATE INDEX IF NOT EXISTS idx_professor_payments_status ON public.professor_payments(status);


-- 6. POLITIQUES DE SÉCURITÉ RLS (ADMIN + SECRÉTAIRE + UTILISATEURS CONCERNÉS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_payments ENABLE ROW LEVEL SECURITY;

-- Politiques student_payments :
DROP POLICY IF EXISTS "Admins full access to student_payments" ON public.student_payments;
DROP POLICY IF EXISTS "Admins and Secs full access to student_payments" ON public.student_payments;

CREATE POLICY "Admins and Secs full access to student_payments"
  ON public.student_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary'))
  );

DROP POLICY IF EXISTS "Students view own payments" ON public.student_payments;
CREATE POLICY "Students view own payments"
  ON public.student_payments
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
  );

-- Politiques professor_payments :
DROP POLICY IF EXISTS "Admins full access to professor_payments" ON public.professor_payments;
DROP POLICY IF EXISTS "Admins and Secs full access to professor_payments" ON public.professor_payments;

CREATE POLICY "Admins and Secs full access to professor_payments"
  ON public.professor_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary'))
  );

DROP POLICY IF EXISTS "Professors view own payments" ON public.professor_payments;
CREATE POLICY "Professors view own payments"
  ON public.professor_payments
  FOR SELECT
  TO authenticated
  USING (
    professor_id = auth.uid()
  );

-- Accès secrétaire étendu aux autres tables si RLS activée
DO $$
BEGIN
  -- Permettre à la secrétaire de lire et gérer les présences
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendances' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Secretary manage attendances" ON public.attendances;
    CREATE POLICY "Secretary manage attendances"
      ON public.attendances
      FOR ALL
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary')));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'session_attendance' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Secretary manage session_attendance" ON public.session_attendance;
    CREATE POLICY "Secretary manage session_attendance"
      ON public.session_attendance
      FOR ALL
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'secretary')));
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
