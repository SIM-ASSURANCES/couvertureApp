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
    kycRequis: { type: "boolean", description: "Si true (Assurances Accidents), la pièce d'identité (`pieceIdentiteUrl`) est obligatoire à la souscription ; le selfie (`selfieUrl`) l'est aussi sauf pour RelaxVoyage. Les Assurances Dommages et Santé n'exigent aucune pièce." },
    tauxCommissionApi: { type: "number" },
    devisCalcule: { type: "boolean", description: "true = pas de ligne de barème unique : la prime est calculée à partir de `entrees` (SecurHome+, SecurPro, SecurMoto…). `POST /devis` les chiffre." },
    souscriptionApi: { type: "boolean", description: "true = POST /devis et POST /souscriptions acceptent ce produit. Vrai pour les 10 produits ouverts (Accidents ×6 dont RelaxVoyage et RelaxAccidents, Dommages ×4) ; les produits « calculés » (RelaxVoyage, RelaxAccidents, SecurHome, SecurHome+, SecurPro, SecurMoto) prennent leurs paramètres dans `entrees`. Faux pour les Assurances Santé (verrouillées)." },
    verrouille: { type: "boolean", description: "true = produit verrouillé sur l'API (Assurances Santé) : visible au catalogue, mais devis et souscription répondent 403 `produit_verrouille`." },
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
    statut: { type: "string", enum: ["en_attente_validation", "refusee", "en_attente_confirmation", "confirmee", "echouee"], description: "`en_attente_validation` et `refusee` ne concernent que les Assurances Santé (demande à valider par SIM Assurances avant tout paiement)." },
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
        description:
          "Portée requise : `catalogue:read`. Les 13 produits sont chiffrables. RelaxMoto, RelaxAuto et RelaxAccidents Frais Médicaux ×2 : `formule` (+ `nombrePeriodes` pour Moto/Auto). Les 9 autres : paramètres dans `entrees` — `relaxvoyage` et `sante_*` : `{ formule }` (ou `formule` à la racine) ; `relaxaccidents` : `{ classe: 1-4, cnpsDeclare, cycle: annuel|mensuel, moyenDeplacement: voiture|moto_tricycle|autres }` ; `securhome` : `{ nombrePieces: 1-5, statutOccupation: proprietaire|locataire, cycle }` ; `securhome_dommages`, `securpro_dommages`, `securmoto` : mêmes champs que le devis partageable (valeurs du bâtiment/contenu, garanties choisies, `valeurMoto`, `ageMoto`…). La prime est toujours calculée par SIM Assurances, entière en FCFA.",
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
                  entrees: { type: "object", additionalProperties: true, description: "Paramètres de tarification des 9 produits « calculés » (voir description)." },
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
                    detail: { description: "Produits « calculés » : détail de la prime (lignes de garanties, accessoires, taxes) quand il existe." },
                    entrees: { type: "object", additionalProperties: true, description: "Produits « calculés » : paramètres retenus pour le calcul." },
                    beneficiaireRequis: { type: "boolean", description: "Produits « calculés » : true si `beneficiaire` est obligatoire à la souscription (RelaxVoyage, RelaxAccidents)." },
                    validationRequise: { type: "boolean", description: "Produits « calculés » : true pour les Assurances Santé (demande validée avant paiement)." },
                    priseEffet,
                    commissionApi,
                  },
                }),
              },
            },
          },
          "400": reponseErreur("`formule_requise`, `formule_inconnue`, `nombre_periodes_non_applicable`, `entrees_invalides` (paramètres manquants ou hors barème, détail dans `details`) ou `devis_invalide`."),
          "403": reponseErreur("`produit_non_autorise` / `produit_desactive` ou portée manquante."),
          "404": reponseErreur("`produit_inconnu`."),
          "501": reponseErreur("`devis_calcule_non_supporte` — produit sans barème exploitable."),
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
          { name: "statut", in: "query", schema: { type: "string", enum: ["en_attente_validation", "refusee", "en_attente_confirmation", "confirmee", "echouee"] } },
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
          "Portée requise : `souscriptions:write`. Option B : aucune interaction de paiement ici, le partenaire encaisse puis appelle `confirmer-paiement`. " +
          "**10 produits ouverts** ; les trois Assurances Santé sont **verrouillées** sur l'API (403 `produit_verrouille`). " +
          "(1) `relaxmoto`, `relaxauto`, `relaxaccidents_fraismedicaux`, `relaxaccidents_fraismedicaux_livreurs` : `formule` + `pieceIdentiteUrl` + `selfieUrl` obligatoires. " +
          "(2) Produits « calculés », dont la prime est recalculée par SIM Assurances à partir de `entrees` (voir `POST /devis`) : " +
          "`relaxvoyage` (`formule`, bloc `voyage`, `pieceIdentiteUrl`, `beneficiaire`) ; " +
          "`relaxaccidents` (`entrees`, `pieceIdentiteUrl` + `selfieUrl`, `beneficiaire`) ; " +
          "`securhome`, `securhome_dommages`, `securpro_dommages`, `securmoto` (`entrees`, aucune pièce ; bloc `commerce` facultatif) ; " +
          "**Assurances Santé (`sante_solo`, `sante_duo`, `sante_famille`) : verrouillées** — `403 produit_verrouille` ; la souscription Santé se fait par les autres canaux de SIM Assurances. Les demandes Santé créées avant le verrouillage restent lisibles et `confirmer-paiement` répond `409 validation_requise` tant qu'elles ne sont pas validées.",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["produit", "prospect"],
                properties: {
                  produit: { type: "string" },
                  formule: { type: "string", description: "= libelleVariante ; « mensuel » ou « annuel » pour RelaxMoto/Auto ; formule du barème pour RelaxAccidents Frais Médicaux, RelaxVoyage et Santé. Obligatoire pour ces produits." },
                  nombrePeriodes: { type: "integer", minimum: 1, maximum: 12, description: "RelaxMoto / RelaxAuto uniquement." },
                  entrees: { type: "object", additionalProperties: true, description: "Paramètres de tarification des produits « calculés » — mêmes champs que `POST /devis`. Le montant n'est jamais lu dans la requête." },
                  prospect: {
                    type: "object",
                    required: ["nom", "prenom", "telephone"],
                    properties: {
                      nom: { type: "string" },
                      prenom: { type: "string" },
                      telephone: { type: "string" },
                      dateNaissance: { type: "string", format: "date", description: "Obligatoire pour les Assurances Santé (assuré principal de 15 à 65 ans)." },
                      sexe: { type: "string", enum: ["masculin", "feminin"], description: "Obligatoire pour les Assurances Santé." },
                      civilite: { type: "string", enum: ["M.", "MLLE", "MME"] },
                      email: { type: "string", format: "email", description: "Assurances Santé." },
                      ville: { type: "string" },
                      commune: { type: "string" },
                      adresse: { type: "string" },
                      numeroPieceIdentite: { type: "string" },
                    },
                  },
                  voyage: {
                    type: "object",
                    description: "RelaxVoyage uniquement — trajet. La date de départ ne peut pas être passée.",
                    required: ["compagnie", "lieuDepart", "lieuArrivee", "numeroTicket", "dateDepart", "numeroPersonneContact"],
                    properties: {
                      typePiece: { type: "string", enum: ["CNI", "Permis", "Passeport"] },
                      compagnie: { type: "string" },
                      lieuDepart: { type: "string" },
                      lieuArrivee: { type: "string" },
                      numeroTicket: { type: "string" },
                      dateDepart: { type: "string", format: "date" },
                      numeroPersonneContact: { type: "string" },
                    },
                  },
                  commerce: {
                    type: "object",
                    description: "SecurHome+ et SecurPro — commerce ou logement assuré (facultatif, imprimé sur le contrat).",
                    properties: {
                      nomCommercial: { type: "string" },
                      ville: { type: "string" },
                      communeQuartier: { type: "string" },
                      refFacture: { type: "string" },
                    },
                  },
                  sante: {
                    type: "object",
                    description: "Assurances Santé uniquement — dossier médical, relu par l'administrateur qui valide la demande.",
                    required: ["ficheSante", "questionnaireSante"],
                    properties: {
                      ficheSante: {
                        type: "object",
                        required: ["profession", "lieuResidence", "situationMatrimoniale", "poidsKg", "tailleCm", "tensionArterielle", "groupeSanguin"],
                        properties: {
                          profession: { type: "string" },
                          lieuResidence: { type: "string" },
                          numeroCmu: { type: "string" },
                          situationMatrimoniale: { type: "string", enum: ["celibataire", "marie", "divorce", "veuf", "union_libre"] },
                          poidsKg: { type: "number" },
                          tailleCm: { type: "number" },
                          tensionArterielle: { type: "string", description: "« systolique/diastolique », ex. 120/80." },
                          groupeSanguin: { type: "string", enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"] },
                        },
                      },
                      personnesAssurees: {
                        type: "array",
                        maxItems: 4,
                        description: "Personnes couvertes en plus du souscripteur : Solo aucune ; Duo le conjoint ; Famille le conjoint et 3 enfants au plus.",
                        items: {
                          type: "object",
                          required: ["lien", "nom", "prenom", "dateNaissance", "sexe", "lieuResidence"],
                          properties: {
                            lien: { type: "string", enum: ["conjoint", "enfant"] },
                            nom: { type: "string" },
                            prenom: { type: "string" },
                            dateNaissance: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                            sexe: { type: "string", enum: ["masculin", "feminin"] },
                            lieuResidence: { type: "string" },
                            profession: { type: "string", description: "Obligatoire pour le conjoint." },
                            numeroCmu: { type: "string" },
                            telephone: { type: "string" },
                          },
                        },
                      },
                      questionnaireSante: {
                        type: "object",
                        required: ["personnes", "declareExactEtSincere"],
                        properties: {
                          personnes: {
                            type: "array",
                            description: "Une entrée par personne assurée (souscripteur en tête, puis conjoint, enfants), chacune avec les réponses `{ cleQuestion: true|false|texte }` à toutes les questions applicables à son sexe.",
                            items: { type: "object", required: ["reponses"], properties: { reponses: { type: "object", additionalProperties: true } } },
                          },
                          declareExactEtSincere: { type: "boolean", enum: [true] },
                        },
                      },
                    },
                  },
                  pieceIdentiteUrl: { type: "string", description: "Data URL image (png/jpeg/webp), ≤ 2 Mo. Obligatoire pour les produits Accidents ; facultative pour Dommages et Santé." },
                  selfieUrl: { type: "string", description: "Data URL image. Obligatoire pour les produits Accidents sauf RelaxVoyage ; facultative sinon." },
                  signature: { type: "string", description: "Data URL image, optionnel." },
                  declarePasLivreur: { type: "boolean", description: "RelaxAccidents Frais Médicaux (grand public) : le souscripteur déclare ne pas être livreur." },
                  beneficiaire: {
                    type: "object",
                    description: "Bénéficiaire de la garantie Décès. **Obligatoire** pour RelaxVoyage et RelaxAccidents ; facultatif pour RelaxMoto, RelaxAuto et RelaxAccidents Frais Médicaux (Décès inclus dans la formule : 100 000 FCFA pour 1 000 F, 50 000 FCFA pour 500 F), imprimé sur le contrat.",
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
                    statut: { type: "string", enum: ["en_attente_confirmation", "en_attente_validation"], description: "`en_attente_validation` : Assurances Santé (demande à valider avant tout paiement)." },
                    produit: { type: "string" },
                    formule: { type: "string" },
                    montantAPercevoir: { type: "integer" },
                    montantCommissionApi: { type: "integer" },
                    montantAReverser: { type: "integer" },
                    echeanceId: { type: ["string", "null"], description: "null pour une demande Santé (pas de paiement avant validation)." },
                    validationRequise: { type: "boolean", description: "Produits « calculés » : true pour les Assurances Santé." },
                    priseEffet,
                  },
                }),
              },
            },
          },
          "400": reponseErreur(
            "`formule_requise`, `formule_inconnue`, `nombre_periodes_non_applicable`, `option_deces_supprimee`, `kyc_requis`, `beneficiaire_requis`, `voyage_requis`, `date_depart_passee`, `date_naissance_invalide`, `entrees_invalides` (détail dans `details`), `devis_invalide`, Santé : `sante_requis`, `date_naissance_requise`, `age_non_eligible`, `sexe_requis`, `personnes_assurees_invalides`, `fiches_invalides`, `questionnaire_invalide` ; `idempotency_key_requis`."
          ),
          "403": reponseErreur("`produit_non_autorise` / `produit_desactive` / `produit_verrouille` (Assurances Santé) ou portée manquante."),
          "404": reponseErreur("`produit_inconnu`."),
          "409": reponseErreur("`souscription_doublon`, `cumul_relaxaccidents` (un seul produit RelaxAccidents par client, RelaxVoyage excepté), Santé : `demande_en_cours`, `idempotency_en_cours`, `idempotency_key_reutilisee`."),
          "501": reponseErreur("`produit_non_supporte_api` — garde-fou, aucun produit du catalogue n'y est aujourd'hui soumis."),
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
          "409": reponseErreur("`deja_confirmee`, `validation_requise` (demande Santé non encore validée par SIM Assurances, ou refusée), `idempotency_en_cours`, `idempotency_key_reutilisee`."),
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
