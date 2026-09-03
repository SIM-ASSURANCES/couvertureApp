/**
 * Spécification OpenAPI 3.1 de l'API partenaire (`/api/partner/v1`).
 *
 * Servie telle quelle par `GET /api/partner/v1/openapi.json` (voir
 * routes/partnerApi.ts) et rendue par Redoc sur `GET /api/partner/v1/docs`.
 * Objet TypeScript plutôt que fichier .yaml : aucune dépendance de parsing et
 * l'objet est embarqué dans `dist/` au build.
 */

const enveloppeSucces = (dataSchema: Record<string, unknown>, extra?: Record<string, unknown>) => ({
  type: "object",
  properties: { data: dataSchema, ...(extra ?? {}) },
  required: ["data"],
});

const priseEffet = {
  type: "object",
  properties: {
    delaiAttente72h: { type: "boolean" },
    dateEstimee: { type: "string", format: "date-time" },
    description: { type: "string" },
  },
};

const commissionApi = {
  type: "object",
  properties: {
    montant: { type: "integer", description: "Part commission « canal API », en FCFA." },
    montantAReverser: { type: "integer", description: "Prime encaissée par le partenaire moins la commission." },
  },
};

const formuleCatalogue = {
  type: "object",
  properties: {
    libelleVariante: { type: ["string", "null"] },
    prime: { type: "integer" },
    primeHT: { type: ["number", "null"] },
    capitalGaranti: { type: "integer" },
    cycleFacturation: { type: ["string", "null"] },
    garanties: {},
  },
};

const produitCatalogue = {
  type: "object",
  properties: {
    code: { type: "string" },
    libelle: { type: "string" },
    branche: { type: "string" },
    sousBranche: { type: ["string", "null"] },
    typePaiement: { type: "string" },
    actifPourPartenaire: { type: "boolean" },
    kycRequis: { type: "boolean", description: "Si true, pieceIdentiteUrl + selfieUrl sont obligatoires à la souscription." },
    tauxCommissionApi: { type: "number" },
    devisCalcule: { type: "boolean", description: "true = prime calculée dynamiquement, POST /devis non disponible pour l'instant." },
    formules: { type: "array", items: formuleCatalogue },
  },
};

const souscriptionListe = {
  type: "object",
  properties: {
    id: { type: "string" },
    produit: { type: "string" },
    produitLibelle: { type: "string" },
    formule: { type: ["string", "null"] },
    statut: { type: "string", enum: ["en_attente_confirmation", "confirmee", "echouee"] },
    nom: { type: ["string", "null"] },
    prenom: { type: ["string", "null"] },
    telephone: { type: "string" },
    montantPrime: { type: "integer" },
    montantCommissionApi: { type: ["integer", "null"] },
    montantAReverser: { type: ["integer", "null"] },
    numeroPolice: { type: ["string", "null"] },
    dateDebut: { type: ["string", "null"], format: "date-time" },
    dateFin: { type: ["string", "null"], format: "date-time" },
    referencePaiementPartenaire: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
  },
};

const erreur = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

const reponseErreur = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } },
});

const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 255 },
  description:
    "Chaîne unique générée par le partenaire. Rejouer la requête avec la même clé et le même corps renvoie la réponse mémorisée sans recréer la ressource.",
};

export const openapiPartnerV1: Record<string, unknown> = {
  openapi: "3.1.0",
  info: {
    title: "API partenaire SIM Assurances",
    version: "1.0.0",
    description:
      "Accès serveur-à-serveur au catalogue et à la souscription. Option B : le partenaire encaisse lui-même la prime, puis la déclare via `confirmer-paiement`. Toutes les réponses de succès sont enveloppées `{ data, meta? }` ; les erreurs `{ error: { code, message, details? } }`.",
  },
  servers: [{ url: "/api/partner/v1" }],
  security: [{ bearerApiKey: [] }],
  tags: [
    { name: "Général" },
    { name: "Catalogue" },
    { name: "Souscriptions" },
    { name: "Documents" },
  ],
  paths: {
    "/ping": {
      get: {
        tags: ["Général"],
        summary: "Vérifie la clé API",
        responses: {
          "200": {
            description: "Clé valide.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "object",
                  properties: {
                    environnement: { type: "string", enum: ["live", "test"] },
                    scopes: { type: "array", items: { type: "string" } },
                    partenaire: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        nomCommerce: { type: "string" },
                        nomResponsable: { type: "string" },
                      },
                    },
                    horodatage: { type: "string", format: "date-time" },
                  },
                }),
              },
            },
          },
          "401": reponseErreur("Clé absente, invalide, révoquée ou expirée."),
        },
      },
    },
    "/catalogue": {
      get: {
        tags: ["Catalogue"],
        summary: "Produits distribués par le partenaire",
        description: "Portée requise : `catalogue:read`.",
        responses: {
          "200": {
            description: "Liste des produits éligibles (actifs ET désactivés, cf. `actifPourPartenaire`).",
            content: {
              "application/json": {
                schema: enveloppeSucces(
                  { type: "array", items: { $ref: "#/components/schemas/ProduitCatalogue" } },
                  { meta: { type: "object", properties: { total: { type: "integer" } } } }
                ),
              },
            },
          },
          "403": reponseErreur("Portée `catalogue:read` manquante."),
        },
      },
    },
    "/produits/{code}": {
      get: {
        tags: ["Catalogue"],
        summary: "Fiche d'un produit",
        description: "Portée requise : `catalogue:read`.",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Fiche produit.",
            content: {
              "application/json": {
                schema: enveloppeSucces({ $ref: "#/components/schemas/ProduitCatalogue" }),
              },
            },
          },
          "403": reponseErreur("`produit_non_autorise` ou `produit_desactive`."),
          "404": reponseErreur("`produit_inconnu`."),
        },
      },
    },
    "/devis": {
      post: {
        tags: ["Catalogue"],
        summary: "Calcule une prime (rien n'est créé)",
        description: "Portée requise : `catalogue:read`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["produit"],
                properties: {
                  produit: { type: "string" },
                  formule: { type: "string", description: "Libellé de la formule ; optionnel si le produit n'en a qu'une." },
                  nombrePeriodes: { type: "integer", minimum: 1, maximum: 12, description: "RelaxMoto / RelaxAuto uniquement." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Devis.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "object",
                  properties: {
                    produit: {
                      type: "object",
                      properties: { code: { type: "string" }, libelle: { type: "string" }, kycRequis: { type: "boolean" } },
                    },
                    formule: { type: ["string", "null"] },
                    cycleFacturation: { type: ["string", "null"] },
                    nombrePeriodes: { type: "integer" },
                    prime: { type: "integer" },
                    primeUnitaire: { type: "integer" },
                    primeHT: { type: "integer" },
                    capitalGaranti: { type: "integer" },
                    garanties: {},
                    priseEffet,
                    commissionApi,
                  },
                }),
              },
            },
          },
          "400": reponseErreur("`formule_requise`, `formule_inconnue` ou `nombre_periodes_non_applicable`."),
          "403": reponseErreur("`produit_non_autorise` / `produit_desactive` ou portée manquante."),
          "404": reponseErreur("`produit_inconnu`."),
          "501": reponseErreur("`devis_calcule_non_supporte` — produit à devis dynamique."),
        },
      },
    },
    "/souscriptions": {
      get: {
        tags: ["Souscriptions"],
        summary: "Liste paginée des souscriptions du partenaire (canal API)",
        description: "Portée requise : `souscriptions:read`. Pagination par curseur : reporter `meta.nextCursor` dans `cursor`.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "statut", in: "query", schema: { type: "string", enum: ["en_attente_confirmation", "confirmee", "echouee"] } },
          { name: "produit", in: "query", schema: { type: "string" } },
          { name: "depuis", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": {
            description: "Page de souscriptions.",
            content: {
              "application/json": {
                schema: enveloppeSucces(
                  { type: "array", items: { $ref: "#/components/schemas/SouscriptionListe" } },
                  {
                    meta: {
                      type: "object",
                      properties: { limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } },
                    },
                  }
                ),
              },
            },
          },
        },
      },
      post: {
        tags: ["Souscriptions"],
        summary: "Crée une souscription en attente de confirmation de paiement",
        description:
          "Portée requise : `souscriptions:write`. Option B : aucune interaction de paiement ici. Produits supportés à ce jour : `relaxmoto`, `relaxauto`, `relaxaccidents_fraismedicaux`. `pieceIdentiteUrl` + `selfieUrl` obligatoires (KYC).",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["produit", "formule", "prospect", "pieceIdentiteUrl", "selfieUrl"],
                properties: {
                  produit: { type: "string" },
                  formule: { type: "string", description: "= libelleVariante ; « mensuel » ou « annuel » pour RelaxMoto/Auto." },
                  nombrePeriodes: { type: "integer", minimum: 1, maximum: 12 },
                  prospect: {
                    type: "object",
                    required: ["nom", "prenom", "telephone"],
                    properties: {
                      nom: { type: "string" },
                      prenom: { type: "string" },
                      telephone: { type: "string" },
                      dateNaissance: { type: "string", format: "date" },
                      sexe: { type: "string", enum: ["masculin", "feminin"] },
                    },
                  },
                  pieceIdentiteUrl: { type: "string", description: "Data URL image (png/jpeg/webp), ≤ 2 Mo." },
                  selfieUrl: { type: "string", description: "Data URL image." },
                  signature: { type: "string", description: "Data URL image, optionnel." },
                  declarePasLivreur: { type: "boolean", description: "RelaxAccidents Frais Médicaux : requis pour l'option Décès." },
                  optionDeces: { type: "string", enum: ["200000", "100000"] },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Souscription créée.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    statut: { type: "string", enum: ["en_attente_confirmation"] },
                    produit: { type: "string" },
                    formule: { type: "string" },
                    montantAPercevoir: { type: "integer" },
                    montantCommissionApi: { type: "integer" },
                    montantAReverser: { type: "integer" },
                    echeanceId: { type: ["string", "null"] },
                    priseEffet,
                  },
                }),
              },
            },
          },
          "400": reponseErreur("`formule_inconnue`, `nombre_periodes_non_applicable`, `option_deces_indisponible`, `idempotency_key_requis`."),
          "403": reponseErreur("`produit_non_autorise` / `produit_desactive` ou portée manquante."),
          "404": reponseErreur("`produit_inconnu`."),
          "409": reponseErreur("`souscription_doublon`, `idempotency_en_cours`, `idempotency_key_reutilisee`."),
          "501": reponseErreur("`produit_non_supporte_api`."),
        },
      },
    },
    "/souscriptions/{id}": {
      get: {
        tags: ["Souscriptions"],
        summary: "Détail d'une souscription",
        description: "Portée requise : `souscriptions:read`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Détail.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  allOf: [
                    { $ref: "#/components/schemas/SouscriptionListe" },
                    {
                      type: "object",
                      properties: {
                        capitalGaranti: { type: "integer" },
                        nombrePeriodes: { type: "integer" },
                        sexe: { type: ["string", "null"] },
                        dateNaissance: { type: ["string", "null"], format: "date-time" },
                        garanties: {},
                        documents: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { type: { type: "string" }, depuisLe: { type: "string", format: "date-time" } },
                          },
                        },
                      },
                    },
                  ],
                }),
              },
            },
          },
          "404": reponseErreur("`souscription_inconnue`."),
        },
      },
    },
    "/souscriptions/{id}/confirmer-paiement": {
      post: {
        tags: ["Souscriptions"],
        summary: "Déclare l'encaissement de la prime et active la couverture",
        description:
          "Portée requise : `souscriptions:write`. Rejoue la confirmation de paiement (police, dates, carte, compte + SMS client, commission). `montantPercu` doit être STRICTEMENT égal à la prime due.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["referencePaiement", "montantPercu"],
                properties: {
                  referencePaiement: { type: "string", maxLength: 120 },
                  montantPercu: { type: "integer", minimum: 1 },
                  datePaiement: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Souscription confirmée.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    statut: { type: "string", enum: ["confirmee", "en_attente_confirmation"] },
                    numeroPolice: { type: ["string", "null"] },
                    dateDebut: { type: ["string", "null"], format: "date-time" },
                    dateFin: { type: ["string", "null"], format: "date-time" },
                    montantAReverser: { type: ["integer", "null"] },
                  },
                }),
              },
            },
          },
          "400": reponseErreur("`montant_incoherent` ou `idempotency_key_requis`."),
          "404": reponseErreur("`souscription_inconnue`."),
          "409": reponseErreur("`deja_confirmee`, `idempotency_en_cours`, `idempotency_key_reutilisee`."),
        },
      },
    },
    "/souscriptions/{id}/evenements": {
      get: {
        tags: ["Souscriptions"],
        summary: "Chronologie d'une souscription",
        description: "Portée requise : `souscriptions:read`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Événements triés par date croissante.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["creee", "paiement_confirme", "renouvellement_confirme", "couverture_debut", "renouvelee"],
                      },
                      date: { type: "string", format: "date-time" },
                      reference: { type: ["string", "null"] },
                    },
                  },
                }),
              },
            },
          },
          "404": reponseErreur("`souscription_inconnue`."),
        },
      },
    },
    "/souscriptions/{id}/carte.png": {
      get: {
        tags: ["Documents"],
        summary: "Carte virtuelle de prise en charge (PNG)",
        description: "Portée requise : `documents:read`. Disponible une fois la souscription confirmée.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Image PNG.", content: { "image/png": { schema: { type: "string", format: "binary" } } } },
          "400": reponseErreur("`selfie_absent`."),
          "404": reponseErreur("`souscription_inconnue` ou `carte_indisponible`."),
        },
      },
    },
    "/souscriptions/{id}/contrat.pdf": {
      get: {
        tags: ["Documents"],
        summary: "Contrat PDF (non disponible pour l'instant)",
        description: "Portée requise : `documents:read`. Renvoie actuellement `501 contrat_pdf_non_disponible`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "404": reponseErreur("`souscription_inconnue`."),
          "501": reponseErreur("`contrat_pdf_non_disponible`."),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "sk_live_… / sk_test_…",
        description: "Clé API fournie par SIM Assurances. En-tête `Authorization: Bearer <clé>`.",
      },
    },
    schemas: {
      Erreur: erreur,
      ProduitCatalogue: produitCatalogue,
      SouscriptionListe: souscriptionListe,
    },
  },
  "x-webhooks": {
    description:
      "Événements poussés en POST vers l'URL configurée sur la clé. En-tête `X-SIM-Signature: t=<ts>,v1=<hmac_sha256>` calculé sur `<ts>.<corps>` avec le secret webhook. Corps : `{ evenement, cree_le, donnees }`. Retries à backoff croissant (1, 5, 30, 120, 360 min), abandon après 24 h.",
    evenements: [
      "souscription.creee",
      "paiement.recu",
      "souscription.confirmee",
      "contrat.disponible",
      "souscription.rejetee",
    ],
  },
};
