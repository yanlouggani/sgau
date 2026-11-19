# Guide du Schéma de Base de Données SGAU (Supabase)

Ce document décrit comment gérer, exporter et versionner le schéma PostgreSQL de la plateforme SGAU.

---

## 1. Structure des dossiers Supabase

```
supabase/
├── migrations/       # Migrations DDL versionnées (schéma, tables, vues, fonctions)
│   └── 20260930_support_school_complete_fix.sql # Migration complète (paiements, profs, modules, RLS)
├── seed/             # Données de test et fixtures pour le développement local
│   └── test_data_support_school.sql # Données fictives (NE PAS exécuter en production)
└── README_SCHEMA.md  # Ce guide
```

---

## 2. Comment exporter le schéma complet depuis Supabase

Si vous disposez de la CLI Supabase installée en local (`npx supabase`) :

```bash
# Se connecter à votre projet Supabase
npx supabase login

# Lier le projet distant
npx supabase link --project-ref <VOTRE_PROJECT_REF>

# Exporter l'intégralité du schéma DDL (tables, contraintes, RLS, fonctions, triggers)
npx supabase db dump -f supabase/schema.sql

# Exporter uniquement les fonctions SQL et triggers
npx supabase db dump --schema public --functions-only -f supabase/functions.sql

# Exporter les politiques RLS
npx supabase db dump --schema public --data-only -f supabase/rls_policies.sql
```

---

## 3. Déploiement des migrations en production

Pour appliquer les migrations sur une base Supabase :
- **Via CLI** :
  ```bash
  npx supabase db push
  ```
- **Via SQL Editor** : Ouvrez le dashboard Supabase > SQL Editor > collez le contenu du fichier de migration > Exécutez.

> ⚠️ **IMPORTANT :** Le script situé dans `supabase/seed/test_data_support_school.sql` contient des comptes et des données de test. **Ne l'exécutez jamais sur votre environnement de production.**
