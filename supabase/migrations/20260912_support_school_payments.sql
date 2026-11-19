-- ================================================================
-- Migration : Suivi des Paiements et Rémunérations (Centre de Soutien)
-- Date : 2026-09-12
-- ================================================================

-- 1. Ajout des champs de rémunération sur la table des utilisateurs (Enseignants)
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('hourly', 'percentage')) DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage_rate numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS billing_notes text;

-- 2. Table des paiements élèves (Frais de cours de soutien)
CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billing_period text NOT NULL, -- Ex: '2026-09' pour Septembre 2026
  amount_due numeric(10, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(10, 2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
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

-- 3. Table des paiements et rémunérations enseignants
CREATE TABLE IF NOT EXISTS public.professor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billing_period text NOT NULL, -- Ex: '2026-09'
  payment_type text NOT NULL CHECK (payment_type IN ('hourly', 'percentage')),
  rate_applied numeric(10, 2) NOT NULL DEFAULT 0,
  base_calculation jsonb NOT NULL DEFAULT '{}'::jsonb, -- Détail traçable (séances, heures, élèves payeurs)
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

-- 4. Sécurité Row Level Security (RLS)
ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_payments ENABLE ROW LEVEL SECURITY;

-- Politiques student_payments
DROP POLICY IF EXISTS "Admins full access to student_payments" ON public.student_payments;
CREATE POLICY "Admins full access to student_payments"
  ON public.student_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Students view own payments" ON public.student_payments;
CREATE POLICY "Students view own payments"
  ON public.student_payments
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
  );

-- Politiques professor_payments
DROP POLICY IF EXISTS "Admins full access to professor_payments" ON public.professor_payments;
CREATE POLICY "Admins full access to professor_payments"
  ON public.professor_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Professors view own payments" ON public.professor_payments;
CREATE POLICY "Professors view own payments"
  ON public.professor_payments
  FOR SELECT
  TO authenticated
  USING (
    professor_id = auth.uid()
  );
