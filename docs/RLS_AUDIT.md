# 🛡️ Audit de Sécurité des Politiques RLS (Row Level Security)

Ce document détaille l'état des permissions d'accès aux tables et fonctions de la base de données PostgreSQL de SGAU pour chaque rôle utilisateur (`admin`, `secretary`, `professor`, `student`), ainsi que les recommandations de durcissement.

---

## 1. Inventaire des Tables et Fonctions Utilisées

### Tables Principales
| Table | Description | Niveaux de Sensibilité |
|---|---|---|
| `users` | Comptes utilisateurs, profils, rôles, coordonnées parents | **Haute** (contient emails, rôles, numéros de téléphone) |
| `student_payments` | Suivi financier des frais de scolarité élèves | **Critique** (montants dus, payés, statuts, dates) |
| `professor_payments` | Fiches de rémunération et calcul de paie enseignants | **Critique** (taux horaires, pourcentages, montants) |
| `session_masters` | Modèles récurrents d'emploi du temps | Moyenne |
| `sessions` | Séances réelles générées / datées | Moyenne |
| `attendance` | Pointage des présences par séance et par élève | **Haute** (assiduité, absences) |
| `enrollments` | Inscriptions des élèves dans les classes | Moyenne |
| `professor_groups` | Affectations des professeurs aux classes | Moyenne |
| `modules` | Matières dispensées et tarifs de référence | Moyenne (tarifs visibles pour inscription) |
| `groups` | Classes / groupes d'élèves | Moyenne |
| `domains` & `sections` | Classification pédagogique | Faible |
| `rooms` | Salles de cours et capacités | Faible |

### Fonctions RPC Utilisées
- `admin_finalize_user(p_uid, p_group_id)` : Initialisation du profil utilisateur après création dans Supabase Auth.
- `start_session(p_session_id, p_started_by)` : Démarrage d'une séance de cours.
- `close_session(p_session_id, p_closed_by)` : Clôture de séance et validation de l'appel.
- `populate_session_attendance(p_session_id)` : Remplissage automatique de la liste d'appel à partir des inscriptions actives du groupe.

---

## 2. Matrice RLS : Autorisations Actuelles vs Recommandées

### A. Table `users`
- **État actuel** : Les administrateurs et secrétaires ont accès en lecture/écriture. Les profs et élèves peuvent lire leur profil.
- **Risque identifié** : Sans filtre RLS strict sur `SELECT`, un élève ou professeur pourrait lister les adresses email et rôles des autres utilisateurs via le client Supabase navigateur.
- **Recommandation** :
  - `admin`, `secretary` : `SELECT`, `UPDATE` autorisés sur tous les utilisateurs.
  - `professor` : `SELECT` uniquement sur son profil, et sur les élèves inscrits dans ses classes (`enrollments -> professor_groups`).
  - `student` : `SELECT` uniquement sur son propre enregistrement (`auth.uid() = id`).
  - `INSERT` / `DELETE` : Bloqués au niveau RLS (réservés à la clé `service_role` via Server Actions).

### B. Tables Financières (`student_payments` & `professor_payments`)
- **État actuel** : RLS activé dans `20260930_support_school_complete_fix.sql` pour `admin` et `secretary`.
- **Risque identifié** : L'élève n'a actuellement aucun accès en lecture à ses propres paiements (`student_payments`), ce qui l'empêche de consulter son reçu ou son reste à payer depuis son espace personnel.
- **Recommandation** :
  - Ajouter une politique SELECT pour l'élève sur `student_payments` :
    ```sql
    CREATE POLICY "Students can view their own payments"
      ON public.student_payments FOR SELECT TO authenticated
      USING (student_id = auth.uid());
    ```
  - `professor_payments` : `admin` en accès complet, `professor` en lecture seule sur ses fiches de paie (`professor_id = auth.uid()`).

### C. Emploi du Temps (`session_masters`, `sessions`, `rooms`, `groups`, `modules`)
- **Recommandation** :
  - Lecture (`SELECT`) : Ouvert à tous les utilisateurs authentifiés.
  - Écriture (`INSERT`, `UPDATE`, `DELETE`) : Réservé aux rôles `admin` et `secretary`.

### D. Présences (`attendance`)
- **Recommandation** :
  - `admin`, `secretary` : Accès complet.
  - `professor` : `SELECT` et `UPDATE` limités aux séances dont il est l'enseignant (`professorid = auth.uid()`).
  - `student` : `SELECT` uniquement sur ses propres présences (`studentId = auth.uid()`).

---

## 3. Sécurité des Fonctions RPC

1. **`admin_finalize_user`** : Doit être exécutée avec `SECURITY DEFINER` et vérifier que l'appelant est soit `service_role`, soit possède le rôle `admin` ou `secretary`.
2. **`start_session` / `close_session`** : Doit valider que l'appelant est soit admin, soit la secrétaire, soit le professeur assigné à la séance.
