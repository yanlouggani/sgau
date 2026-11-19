# 🔒 ACTIONS DE SÉCURITÉ OBLIGATOIRES (À EFFECTUER DANS SUPABASE)

Suite à l'audit de sécurité, les actions suivantes doivent être impérativement menées par l'administrateur du projet Supabase :

---

### 1. Régénération immédiate des clés d'API Supabase
> ⚠️ **CRITIQUE** : Des clés d'API (notamment la clé `service_role` ayant les pleins pouvoirs d'accès et de contournement RLS) ont été présentes dans des fichiers locaux du projet.
1. Rendez-vous sur le dashboard Supabase : **Project Settings > API**.
2. **Régénérez la clé `anon` (publique)**.
3. **Régénérez la clé `service_role` (secrète)**.
4. Mettez à jour votre fichier local `.env.local` avec les nouvelles valeurs :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Vérifiez que `.env.local` n'est JAMAIS partagé ni commité dans Git.

---

### 2. Réinitialisation des mots de passe des comptes de test
> ⚠️ Des mots de passe de comptes de test étaient inscrits en clair dans des scripts de test.
1. Rendez-vous sur le dashboard Supabase : **Authentication > Users**.
2. Réinitialisez le mot de passe de tous les comptes administratifs et comptes de démonstration existants.

---

### 3. Nettoyage des fichiers sensibles et uploads locaux
- [x] `test-auth.cjs` a été supprimé du dépôt et ignoré dans `.gitignore`.
- [x] Le dossier `public/uploads/` contenant d'anciens justificatifs a été purgé et ignoré.
- [ ] Si votre dépôt Git est public ou a été partagé avec un historique contenant `.env.local` ou `test-auth.cjs`, réécrivez l'historique Git (`git filter-repo` ou `BFG Repo-Cleaner`) ou créez un nouveau dépôt propre.

---

### 4. Bonnes pratiques de stockage des justificatifs
Les futurs documents justificatifs doivent être hébergés sur un **Bucket Supabase Storage Privé** avec des URLs signées à durée limitée, et non servis publiquement depuis `/public/uploads`.
