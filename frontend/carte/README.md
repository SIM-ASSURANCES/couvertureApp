# Atlas CI — Carte interactive de la Côte d'Ivoire

Plateforme cartographique pour explorer les villes ivoiriennes : carte vectorielle, recherche instantanée, fiches détaillées (administration, géographie, économie, culture, services, transport, informations pratiques) avec **sources et niveau de fiabilité affichés pour chaque rubrique**.

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3001/carte
npm run build        # export statique dans out/
```

Node ≥ 20.9. Les données géographiques générées sont versionnées : aucune clé d'API n'est nécessaire.

## Intégration couvertureApp

La carte est intégrée à l'espace admin (menu « Carte interactive », après « Partenaires ») :

- `next.config.ts` : `output: "export"` + `basePath: "/carte"` (surchargeable par `NEXT_PUBLIC_BASE_PATH`) ; les URL brutes de `public/` passent par `BASE_PATH` (`src/lib/site.ts`).
- `frontend/Dockerfile` : étape `carte` qui exporte le site, copié dans `/usr/share/nginx/html/carte` ; `frontend/nginx.conf` sert `/carte/*`.
- `frontend/src/pages/admin/Carte.tsx` : affiche `/carte` dans une iframe (styles Tailwind isolés du reste de l'application).
- En développement : lancer `npm run dev` ici et `npm run dev` dans `frontend/` (Vite relaie `/carte` vers le port 3001).

## Architecture

| Couche | Rôle | Emplacement |
| --- | --- | --- |
| Données éditoriales | Une fiche JSON par ville, validée par Zod au build | `src/data/cities/*.json` |
| Données générées | Limites, localités, coordonnées, altitude, photos, itinéraires | `public/data/`, `src/data/generated/` |
| Référentiels | Districts/régions, sources, faits nationaux | `src/data/reference/`, `src/data/sources.ts`, `src/data/country.ts` |
| Dépôt serveur | Lecture, validation, fusion, calculs (voisinage, distances) | `src/server/cities.ts` |
| Cartographie | MapLibre GL : couches, styles, interactions | `src/lib/map/`, `src/components/explorer/MapView.tsx` |
| Interface | Coquille, panneau/bottom sheet, recherche, fiche à onglets | `src/components/` |
| Routes | `/`, `/ville/[id]` (SSG), `/api/cities.json`, `/api/cities/[id]`, sitemap | `src/app/` |

- **Chargement progressif** : la page n'embarque que l'index léger des villes. MapLibre est chargé à part, les localités (GeoJSON) sont lues par la carte dans un Web Worker, et le détail d'une fiche n'est transmis qu'à son ouverture (page statique pré-générée).
- **Rendu performant** : tous les points sont dessinés en WebGL (couches `circle`/`symbol`), les localités sont regroupées (clustering) aux petites échelles. L'unique élément DOM posé sur la carte est le marqueur de sélection.
- **URL partageables** : `/ville/bouake#economie` ouvre directement la fiche et l'onglet.

## Ajouter une ville

1. Créer `src/data/cities/<id>.json` (copier une fiche existante). Seules les références `refs.osm` (nœud OpenStreetMap `node/<id>`) et `refs.wikidata` sont nécessaires pour la géolocalisation.
2. Lancer `npm run data:enrich` : coordonnées (OSM), altitude et photo (Wikidata/Commons), distance et durée depuis Abidjan (OSRM).
3. `npm run build` : la fiche est validée (schéma Zod, district/région existants) puis publiée sur `/ville/<id>`.

Aucun code à modifier. Un champ invalide fait échouer le build avec un message explicite.

## Pipeline de données

```bash
npm run data:boundaries   # geoBoundaries → contours pays/districts/régions + localisateur SVG
npm run data:localities   # OpenStreetMap (Overpass) → villes et bourgs, rattachés à leur district
npm run data:enrich       # OSM + Wikidata + Commons + OSRM → src/data/generated/cities-enrichment.json
npm run data:all
```

Variables optionnelles : `OVERPASS_URL`, `OSRM_URL`.

## Fiabilité et sources

Chaque rubrique porte un badge :

- **Sourcé** : donnée issue d'une source identifiée (INS RGPH 2021, OSM, Wikidata, UNESCO…).
- **Calculé** : valeur calculée (distances à vol d'oiseau, itinéraire OSRM, villes voisines).
- **À vérifier** : contenu éditorial de démonstration, à recouper avant une mise en production.

| Donnée | Source | Licence |
| --- | --- | --- |
| Population | INS — RGPH 2021, résultats globaux définitifs (2022) | — |
| Coordonnées, localités | © contributeurs OpenStreetMap | ODbL |
| Limites administratives | geoBoundaries (Banque mondiale / OCHA, 2016) | CC BY 4.0 |
| Altitude, images | Wikidata / Wikimedia Commons (auteur cité par image) | CC0 / CC BY-SA |
| Itinéraires | OSRM sur données OSM | — |
| Fond de carte | CARTO Positron / Dark Matter, données OSM | voir conditions CARTO |

## Identité visuelle (charte SIM Assurances)

| Élément | Application |
| --- | --- |
| Couleurs corporate | `#004B9C` (bleu foncé : boutons, liens, marqueurs) et `#51AEE2` (bleu clair : accents en mode sombre, éléments graphiques) — échelle `accent-*` dans `src/app/globals.css` |
| Dégradé signature | `.brand-band` : `#19307A → #194187 → #1985B9`, repris des bandeaux de la charte |
| Typographie | Montserrat (institutionnelle), Arial en secours ; les étiquettes de la carte utilisent aussi Montserrat |
| Logotype | Fichiers officiels recadrés dans `public/brand/` ; composant `BrandLogo` : couleur sur fond clair, blanc sur fond sombre, hauteur ≥ 24 px (≈ 40 mm minimum), ratio conservé, jamais pivoté |
| Icônes | `src/app/icon.png` et `apple-icon.png` générés à partir du symbole officiel |

Couleurs d'offre de la charte (non utilisées sur la carte, réservées aux rubriques produit) : Dommage `#FF0000`, Santé jaune, Accident orange. Les valeurs CMJN/RVB indiquées pour ces trois couleurs dans la charte reprennent par erreur celles du bleu clair : à faire confirmer par le service communication.

## Production

- **Tuiles** : les fonds CARTO gratuits ont des limites d'usage. Pour un trafic important, auto-hébergez des tuiles (Protomaps/PMTiles) ou utilisez un fournisseur avec clé, via `NEXT_PUBLIC_MAP_STYLE_LIGHT` / `NEXT_PUBLIC_MAP_STYLE_DARK` (adapter `FONT_*` dans `src/lib/map/config.ts`).
- **SEO** : métadonnées par ville, JSON-LD `schema.org/City`, `sitemap.xml`, `robots.txt`, manifeste PWA.
- **Accessibilité** : navigation clavier (recherche `/` ou `Ctrl+K`, onglets aux flèches, `Échap` pour fermer), rôles ARIA (combobox, tablist, dialog), contrastes AA, `prefers-reduced-motion` respecté.
