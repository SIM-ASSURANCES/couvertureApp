# SIM Assurances — couvertureApp

Plateforme web de micro-assurance : souscription par QR code, gestion multi-branches (Assurances Accidents/Dommages, Relax, IMF), espace client en libre-service, paiement Wave, génération de contrats PDF et de cartes de prise en charge, réseau de partenaires/agents, back-office complet.

Ce document décrit l'architecture technique et recense l'ensemble des fonctionnalités de l'application, branche par branche.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Architecture du dépôt](#3-architecture-du-dépôt)
4. [Modèle de données](#4-modèle-de-données)
5. [Authentification et rôles](#5-authentification-et-rôles)
6. [Parcours public de souscription](#6-parcours-public-de-souscription)
7. [Paiement Wave](#7-paiement-wave)
8. [Contrats PDF, Conditions Générales et cartes de prise en charge](#8-contrats-pdf-conditions-générales-et-cartes-de-prise-en-charge)
9. [Espace client](#9-espace-client)
10. [Branche "Assurances Accidents et Dommages"](#10-branche-assurances-accidents-et-dommages)
11. [Branche "Relax" (historique)](#11-branche-relax-historique)
12. [Branche "Assurances IMF"](#12-branche-assurances-imf)
13. [Espace Partenaire](#13-espace-partenaire)
14. [Agent de distribution](#14-agent-de-distribution)
15. [Administration générale](#15-administration-générale)
16. [Sinistres et analyse anti-fraude IA](#16-sinistres-et-analyse-anti-fraude-ia)
17. [Notifications](#17-notifications)
18. [Sécurité](#18-sécurité)
19. [Déploiement](#19-déploiement)
20. [Variables d'environnement](#20-variables-denvironnement)
21. [Commandes de développement](#21-commandes-de-développement)

---

## 1. Vue d'ensemble

SIM Assurances CI distribue des produits de micro-assurance (Accidents corporels, Dommages/Incendie, véhicules deux-roues/auto, voyage, habitation, professionnel, et des produits dédiés aux institutions de micro-finance) via un réseau de **partenaires commerçants**, d'**agents de distribution**, et d'**agents IMF**. Le prospect scanne un QR code affiché chez le partenaire, souscrit en ligne, paie par **Wave**, et reçoit un contrat PDF ainsi qu'une carte de prise en charge. Il gère ensuite son contrat (renouvellement, sinistre, téléchargements) depuis un **espace client** en ligne, sans jamais retourner en boutique (sauf pour l'Incendie historique).

Le back-office central permet aux administrateurs de piloter les partenaires, les tarifs, les contrats, les commissions, les sinistres et les statistiques, avec un système de rôles et de branches qui cloisonne les accès (une seule branche pour un admin scopé, toutes pour un Super Admin).

Trois branches métier cohabitent dans la même application :
- **Assurances Accidents et Dommages** — la branche principale et la plus riche fonctionnellement, incluant l'ex-branche "Relax" (RelaxMoto/Auto) désormais unifiée avec elle.
- **Relax** — l'ancienne branche dédiée à RelaxMoto/RelaxAuto ; ses pages admin existent toujours mais ne sont plus dans le menu (voir §11).
- **Assurances IMF** — distribution via des institutions de micro-finance, produits et hiérarchie d'acteurs entièrement différents (voir §12).

## 2. Stack technique

**Backend** (`backend/`) : Node.js + Express (TypeScript, ESM), Prisma ORM sur **PostgreSQL**, JWT (`jsonwebtoken`) pour l'auth, `bcryptjs` pour les mots de passe, `zod` pour la validation, `helmet` + `express-rate-limit` pour la sécurité HTTP, `puppeteer-core` pour le rendu PDF/PNG serveur, `qrcode` pour la génération des QR, `node-cron` pour les tâches planifiées.

**Frontend** (`frontend/`) : React 19 + TypeScript + Vite, React Router 7, `lucide-react` (icônes), `xlsx` (export Excel). Pas de librairie CSS externe : feuilles de styles maison (`theme.css`).

**Base de données** : PostgreSQL, schéma unique décrivant les trois branches (voir §4).

**Paiement** : Wave (Sénégal/CI), avec un **mode stub** intégral (confirmation immédiate sans appel réel) quand `WAVE_API_KEY` est absent — pratique en développement, bloqué explicitement en production (voir §18).

**SMS** : Sayele Send, avec le même principe de mode stub (les messages sont journalisés en console si `SMS_API_KEY` est absent).

**Carte de prise en charge** : intégration Novelia (mode stub si `NOVELIA_API_KEY` absent — génère un numéro de carte local).

**IA anti-fraude sinistres** : OpenRouter (configurable via `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`).

## 3. Architecture du dépôt

```
couvertureApp/
├── backend/
│   ├── prisma/schema.prisma      # schéma unique (Accidents/Dommages + Relax + IMF)
│   ├── prisma/seed.ts            # seed destructif de développement
│   └── src/
│       ├── index.ts              # bootstrap Express, montage des routers, sécurité
│       ├── auth.ts                # middlewares requireAuth/requireBranche/...
│       ├── seed.ts                # bootstrap idempotent du Super Admin en production
│       ├── routes/                # un routeur par domaine fonctionnel (voir ci-dessous)
│       └── services/              # logique métier réutilisée par plusieurs routes
├── frontend/
│   └── src/
│       ├── App.tsx                # arbre de routes complet
│       ├── pages/
│       │   ├── public/            # formulaire de souscription (QR)
│       │   ├── client/            # espace client
│       │   ├── admin/             # back-office (dont admin/relax, admin/imf, admin/accidents)
│       │   ├── partenaire/        # espace partenaire
│       │   ├── agent-imf/         # espace agent IMF
│       │   └── agent-distribution/# espace agent de distribution
│       └── components/            # composants partagés (modales photos/signature/etc.)
├── docker-compose.yaml            # référence de déploiement (le compose réel est édité dans Dokploy)
└── .env.example
```

Chaque domaine backend a son propre fichier de routes, monté dans `index.ts` avec ses propres middlewares d'accès :

| Routeur | Préfixe | Accès |
|---|---|---|
| `authRouter` | `/api/auth` | public (rate-limité) |
| `publicRouter` | `/api/public` | public (rate-limité) — parcours de souscription |
| `partenairesRouter` | `/api/partenaires` | admin |
| `souscriptionsRouter` | `/api/souscriptions` | admin, branche INCENDIE_ACCIDENT — modèles historiques Incendie/Accident |
| `statsRouter` | `/api/stats` | admin, branche INCENDIE_ACCIDENT |
| `assurancesAccidentsRouter` | `/api/assurances-accidents` | admin, branche INCENDIE_ACCIDENT — sous-branche générique |
| `assurancesBrancheRouter` | `/api/assurances-branche` | admin, branche INCENDIE_ACCIDENT — vue unifiée tous produits |
| `relaxRouter` | `/api/relax` | admin, branche RELAX |
| `imfRouter` / `agentImfRouter` | `/api/imf` / `/api/agent-imf` | admin branche IMF / agent IMF |
| `journalRouter` | `/api/journal` | Super Admin |
| `adminsRouter` | `/api/admins` | admin |
| `parametresRouter` | `/api/parametres` | Super Admin (branche INCENDIE_ACCIDENT) |
| `meRouter` | `/api/me` | partenaire |
| `commissionsRouter` | `/api/commissions` | admin |
| `notificationsRouter` | `/api/notifications` | admin, partenaire |
| `clientRouter` | `/api/client` | client |
| `agentDistributionRouter` | `/api/agent-distribution` | agent de distribution |
| `contratsRouter` | `/api/contrats` | mixte (voir §8) |
| `cartesRouter` | `/api/cartes` | mixte (voir §8) |

## 4. Modèle de données

Le schéma Prisma (`backend/prisma/schema.prisma`) couvre les trois branches dans une seule base. Grandes familles de modèles :

**Acteurs** : `Admin` (rôle + branches), `Partenaire` (commerçant, avec ses QR et ses statistiques), `AgentDistribution` (rattaché à un partenaire), `AgentImf` (rattaché à une agence et/ou une ou plusieurs zones).

**Catalogue & tarification** : `Produit` (code, libellé, sous-branche), `TarifProduit` (prime/HT/accessoires/taxes/commission par variante), `TarifAccident`/`TarifIncendie` (grilles historiques), `BaremeSecurpro`/`BaremeSecurstock`/`PalierSecurecolte` (IMF), `IndiceArcImf`/`SousPrefectureArc` (indice sécheresse IMF).

**Souscriptions** :
- `Souscription` — modèle **générique**, utilisé par RelaxMoto, RelaxAuto, RelaxAccidents (Frais Médicaux + générale), RelaxVoyage, SecurHome+ Dommages, SecurPro Dommages ;
- `SouscriptionIncendie` et `SouscriptionAccident` — deux modèles **historiques** distincts (Dommages/Incendie et Accidents), conservés pour compatibilité avec les contrats antérieurs à la refonte générique ;
- `SouscriptionImf` — souscriptions de la branche IMF (SECURPRO/SECURSTOCK/COUPS DURS/SECURECOLTE).

**Paiement & cycle de vie** : `Paiement` (échéances du modèle générique), `QrCode` (tokens QR, précis/sélecteur/unique), `Carte` (cartes RelaxMoto/Auto historiques), `Document` (CNI/Permis/Selfie), `ConditionsGenerales` (CG éditables par clé produit).

**Sinistres** : `SinistreRelax` (tous produits hors IMF), `SinistreImf`.

**IMF spécifique** : `ZoneImf` → `AgenceImf` → `AgentImf`, `SimulationImf`, `BordereauImf`.

**Transverse** : `JournalActivite` (audit trail), `DemandeCommission`, `Notification`, `Parametre` (taux/tarifs globaux singleton).

## 5. Authentification et rôles

Cinq types d'acteurs (`ActorType`), chacun avec son propre point de connexion, plus un point unifié :

- `POST /api/auth/login` — détection automatique admin → partenaire → agent IMF ;
- `POST /api/auth/admin/login`, `/api/auth/partenaire/login`, `/api/auth/agent-imf/login`, `/api/auth/client/login`, `/api/auth/agent-distribution/login`.

**Rôles admin** (`Role`) : `ADMIN` (accès selon `branches` assignées), `BRANCH_SUPER_ADMIN` (super-admin scopé à une ou plusieurs branches — peut gérer tarifs/CG/comptes de sa branche), `SUPER_ADMIN` (accès total, toutes branches automatiquement quel que soit le contenu stocké en base).

**Branches** (`Branche`) : `INCENDIE_ACCIDENT`, `RELAX`, `IMF`.

**Rôles agent IMF** (`RoleImf`) : `AGENT`, `RESPONSABLE_AGENCE`, `RESPONSABLE_ZONE` (une seule zone, accès complet), `CHEF_ZONE` (plusieurs zones, restreint — ni simulateur de vente directe au nom d'un agent, ni sinistres), `FINANCE_COMPTABLE` (accès restreint : tableau de bord, contrats, finance uniquement).

**Middlewares** (`backend/src/auth.ts`) : `requireAuth(...types)` (vérifie le JWT, restreint le(s) type(s) d'acteur), `requireBranche(branche)`/`hasBranche` (réserve une route à une branche), `requireSuperAdminBranche(branche)` (pouvoirs de super-admin délégables), `requireAnySuperAdmin`, `lireTokenOptionnel` (décodage sans forcer l'authentification, utilisé par les routes de cartes accessibles à plusieurs profils). Le JWT expire après 12h.

## 6. Parcours public de souscription

Route frontend : `/s/:produit/:token` (et `/souscription/:token` pour l'ancien format), backend `backend/src/routes/public.ts`.

**Entrée par QR** — `GET /public/qr/:token` résout le token scanné via deux modèles coexistants :
- le modèle générique `QrCode` (prioritaire), qui peut être **précis** (un seul produit fixe), **sélecteur de sous-branche** (liste des produits d'une Assurance), ou depuis la refonte du 07/08/2026 un **QR unique par partenaire** : le prospect choisit d'abord son Assurance (Accidents vs Dommages) puis son produit, en conservant le même token du début à la fin ;
- le modèle historique (`Partenaire.qrIncendie1000Token/2000Token/qrAccidentToken`), en repli, pour Incendie/Accident.

**Produits proposés à la souscription publique** :
- `relaxmoto` / `relaxauto` — abonnement à cycle (mensuel/annuel), curseur multi-périodes (1 à 12 cycles payés d'avance, montant total toujours recalculé côté serveur) ;
- `relaxaccidents_fraismedicaux` — formule à prime fixe, case à cocher obligatoire "je ne suis pas livreur" (produit non conçu pour les livreurs) ;
- `relaxaccidents` — police collective, devis dynamique calculé côté serveur ;
- `relaxvoyage` — formule à prime fixe ;
- `securhome_dommages` / `securpro_dommages` — devis dynamique (aucun `TarifProduit`, calcul par barème/paramètres saisis) ;
- `incendie` / `accident` — modèles historiques, non proposés à la souscription publique mais toujours actifs pour la gestion et le renouvellement.

**Anti-doublon** : un même client (nom + téléphone, ou nom + date de naissance pour Accident) ne peut souscrire qu'une seule fois par produit **une fois la souscription confirmée** ; une tentative non aboutie ne bloque rien. Toute souscription ultérieure au même produit passe par le renouvellement (espace client ou relance admin), jamais par une nouvelle souscription.

**Signature électronique** : capturée avant le paiement (composant `SignaturePad`), envoyée en data URL validée par une regex stricte, stockée dans `donneesSpecifiques.signature` (modèle générique) ou une colonne dédiée (Incendie/Accident).

**Écran de récapitulatif** : avant le paiement, une étape "confirm" affiche l'ensemble des informations saisies pour relecture/correction, avant de déclencher le paiement Wave.

**Après paiement** : génération du contrat PDF et de la carte de prise en charge (voir §8), dépôt des photos d'identité/selfie (`POST .../documents` ou `.../carte-photos`, avec verrou anti-remplacement une fois déposées).

## 7. Paiement Wave

`POST /public/souscriptions/.../initiate` crée la souscription (`waveStatut: en_attente`) puis appelle l'API Wave (`checkoutUrl` + `transactionId`), sauf en **mode stub** (absence de `WAVE_API_KEY`) où la confirmation est immédiate.

Le webhook `POST /public/wave/callback` :
- vérifie la signature HMAC (`WAVE_WEBHOOK_SECRET`) — refuse tout callback si le secret est absent (fail-closed) ;
- contrôle la cohérence du montant payé avec le montant attendu ;
- confirme la souscription/l'échéance (`confirmerAccident`/`confirmerEcheance`) ou marque « échoué » (avec SMS de relance si applicable).

Un **filet de sécurité manuel** (`GET .../verify`, ou un bouton "Vérifier le paiement Wave" côté admin) revérifie l'état directement auprès de Wave si le webhook n'a pas abouti (délai réseau, perte du callback) — disponible pour l'Accident historique et pour le modèle générique.

Le renouvellement suit trois mécaniques distinctes selon le produit (voir §9 et §10).

## 8. Contrats PDF, Conditions Générales et cartes de prise en charge

**Contrat PDF** (`backend/src/routes/contrats.ts`, `POST /api/contrats/pdf`) : rendu 100% serveur via Puppeteer (texte réel, pas une image). Un schéma Zod en union discriminée couvre les types de contrats : incendie, accident, relaxaccidents_fraismedicaux, relaxmoto_relaxauto, relaxvoyage, relaxaccidents_generale, securpro, securpro_dommages, securhome_dommages, et les produits IMF (securstock, securecolte, coupsdurs). Tous les champs texte sont bornés en taille et la signature validée par regex stricte (endpoint non authentifié, exposé à `POST /api/contrats/pdf`). Le PDF détaille la décomposition de prime (prime nette / accessoires / taxes / TTC).

**Conditions Générales éditables** : stockées en base (`ConditionsGenerales`, une ligne par clé produit), modifiables depuis la page admin dédiée ; à défaut de saisie, repli automatique sur un fichier HTML statique livré avec l'application.

**Carte de prise en charge** (`backend/src/routes/cartes.ts`, `POST /api/cartes/png`) : rendu HTML→PNG, disponible pour incendie, accident, relaxmoto, relaxauto, relaxaccidents_fraismedicaux, relaxvoyage (pas RelaxAccidents générale, ni SecurHome+/SecurPro Dommages — assurances de biens, pas de personne). Intégration Novelia (mode stub sans clé API).

**Sécurisation des deux endpoints** — trois voies d'accès : un admin authentifié, le client connecté sur sa propre souscription, ou un `paiementId` confirmé rattaché à la souscription (seul cas public, juste après le retour Wave, avant même que le compte client n'existe).

## 9. Espace client

Route frontend : `/client` (connexion : `/client/connexion`), backend `backend/src/routes/client.ts`.

**Connexion** : téléphone + mot de passe reçu par SMS à la première confirmation du contrat. Un même téléphone peut avoir plusieurs contrats sur plusieurs modèles ; la connexion cible le plus récent parmi les trois (générique/Incendie/Accident).

**Fonctionnalités** :
- Consultation du contrat (données aplaties dans un format commun aux trois modèles).
- Téléchargement du contrat PDF et de la carte de prise en charge — y compris pour RelaxMoto/Auto, qui disposent d'un contrat PDF en plus de la carte.
- **Renouvellement** (`POST /client/renouveler`), selon le produit :
  - Incendie : pas de paiement en ligne — SMS avec lien de complétion (nouvelle réf. facture obligatoire, achat en boutique) ;
  - Accident historique : nouveau paiement Wave sur la même ligne, numéro de police conservé sauf délai de grâce dépassé ;
  - Générique avec cycle (RelaxMoto/Auto) : nouvelle échéance au même cycle et au tarif courant, prolonge la date d'échéance d'autant de cycles ;
  - Générique sans cycle (formule 3 mois) : nouvelle échéance au montant de la prime initiale.
- **Déclaration de sinistre** : type d'événement, date, description, jusqu'à 5 photos, déclenche une analyse anti-fraude IA en tâche de fond.
- **Réseau de soins** : onglet dédié listant les prestataires de soins conventionnés (import du référentiel Novelia).
- **Souscription à d'autres produits du même partenaire** : liste des produits Accidents/Dommages actifs chez le partenaire d'origine, non déjà souscrits par ce téléphone (SecurHome+/SecurPro exclus — nécessitent une évaluation avec le partenaire).
- **Pré-remplissage** : nom/prénom/date de naissance/sexe/pièce d'identité/selfie déjà connus sont repris (modifiables) lors d'une nouvelle souscription, pour ne pas ressaisir l'information.

## 10. Branche "Assurances Accidents et Dommages"

La branche principale, regroupant à la fois les modèles historiques (Incendie, Accident) et tous les produits du modèle générique orientés Accidents/Dommages (RelaxMoto/Auto compris — l'ex-branche Relax y est désormais intégrée sur le plan fonctionnel).

**Pages admin** (menu "Assurances Accidents et Dommages") :
- **Tableau de bord** — chiffre d'affaires, taxes, primes HT par branche (Accidents/Dommages), partenaires actifs, dernières souscriptions (vue unifiée tous produits avec filtres type d'Assurance/type de produit).
- **Partenaires** — CRUD, activation/désactivation, gestion des QR (précis/sélecteur/unique), agents de distribution rattachés.
- **Clients Dommages** — clients du modèle historique Incendie.
- **Clients Accidents** — clients du modèle générique (RelaxAccidents Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro), avec bouton "Vérifier le paiement Wave" pour reconcilier manuellement un renouvellement bloqué.
- **Clients Accidents (historique)** — clients du modèle historique Accident, avec le même bouton de vérification manuelle.
- **Paiement en attente** — souscriptions dont le paiement Wave n'a pas abouti (tous modèles), avec relance SMS et re-vérification manuelle.
- **Contrats** — vue transverse de tous les contrats confirmés, téléchargement PDF/carte, détail de la décomposition de prime, gestion des photos d'identité/selfie.
- **Sinistres** — déclarations reçues depuis l'espace client, tous produits confondus, avec résultat de l'analyse IA anti-fraude (voir §16).
- **Tarifs** — grilles tarifaires (prime, capital garanti, commission, décomposition HT/accessoires/taxes) par produit/variante.
- **Conditions Générales** — édition du texte des CG par produit, avec repli sur les fichiers statiques.
- **Performance & Commissions** — chiffre d'affaires par partenaire, demandes de commission (validation/rejet), export Excel.

**Réseau de soins** : référentiel de plus de 1500 prestataires conventionnés (import Novelia), affiché comme un onglet dans l'espace client.

## 11. Branche "Relax" (historique)

Avant l'unification de RelaxMoto/RelaxAuto dans la branche "Assurances Accidents et Dommages", ces produits avaient leur propre section admin complète, avec son propre routeur backend (`relaxRouter`, `/api/relax`, branche `RELAX`). Ces pages existent toujours et restent fonctionnelles (routées sous `/admin/relax/*`), mais **ne figurent plus dans le menu de navigation** — accessibles uniquement par URL directe :

- `/admin/relax` — tableau de bord dédié RelaxMoto/Auto ;
- `/admin/relax/partenaires` — partenaires Relax ;
- `/admin/relax/moto` et `/admin/relax/auto` — clients par produit ;
- `/admin/relax/paiements-en-attente` — échéances bloquées, avec vérification manuelle par échéance ;
- `/admin/relax/contrats` — contrats RelaxMoto/Auto ;
- `/admin/relax/performance` — commissions par partenaire Relax.

Un compte `ADMIN`/`BRANCH_SUPER_ADMIN` doit avoir la branche `RELAX` pour y accéder (un `SUPER_ADMIN` y a toujours accès).

## 12. Branche "Assurances IMF"

Distribution de micro-assurance à travers un réseau d'**institutions de micro-finance** (zones → agences → agents), entièrement distinct du réseau partenaire/agent de distribution des autres branches.

**Hiérarchie** : `ZoneImf` → `AgenceImf` → `AgentImf`. Cinq rôles (`RoleImf`) :
- **AGENT** — vend (simulateur, souscriptions, sinistres) ;
- **RESPONSABLE_AGENCE** — supervise son agence (unicité vérifiée applicativement) ;
- **FINANCE_COMPTABLE** — même portée que le responsable d'agence, mais seul à voir les commissions ; bloqué pour devis/souscriptions/sinistres ;
- **RESPONSABLE_ZONE** — une seule zone, accès complet en plus de la supervision ;
- **CHEF_ZONE** — plusieurs zones à la fois, accès volontairement restreint (simulateur oui, **jamais** de déclaration de sinistre).

**Produits IMF** :
- **SECURPRO** (incendie commerces) — barème par classe (1 à 4), assiette bâtiment + contenu, coefficients de prévention (gardien/extincteur), garanties optionnelles (vol, dégât des eaux, dommages électriques, bris de glace).
- **SECURSTOCK** (stock nanti par une IMF) — barème par classe, taux dommage électrique/autre cause, plafonds selon localisation et installation électrique (une installation jugée "dangereuse" n'est pas assurable), majorations/minorations selon densité/prévention/gardien/caméra.
- **COUPS DURS** — produit catalogue à prix fixe, trois garanties combinables : Maladie (socle obligatoire), Décès (optionnel, répartition des bénéficiaires devant totaliser 100%), Incapacité temporaire (plafond 500k ou 1M, nécessite Décès) ; prorata linéaire sur une durée de 1 à 12 mois.
- **SECURECOLTE** (assurance indicielle agricole) — basée sur l'**Indice ARC** (indice WRSI observé vs référence, saisi par région/année), qui détermine un palier de sécheresse (forte/moyenne/faible/aucune). Le tarif national est recalculé depuis un référentiel de sous-préfectures (import en masse d'un export ARC officiel), avec un modèle actuariel dédié (fréquences, chargement, marge assureur, taxe).

**Flux de souscription** : simulation de devis (stockée, réutilisable) → conversion en souscription avec identité complète et signature optionnelle → génération d'un numéro de police et **activation directe** (pas de passerelle de paiement en ligne, contrairement aux autres branches). Idempotence prévue pour un usage hors-ligne (PWA).

**Flux sinistre** : déclaration par un agent (hors Finance Comptable/Chef de Zone) → checklist de pièces générée selon le produit/l'événement → instruction → acceptation/rejet (avec motif) → règlement (montant ventilé IMF/souscripteur pour SECURSTOCK). SECURECOLTE est exclu de la déclaration individuelle : indemnisation automatique en masse selon le palier de sécheresse constaté.

**Bordereaux** : reporting/facturation périodique par agence, agrégeant les souscriptions actives d'une fenêtre de dates, avec suivi des virements reçus (statuts émis/partiellement réglé/réglé).

**Pages admin** (menu "Assurances IMF") : Tableau de bord, Zones, Agences, Agents, Barèmes, Indice ARC, Simulateur, Contrats, Sinistres, Bordereaux.

**Espace agent IMF** (`/agent-imf`), adapté selon le rôle : Tableau de bord, Simulateur, Mon réseau (zone/agence, pour les responsables), Contrats, Sinistres (sauf Chef de Zone), Finance (Finance Comptable uniquement).

## 13. Espace Partenaire

Route frontend `/partenaire`, backend `backend/src/routes/me.ts`.

Un partenaire (commerçant) gère depuis son espace :
- son tableau de bord (vue d'ensemble de son activité) ;
- ses souscriptions (tous produits confondus, générique + historiques) ;
- ses commissions (consultation + demande de versement) ;
- son ou ses QR codes (téléchargement, selon le mode : précis/sélecteur/unique) ;
- ses agents de distribution (création, réinitialisation de mot de passe, consultation de leurs souscriptions et de leur propre QR) ;
- son profil.

## 14. Agent de distribution

Route frontend `/agent-distribution`, backend `backend/src/routes/agentDistribution.ts`.

Rôle intermédiaire entre le partenaire (qui le crée depuis son espace) et le client final : il hérite automatiquement des mêmes produits/QR que son partenaire, avec ses propres tokens QR et son propre QR sélecteur le cas échéant.

- Connexion dédiée (téléphone + mot de passe communiqué par le partenaire, avec changement de mot de passe forcé au premier login).
- **Commission** : contrairement au partenaire (rémunéré sur ses ventes directes) et à l'agent IMF (autre branche), l'agent de distribution touche **75% de la commission générée par ses propres ventes**, les 25% restants revenant au partenaire — cycle de demande de versement de 14 jours, validé par l'admin.
- Accès en lecture seule à sa propre activité (souscriptions, QR, commission due) — aucune fonction de gestion partenaire.

## 15. Administration générale

- **Administrateurs** (`/admin/administrateurs`) — gestion des comptes admin (création, rôle, branches assignées) ; un `BRANCH_SUPER_ADMIN` ne peut créer que des comptes `ADMIN` scopés à sa/ses propre(s) branche(s), jamais un autre super-administrateur.
- **Journal d'activité** (`/admin/journal`) — audit trail de toutes les actions (création/modification/suppression/export/connexion/relance), réservé au Super Admin, avec valeurs avant/après et IP d'origine.
- **Paramètres** (`/admin/parametres`) — taux de commission globaux, tarifs des modèles historiques (Incendie/Accident), édition des Conditions Générales, déclenchement manuel des relances SMS d'échéance.
- **Profil** — modification de son propre nom/email/mot de passe.

Une tâche planifiée (`node-cron`, 8h heure d'Abidjan) envoie automatiquement les relances SMS d'échéance (J-5 et jour J) — déclenchable aussi manuellement depuis Paramètres.

## 16. Sinistres et analyse anti-fraude IA

Un client peut déclarer un sinistre depuis son espace (tous produits hors IMF, qui a son propre workflow — voir §12) : type d'événement, date, description, jusqu'à 5 photos.

Chaque déclaration déclenche une **analyse anti-fraude par IA** (OpenRouter) en tâche de fond, dont le résultat (score/indices de suspicion) est affiché à l'admin sur la page Sinistres pour l'aider à instruire le dossier — sans bloquer ni retarder la déclaration elle-même.

## 17. Notifications

Un système de notifications in-app (cloche, `NotificationsBell`) informe les admins et les partenaires des événements pertinents (ex. commission validée/rejetée). Les admins ne voient que les notifications de leurs branches (un Super Admin voit tout) ; les partenaires ne voient que les leurs.

## 18. Sécurité

- **Refus de démarrage en production** si `WAVE_API_KEY` ou `SMS_API_KEY` sont absents — le mode stub confirmerait des paiements sans encaissement réel, ou journaliserait des mots de passe en clair.
- **CORS** restreint explicitement à `CORS_ORIGIN`/`APP_PUBLIC_URL` — refuse de démarrer si aucune origine n'est configurée (jamais de reflet automatique de l'origine).
- **En-têtes de sécurité** via `helmet` (anti-clickjacking, anti-MIME-sniffing, HSTS...).
- **Rate limiting** dédié sur les routes d'authentification et les routes publiques.
- **Webhook Wave** vérifié par signature HMAC (`WAVE_WEBHOOK_SECRET`), fail-closed si le secret est absent.
- **Endpoints de génération PDF/PNG** non authentifiés mais fortement contraints (champs texte bornés en taille, signature validée par regex stricte) pour limiter le temps de rendu Chromium et empêcher toute injection.
- **Accès aux contrats/cartes** à trois niveaux (admin, client propriétaire, ou `paiementId` confirmé) — jamais par simple connaissance d'un identifiant de souscription (sauf exception historique documentée pour Incendie/Accident).
- **Journal d'audit** complet (`JournalActivite`) sur toutes les actions sensibles côté admin.
- Aucun secret (clé Wave, SMS, Novelia, OpenRouter, JWT) n'est commité — tous transitent par variables d'environnement (`.env`, non versionné).

## 19. Déploiement

Hébergement sur un VPS via **Dokploy + Traefik**. Deux images Docker publiées sur GHCR (`ghcr.io/sim-assurances/couvertureapp-backend`, `couvertureapp-frontend`), versionnées (`vN`).

Le `docker-compose.yaml` du dépôt sert de **référence** (3 services : `postgres`, `backend`, `frontend`) mais **n'est pas** le fichier réellement utilisé en production — le compose exécuté est édité directement dans le tableau de bord Dokploy.

Le frontend est buildé avec `VITE_API_URL=/api` (chemin relatif) ; `nginx.conf` proxifie `/api/` vers le service `backend` avec résolution DNS dynamique (`resolver` Docker), pour survivre à la recréation du conteneur backend.

Le backend exécute au démarrage : `prisma db push --accept-data-loss` (synchronisation du schéma) puis `dist/src/seed.js` (bootstrap **idempotent** du Super Admin depuis les variables `SUPER_ADMIN_*` — à ne pas confondre avec `prisma/seed.ts`, destructif, réservé au développement local).

## 20. Variables d'environnement

Voir `.env.example` à la racine. Principales variables :

| Variable | Rôle |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Connexion PostgreSQL |
| `JWT_SECRET` | Signature des JWT (tous types d'acteurs) |
| `APP_PUBLIC_URL` | Domaine public — liens QR/SMS/WhatsApp, restriction CORS |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_NOM` | Bootstrap du compte Super Admin au premier démarrage |
| `WAVE_API_KEY` / `WAVE_WEBHOOK_SECRET` | Paiement Wave — absent = mode stub |
| `SMS_API_KEY` / `SMS_API_URL` / `SMS_SENDER` | SMS (Sayele Send) — absent = mode stub (console) |
| `NOVELIA_API_KEY` | Cartes de prise en charge — absent = mode stub |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Analyse anti-fraude IA des sinistres |

## 21. Commandes de développement

**Backend** (`backend/`) :
```bash
npm run dev              # tsx watch, serveur de dev
npm run build            # tsc
npm run prisma:generate  # génère le client Prisma
npm run prisma:push      # synchronise le schéma avec la base
npm run seed             # seed destructif de développement (prisma/seed.ts)
```

**Frontend** (`frontend/`) :
```bash
npm run dev       # serveur Vite
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # prévisualisation du build
```
