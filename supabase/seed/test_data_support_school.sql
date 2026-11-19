-- ==============================================================================
-- INJECTION DE DONNÉES DE TEST RÉALISTES — ÉCOLE DE SOUTIEN SCOLAIRE (SGAU)
-- Données : Élèves avec contacts parents, impayés en retard, profs à payer, 
--           matières avec tarifs, groupes, séances et émargements.
-- Compatible Supabase SQL Editor (gère les contraintes NOT NULL, clés étrangères Auth)
-- ==============================================================================

-- 0. S'assurer de la présence des colonnes indispensables
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rooms ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE IF EXISTS public.modules ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE IF EXISTS public.modules ADD COLUMN IF NOT EXISTS price_per_session numeric(10, 2);
ALTER TABLE IF EXISTS public.modules ADD COLUMN IF NOT EXISTS monthly_price numeric(10, 2);
ALTER TABLE IF EXISTS public.modules ADD COLUMN IF NOT EXISTS level_name text;
ALTER TABLE IF EXISTS public.modules ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'hourly';
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2) DEFAULT 0;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS percentage_rate numeric(5, 2) DEFAULT 0;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS parent_name text;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS parent_phone text;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS billing_notes text;

ALTER TABLE IF EXISTS public.groups ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE IF EXISTS public.groups ADD COLUMN IF NOT EXISTS moduleid uuid;

DO $$
BEGIN
  -- ----------------------------------------------------------------------------
  -- 1. Salles de classe (avec colonne 'code' obligatoire)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.rooms (id, name, code, capacity, isactive)
  VALUES 
    ('11111111-0000-0000-0000-000000000001', 'Salle 1 — Descartes (Maths)', 'S1-DESC', 25, true),
    ('11111111-0000-0000-0000-000000000002', 'Salle 2 — Curie (Physique)', 'S2-CURI', 20, true),
    ('11111111-0000-0000-0000-000000000003', 'Salle 3 — Ibn Khaldoun (Lettres)', 'S3-IBNK', 25, true),
    ('11111111-0000-0000-0000-000000000004', 'Salle 4 — Multimédia (Langues)', 'S4-MULT', 18, true)
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    code = EXCLUDED.code, 
    capacity = EXCLUDED.capacity, 
    isactive = true;

  -- ----------------------------------------------------------------------------
  -- 2. Matières avec Tarifs École de Soutien
  -- ----------------------------------------------------------------------------
  INSERT INTO public.modules (id, name, code, isactive, price_per_session, monthly_price, level_name, category)
  VALUES 
    ('22222222-0000-0000-0000-000000000001', 'Mathématiques Terminale', 'MATH-BAC', true, 900, 3500, 'Terminale Scientifique', 'Scientifique'),
    ('22222222-0000-0000-0000-000000000002', 'Physique-Chimie Terminale', 'PHYS-BAC', true, 900, 3500, 'Terminale Scientifique', 'Scientifique'),
    ('22222222-0000-0000-0000-000000000003', 'Sciences Naturelles BAC', 'SVT-BAC', true, 800, 3000, 'Terminale Scientifique', 'Scientifique'),
    ('22222222-0000-0000-0000-000000000004', 'Français Prépa BEM (4e AM)', 'FR-BEM', true, 700, 2500, '4e Année Collège (BEM)', 'Littéraire'),
    ('22222222-0000-0000-0000-000000000005', 'Anglais Perfectionnement', 'ANG-ALL', true, 700, 2500, 'Tous Niveaux', 'Langues')
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    code = EXCLUDED.code,
    price_per_session = EXCLUDED.price_per_session, 
    monthly_price = EXCLUDED.monthly_price,
    level_name = EXCLUDED.level_name,
    category = EXCLUDED.category,
    isactive = true;

  -- ----------------------------------------------------------------------------
  -- 3. Utilisateurs dans auth.users (Pour satisfaire la contrainte FK si active)
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    )
    VALUES 
      -- Enseignants
      ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'prof.belkacem@ecole.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Ahmed","lastName":"Belkacem","role":"professor"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'prof.chaoui@ecole.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Leïla","lastName":"Chaoui","role":"professor"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'prof.amrani@ecole.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Sofiane","lastName":"Amrani","role":"professor"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'prof.boudiaf@ecole.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Samira","lastName":"Boudiaf","role":"professor"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      -- Élèves
      ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'karim.benali@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Karim","lastName":"Benali","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'sarah.haddad@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Sarah","lastName":"Haddad","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'amina.meziane@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Amina","lastName":"Meziane","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'youcef.khelifi@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Youcef","lastName":"Khelifi","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'walid.mansouri@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Walid","lastName":"Mansouri","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'rania.berrached@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Rania","lastName":"Berrached","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
      ('44444444-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'mehdi.zerrouki@eleve.dz', extensions.crypt('Test1234!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"firstName":"Mehdi","lastName":"Zerrouki","role":"student"}'::jsonb, now(), now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 4. Enseignants Vacataires avec Taux de Rémunération
  -- ----------------------------------------------------------------------------
  INSERT INTO public.users (id, email, firstname, lastname, role, isactive, payment_type, hourly_rate, percentage_rate)
  VALUES
    ('33333333-0000-0000-0000-000000000001', 'prof.belkacem@ecole.dz', 'Ahmed', 'Belkacem', 'professor', true, 'hourly', 2500, 0),
    ('33333333-0000-0000-0000-000000000002', 'prof.chaoui@ecole.dz', 'Leïla', 'Chaoui', 'professor', true, 'hourly', 2200, 0),
    ('33333333-0000-0000-0000-000000000003', 'prof.amrani@ecole.dz', 'Sofiane', 'Amrani', 'professor', true, 'hourly', 1800, 0),
    ('33333333-0000-0000-0000-000000000004', 'prof.boudiaf@ecole.dz', 'Samira', 'Boudiaf', 'professor', true, 'hourly', 2000, 0)
  ON CONFLICT (id) DO UPDATE SET 
    firstname = EXCLUDED.firstname,
    lastname = EXCLUDED.lastname,
    payment_type = EXCLUDED.payment_type,
    hourly_rate = EXCLUDED.hourly_rate,
    percentage_rate = EXCLUDED.percentage_rate,
    isactive = true;

  -- ----------------------------------------------------------------------------
  -- 5. Élèves avec Contacts Parents (Téléphones réels pour WhatsApp)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.users (id, email, firstname, lastname, role, isactive, parent_name, parent_phone, billing_notes)
  VALUES
    ('44444444-0000-0000-0000-000000000001', 'karim.benali@eleve.dz', 'Karim', 'Benali', 'student', true, 'Mohamed Benali (Père)', '0555123456', 'Pack Maths + Physique'),
    ('44444444-0000-0000-0000-000000000002', 'sarah.haddad@eleve.dz', 'Sarah', 'Haddad', 'student', true, 'Fatima Haddad (Mère)', '0661223344', 'Fratrie -10% avec son frère Yacine'),
    ('44444444-0000-0000-0000-000000000003', 'amina.meziane@eleve.dz', 'Amina', 'Meziane', 'student', true, 'Rachid Meziane (Père)', '0770889900', 'Terminale BAC Maths'),
    ('44444444-0000-0000-0000-000000000004', 'youcef.khelifi@eleve.dz', 'Youcef', 'Khelifi', 'student', true, 'Zohra Khelifi (Mère)', '0550445566', 'Prépa BEM Français'),
    ('44444444-0000-0000-0000-000000000005', 'walid.mansouri@eleve.dz', 'Walid', 'Mansouri', 'student', true, 'Omar Mansouri (Père)', '0665778899', 'Règlement toujours ponctuel'),
    ('44444444-0000-0000-0000-000000000006', 'rania.berrached@eleve.dz', 'Rania', 'Berrached', 'student', true, 'Khadidja Berrached (Mère)', '0771556677', 'Pack Scientifique 3 matières'),
    ('44444444-0000-0000-0000-000000000007', 'mehdi.zerrouki@eleve.dz', 'Mehdi', 'Zerrouki', 'student', true, 'Mustapha Zerrouki (Père)', '0552334455', 'Payé en espèces aujourd hui')
  ON CONFLICT (id) DO UPDATE SET 
    firstname = EXCLUDED.firstname,
    lastname = EXCLUDED.lastname,
    parent_name = EXCLUDED.parent_name,
    parent_phone = EXCLUDED.parent_phone,
    billing_notes = EXCLUDED.billing_notes,
    isactive = true;

  -- ----------------------------------------------------------------------------
  -- 6. Classes / Groupes de Niveau
  -- ----------------------------------------------------------------------------
  INSERT INTO public.groups (id, name, code, moduleid, isactive)
  VALUES
    ('55555555-0000-0000-0000-000000000001', 'Terminale Scientifique — G1', 'GRP-TERM-G1', '22222222-0000-0000-0000-000000000001', true),
    ('55555555-0000-0000-0000-000000000002', 'Terminale BAC Physique — G2', 'GRP-TERM-G2', '22222222-0000-0000-0000-000000000002', true),
    ('55555555-0000-0000-0000-000000000003', '4e AM Préparation BEM — G1', 'GRP-BEM-G1', '22222222-0000-0000-0000-000000000004', true),
    ('55555555-0000-0000-0000-000000000004', 'Anglais Perfectionnement — G1', 'GRP-ANG-G1', '22222222-0000-0000-0000-000000000005', true)
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    code = EXCLUDED.code,
    moduleid = EXCLUDED.moduleid, 
    isactive = true;

  -- ----------------------------------------------------------------------------
  -- 7. Inscriptions des Élèves (Enrollments)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.enrollments (id, studentid, groupid, status, enrolledat)
  VALUES
    ('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000003', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000001', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000001', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000002', 'active', NOW()),
    ('66666666-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000004', 'active', NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------------------
  -- 8. Créneaux Hebdomadaires Réguliers (Session Masters)
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_masters') THEN
    -- Table session_masters complète avec series_key, effective_start_date, weekday
    BEGIN
      INSERT INTO public.session_masters (
        id, series_key, moduleid, groupid, professorid, roomid, weekday, starttime, endtime, effective_start_date, status
      )
      VALUES
        ('77777777-0000-0000-0000-000000000001', 'SERIES-MATH-T1', '22222222-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 2, '17:00:00', '19:00:00', '2026-09-01', 'active'),
        ('77777777-0000-0000-0000-000000000002', 'SERIES-PHYS-T2', '22222222-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 3, '14:00:00', '16:00:00', '2026-09-01', 'active'),
        ('77777777-0000-0000-0000-000000000003', 'SERIES-FRAN-B1', '22222222-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 5, '09:00:00', '11:00:00', '2026-09-01', 'active'),
        ('77777777-0000-0000-0000-000000000004', 'SERIES-ANGL-G1', '22222222-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 6, '10:00:00', '12:00:00', '2026-09-01', 'active')
      ON CONFLICT (id) DO UPDATE SET 
        starttime = EXCLUDED.starttime,
        endtime = EXCLUDED.endtime,
        status = 'active';
    EXCEPTION
      WHEN OTHERS THEN
        -- Si les noms de colonnes sont dayofweek / isactive (variante simplifiée)
        BEGIN
          EXECUTE 'INSERT INTO public.session_masters (id, groupid, professorid, roomid, dayofweek, starttime, endtime, isactive)
                   VALUES (''77777777-0000-0000-0000-000000000001'', ''55555555-0000-0000-0000-000000000001'', ''33333333-0000-0000-0000-000000000001'', ''11111111-0000-0000-0000-000000000001'', 2, ''17:00:00'', ''19:00:00'', true)
                   ON CONFLICT (id) DO NOTHING';
        EXCEPTION
          WHEN OTHERS THEN NULL;
        END;
    END;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 9. PAIEMENTS ÉLÈVES (CAS RÉELS D'IMPAYÉS EN RETARD ET DE RÈGLEMENTS)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.student_payments (id, student_id, billing_period, amount_due, amount_paid, status, due_date, paid_at, payment_method, notes)
  VALUES
    -- 1. Karim Benali : Retard total (status: 'late', 4 500 DA impayés)
    ('88888888-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '2026-09', 4500, 0, 'late', '2026-09-10', NULL, 'cash', 'Retard de 20 jours. Relancer le père par WhatsApp.'),
    
    -- 2. Sarah Haddad : Retard partiel / acompte (status: 'late', 1 500 DA payés sur 3 500 DA, reste 2 000 DA)
    ('88888888-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '2026-09', 3500, 1500, 'late', '2026-09-15', '2026-09-08', 'cash', 'Acompte de 1500 DA versé. Reste 2000 DA non soldé.'),

    -- 3. Amina Meziane : Retard total Pack BAC (status: 'late', 6 000 DA impayés)
    ('88888888-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', '2026-09', 6000, 0, 'late', '2026-09-05', NULL, 'cash', 'Échéance du 5 septembre dépassée.'),

    -- 4. Youcef Khelifi : En attente / impayé (status: 'unpaid', 2 500 DA)
    ('88888888-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004', '2026-09', 2500, 0, 'unpaid', '2026-09-30', NULL, 'cash', 'Cotisation du mois en attente.'),

    -- 5. Walid Mansouri : Totalement réglé (status: 'paid', 3 500 DA)
    ('88888888-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005', '2026-09', 3500, 3500, 'paid', '2026-09-05', '2026-09-04', 'cash', 'Payé par espèces.'),

    -- 6. Rania Berrached : Totalement réglé Pack Trio avec réduction (status: 'paid', 5 600 DA)
    ('88888888-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006', '2026-09', 5600, 5600, 'paid', '2026-09-02', '2026-09-02', 'transfer', 'Virement bancaire reçu.'),

    -- 7. Mehdi Zerrouki : Encaissé aujourd hui en cash (visible dans la Caisse du Jour !)
    ('88888888-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000007', '2026-09', 2500, 2500, 'paid', CURRENT_DATE::text, CURRENT_DATE::text, 'cash', 'Encaissement comptoir aujourd hui.')
  ON CONFLICT (id) DO UPDATE SET 
    amount_due = EXCLUDED.amount_due,
    amount_paid = EXCLUDED.amount_paid,
    status = EXCLUDED.status,
    due_date = EXCLUDED.due_date,
    paid_at = EXCLUDED.paid_at,
    payment_method = EXCLUDED.payment_method,
    notes = EXCLUDED.notes;

  -- ----------------------------------------------------------------------------
  -- 10. RÉMUNÉRATIONS ENSEIGNANTS (PROFS À PAYER ET PROF DÉJÀ PAYÉ)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.professor_payments (id, professor_id, billing_period, payment_type, rate_applied, base_calculation, total_amount, status, paid_at, notes)
  VALUES
    -- 1. Pr. Ahmed Belkacem : 16 séances à 2 500 DA = 40 000 DA À PAYER (status: 'validated')
    ('99999999-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '2026-09', 'hourly', 2500, '{"totalHours": 16, "sessionsCount": 8, "periodLabel": "Septembre 2026"}'::jsonb, 40000, 'validated', NULL, 'Calcul mensuel validé par la direction. En attente de décaissement.'),

    -- 2. Mme Leïla Chaoui : 12 séances à 2 200 DA = 26 400 DA À VALIDER / PAYER (status: 'draft')
    ('99999999-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '2026-09', 'hourly', 2200, '{"totalHours": 12, "sessionsCount": 6, "periodLabel": "Septembre 2026"}'::jsonb, 26400, 'draft', NULL, 'Brouillon généré automatiquement d après les séances pointées.'),

    -- 3. M. Sofiane Amrani : 18 heures à 1 800 DA = 32 400 DA À PAYER (status: 'validated')
    ('99999999-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003', '2026-09', 'hourly', 1800, '{"totalHours": 18, "sessionsCount": 9, "periodLabel": "Septembre 2026"}'::jsonb, 32400, 'validated', NULL, 'Heures de soutien français BEM validées.'),

    -- 4. Mme Samira Boudiaf : 10 séances à 2 000 DA = 20 000 DA DÉJÀ PAYÉ (status: 'paid')
    ('99999999-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000004', '2026-09', 'hourly', 2000, '{"totalHours": 10, "sessionsCount": 5, "periodLabel": "Septembre 2026"}'::jsonb, 20000, 'paid', NOW(), 'Règlement effectué par virement bancaire.')
  ON CONFLICT (id) DO UPDATE SET 
    payment_type = EXCLUDED.payment_type,
    rate_applied = EXCLUDED.rate_applied,
    base_calculation = EXCLUDED.base_calculation,
    total_amount = EXCLUDED.total_amount,
    status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at,
    notes = EXCLUDED.notes;

  -- ----------------------------------------------------------------------------
  -- 11. SÉANCES EN DIRECT (AUJOURD'HUI & RÉCENTES) ET PRÉSENCES
  -- ----------------------------------------------------------------------------
  INSERT INTO public.sessions (id, moduleid, groupid, professorid, roomid, sessiondate, starttime, endtime, status, totalstudents, presentcount, absentcount, latecount)
  VALUES
    ('aaaa0000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', CURRENT_DATE::text, '17:00:00', '19:00:00', 'ACTIVE', 5, 2, 1, 1),
    ('aaaa0000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', CURRENT_DATE::text, '14:00:00', '16:00:00', 'COMPLETED', 2, 2, 0, 0)
  ON CONFLICT (id) DO UPDATE SET 
    sessiondate = EXCLUDED.sessiondate,
    status = EXCLUDED.status,
    totalstudents = EXCLUDED.totalstudents,
    presentcount = EXCLUDED.presentcount,
    absentcount = EXCLUDED.absentcount,
    latecount = EXCLUDED.latecount;

  -- Présences pour la séance d'aujourd'hui
  INSERT INTO public.attendance (sessionid, studentid, status, scanmethod, markedby, markedat)
  VALUES
    -- Karim Benali : Absent (permet de tester l'alerte WhatsApp parent !)
    ('aaaa0000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'absent', 'manual', 'secretary', NOW()),
    -- Sarah Haddad : En retard (permet de tester WhatsApp parent et alerte impayé !)
    ('aaaa0000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'late', 'manual', 'secretary', NOW()),
    -- Amina Meziane : Présente
    ('aaaa0000-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'present', 'qr', 'secretary', NOW()),
    -- Walid Mansouri : Présent
    ('aaaa0000-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000001', 'present', 'qr', 'secretary', NOW())
  ON CONFLICT (sessionid, studentid) DO UPDATE SET 
    status = EXCLUDED.status,
    scanmethod = EXCLUDED.scanmethod,
    markedby = EXCLUDED.markedby,
    markedat = EXCLUDED.markedat;

END $$;
