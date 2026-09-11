import { z } from "zod";

/**
 * Niveau de fiabilité d'une information :
 * - verified  : donnée issue d'une source citée (INS, OSM, Wikidata, UNESCO…)
 * - computed  : valeur calculée par l'application (distances, voisinage, itinéraires)
 * - to-verify : contenu éditorial non encore recoupé avec une source officielle
 */
export const ConfidenceSchema = z.enum(["verified", "computed", "to-verify"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Élément d'information court. Accepte une simple chaîne pour faciliter la saisie. */
export const InfoItemSchema = z
  .union([
    z.string().min(1),
    z.object({
      name: z.string().min(1),
      detail: z.string().optional(),
      confidence: ConfidenceSchema.optional(),
      source: z.string().optional(),
      url: z.url().optional(),
    }),
  ])
  .transform((v) => (typeof v === "string" ? { name: v } : v));
export type InfoItem = z.output<typeof InfoItemSchema>;

const items = () => z.array(InfoItemSchema).default([]);

/** Métadonnées communes à chaque rubrique de la fiche. */
const section = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    confidence: ConfidenceSchema.default("to-verify"),
    sources: z.array(z.string()).default([]),
    ...shape,
  });

export const SourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  publisher: z.string(),
  url: z.url().optional(),
  date: z.string().optional(),
  license: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const EconomyCategorySchema = z.enum([
  "agriculture",
  "trade",
  "industry",
  "logistics",
  "services",
  "tourism",
  "resources",
  "crafts",
  "fishing",
]);
export type EconomyCategory = z.infer<typeof EconomyCategorySchema>;

const MeasureSchema = z.object({
  value: z.number().positive(),
  year: z.number().int().min(1900).max(2100).optional(),
  scope: z.string(),
  source: z.string(),
  confidence: ConfidenceSchema.default("verified"),
  note: z.string().optional(),
});

export const CitySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "identifiant en minuscules, chiffres et tirets"),
  name: z.string().min(1),
  tagline: z.string().max(90),
  summary: z.string().max(420),
  updatedAt: z.iso.date(),
  refs: z.object({
    osm: z.string().regex(/^node\/\d+$/, "référence OSM attendue : node/<id>"),
    wikidata: z.string().regex(/^Q\d+$/).optional(),
  }),
  admin: section({
    district: z.string(),
    region: z.string().nullable(),
    department: z.string(),
    subPrefecture: z.string().optional(),
    status: z.array(z.string()).min(1),
  }),
  population: MeasureSchema.extend({ value: z.number().int().positive(), year: z.number().int() }).nullable(),
  area: MeasureSchema.extend({ unit: z.literal("km²") }).nullable().default(null),
  geography: section({
    situation: z.string(),
    relief: z.string().optional(),
    hydrography: items(),
    landmarks: items(),
  }),
  economy: section({
    summary: z.string(),
    sectors: z.array(z.object({ category: EconomyCategorySchema, items: z.array(InfoItemSchema).min(1) })).min(1),
  }),
  culture: section({
    sites: items(),
    heritage: items(),
    events: items(),
    traditions: items(),
  }),
  services: section({
    health: items(),
    education: items(),
    higherEducation: items(),
    infrastructure: items(),
    publicServices: items(),
  }),
  transport: section({
    roads: items(),
    modes: items(),
    airports: items(),
    railways: items(),
    ports: items(),
  }),
  practical: section({
    climate: z.object({
      type: z.string(),
      koppen: z.string().optional(),
      seasons: items(),
    }),
    languages: z.array(z.string()).min(1),
    tips: items(),
  }),
  /** Identifiants du catalogue (src/data/sources.ts) ou sources propres à la fiche. */
  sources: z.array(z.union([z.string(), SourceSchema])).default([]),
});

export type CityInput = z.input<typeof CitySchema>;
export type City = z.output<typeof CitySchema>;

// --- Enrichissement généré (scripts/enrich-cities.mjs) ---
export const EnrichmentSchema = z.object({
  generatedAt: z.string(),
  cities: z.record(
    z.string(),
    z.object({
      coordinates: z.object({ lat: z.number(), lon: z.number(), source: z.string(), ref: z.string() }).optional(),
      elevation: z.object({ value: z.number(), source: z.string() }).optional(),
      wikipedia: z.object({ title: z.string(), url: z.url() }).optional(),
      image: z
        .object({
          src: z.url(),
          width: z.number().optional(),
          height: z.number().optional(),
          author: z.string(),
          license: z.string(),
          licenseUrl: z.string().optional(),
          pageUrl: z.url(),
          title: z.string(),
        })
        .optional(),
      roadFromAbidjan: z
        .object({ distanceKm: z.number(), durationMin: z.number(), source: z.string(), computedAt: z.string() })
        .optional(),
    }),
  ),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;
export type CityImage = NonNullable<Enrichment["cities"][string]["image"]>;
