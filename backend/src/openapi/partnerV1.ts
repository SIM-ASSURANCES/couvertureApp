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
    devisCalcule: { type: "boolean", description: "Toujours false pour les quatre produits ouverts : la prime se lit sur la formule choisie." },
    souscriptionApi: { type: "boolean", description: "Toujours true pour les quatre produits ouverts à la clé API (RelaxMoto, RelaxAuto, RelaxAccidents Frais Médicaux, RelaxAccidents FM Livreurs/MotoTaxis)." },
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
          "Portée requise : `souscriptions:write`. Option B : aucune interaction de paiement ici. Seuls quatre produits sont ouverts à la clé API : `relaxmoto`, `relaxauto`, `relaxaccidents_fraismedicaux`, `relaxaccidents_fraismedicaux_livreurs` (tout autre code répond `403 produit_non_autorise`). `formule`, `pieceIdentiteUrl` + `selfieUrl` obligatoires (KYC).",
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
                  declarePasLivreur: { type: "boolean", description: "RelaxAccidents Frais Médicaux (grand public) : le souscripteur déclare ne pas être livreur." },
                  beneficiaire: {
                    type: "object",
                    description: "Bénéficiaire de la garantie Décès (RelaxMoto, RelaxAuto, RelaxAccidents Frais Médicaux — Décès inclus dans la formule : 100 000 FCFA pour 1 000 F, 50 000 FCFA pour 500 F). Facultatif ici, imprimé sur le contrat.",
                    required: ["nom", "telephone"],
                    properties: { nom: { type: "string" }, telephone: { type: "string" } },
                  },
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
          "400": reponseErreur("`formule_requise`, `formule_inconnue`, `nombre_periodes_non_applicable`, `option_deces_supprimee`, `kyc_requis`, `idempotency_key_requis`."),
          "403": reponseErreur("`produit_non_autorise` / `produit_desactive` ou portée manquante."),
          "404": reponseErreur("`produit_inconnu`."),
          "409": reponseErreur("`souscription_doublon`, `cumul_relaxaccidents` (un seul produit RelaxAccidents par client), `idempotency_en_cours`, `idempotency_key_reutilisee`."),
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
                    documents: {
                      type: ["object", "null"],
                      description: "Liens des documents, une fois la souscription confirmée.",
                      properties: {
                        carteUrl: { type: "string" },
                        contratUrl: { type: "string" },
                        factureUrl: { type: "string" },
                        facturesUrl: { type: "string" },
                      },
                    },
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
        summary: "Contrat PDF (conditions particulières)",
        description:
          "Portée requise : `documents:read`. Disponible dès la confirmation du paiement : même contrat que celui de l'espace client (police, dates d'effet et d'échéance, garanties, bénéficiaire Décès, intermédiaire), construit par SIM Assurances à partir de ses données.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Document PDF.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
          "404": reponseErreur("`souscription_inconnue` ou `contrat_indisponible`."),
          "409": reponseErreur("`souscription_non_confirmee` — paiement pas encore confirmé."),
        },
      },
    },
    "/souscriptions/{id}/factures": {
      get: {
        tags: ["Documents"],
        summary: "Factures d'une souscription",
        description:
          "Portée requise : `documents:read`. Une facture par paiement confirmé (souscription, puis chaque renouvellement), la plus récente en tête. Liste vide tant que le paiement n'est pas confirmé.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Factures.",
            content: {
              "application/json": {
                schema: enveloppeSucces({
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      paiementId: { type: "string" },
                      numeroFacture: { type: "string", description: "Ex. FAC-2026-000096." },
                      datePaiement: { type: ["string", "null"], format: "date-time" },
                      montant: { type: "number" },
                      estRenouvellement: { type: "boolean" },
                      periodeDebut: { type: ["string", "null"], format: "date-time" },
                      periodeFin: { type: ["string", "null"], format: "date-time" },
                      url: { type: "string", description: "Lien du PDF de cette facture." },
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
    "/souscriptions/{id}/facture.pdf": {
      get: {
        tags: ["Documents"],
        summary: "Facture PDF",
        description:
          "Portée requise : `documents:read`. La facture la plus récente, ou celle d'un paiement précis avec `?paiementId=` (voir `GET /souscriptions/{id}/factures`). Émise dès la confirmation du paiement ; mention « règlement : encaissé par le partenaire ».",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "paiementId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Document PDF.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
          "404": reponseErreur("`souscription_inconnue` ou `facture_inconnue`."),
          "409": reponseErreur("`souscription_non_confirmee` — aucune facture tant que le paiement n'est pas confirmé."),
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
