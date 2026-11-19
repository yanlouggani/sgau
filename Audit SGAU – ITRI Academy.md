# Audit SGAU – ITRI Academy

*Analyse du code de sgau-main.zip (Next.js 16, React 19, Tailwind 4, Supabase) – novembre 2026*

**Méthode et limites.** J'ai lu le code source (environ 19 000 lignes TS/TSX), les migrations SQL, le middleware, les actions serveur et le document de spécification des emplois du temps. Je n'ai pas pu lancer l'application (pas de node\_modules, pas d'accès à votre base Supabase). Les points « ça marche » sont donc déduits du code, pas d'un test en conditions réelles. Les points marqués *à vérifier* demandent un test manuel.

---

## 1. Résumé en 30 secondes

Le site est ambitieux et déjà riche : 4 espaces (admin, secrétaire, enseignant, élève), paiements, emploi du temps en glisser-déposer, présences par QR, mascotte. La base fonctionnelle est bonne. Trois choses empêchent aujourd'hui de le mettre en production sereinement :

1. **Sécurité** : une clé secrète Supabase (service role) et des mots de passe de test sont dans l'archive, une secrétaire peut techniquement créer un administrateur, et le QR code de l'élève est son identifiant brut.
2. **Base de données non reproductible** : seules les tables de paiement sont dans les migrations. Tables principales, fonctions SQL et règles RLS ne sont pas versionnées.
3. **Simplicité d'usage** : trop d'entrées dans le menu admin, vocabulaire incohérent (module/matière, groupe/classe, étudiant/élève), fichiers énormes difficiles à faire évoluer, quelques fonctions qui ne mènent nulle part.

---

## 2. Ce qui fonctionne bien

- **Séparation claire par rôle** : le middleware redirige chaque rôle vers son espace, et les pages admin revérifient le rôle côté serveur.
- **Paiements** : statuts automatiques (payé, partiel, en retard, impayé), badge de retards dans le menu, export CSV, calcul mensuel de la rémunération des enseignants (taux horaire ou pourcentage), contrôle de rôle dans les actions serveur, RLS activé sur les deux tables.
- **Emploi du temps** : glisser-déposer avec mise à jour optimiste et retour arrière, détection visuelle des conflits (enseignant, salle, classe), blocage des matières sans enseignant, pré-remplissage au clic sur une case vide, mode tactile pour mobile.
- **Parcours guidés** : assistants en étapes pour créer un élève (3 étapes) et un enseignant (4 étapes). C'est exactement la bonne direction pour la simplicité.
- **Présences** : QR code élève, scan rapide côté secrétariat avec alerte si l'élève a un paiement en retard, rappel WhatsApp en un clic.
- **Détails de confort** : mascotte et états vides sympathiques, squelettes de chargement, notifications (toasts), page d'erreur et 404 personnalisées, mode clair/sombre prévu, pagination sur l'historique enseignant.
- **Documentation métier** : le fichier *Logique\_Gestion\_Emplois\_du\_Temps.docx* est une vraie spécification (benchmark PRONOTE, aSc, Omniscol…). C'est un atout : il sert de cahier des charges.

---

## 3. Ce qui ne va pas – sécurité (à traiter en premier)

| # | Problème | Gravité | Correction |
| --- | --- | --- | --- |
| S1 | `.env.local` est dans l'archive avec la **clé service role** Supabase (accès total à la base, contourne toute sécurité). `test-auth.cjs` contient l'URL, la clé publique et des **mots de passe de comptes de test** en clair. | Critique | Régénérer toutes les clés Supabase, changer les mots de passe, supprimer ces fichiers, vérifier que rien n'est dans l'historique Git. |
| S2 | `createUserAction` accepte n'importe quel `role` et autorise les secrétaires : une secrétaire peut créer un compte **admin**. De plus, le mot de passe est optionnel, et si la fonction SQL `admin_finalize_user` échoue, le compte d'authentification reste créé (compte orphelin). | Critique | Liste blanche des rôles selon l'appelant (secrétaire : élève et enseignant seulement), mot de passe temporaire généré, suppression du compte auth en cas d'échec. |
| S3 | Le **QR code de l'élève encode son identifiant (UUID)** tel quel. Quiconque le photographie ou le connaît peut le réutiliser indéfiniment. | Élevée | Jeton signé et à durée courte (ou rotation quotidienne), vérifié côté serveur. |
| S4 | Un **justificatif PDF d'élève** est stocké dans `public/uploads/justifications/` : accessible à toute personne ayant l'URL, et présent dans le code source. | Élevée | Bucket Supabase Storage **privé** avec liens signés. Supprimer le fichier du dépôt. |
| S5 | **Aucune migration** pour users, groups, sessions, attendance, enrollments, rooms, ni pour les fonctions SQL (`start_session`, `close_session`, `populate_session_attendance`, `admin_finalize_user`). Comme 24 fichiers interrogent Supabase directement depuis le navigateur, la **vraie sécurité repose sur des règles RLS que je n'ai pas pu auditer**. | Élevée | Exporter le schéma complet (`supabase db dump`), le versionner, auditer chaque politique RLS par rôle. |
| S6 | Le scan rapide du secrétariat injecte la saisie dans un filtre `.or("email.ilike.%...%")` : les virgules et parenthèses cassent le filtre, et `limit(1)` sur une recherche approximative peut **pointer présent le mauvais élève**. | Moyenne | Correspondance exacte (UUID/jeton), sinon liste de choix à confirmer ; échapper la saisie. |
| S7 | Le dossier `migrations` contient un script de **données de test** et deux migrations qui créent les mêmes tables de paiement. Risque d'exécuter des données factices en production. | Moyenne | Séparer `seed` des migrations, supprimer le doublon. |

---

## 4. Ce qui ne marche pas ou est incohérent (bugs et fonctions mortes)

- **Détection de conflits non appliquée côté serveur.** `checkScheduleConflictAction` existe mais n'est appelée nulle part. De plus, elle renvoie « pas de conflit » en cas d'erreur (échec silencieux) et ne regarde que le jour de la semaine. Seule la détection côté navigateur protège aujourd'hui l'emploi du temps. Il faut aussi une contrainte en base.
- **Connexion de la secrétaire** : la page de login ne connaît pas le rôle secrétaire et l'envoie vers l'espace élève, puis le middleware la redirige. Ça marche mais en deux sauts.
- **Routes autorisées mais inutilisables pour la secrétaire** : `/rooms`, `/enrollments`, `/groups` sont autorisées par le middleware mais les pages renvoient vers `/dashboard`, qui renvoie lui-même ailleurs. Chaînes de redirections fragiles.
- **Justificatifs d'absence abandonnés** : la page admin/justifications redirige vers le tableau de bord, l'élève voit le statut « Justifié » mais n'a aucun moyen de déposer un justificatif.
- **Pages fantômes** : `/users`, `/student/scan`, `/student/qrcode`, `/admin/justifications` ne font que rediriger.
- **Voyant « En ligne »** dans l'en-tête : il est vert en permanence, sans lien avec une vraie connexion. Trompeur.
- **Formulaire de contact de la page d'accueil factice** : le bouton « Envoyer le message » n'envoie rien (`preventDefault` uniquement). Les visiteurs croient avoir écrit à l'école.
- **Chiffres marketing en dur** (500+ élèves, 98 % de satisfaction, 15+ langues, avis clients) : à remplacer par des données réelles, sinon problème de crédibilité.
- **Dates en UTC** (15 endroits utilisent `toISOString`) alors que le tableau de bord utilise l'heure locale : entre minuit et 1 h en Algérie, « aujourd'hui » et les retards de paiement peuvent être décalés d'un jour.
- **Dépendance inutilisée** : `html5-qrcode` est installé mais le scan par caméra n'existe pas. Le « scan » fonctionne uniquement avec une douchette qui tape l'identifiant, ou à la saisie.
- **Next.js 16** : le fichier `middleware.ts` est renommé *proxy* dans cette version (ancien nom encore toléré). *À vérifier* dans la doc livrée avec le projet (AGENTS.md le demande).
- **README obsolète** : décrit « soutien scolaire » seulement, alors que l'école fait aussi langues et formations.

---

## 5. Simplicité d'usage : ce qu'il faut changer pour que ce soit intuitif

### 5.1 Vocabulaire unique

Le même concept porte plusieurs noms : *module / matière*, *groupe / classe*, *étudiant / élève*, *séance / session*. Choisir **un seul mot par concept** dans toute l'interface (suggestion : Matière, Classe, Élève, Séance).

### 5.2 Menu admin trop chargé et mal hiérarchisé

Aujourd'hui : 14 entrées sur 5 sections, avec **trois entrées qui ont la même icône** (Matières, Domaines, Sections) et dont la relation n'est pas évidente. Proposition :

- **Aujourd'hui** (accueil avec actions rapides)
- **Élèves** (inscriptions, paiements et absences dans la fiche de l'élève)
- **Classes et emploi du temps**
- **Enseignants**
- **Argent** (encaissements, rémunérations)
- **Réglages** (matières, domaines, sections, salles, utilisateurs : on y touche rarement)

Principe : **la fiche de l'élève est le centre** (infos, classes, paiements, absences, relances). On ne devrait pas avoir à naviguer entre 4 écrans pour traiter un seul élève.

### 5.3 Accueil orienté tâches

Le tableau de bord admin affiche surtout des statistiques. Pour un usage quotidien, il vaut mieux commencer par **ce qui demande une action** : paiements en retard, séances sans enseignant, classes complètes, élèves en brouillon, absences non justifiées. Des gros boutons : « Inscrire un élève », « Encaisser un paiement », « Ajouter une séance ».

### 5.4 Encaissement en 2 clics

Le cas d'usage le plus fréquent d'une école, c'est « un parent paie ». Il faut une **barre de recherche globale** (nom d'élève ou téléphone du parent, raccourci Ctrl+K) puis un bouton « Encaisser » avec montant pré-rempli et reçu imprimable.

### 5.5 Confirmations et retours

Huit suppressions utilisent la boîte native `confirm()` du navigateur alors que le composant `alert-dialog` existe déjà. Les remplacer, et proposer **Annuler (undo)** après suppression plutôt qu'une confirmation systématique. Préférer **archiver** à supprimer (un élève supprimé emporte son historique de paiements).

### 5.6 Formulaires

- Valider en direct, message d'erreur à côté du champ, jamais seulement un toast.
- Téléphone au format algérien, montants en DA avec séparateur de milliers.
- Enregistrer en brouillon automatiquement dans les assistants.

### 5.7 Mobile et accessibilité

- Seulement 4 `aria-label` dans toute l'application : ajouter des libellés sur les boutons-icônes, vérifier le contraste (violet clair sur fond clair) et la navigation au clavier.
- Les très gros tableaux (paiements, élèves) doivent devenir des **cartes empilées** sur téléphone.
- Paginer ou chercher côté serveur : presque aucune liste n'est paginée, ce sera lent avec quelques centaines d'élèves.

### 5.8 Parcours de chaque rôle

- **Secrétaire** : l'écran « Séances du jour » avec scan est le bon point d'entrée. Ajouter le scan par caméra et un mode « tablette à l'accueil ».
- **Enseignant** : faire l'appel en un geste (tout le monde présent par défaut, on décoche les absents).
- **Élève / parent** : le QR code doit être visible dès l'ouverture, avec les prochains cours, les paiements restants et les absences. Beaucoup de parents préfèreront un **lien sans mot de passe** (ou un code par WhatsApp) plutôt qu'un compte.
- **Connexion** : ajouter « Mot de passe oublié » (absent aujourd'hui), afficher le rôle attendu, rediriger la secrétaire directement.

---

## 6. Qualité du code et maintenabilité

- **Fichiers monolithiques** : payments/page.tsx (2 281 lignes), schedule-management.tsx (2 027), students-management.tsx (1 028), secretary/dashboard (960). Les découper en composants et hooks (< 300 lignes).
- **Accès base dispersé** : 24 fichiers font des requêtes Supabase depuis le navigateur. Centraliser dans `lib/data/*` et **actions serveur** pour la logique sensible (présences, encaissements, inscriptions).
- **Pas de validation de formulaires** structurée : ajouter zod + react-hook-form.
- **Types** : quelques `any`, types écrits à la main. Générer les types avec `supabase gen types`.
- **Aucun test** : au minimum des tests pour le calcul de statut de paiement, la rémunération enseignants et la détection de conflits (ce sont les règles où une erreur coûte de l'argent).
- **Journal d'audit** : qui a encaissé, modifié, supprimé quoi. Indispensable dès qu'il y a de l'argent.
- **Performance** : le middleware fait 2 requêtes base à chaque navigation, puis le layout les refait. Mettre le rôle dans les claims du JWT.
- `<img>` brut au lieu de `next/image`, `README` et nom du produit (SGAU / ITRI Academy) à unifier, `tsbuildinfo` et fichiers uploadés à sortir du dépôt.

---

## 7. Suggestions de fonctionnalités (par valeur pour l'école)

**Haute valeur, effort modéré**

1. Reçu de paiement PDF avec numéro, et caisse journalière (la logique `cash-register.ts` existe déjà).
2. Relances de paiement groupées par WhatsApp avec modèle de message.
3. Justification d'absence par le parent (photo ou PDF) et validation par la secrétaire.
4. Recherche globale (élève, parent, téléphone).
5. Rappel automatique de séance la veille (WhatsApp ou SMS).

**Utile ensuite** 6. Gestion des rattrapages et annulations de séance (prévenir élèves et enseignant). 7. Liste d'attente quand une classe est pleine. 8. Remises fratrie, tarif dégressif, paiement échelonné. 9. Suivi des niveaux et attestations pour les langues et formations (certificat PDF). 10. Import Excel des élèves pour démarrer l'année. 11. Tableau de bord financier : prévu vs encaissé par mois, par matière, par enseignant. 12. Sauvegarde et export complets (propriétaire de l'école).

**À garder pour plus tard** : application mobile installable (PWA), multi-sites, génération automatique de l'emploi du temps (la spécification existe déjà dans le document).

---

## 8. Plan d'action recommandé

| Phase | Contenu | Durée indicative |
| --- | --- | --- |
| 0 – Urgence | Régénérer les clés, retirer secrets et PDF, corriger S2 (rôles) | 1 jour |
| 1 – Fondations | Exporter et versionner le schéma, auditer RLS, contrainte anti-conflit en base, QR signé, dates locales | 3 à 5 jours |
| 2 – Simplification | Vocabulaire unique, nouveau menu, accueil par tâches, recherche globale, encaissement rapide, suppression des fonctions mortes | 1 semaine |
| 3 – Confort | Mobile, accessibilité, mot de passe oublié, scan caméra, justificatifs, reçus PDF | 1 à 2 semaines |
| 4 – Qualité | Découpage des gros fichiers, tests, audit log, performance | en continu |

---

## 9. Prompt à donner à Antigravity

Copiez le bloc ci-dessous tel quel. Il est écrit pour être exécuté **phase par phase** : demandez à Antigravity de s'arrêter après chaque phase pour que vous testiez.

```
RÔLE
Tu es un développeur senior full-stack (Next.js, TypeScript, Supabase). Tu travailles sur le projet SGAU (marque : ITRI Academy), un site de gestion d'une école de soutien scolaire, de langues et de formations en Algérie. Monnaie : DA (dinar algérien). Langue de l'interface : français. Semaine de travail : dimanche à jeudi.

CONTEXTE TECHNIQUE
Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase (Postgres, Auth, RLS). Quatre rôles : admin, secretary, professor, student. Avant d'écrire du code Next.js, lis la documentation dans node_modules/next/dist/docs/ car cette version a des changements (par exemple middleware renommé proxy). Lis aussi le fichier Logique_Gestion_Emplois_du_Temps.docx : c'est la spécification métier de l'emploi du temps.

OBJECTIF PRINCIPAL
Rendre le site le plus simple et intuitif possible pour des personnes non techniques (secrétaire, parents, enseignants), sans casser l'existant. Chaque tâche courante doit se faire en 3 clics ou moins.

RÈGLES DE TRAVAIL
- Travaille par phases. À la fin de chaque phase : lance lint et build, liste ce qui a changé, ce qu'il faut tester à la main, puis ARRÊTE-TOI et attends ma validation.
- Ne supprime aucune donnée. Toute modification de base passe par une nouvelle migration SQL idempotente dans supabase/migrations.
- Aucun secret dans le code. N'affiche jamais le contenu de .env.local.
- Pas de nouveau paquet sans le justifier. Réutilise les composants shadcn existants.
- Petits composants (moins de 300 lignes), types stricts, pas de any.
- Tous les textes utilisateur en français, avec un vocabulaire unique : Matière, Classe, Élève, Séance, Enseignant, Salle.

PHASE 0 – SÉCURITÉ IMMÉDIATE
1. Supprime test-auth.cjs et public/uploads du dépôt. Ajoute public/uploads, .env*, *.tsbuildinfo et test-auth.cjs au .gitignore. Écris un fichier SECURITY_TODO.md qui me dit de régénérer les clés Supabase (service role et anon) et de changer les mots de passe des comptes de test.
2. Dans src/lib/actions/admin-users.ts : valide le rôle demandé côté serveur avec zod. Un admin peut créer tous les rôles ; une secrétaire peut créer seulement student et professor. Génère un mot de passe temporaire robuste si aucun n'est fourni. Si l'appel RPC admin_finalize_user échoue, supprime le compte auth créé. Retourne des erreurs claires en français.
3. Même contrôle de rôle dans toutes les server actions sensibles via une fonction commune requireRole(roles).

PHASE 1 – BASE DE DONNÉES ET FIABILITÉ
1. Ajoute un fichier supabase/README_SCHEMA.md expliquant comment exporter le schéma complet avec supabase db dump, et prépare la structure supabase/migrations et supabase/seed (déplace le script de données de test dans supabase/seed, supprime le doublon de migration des paiements en gardant la version la plus complète).
2. Fais la liste des tables et fonctions SQL utilisées par le code (users, groups, modules, sessions, session_masters, attendance, enrollments, rooms, professor_groups, student_payments, professor_payments, et RPC start_session, close_session, populate_session_attendance, admin_finalize_user). Écris un document docs/RLS_AUDIT.md : pour chaque table et rôle, ce qui est permis aujourd'hui d'après le code et ce qui devrait l'être. Signale tout risque.
3. Emploi du temps : branche checkScheduleConflictAction (ou une fonction SQL) avant chaque création ou déplacement de séance, côté serveur. Corrige-la : plus d'échec silencieux (en cas d'erreur, refuse), prends en compte enseignant, salle ET classe, et les dates exactes des séances. Ajoute une contrainte d'exclusion Postgres pour empêcher les doubles réservations de salle et d'enseignant.
4. Dates : crée src/lib/dates.ts avec des fonctions utilisant le fuseau Africa/Algiers et remplace les 15 usages de toISOString().slice(0,10) ou split.
5. QR code : remplace l'UUID brut par un jeton signé (HMAC avec une clé serveur, expiration 24 h, régénéré à l'ouverture de la page élève). Vérifie-le dans une server action de pointage. Garde la compatibilité avec la douchette (saisie clavier).
6. Scan rapide du secrétariat : plus de recherche approximative en limit(1). Si la saisie n'est pas un jeton valide, affiche une liste de résultats (max 5) et demande de cliquer sur le bon élève. Échappe la saisie utilisée dans les filtres.

PHASE 2 – SIMPLIFICATION DE L'INTERFACE
1. Vocabulaire : remplace partout Module par Matière, Groupe par Classe, Étudiant par Élève, Session par Séance (interface seulement, pas les noms de tables).
2. Menu admin : remplace les 14 entrées par 6 : Aujourd'hui, Élèves, Classes et emploi du temps, Enseignants, Argent, Réglages. Réglages regroupe Matières, Domaines, Sections, Salles, Utilisateurs avec une explication d'une ligne sur la relation entre eux (Domaine, puis Section, puis Matière, puis Classe). Icônes distinctes. Mets à jour le middleware et les redirections.
3. Nouvelle page Aujourd'hui pour admin et secrétaire : cartes d'action en haut (paiements en retard, séances sans enseignant, élèves en brouillon, absences à justifier), et gros boutons Inscrire un élève, Encaisser un paiement, Ajouter une séance. Les statistiques passent en dessous.
4. Recherche globale (Ctrl+K et bouton dans l'en-tête) : élève, parent, téléphone, enseignant, classe. Résultat qui ouvre directement la fiche.
5. Fiche élève centrale : une page unique avec onglets Infos, Classes, Paiements, Absences, Contact parent, avec boutons Encaisser et Relancer par WhatsApp.
6. Encaissement rapide : bouton Encaisser accessible depuis la recherche et la fiche, montant pré-rempli avec le reste dû, choix du mode de paiement, génération d'un reçu PDF numéroté (réutilise jspdf et cash-register.ts).
7. Remplace les 8 appels confirm() par le composant AlertDialog. Pour les élèves, enseignants et classes : archiver au lieu de supprimer, avec bouton Annuler pendant 8 secondes.
8. Supprime les pages fantômes (/users, /student/scan, /student/qrcode, /admin/justifications) ou donne-leur une vraie fonction. Supprime le voyant En ligne de l'en-tête. Corrige la connexion pour rediriger la secrétaire vers /secretary/dashboard. Ajoute Mot de passe oublié sur la page de connexion.
9. Page d'accueil publique : fais fonctionner le formulaire de contact (enregistre dans une table contact_messages et affiche une confirmation), et remplace les chiffres et avis en dur par des valeurs modifiables dans un fichier de configuration (src/config/school.ts) que je remplirai.

PHASE 3 – CONFORT, MOBILE, ACCESSIBILITÉ
1. Tableaux : version cartes empilées en dessous de 768 px pour les paiements, élèves et classes. Recherche et pagination côté serveur (25 par page).
2. Formulaires : zod + react-hook-form, erreurs sous chaque champ, téléphone algérien (05, 06, 07 ou +213), montants en DA avec séparateurs. Brouillon automatique dans les assistants élève et enseignant.
3. Accessibilité : aria-label sur tous les boutons-icônes, focus visible, contraste AA minimum, navigation clavier dans les menus et dialogues.
4. Justificatifs d'absence : l'élève ou le parent dépose une photo ou un PDF depuis Mes absences (bucket Supabase Storage privé, liens signés) ; la secrétaire valide ou refuse dans Aujourd'hui, et le statut passe à Justifié.
5. Appel enseignant : tous présents par défaut, l'enseignant décoche les absents, un bouton Terminer l'appel.
6. Scan par caméra (html5-qrcode déjà installé) dans le tableau de bord secrétaire, avec retour sonore et visuel clair vert ou rouge.

PHASE 4 – QUALITÉ
1. Découpe payments/page.tsx, schedule-management.tsx, students-management.tsx et secretary/dashboard/page.tsx en composants, hooks et server actions de moins de 300 lignes, sans changer le comportement.
2. Centralise les accès Supabase dans src/lib/data. Génère les types avec supabase gen types.
3. Ajoute des tests (vitest) pour : calcul du statut de paiement, rémunération enseignants (taux horaire et pourcentage), détection de conflits, jetons QR.
4. Table audit_log (qui, quoi, quand, avant/après) alimentée pour paiements, suppressions et changements de rôle, avec une page de consultation pour l'admin.
5. Mets à jour README.md : description réelle (soutien, langues, formations), installation, variables d'environnement (sans valeurs), rôles, structure du projet.

CRITÈRES D'ACCEPTATION GLOBAUX
- npm run lint et npm run build passent sans erreur.
- Une secrétaire ne peut jamais créer ni modifier un admin, même en appelant l'action directement.
- Impossible de créer deux séances qui se chevauchent pour la même salle ou le même enseignant.
- Une secrétaire encaisse un paiement depuis la recherche en moins de 3 clics.
- Toutes les pages utilisables sur un téléphone de 360 px de large.

Commence par la PHASE 0, puis arrête-toi.
```

---

*Ce rapport est basé sur une lecture du code. Une fois les clés régénérées et le schéma exporté, je peux refaire un audit RLS précis, table par table.*
