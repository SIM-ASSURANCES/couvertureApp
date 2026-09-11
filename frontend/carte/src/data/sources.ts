import type { Source } from "@/lib/schema/city";

/**
 * Catalogue des sources citées par les fiches. Une fiche référence une source par son `id`.
 * Toute nouvelle source doit indiquer l'éditeur, la date de référence et, si possible, l'URL.
 */
export const SOURCES = {
  "ins-rgph-2021": {
    id: "ins-rgph-2021",
    title: "RGPH 2021 — Résultats globaux définitifs",
    publisher: "Institut National de la Statistique (INS) / Ministère du Plan et du Développement",
    url: "https://plan.gouv.ci/uploads/publications/RGPH2021-RESULTATS-GLOBAUX-VF.pdf",
    date: "2022-07",
  },
  "datagouv-rgph-2021-districts": {
    id: "datagouv-rgph-2021-districts",
    title: "Population, superficie et densité par district et région administrative (RGPH 2021)",
    publisher: "Portail officiel des données ouvertes de Côte d'Ivoire",
    url: "https://data.gouv.ci/datasets/population-superficie-et-densite-par-district-et-region-administrative-rgph-2021",
    date: "2022",
  },
  "decret-2011-263": {
    id: "decret-2011-263",
    title: "Décret n° 2011-263 portant organisation du territoire en districts et régions",
    publisher: "Gouvernement de Côte d'Ivoire",
    date: "2011-09-28",
  },
  osm: {
    id: "osm",
    title: "OpenStreetMap — coordonnées des localités",
    publisher: "Contributeurs OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
  },
  geoboundaries: {
    id: "geoboundaries",
    title: "geoBoundaries — limites administratives CIV (ADM0-ADM2)",
    publisher: "William & Mary geoLab ; données Banque mondiale / OCHA",
    url: "https://www.geoboundaries.org/",
    date: "2016",
    license: "CC BY 4.0",
  },
  wikidata: {
    id: "wikidata",
    title: "Wikidata — altitude et médias",
    publisher: "Fondation Wikimédia",
    url: "https://www.wikidata.org/",
    license: "CC0",
  },
  commons: {
    id: "commons",
    title: "Wikimedia Commons — photographies",
    publisher: "Fondation Wikimédia (auteurs cités sur chaque image)",
    url: "https://commons.wikimedia.org/",
  },
  osrm: {
    id: "osrm",
    title: "OSRM — distances et durées routières calculées",
    publisher: "Project OSRM, sur données OpenStreetMap",
    url: "https://project-osrm.org/",
  },
  "unesco-grand-bassam": {
    id: "unesco-grand-bassam",
    title: "Ville historique de Grand-Bassam — Liste du patrimoine mondial",
    publisher: "UNESCO",
    url: "https://whc.unesco.org/fr/list/1322",
    date: "2012",
  },
  "unesco-mosquees-soudanaises": {
    id: "unesco-mosquees-soudanaises",
    title: "Mosquées de style soudanais du nord ivoirien — Liste du patrimoine mondial",
    publisher: "UNESCO",
    url: "https://whc.unesco.org/fr/list/1648",
    date: "2021",
  },
  artci: {
    id: "artci",
    title: "Plan de numérotation à 10 chiffres (+225)",
    publisher: "ARTCI — Autorité de Régulation des Télécommunications de Côte d'Ivoire",
    url: "https://www.artci.ci/",
    date: "2021-01-31",
  },
  bceao: {
    id: "bceao",
    title: "Franc CFA (XOF) — monnaie de l'UEMOA",
    publisher: "BCEAO",
    url: "https://www.bceao.int/",
  },
  editorial: {
    id: "editorial",
    title: "Rédaction Atlas CI — contenu de démonstration à valider",
    publisher: "Équipe éditoriale",
    date: "2026-09",
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

export function resolveSource(ref: string | Source): Source | undefined {
  if (typeof ref !== "string") return ref;
  return (SOURCES as Record<string, Source>)[ref];
}
