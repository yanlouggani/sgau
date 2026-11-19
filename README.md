# SGAU — Système de Gestion pour Centre de Soutien Scolaire & Cours Particuliers

Application web complète développée avec **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **shadcn/ui** et **Supabase** (Postgres + Auth).

---

## 🚀 Nouvelles Fonctionnalités & Refonte Métier

### 1. Suivi des Finances & Paiements (`/payments`)
- **Frais de cours des élèves** :
  - Suivi des mensualités et acomptes en Dinar Algérien (DZD).
  - Statuts automatiques : `Payé` (vert), `Partiel` (orange), `En retard` (rouge), `Impayé` (gris).
  - Tableau de bord avec indicateurs clés : Total attendu, Total encaissé, Taux de recouvrement, Reste à recouvrer.
  - Enregistrement rapide d'acompte et export complet en CSV / tableur.
- **Rémunérations des enseignants** :
  - **Deux modes au choix** configurés sur chaque enseignant :
    - **Taux horaire fixe** (DA / h) basé sur le volume d'heures assurées.
    - **Pourcentage sur encaissements** (%) basé sur les frais de cours réellement collectés auprès des élèves de ses classes.
  - Calcul et génération automatique mensuelle côté serveur (`generateMonthlyProfessorPaymentsAction`).
  - Traçabilité complète consultable par bordereau détaillé (séances assurées ou élèves ayant cotisé).
  - Validation manuelle par l'administration et passage en statut `Payé`.

### 2. Emploi du Temps Interactif en Drag & Drop (`/schedule`)
- Grille hebdomadaire interactive propulsée par **`@dnd-kit/core`** (Dimanche à Jeudi).
- Déplacement fluide de séances d'une case à une autre avec **mise à jour optimiste** et rollback automatique en cas d'erreur.
- **Détection visuelle temps réel des conflits** : surbrillance rouge immédiate si l'enseignant, la salle ou la classe est déjà occupé(e).
- **Contrainte stricte d'affectation** : les matières sans aucun enseignant assigné sont grisées/désactivées avec message explicite et lien d'assignation directe (validé côté client et côté serveur).
- **Pré-remplissage intelligent** du formulaire lors d'un clic sur une case vide : jour, horaire, auto-sélection de l'enseignant unique, suggestion prioritaire des salles disponibles.
- Mode secours / liste classique et mode "Tap-to-move" pour les écrans tactiles et mobiles.

### 3. Parcours d'Inscription en Wizard Progressif
- **Fiche Enseignant (`/professors`)** :
  - Wizard à 4 étapes : (1) Identité & Contact, (2) Classes & Matières, (3) Choix dynamique de rémunération (Taux horaire OU Pourcentage), (4) Récapitulatif.
- **Fiche Élève (`/students`)** :
  - Wizard à 3 étapes : (1) Identité élève & Contact tuteur/parent, (2) Inscription aux matières de soutien, (3) Tarifs, échéances & option brouillon.

---

## 🛠️ Stack Technique

- **Framework** : Next.js 16+ (App Router, Turbopack, Server Actions)
- **Langage** : TypeScript
- **Style & UI** : Tailwind CSS v4, shadcn/ui, Lucide Icons, Sonner (Toasts)
- **Drag and Drop** : `@dnd-kit/core`
- **Base de données & Auth** : Supabase (PostgreSQL, Row Level Security, RPC)
- **Dates** : `date-fns` (avec locale française `fr`)

---

## 📦 Base de Données & Migrations SQL

Pour appliquer les nouvelles tables et colonnes financières dans Supabase :
Exécutez le script SQL situé dans :
```bash
supabase/migrations/20260912_support_school_payments.sql
```
Ce script crée :
- Les colonnes `payment_type`, `hourly_rate`, `percentage_rate`, `parent_name`, `parent_phone`, `billing_notes` sur `users`.
- La table `student_payments` (frais des élèves, échéances, statuts).
- La table `professor_payments` (rémunérations, taux, ventilation traçable en JSONB).
- Les règles de sécurité RLS (Row Level Security).

---

## 💻 Démarrage en Développement

```bash
npm install
npm run dev
```

Rendez-vous sur [http://localhost:3000](http://localhost:3000).

Pour vérifier la compilation de production :
```bash
npm run build
```
