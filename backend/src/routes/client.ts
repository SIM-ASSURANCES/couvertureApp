import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import {
  initiateWavePayment,
  sendSMS,
  lienFormulaire,
  messageRelanceRenouvellementIncendie,
  numeroPoliceIncendieSynthetique,
} from "../services/notify.js";
import { confirmerEcheance, verifierPaiementEcheance } from "../services/paiementWave.js";
import { confirmerAccident, verifierPaiementAccident } from "../services/accident.js";
import { construireChooserProduits } from "./public.js";
import { mapperSouscriptionGenerique } from "../services/contratGenerique.js";
import { analyserSinistreIA } from "../services/fraudeIA.js";

/**
 * Espace client, tous produits confondus (modèle générique, Incendie,
 * Accident historique — voir refonte "espace client universel") : contrat,
 * carte, renouvellement, souscription à d'autres produits du même
 * partenaire, sinistres. `req.user.sub` est l'id de la ligne dans le modèle
 * désigné par `req.user.produitType` (voir auth.ts POST /client/login).
 */
export const clientRouter = Router();
clientRouter.use(requireAuth("client"));

function numeroSinistre(produitCode: string, id: string) {
  const annee = new Date().getFullYear();
  return `SIN-${produitCode.toUpperCase()}-${annee}-${id.slice(0, 8).toUpperCase()}`;
}

function produitType(req: AuthedRequest): "generique" | "incendie" | "accident" {
  return req.user!.produitType ?? "generique";
}

/** Téléphone du contrat sur lequel le client est connecté — sert de clé pour retrouver ses autres contrats (même numéro). */
async function telephoneDuClient(type: ReturnType<typeof produitType>, id: string): Promise<string | null> {
  if (type === "incendie") {
    return (await prisma.souscriptionIncendie.findUnique({ where: { id }, select: { telephone: true } }))?.telephone ?? null;
  }
  if (type === "accident") {
    return (await prisma.souscriptionAccident.findUnique({ where: { id }, select: { telephone: true } }))?.telephone ?? null;
  }
  return (await prisma.souscription.findUnique({ where: { id }, select: { telephone: true } }))?.telephone ?? null;
}

clientRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      const debut = s.dateDebut ?? s.createdAt;
      return res.json({
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        produitType: type,
        carteType: "incendie",
        produitLibelle: "Incendie Habitation en Inclusion",
        partenaire: s.partenaire.nomCommerce,
        numeroPolice: numeroPoliceIncendieSynthetique(s.id, debut),
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        cycleFacturation: null,
        statutAbonnement: null,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
      });
    }

    if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      return res.json({
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        produitType: type,
        carteType: "accident",
        produitLibelle: "Accidents (historique)",
        partenaire: s.partenaire.nomCommerce,
        numeroPolice: s.numeroPolice,
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        cycleFacturation: null,
        statutAbonnement: null,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
      });
    }

    const s = await prisma.souscription.findUnique({
      where: { id },
      include: { produit: { select: { code: true, libelle: true } }, partenaire: { select: { nomCommerce: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    // RelaxVoyage : Frais de Santé et Bagages varient selon la formule
    // choisie (250/400/600/1000 FCFA) — portés par TarifProduit.donneesSpecifiques,
    // pas par la souscription elle-même (même lookup que services/contratGenerique.ts,
    // utilisé pour le contrat PDF).
    let fraisSante: number | null = null;
    let bagages: string | null = null;
    if (s.produit.code === "relaxvoyage") {
      const tarif = await prisma.tarifProduit.findFirst({
        where: { produitId: s.produitId, prime: s.montantPrime },
      });
      const infos = tarif?.donneesSpecifiques as { fraisSante?: number; bagages?: string } | null;
      fraisSante = infos?.fraisSante ?? null;
      bagages = infos?.bagages ?? null;
    }

    // RelaxAccidents Frais Médicaux : option Décès facultative, choisie à la
    // souscription (voir formuleSchema, routes/public.ts) — stockée
    // directement sur la souscription, contrairement à RelaxVoyage ci-dessus.
    const optionDeces =
      s.produit.code === "relaxaccidents_fraismedicaux"
        ? ((s.donneesSpecifiques as { optionDeces?: { capital: number; prime: number; dureeMois: number } } | null)
            ?.optionDeces ?? null)
        : null;

    // RelaxAccidents générale : classe de risque + statut CNPS, dont
    // dépendent les garanties affichées (voir garantiesRelaxAccidentsGenerale).
    const relaxAccidentsGenerale =
      s.produit.code === "relaxaccidents"
        ? (s.donneesSpecifiques as { classe?: number; cnpsDeclare?: boolean } | null)
        : null;

    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      produitType: type,
      carteType: s.produit.code,
      produitCode: s.produit.code,
      produitLibelle: s.produit.libelle,
      partenaire: s.partenaire.nomCommerce,
      numeroPolice: s.numeroPolice,
      montantPrime: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      cycleFacturation: s.cycleFacturation,
      statutAbonnement: s.statutAbonnement,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      fraisSante,
      bagages,
      optionDeces,
      classe: relaxAccidentsGenerale?.classe ?? null,
      cnpsDeclare: relaxAccidentsGenerale?.cnpsDeclare ?? null,
    });
  })
);

/**
 * Données aplaties du contrat, dans le même format que celui utilisé par la
 * page admin Contrats (`GET /souscriptions/contrats`, souscriptions.ts) et
 * son transformateur frontend `genererContratDepuisDonnees` (frontend/src/
 * contract.ts) — pour que le client puisse générer exactement le même PDF
 * (texte réel, rendu serveur) que l'admin. RelaxMoto/RelaxAuto n'ont pas de
 * contrat PDF séparé (seulement une carte) — le frontend n'appelle pas cette
 * route pour ces deux produits.
 */
clientRouter.get(
  "/contrat",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      const debut = s.dateDebut ?? s.createdAt;
      const fin =
        s.dateFin ??
        (() => {
          const d = new Date(debut);
          d.setMonth(d.getMonth() + 3);
          return d;
        })();
      return res.json({
        id: s.id,
        type: "incendie",
        numeroPolice: numeroPoliceIncendieSynthetique(s.id, debut),
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        telephone: s.telephone,
        montant: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        partenaire: s.partenaire.nomCommerce,
        partenaireResponsable: s.partenaire.nomResponsable,
        partenaireLocalisation: s.partenaire.localisation,
        dateDebut: debut,
        dateFin: fin,
        date: s.createdAt,
        refFacture: s.refFacture,
        commune: s.commune,
        quartier: s.quartier,
        numeroMaison: s.numeroMaison,
        signature: s.signature,
      });
    }

    if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      if (s.waveStatut !== "confirme") return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
      return res.json({
        id: s.id,
        type: "accident",
        numeroPolice: s.numeroPolice ?? "",
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montant: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        partenaire: s.partenaire.nomCommerce,
        partenaireResponsable: s.partenaire.nomResponsable,
        partenaireLocalisation: s.partenaire.localisation,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        date: s.createdAt,
        dateNaissance: s.dateNaissance,
        signature: s.signature,
      });
    }

    const s = await prisma.souscription.findUnique({
      where: { id },
      include: {
        partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
        produit: { select: { code: true, libelle: true } },
      },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.waveStatut !== "confirme") return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
    const d = await mapperSouscriptionGenerique(s);
    res.json({
      id: d.id,
      type: d.produit,
      numeroPolice: d.numeroPolice ?? "",
      nom: d.nom ?? "",
      prenom: d.prenom ?? "",
      telephone: d.telephone,
      montant: d.montant,
      capitalGaranti: d.capitalGaranti,
      partenaire: d.partenaire,
      partenaireResponsable: d.partenaireResponsable,
      partenaireLocalisation: d.partenaireLocalisation,
      dateDebut: d.dateDebut,
      dateFin: d.dateFin,
      date: d.createdAt,
      dateNaissance: d.dateNaissance,
      signature: d.signature,
      produitLibelle: d.produitLibelle,
      compagnie: d.compagnie,
      lieuDepart: d.lieuDepart,
      lieuArrivee: d.lieuArrivee,
      numeroTicket: d.numeroTicket,
      dateDepart: d.dateDepart,
      numeroPersonneContact: d.numeroPersonneContact,
      fraisSante: d.fraisSante,
      bagages: d.bagages,
      optionDeces: d.optionDeces,
      classe: d.classe,
      cnpsDeclare: d.cnpsDeclare,
      nomCommercial: d.nomCommercial,
      ville: d.ville,
      communeQuartier: d.communeQuartier,
      refFacture: d.refFacture,
      statutOccupation: d.statutOccupation,
      valeurBatiment: d.valeurBatiment,
      loyerMensuel: d.loyerMensuel,
      contenu: d.contenu,
      dansMarche: d.dansMarche,
      nombrePieces: d.nombrePieces,
      resultat: d.resultat,
      // RelaxMoto/RelaxAuto : le contrat PDF mentionne la périodicité de la
      // prime (abonnement reconductible) — voir renderContratRelaxMotoAuto.
      cycleFacturation: s.cycleFacturation,
    });
  })
);

/** Crée une échéance de renouvellement sur le modèle générique et lance le paiement (ou stub-confirme sans WAVE_API_KEY). */
async function creerEcheanceRenouvellement(souscriptionId: string, montant: number) {
  const dernier = await prisma.paiement.findFirst({
    where: { souscriptionId },
    orderBy: { numeroEcheance: "desc" },
  });
  const paiement = await prisma.paiement.create({
    data: {
      souscriptionId,
      numeroEcheance: (dernier?.numeroEcheance ?? 0) + 1,
      montant,
      dateEcheance: new Date(),
      estRenouvellement: true,
    },
  });

  const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
  const successUrl = `${appUrl}/client?renouvele=${paiement.id}`;
  const errorUrl = `${appUrl}/client?paiement=echec`;

  if (!process.env.WAVE_API_KEY) {
    const transactionId = `STUB-${paiement.id.slice(0, 8)}`;
    await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: transactionId } });
    await confirmerEcheance({ ...paiement, waveTransactionId: transactionId });
    return { paiementId: paiement.id, montant: paiement.montant, checkoutUrl: successUrl };
  }

  const wave = await initiateWavePayment(paiement.montant, paiement.id, successUrl, errorUrl);
  await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: wave.transactionId } });
  return { paiementId: paiement.id, montant: paiement.montant, checkoutUrl: wave.checkoutUrl };
}

/**
 * Renouvellement, tous produits confondus — trois mécaniques selon
 * `produitType` :
 * - générique + cycleFacturation (RelaxMoto/Auto) : un paiement au même
 *   cycle que le contrat initial, prolonge dateFin à la confirmation (voir
 *   confirmerEcheance, branche estRenouvellement).
 * - générique sans cycleFacturation (formule 3 mois) et accident (historique)
 *   : nouveau paiement Wave (ou stub) sur la même ligne — le numéro de
 *   police est conservé sauf si le renouvellement dépasse le délai de grâce
 *   de 2 jours après l'échéance (voir numeroPoliceRenouvellement).
 * - incendie : pas de paiement en ligne (achat en boutique) — déclenche le
 *   même SMS que la relance admin, invitant à revenir avec une nouvelle
 *   réf.facture (voir POST /souscriptions/incendie/:id/relance-renouvellement).
 */
clientRouter.post(
  "/renouveler",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      if (s.statut !== "complet" || !s.lienFormulaireToken) {
        return res.status(400).json({ error: "Ce contrat n'est pas encore complet." });
      }
      await sendSMS(
        s.telephone,
        messageRelanceRenouvellementIncendie(lienFormulaire("incendie", s.lienFormulaireToken))
      );
      const updated = await prisma.souscriptionIncendie.update({
        where: { id: s.id },
        data: { renouvellementEnCoursDepuis: new Date(), relanceRenouvellementCount: { increment: 1 } },
      });
      return res.json({ sms: true, relanceRenouvellementCount: updated.relanceRenouvellementCount });
    }

    if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      if (s.waveStatut !== "confirme" || !s.numeroPolice) {
        return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
      }

      const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
      const successUrl = `${appUrl}/client?renouvele=${s.id}`;
      const errorUrl = `${appUrl}/client?paiement=echec`;

      if (!process.env.WAVE_API_KEY) {
        const transactionId = `STUB-${s.id.slice(0, 8)}-${Date.now()}`;
        const stub = { ...s, waveTransactionId: transactionId, renouvellementEnCoursDepuis: new Date() };
        await prisma.souscriptionAccident.update({
          where: { id: s.id },
          data: { waveTransactionId: transactionId, renouvellementEnCoursDepuis: stub.renouvellementEnCoursDepuis },
        });
        await confirmerAccident(stub);
        return res.status(201).json({ checkoutUrl: successUrl });
      }

      const wave = await initiateWavePayment(s.montantPrime, s.id, successUrl, errorUrl);
      await prisma.souscriptionAccident.update({
        where: { id: s.id },
        data: { waveTransactionId: wave.transactionId, renouvellementEnCoursDepuis: new Date() },
      });
      return res.status(201).json({ checkoutUrl: wave.checkoutUrl });
    }

    const s = await prisma.souscription.findUnique({
      where: { id },
      include: { produit: { select: { code: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    // Le trajet couvert par RelaxVoyage est ponctuel (24h) : rien à
    // reconduire — une nouvelle couverture suppose un nouveau voyage, donc
    // une nouvelle souscription, pas un renouvellement.
    if (s.produit.code === "relaxvoyage") {
      return res.status(400).json({ error: "RelaxVoyage ne se renouvelle pas : souscrivez un nouveau contrat pour votre prochain trajet." });
    }

    if (s.cycleFacturation === "mensuel" || s.cycleFacturation === "annuel") {
      const tarif = await prisma.tarifProduit.findFirst({
        where: { produitId: s.produitId, libelleVariante: s.cycleFacturation },
      });
      if (!tarif) return res.status(400).json({ error: "Tarif indisponible pour ce produit" });
      // Reconduction à l'identique : même durée que la souscription initiale
      // (un contrat pris pour 3 mois se renouvelle par 3 mois), au tarif
      // courant du cycle — voir confirmerEcheance, qui prolonge dateFin
      // d'autant de cycles.
      return res.status(201).json(await creerEcheanceRenouvellement(s.id, tarif.prime * s.nombrePeriodes));
    }

    if (s.waveStatut !== "confirme") {
      return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
    }
    res.status(201).json(await creerEcheanceRenouvellement(s.id, s.montantPrime));
  })
);

clientRouter.get(
  "/renouveler/:paiementId/verify",
  asyncHandler(async (req: AuthedRequest, res) => {
    // Accident historique (SouscriptionAccident) : pas de ligne Paiement, l'état
    // du renouvellement vit directement sur la souscription (voir POST
    // /renouveler ci-dessus, qui redirige vers Wave avec son propre id, pas
    // un id de Paiement) — sans cette branche, le filet de sécurité restait
    // bloqué en 404 dès que le webhook Wave n'aboutissait pas, laissant
    // renouvellementEnCoursDepuis/dateFin jamais mis à jour.
    if (produitType(req) === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id: req.user!.sub } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      const statutAccident = await verifierPaiementAccident(s);
      // Le frontend (client/Dashboard.tsx) attend la même convention que
      // verifierPaiementEcheance ("paye"/"echoue"/en attente), commune aux
      // deux modèles.
      const statut = statutAccident === "confirme" ? "paye" : statutAccident;
      return res.json({ statut });
    }

    const p = await prisma.paiement.findUnique({ where: { id: req.params.paiementId } });
    if (!p || p.souscriptionId !== req.user!.sub) return res.status(404).json({ error: "Introuvable" });
    const statut = await verifierPaiementEcheance(p);
    res.json({ statut });
  })
);

/**
 * Produits volontairement absents de l'espace client :
 * - SecurHome+ et SecurPro assurent un local ou un bâtiment et supposent une
 *   évaluation (valeur du bâtiment, contenu, garanties optionnelles) qui se
 *   fait avec le partenaire, pas en libre-service. Ils restent souscriptibles
 *   via le QR du partenaire.
 * - "incendie" (Incendie Habitation en Inclusion) n'est qu'une ligne
 *   présentationnelle du catalogue générique (voir seed.ts) — le flux réel
 *   passe par le modèle historique SouscriptionIncendie (achat en boutique
 *   avec réf. facture), pas par ce chooser/cette souscription générique.
 */
const PRODUITS_HORS_ESPACE_CLIENT = new Set(["securhome_dommages", "securpro_dommages", "incendie"]);

/** Autres produits actifs du partenaire d'origine, non encore souscrits (confirmés) par ce même numéro chez ce partenaire. */
clientRouter.get(
  "/produits-disponibles",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    let partenaireId: string;
    let telephone: string;
    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    } else if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    } else {
      const s = await prisma.souscription.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    }

    const partenaire = await prisma.partenaire.findUnique({
      where: { id: partenaireId },
      select: { id: true, nomCommerce: true },
    });
    if (!partenaire) return res.status(404).json({ error: "Partenaire introuvable" });

    const [accidentsChooser, dommagesChooser, dejaSouscrits, qr] = await Promise.all([
      construireChooserProduits("ASSURANCES_ACCIDENTS", partenaire),
      construireChooserProduits("ASSURANCES_DOMMAGES", partenaire),
      prisma.souscription.findMany({
        where: { telephone, partenaireId, waveStatut: "confirme" },
        select: { produit: { select: { code: true } } },
      }),
      prisma.qrCode.findFirst({ where: { partenaireId, produitId: null } }),
    ]);

    const codesDejaSouscrits = new Set(dejaSouscrits.map((d) => d.produit.code));
    const produits = [...accidentsChooser.produits, ...dommagesChooser.produits].filter(
      (p) => p.disponible && !codesDejaSouscrits.has(p.code) && !PRODUITS_HORS_ESPACE_CLIENT.has(p.code)
    );

    res.json({
      partenaire: { nomCommerce: partenaire.nomCommerce },
      qrToken: qr?.token ?? null,
      produits: produits.map((p) => ({ code: p.code, libelle: p.libelle, montantPrime: p.montantPrime })),
    });
  })
);

/**
 * Identité/photos déjà connues du client (parmi ses souscriptions confirmées,
 * même téléphone) — utilisé pour pré-remplir le formulaire de souscription à
 * un nouveau produit depuis l'espace client, afin de ne pas lui redemander ce
 * qu'on sait déjà. Purement informatif : tous les champs restent modifiables
 * côté formulaire. Voir frontend/src/pages/public/Souscription.tsx.
 */
clientRouter.get(
  "/profil-identite",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    let telephone: string;
    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id }, select: { telephone: true } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      telephone = s.telephone;
    } else if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id }, select: { telephone: true } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      telephone = s.telephone;
    } else {
      const s = await prisma.souscription.findUnique({ where: { id }, select: { telephone: true } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      telephone = s.telephone;
    }

    const mesSouscriptions = await prisma.souscription.findMany({
      where: { telephone },
      orderBy: { createdAt: "desc" },
      select: { id: true, nom: true, prenom: true, dateNaissance: true, sexe: true, pieceIdentiteUrl: true },
    });

    let nom: string | null = null;
    let prenom: string | null = null;
    let dateNaissance: Date | null = null;
    let sexe: string | null = null;
    let pieceIdentiteUrl: string | null = null;
    for (const s of mesSouscriptions) {
      nom ??= s.nom;
      prenom ??= s.prenom;
      dateNaissance ??= s.dateNaissance;
      sexe ??= s.sexe;
      pieceIdentiteUrl ??= s.pieceIdentiteUrl;
    }

    let typePiece: string | null = null;
    let selfieUrl: string | null = null;
    if (mesSouscriptions.length > 0) {
      const documents = await prisma.document.findMany({
        where: { souscriptionId: { in: mesSouscriptions.map((s) => s.id) }, type: { in: ["CNI", "Permis", "Selfie"] } },
        orderBy: { createdAt: "desc" },
      });
      const selfieDoc = documents.find((d) => d.type === "Selfie");
      const pieceDoc = documents.find((d) => d.type === "CNI" || d.type === "Permis");
      selfieUrl = selfieDoc?.url ?? null;
      if (pieceDoc) {
        typePiece = pieceDoc.type;
        pieceIdentiteUrl ??= pieceDoc.url;
      }
    }

    // Repli : client dont l'unique contrat connu est un ancien Accident (pas
    // encore de ligne dans le modèle générique sous ce téléphone).
    if (!nom && !prenom) {
      const legacy = await prisma.souscriptionAccident.findFirst({
        where: { telephone },
        orderBy: { createdAt: "desc" },
        select: { nom: true, prenom: true, dateNaissance: true, pieceIdentiteUrl: true },
      });
      if (legacy) {
        nom = legacy.nom;
        prenom = legacy.prenom;
        dateNaissance ??= legacy.dateNaissance;
        pieceIdentiteUrl ??= legacy.pieceIdentiteUrl;
      }
    }

    res.json({
      nom,
      prenom,
      dateNaissance,
      sexe,
      typePiece,
      pieceIdentiteUrl,
      selfieUrl,
    });
  })
);

/**
 * Contrats "Assurances Accidents" du client (même numéro de téléphone,
 * tous produits confondus : générique — RelaxMoto/Auto, RelaxAccidents
 * Frais Médicaux/générale, RelaxVoyage — et modèle historique Accident) —
 * lui permet de choisir sur quel numéro de police porte une déclaration de
 * sinistre quand il en détient plusieurs. Exclut les produits Dommages
 * (Incendie, SecurHome+, SecurPro), hors périmètre de cette sélection.
 */
clientRouter.get(
  "/mes-contrats-accidents",
  asyncHandler(async (req: AuthedRequest, res) => {
    const telephone = await telephoneDuClient(produitType(req), req.user!.sub);
    if (!telephone) return res.status(404).json({ error: "Introuvable" });

    const [generiques, accidents] = await Promise.all([
      prisma.souscription.findMany({
        where: { telephone, waveStatut: "confirme", produit: { sousBranche: "ASSURANCES_ACCIDENTS" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, numeroPolice: true, produit: { select: { code: true, libelle: true } } },
      }),
      prisma.souscriptionAccident.findMany({
        where: { telephone, waveStatut: "confirme" },
        orderBy: { createdAt: "desc" },
        select: { id: true, numeroPolice: true },
      }),
    ]);

    res.json([
      ...generiques.map((s) => ({
        produitType: "generique" as const,
        id: s.id,
        produitCode: s.produit.code,
        produitLibelle: s.produit.libelle,
        numeroPolice: s.numeroPolice,
      })),
      ...accidents.map((s) => ({
        produitType: "accident" as const,
        id: s.id,
        produitCode: "accident",
        produitLibelle: "Accidents (historique)",
        numeroPolice: s.numeroPolice,
      })),
    ]);
  })
);

// Même régime que les data URL image validées ailleurs (contrats.ts, public.ts).
const dataUrlImage = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Image invalide");

const sinistreSchema = z.object({
  typeEvenement: z.string().min(1).max(120),
  dateSurvenance: z.coerce.date(),
  description: z.string().max(2000).optional(),
  photosAccidentUrls: z.array(dataUrlImage).max(5).optional(),
  // Contrat Accidents concerné, si le client en détient plusieurs (voir GET
  // /mes-contrats-accidents) — par défaut (omis), le contrat sur lequel il
  // est connecté.
  cible: z.object({ produitType: z.enum(["generique", "accident"]), id: z.string().min(1) }).optional(),
});

clientRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = sinistreSchema.parse(req.body);
    let type = produitType(req);
    let id = req.user!.sub;

    if (data.cible) {
      // Vérifie que le contrat visé appartient bien à ce client (même
      // numéro de téléphone que son propre contrat) avant d'accepter d'y
      // rattacher la déclaration — sans quoi n'importe quel client connecté
      // pourrait déclarer un sinistre sur la police d'un autre.
      const monTelephone = await telephoneDuClient(type, id);
      const cibleTelephone =
        data.cible.produitType === "accident"
          ? (await prisma.souscriptionAccident.findUnique({ where: { id: data.cible.id }, select: { telephone: true } }))?.telephone
          : (await prisma.souscription.findUnique({ where: { id: data.cible.id }, select: { telephone: true } }))?.telephone;
      if (!cibleTelephone || !monTelephone || cibleTelephone !== monTelephone) {
        return res.status(403).json({ error: "Ce contrat ne vous appartient pas." });
      }
      type = data.cible.produitType;
      id = data.cible.id;
    }

    let produitCode: string;
    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = "incendie";
    } else if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = "accident";
    } else {
      const s = await prisma.souscription.findUnique({
        where: { id },
        include: { produit: { select: { code: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = s.produit.code;
    }

    const created = await prisma.sinistreRelax.create({
      data: {
        produitType: type,
        souscriptionId: type === "generique" ? id : undefined,
        souscriptionIncendieId: type === "incendie" ? id : undefined,
        souscriptionAccidentId: type === "accident" ? id : undefined,
        numeroSinistre: "TMP",
        typeEvenement: data.typeEvenement,
        dateSurvenance: data.dateSurvenance,
        description: data.description,
        photosAccidentUrls: data.photosAccidentUrls ?? [],
      },
    });
    const updated = await prisma.sinistreRelax.update({
      where: { id: created.id },
      data: { numeroSinistre: numeroSinistre(produitCode, created.id) },
    });

    // Analyse anti-fraude IA — fire-and-forget, ne bloque jamais la réponse
    // au client (voir services/fraudeIA.ts) ; le résultat sera prêt au
    // moment où l'admin consulte le sinistre.
    analyserSinistreIA(updated.id).catch((e) => console.error("[fraudeIA]", e));

    res.status(201).json(updated);
  })
);

clientRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const rows = await prisma.sinistreRelax.findMany({
        where: { souscriptionIncendieId: id },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    // Un client peut avoir déclaré un sinistre sur un AUTRE de ses contrats
    // Accidents que celui sur lequel il est connecté (voir POST /sinistres
    // et GET /mes-contrats-accidents) — on agrège donc tous ses contrats
    // (même numéro de téléphone) pour qu'il retrouve chaque déclaration.
    const telephone = await telephoneDuClient(type, id);
    const [autresGeneriques, autresAccidents] = telephone
      ? await Promise.all([
          prisma.souscription.findMany({
            where: { telephone, produit: { sousBranche: "ASSURANCES_ACCIDENTS" } },
            select: { id: true },
          }),
          prisma.souscriptionAccident.findMany({ where: { telephone }, select: { id: true } }),
        ])
      : [[], []];

    const souscriptionIds = new Set(autresGeneriques.map((s) => s.id));
    const souscriptionAccidentIds = new Set(autresAccidents.map((s) => s.id));
    if (type === "generique") souscriptionIds.add(id);
    else souscriptionAccidentIds.add(id);

    const rows = await prisma.sinistreRelax.findMany({
      where: {
        OR: [
          ...(souscriptionIds.size ? [{ souscriptionId: { in: [...souscriptionIds] } }] : []),
          ...(souscriptionAccidentIds.size ? [{ souscriptionAccidentId: { in: [...souscriptionAccidentIds] } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  })
);
