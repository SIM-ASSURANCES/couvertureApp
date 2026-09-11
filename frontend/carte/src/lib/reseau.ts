import { getRegion } from "@/lib/admin";
import { normalize } from "@/lib/search";
import type { BBox, LngLat, Locality } from "@/lib/types";

/**
 * Réseau de distribution (partenaires Assurances Accidents et Dommages et leurs
 * sous-agents), transmis par l'espace admin couvertureApp à la carte embarquée
 * (voir frontend/src/pages/admin/Carte.tsx). La position de chacun est déduite
 * de sa localisation saisie en texte libre (« Cocody, Angré », « Bouaké »…) :
 * aucune coordonnée n'est stockée côté serveur.
 */

export interface ReseauAgent {
  id: string;
  /** Absents si l'admin n'est pas super-administrateur de la branche. */
  nom?: string | null;
  telephone?: string | null;
  localisation: string | null;
  statut: string;
}

export interface ReseauPartenaire {
  id: string;
  nomCommerce: string;
  nomResponsable: string;
  telephone: string;
  localisation: string | null;
  statut: string;
  agents: ReseauAgent[];
}

export interface Lieu {
  key: string;
  name: string;
  coordinates: LngLat;
  region: string | null;
  /** Commune (ou quartier) d'Abidjan plutôt qu'une localité OpenStreetMap. */
  commune: boolean;
}

export interface GroupeLieu {
  partenaire: ReseauPartenaire;
  /** Le partenaire lui-même est ici (sinon seuls certains de ses sous-agents le sont). */
  ici: boolean;
  /** `herite` : placé chez son partenaire, faute de localisation propre reconnue. */
  agents: { agent: ReseauAgent; herite: boolean }[];
}

export interface LieuReseau {
  lieu: Lieu;
  groupes: GroupeLieu[];
  nbPartenaires: number;
  nbAgents: number;
}

export interface RegionReseau {
  id: string;
  name: string;
  nbPartenaires: number;
  nbAgents: number;
  lieux: LieuReseau[];
}

export interface NonLocalise {
  partenaire: ReseauPartenaire;
  /** Sous-agents qui n'ont pas pu être placés non plus. */
  agents: ReseauAgent[];
}

export interface ReseauAgrege {
  lieux: LieuReseau[];
  regions: RegionReseau[];
  nonLocalises: NonLocalise[];
  totaux: { partenaires: number; agents: number; partenairesLocalises: number; agentsLocalises: number };
}

export const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

const REGION_ABIDJAN = "da-abidjan";

/**
 * Communes d'Abidjan (absentes des localités OSM du pays) et quartiers courants
 * rattachés à leur commune. Coordonnées approximatives du centre de la commune.
 */
const COMMUNES_ABIDJAN: { name: string; coordinates: LngLat; alias: string[] }[] = [
  { name: "Abobo", coordinates: [-4.0205, 5.418], alias: ["anador", "avocatier", "pk 18", "pk18", "sagbe", "agbekoi", "ndotre", "n dotre"] },
  { name: "Adjamé", coordinates: [-4.027, 5.361], alias: ["williamsville", "220 logements", "bracodi"] },
  { name: "Attécoubé", coordinates: [-4.045, 5.335], alias: ["locodjro", "abobo doume", "agban"] },
  {
    name: "Cocody",
    coordinates: [-3.987, 5.355],
    alias: ["angre", "riviera", "deux plateaux", "2 plateaux", "ii plateaux", "palmeraie", "attoban", "faya", "blockhauss", "mermoz", "ambassades", "cite des arts", "bonoumin", "vallon"],
  },
  { name: "Koumassi", coordinates: [-3.953, 5.297], alias: ["grand campement"] },
  { name: "Marcory", coordinates: [-3.984, 5.303], alias: ["zone 4", "zone iv", "bietry", "anoumabo"] },
  { name: "Plateau", coordinates: [-4.018, 5.322], alias: [] },
  { name: "Port-Bouët", coordinates: [-3.93, 5.255], alias: ["vridi", "gonzagueville", "adjouffou", "jean folly"] },
  { name: "Treichville", coordinates: [-4.005, 5.3], alias: ["arras"] },
  { name: "Yopougon", coordinates: [-4.078, 5.345], alias: ["yop", "niangon", "selmer", "sideci", "toits rouges", "siporex", "wassakara", "port bouet 2", "gesco", "koute"] },
];

/** Abréviations usuelles → nom normalisé d'une localité OSM. */
const ALIAS_LOCALITES: Record<string, string> = { yakro: "yamoussoukro", bassam: "grand bassam", abj: "abidjan" };

/** Normalisation de saisie libre : sans accents, casse ni ponctuation (« Cocody, Angré » → « cocody angre »). */
const norm = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Rang de priorité quand un texte cite plusieurs lieux :
 * 3 = localité hors d'Abidjan (« Daloa, quartier Plateau » → Daloa, pas le Plateau d'Abidjan) ;
 * 2 = commune/quartier d'Abidjan ou localité du district (Bingerville, Anyama…) ;
 * 1 = « Abidjan » seul (centre-ville, faute de commune précisée).
 */
interface EntreeGazetteer {
  cle: string;
  lieu: Lieu;
  rang: number;
  population: number;
}
export type Gazetteer = EntreeGazetteer[];

export function construireGazetteer(localities: Locality[]): Gazetteer {
  const parCle = new Map<string, EntreeGazetteer>();
  const ajouter = (cle: string, lieu: Lieu, rang: number, population = 0) => {
    if (!cle) return;
    const existant = parCle.get(cle);
    // Homonymes : le rang le plus élevé, puis la localité la plus peuplée.
    if (existant && (existant.rang > rang || (existant.rang === rang && existant.population >= population))) return;
    parCle.set(cle, { cle, lieu, rang, population });
  };

  for (const l of localities) {
    const lieu: Lieu = { key: `l:${l.id}`, name: l.name, coordinates: l.coordinates, region: l.region ?? null, commune: false };
    const rang = l.district !== "abidjan" ? 3 : l.id === "abidjan" ? 1 : 2;
    ajouter(norm(l.name), lieu, rang, l.population ?? 0);
  }
  for (const c of COMMUNES_ABIDJAN) {
    const cle = norm(c.name);
    const lieu: Lieu = { key: `c:${cle.replace(/ /g, "-")}`, name: c.name, coordinates: c.coordinates, region: REGION_ABIDJAN, commune: true };
    for (const k of [cle, ...c.alias]) ajouter(k, lieu, 2);
  }
  for (const [alias, cible] of Object.entries(ALIAS_LOCALITES)) {
    const e = parCle.get(cible);
    if (e) ajouter(alias, e.lieu, e.rang, e.population);
  }
  return [...parCle.values()];
}

/** Lieu cité par une localisation en texte libre (mots entiers), ou `null` si rien n'est reconnu. */
export function localiser(texte: string | null | undefined, gazetteer: Gazetteer): Lieu | null {
  const t = texte ? norm(texte) : "";
  if (!t) return null;
  const padded = ` ${t} `;
  let meilleur: EntreeGazetteer | null = null;
  for (const e of gazetteer) {
    if (!padded.includes(` ${e.cle} `)) continue;
    if (!meilleur || e.rang > meilleur.rang || (e.rang === meilleur.rang && e.cle.length > meilleur.cle.length)) meilleur = e;
  }
  return meilleur?.lieu ?? null;
}

const totalLieu = (x: { nbPartenaires: number; nbAgents: number }) => x.nbPartenaires + x.nbAgents;

/**
 * Place partenaires et sous-agents, puis regroupe par lieu et par région.
 * Un sous-agent sans localisation propre reconnue est placé chez son partenaire.
 */
export function agreger(partenaires: ReseauPartenaire[], gazetteer: Gazetteer, inclureInactifs: boolean): ReseauAgrege {
  const compte = (statut: string) => inclureInactifs || statut === "actif";
  const lieux = new Map<string, LieuReseau>();
  const nonLocalises: NonLocalise[] = [];
  const totaux = { partenaires: 0, agents: 0, partenairesLocalises: 0, agentsLocalises: 0 };

  const placer = (lieu: Lieu, p: ReseauPartenaire) => {
    let lr = lieux.get(lieu.key);
    if (!lr) {
      lr = { lieu, groupes: [], nbPartenaires: 0, nbAgents: 0 };
      lieux.set(lieu.key, lr);
    }
    let g = lr.groupes.find((x) => x.partenaire.id === p.id);
    if (!g) {
      g = { partenaire: p, ici: false, agents: [] };
      lr.groupes.push(g);
    }
    return { lr, g };
  };

  for (const p of partenaires) {
    if (!compte(p.statut)) continue;
    totaux.partenaires++;
    const lieuP = localiser(p.localisation, gazetteer);
    if (lieuP) {
      const { lr, g } = placer(lieuP, p);
      g.ici = true;
      lr.nbPartenaires++;
      totaux.partenairesLocalises++;
    }
    const perdus: ReseauAgent[] = [];
    for (const a of p.agents) {
      if (!compte(a.statut)) continue;
      totaux.agents++;
      const propre = localiser(a.localisation, gazetteer);
      const lieuA = propre ?? lieuP;
      if (!lieuA) {
        perdus.push(a);
        continue;
      }
      const { lr, g } = placer(lieuA, p);
      g.agents.push({ agent: a, herite: !propre });
      lr.nbAgents++;
      totaux.agentsLocalises++;
    }
    if (!lieuP) nonLocalises.push({ partenaire: p, agents: perdus });
  }

  const liste = [...lieux.values()].sort((a, b) => totalLieu(b) - totalLieu(a) || a.lieu.name.localeCompare(b.lieu.name, "fr"));
  for (const lr of liste) {
    lr.groupes.sort((a, b) => Number(b.ici) - Number(a.ici) || a.partenaire.nomCommerce.localeCompare(b.partenaire.nomCommerce, "fr"));
  }

  const regions = new Map<string, RegionReseau>();
  for (const lr of liste) {
    const id = lr.lieu.region ?? "inconnue";
    let r = regions.get(id);
    if (!r) {
      r = { id, name: getRegion(lr.lieu.region)?.name ?? "Région non déterminée", nbPartenaires: 0, nbAgents: 0, lieux: [] };
      regions.set(id, r);
    }
    r.nbPartenaires += lr.nbPartenaires;
    r.nbAgents += lr.nbAgents;
    r.lieux.push(lr);
  }

  return {
    lieux: liste,
    regions: [...regions.values()].sort((a, b) => totalLieu(b) - totalLieu(a) || a.name.localeCompare(b.name, "fr")),
    nonLocalises,
    totaux,
  };
}

/** Une pastille par lieu (le regroupement aux petites échelles est fait par MapLibre). */
export function reseauToGeoJSON(agg: ReseauAgrege | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: (agg?.lieux ?? []).map((lr) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: lr.lieu.coordinates },
      properties: { key: lr.lieu.key, name: lr.lieu.name, nbPartenaires: lr.nbPartenaires, nbAgents: lr.nbAgents, total: totalLieu(lr) },
    })),
  };
}

/** Emprise d'un ensemble de lieux, `null` s'il y en a moins de deux. */
export function bboxLieux(lieux: LieuReseau[]): BBox | null {
  if (lieux.length < 2) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const { lieu } of lieux) {
    const [lon, lat] = lieu.coordinates;
    w = Math.min(w, lon);
    s = Math.min(s, lat);
    e = Math.max(e, lon);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}
