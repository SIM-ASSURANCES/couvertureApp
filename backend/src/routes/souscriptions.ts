import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";
import {
  sendSMS,
  messageIncendie,
  lienFormulaire,
  newFormulaireToken,
  initiateWavePayment,
  messageRelancePaiement,
  messageRelanceRenouvellement,
  messageRelanceRenouvellementIncendie,
} from "../services/notify.js";
import { verifierPaiementAccident } from "../services/accident.js";
import { refFactureDisponible, MAX_USAGES_REF_FACTURE } from "../services/incendie.js";
import { mapperSouscriptionGenerique } from "../services/contratGenerique.js";

export const souscriptionsRouter = Router();
souscriptionsRouter.use(requireAuth("admin"));

/** Liste unifiée des contrats : incendie complets + accident confirmés */
souscriptionsRouter.get(
  "/contrats",
  asyncHandler(async (req, res) => {
    const { q, type, from, to } = req.query as { q?: string; type?: string; from?: string; to?: string };
    // Filtre "date d'effet" (dateDebut) — pour Incendie, dateDebut = createdAt
    // (pas de colonne dédiée sur ce modèle historique, voir plus bas).
    const dateEffetRange =
      from || to
        ? { gte: from ? new Date(`${from}T00:00:00`) : undefined, lte: to ? new Date(`${to}T23:59:59.999`) : undefined }
        : undefined;

    type Contrat = {
      id: string;
      type: string;
      numeroPolice: string;
      nom: string;
      prenom: string;
      telephone: string;
      montant: number;
      capitalGaranti: number;
      partenaire: string;
      partenaireResponsable: string;
      partenaireLocalisation: string | null;
      dateDebut: Date | null;
      dateFin: Date | null;
      date: Date;
      refFacture?: string | null;
      commune?: string | null;
      quartier?: string | null;
      numeroMaison?: string | null;
      dateNaissance?: Date | null;
      primeHT?: number | null;
      primeTTC: number;
      taxes?: number | null;
      // Tous deux affichés sous le libellé « Accessoires », mais exclusifs :
      // `fg` est DÉJÀ COMPRIS dans primeHT sur les produits à tarif fixe
      // (prime TTC = primeHT + taxes), tandis que `accessoires` s'ajoute sur
      // les produits à devis calculé (TTC = primeHT + accessoires + taxes).
      // Ne jamais les additionner — voir pages/admin/Contrats.tsx.
      fg?: number | null;
      accessoires?: number | null;
      signature?: string | null;
      // Modèle générique (RelaxMoto/Auto, RelaxAccidents Frais Médicaux/générale,
      // RelaxVoyage, SecurHome+, SecurPro Dommages) — voir services/contratGenerique.ts
      produitLibelle?: string;
      compagnie?: string | null;
      lieuDepart?: string | null;
      lieuArrivee?: string | null;
      numeroTicket?: string | null;
      dateDepart?: string | null;
      numeroPersonneContact?: string | null;
      fraisSante?: number | null;
      bagages?: string | null;
      optionDeces?: { capital: number; prime: number; dureeMois: number } | null;
      raisonSociale?: string | null;
      profession?: string | null;
      classe?: number | null;
      typeCouverture?: string | null;
      effectif?: number | null;
      nomCommercial?: string | null;
      ville?: string | null;
      communeQuartier?: string | null;
      statutOccupation?: "proprietaire" | "locataire" | null;
      valeurBatiment?: number | null;
      loyerMensuel?: number | null;
      contenu?: number | null;
      dansMarche?: boolean | null;
      gardien?: boolean | null;
      extincteur?: boolean | null;
      camera?: boolean | null;
      volContenu?: boolean | null;
      nombrePieces?: number | null;
      /** RelaxMoto/RelaxAuto : périodicité mentionnée sur le contrat PDF. */
      cycleFacturation?: "mensuel" | "annuel" | null;
      // Référence de la transaction Wave, uniquement quand le paiement est
      // confirmé. Incendie se règle par facture en boutique : pas de référence.
      referenceWave?: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resultat?: any;
    };

    const out: Contrat[] = [];

    const [tarifsInc, tarifsAcc] = await Promise.all([
      prisma.tarifIncendie.findMany(),
      prisma.tarifAccident.findMany(),
    ]);
    const incTarifMap = new Map(tarifsInc.map((t) => [t.prime, t]));
    const accTarifMap = new Map(tarifsAcc.map((t) => [t.prime, t]));

    if (!type || type === "incendie") {
      const inc = await prisma.souscriptionIncendie.findMany({
        where: { statut: "complet", createdAt: dateEffetRange },
        include: {
          partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      for (const s of inc) {
        const debut = s.createdAt;
        const fin = new Date(debut);
        fin.setFullYear(fin.getFullYear() + 1);
        const t = incTarifMap.get(s.montantPrime);
        out.push({
          id: s.id,
          type: "incendie",
          numeroPolice: `POL-INC-${debut.getFullYear()}-${s.id.slice(0, 8).toUpperCase()}`,
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
          refFacture: s.refFacture ?? null,
          commune: s.commune ?? null,
          quartier: s.quartier ?? null,
          numeroMaison: s.numeroMaison ?? null,
          primeHT: t?.primeHT ?? null,
          primeTTC: s.montantPrime,
          taxes: t?.taxes ?? null,
          fg: t?.fg ?? null,
          signature: s.signature,
        });
      }
    }

    if (!type || type === "accident") {
      const acc = await prisma.souscriptionAccident.findMany({
        where: { waveStatut: "confirme", dateDebut: dateEffetRange },
        include: {
          partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      for (const s of acc) {
        const t = accTarifMap.get(s.montantPrime);
        out.push({
          referenceWave: s.waveStatut === "confirme" ? s.waveTransactionId : null,
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
          primeHT: t?.primeHT ?? null,
          primeTTC: s.montantPrime,
          taxes: t?.taxes ?? null,
          fg: t?.fg ?? null,
          signature: s.signature,
        });
      }
    }

    // Modèle générique (branches "Assurances Accidents"/"Assurances Dommages") —
    // toujours confirmé (waveStatut === "confirme"), même convention que Accident.
    if (type !== "incendie" && type !== "accident") {
      const produitsGeneriques = await prisma.produit.findMany({
        where: {
          sousBranche: { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] },
          ...(type ? { code: type } : {}),
        },
      });
      if (produitsGeneriques.length > 0) {
        // Décomposition de la prime (nette / accessoires / taxes / TTC) — deux
        // sources selon le produit : le barème TarifProduit pour les produits à
        // formule fixe, le devis stocké dans Souscription.resultat pour ceux à
        // calcul dynamique (RelaxAccidents générale, SecurHome+, SecurPro).
        const tarifsProduit = await prisma.tarifProduit.findMany({
          where: { produitId: { in: produitsGeneriques.map((p) => p.id) } },
        });
        // L'identité d'un tarif est (produitId, libelleVariante) et non le prix
        // (deux formules d'un même produit peuvent coûter pareil) — on indexe
        // donc sur le libellé, avec un repli par prime quand la souscription ne
        // mémorise pas la formule choisie.
        const tarifParVariante = new Map(
          tarifsProduit.filter((t) => t.libelleVariante).map((t) => [`${t.produitId}|${t.libelleVariante}`, t])
        );
        const tarifParPrime = new Map<string, (typeof tarifsProduit)[number]>();
        for (const t of tarifsProduit) {
          const cle = `${t.produitId}|${t.prime}`;
          if (!tarifParPrime.has(cle)) tarifParPrime.set(cle, t);
        }

        const generiques = await prisma.souscription.findMany({
          where: {
            produitId: { in: produitsGeneriques.map((p) => p.id) },
            waveStatut: "confirme",
            dateDebut: dateEffetRange,
          },
          include: {
            partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
            produit: { select: { code: true, libelle: true } },
            // Dernière échéance réglée : porte la référence Wave quand elle
            // n'a pas été recopiée sur la souscription (cas des abonnements).
            paiements: {
              where: { statut: "paye" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { waveTransactionId: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });
        for (const s of generiques) {
          const d = await mapperSouscriptionGenerique(s);

          // Produits à devis calculé : les totaux sont déjà figés dans
          // `resultat` (voir services/relaxAccidentsGenerale.ts et
          // securhomeDommages.ts), même lecture que services/commission.ts.
          const r = s.resultat as
            | { primeNetteHT?: number; primeNetteHT2?: number; accessoires?: number; taxes?: number; primeTTC?: number }
            | null;
          let primeHT: number | null = r?.primeNetteHT2 ?? r?.primeNetteHT ?? null;
          let accessoires: number | null = r?.accessoires ?? null;
          let taxes: number | null = r?.taxes ?? null;
          let primeTTC: number = r?.primeTTC ?? d.montant;
          let fg: number | null = null;

          if (primeHT === null) {
            const tarif =
              (s.cycleFacturation ? tarifParVariante.get(`${s.produitId}|${s.cycleFacturation}`) : undefined) ??
              tarifParPrime.get(`${s.produitId}|${s.montantPrime}`);
            primeHT = tarif?.primeHT ?? null;
            taxes = tarif?.taxes ?? null;
            fg = tarif?.fg ?? null;
            accessoires = null;
            primeTTC = d.montant;
          }

          // Le franc CFA n'a pas de subdivision : les barèmes stockent des
          // flottants (issus d'un calcul de taux), on n'affiche que des entiers.
          const arrondir = (v: number | null) => (v === null ? null : Math.round(v));
          primeHT = arrondir(primeHT);
          taxes = arrondir(taxes);
          fg = arrondir(fg);
          accessoires = arrondir(accessoires);

          out.push({
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
            primeHT,
            primeTTC,
            taxes,
            fg,
            accessoires,
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
            raisonSociale: d.raisonSociale,
            profession: d.profession,
            classe: d.classe,
            typeCouverture: d.typeCouverture,
            effectif: d.effectif,
            nomCommercial: d.nomCommercial,
            ville: d.ville,
            communeQuartier: d.communeQuartier,
            refFacture: d.refFacture,
            statutOccupation: d.statutOccupation,
            valeurBatiment: d.valeurBatiment,
            loyerMensuel: d.loyerMensuel,
            contenu: d.contenu,
            dansMarche: d.dansMarche,
            gardien: d.gardien,
            extincteur: d.extincteur,
            camera: d.camera,
            volContenu: d.volContenu,
            nombrePieces: d.nombrePieces,
            resultat: d.resultat,
            cycleFacturation: s.cycleFacturation,
            referenceWave:
              s.waveStatut === "confirme"
                ? s.waveTransactionId ?? s.paiements[0]?.waveTransactionId ?? null
                : null,
          });
        }
      }
    }

    let list = out;
    if (q) {
      const ql = q.toLowerCase();
      list = out.filter(
        (c) =>
          `${c.prenom} ${c.nom}`.toLowerCase().includes(ql) ||
          c.numeroPolice.toLowerCase().includes(ql) ||
          c.telephone.toLowerCase().includes(ql) ||
          c.partenaire.toLowerCase().includes(ql)
      );
    }

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(list);
  })
);

/** Re-vérifie un paiement Wave bloqué « en attente » et confirme si payé */
souscriptionsRouter.post(
  "/accident/:id/verifier",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    const statut = await verifierPaiementAccident(s);
    if (statut === "confirme" && s.waveStatut !== "confirme") {
      await logAction({
        adminId: req.user!.sub,
        typeAction: "modification",
        objetType: "souscription_accident",
        objetId: s.id,
        valeurApres: { waveStatut: "confirme", source: "verification_wave" },
      });
    }
    res.json({ statut });
  })
);

souscriptionsRouter.get(
  "/incendie",
  asyncHandler(async (req, res) => {
    const { statut, partenaireId, renouvellementProche } = req.query as {
      statut?: string;
      partenaireId?: string;
      renouvellementProche?: string;
    };
    const procheDeLecheance = renouvellementProche === "1";
    const rows = await prisma.souscriptionIncendie.findMany({
      where: {
        statut:
          statut === "en_cours" || statut === "complet" || statut === "expire"
            ? statut
            : undefined,
        partenaireId: partenaireId || undefined,
        ...(procheDeLecheance
          ? { dateFin: { gte: new Date(), lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } }
          : {}),
      },
      include: {
        partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
      },
      orderBy: procheDeLecheance ? { dateFin: "asc" } : { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({
        ...r,
        clientPasswordHash: undefined,
        espaceClientActif: !!r.clientPasswordHash,
        partenaireNom: r.partenaire.nomCommerce,
        partenaireResponsable: r.partenaire.nomResponsable,
        partenaireLocalisation: r.partenaire.localisation,
      }))
    );
  })
);

const RENOUVELLEMENT_FENETRE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Liste des clients Accident. Un accident n'est considéré comme une souscription
 * réelle qu'une fois le paiement Wave confirmé au moins une fois : cette route
 * renvoie par défaut toute souscription ayant déjà eu un numéro de police
 * (donc y compris pendant l'attente d'un paiement de renouvellement, où
 * `waveStatut` ne change plus — voir services/accident.ts), sauf si `attente=1`
 * est passé (utilisé par la page dédiée « Paiement en attente », qui liste les
 * PREMIERS paiements en attente ET échoués — jamais les renouvellements, qui
 * ne touchent pas `waveStatut`). `renouvellementProche=1` filtre en plus sur les
 * échéances (`dateFin`) dans les 2 semaines à venir, pour la page d'alerte.
 */
souscriptionsRouter.get(
  "/accident",
  asyncHandler(async (req, res) => {
    const { attente, partenaireId, renouvellementProche } = req.query as {
      attente?: string;
      partenaireId?: string;
      renouvellementProche?: string;
    };
    // Purge les PREMIERS paiements toujours en attente/échoués 24h après la
    // souscription — la page "Paiement en attente" ne doit jamais accumuler
    // indéfiniment des tentatives de paiement abandonnées.
    if (attente === "1") {
      await prisma.souscriptionAccident.deleteMany({
        where: {
          waveStatut: { in: ["en_attente", "echoue"] },
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
    }
    const rows = await prisma.souscriptionAccident.findMany({
      where: {
        waveStatut: attente === "1" ? { in: ["en_attente", "echoue"] } : undefined,
        numeroPolice: attente === "1" ? undefined : { not: null },
        dateFin:
          renouvellementProche === "1"
            ? { gte: new Date(), lte: new Date(Date.now() + RENOUVELLEMENT_FENETRE_MS) }
            : undefined,
        partenaireId: partenaireId || undefined,
      },
      include: {
        partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
      },
      orderBy: renouvellementProche === "1" ? { dateFin: "asc" } : { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({
        ...r,
        clientPasswordHash: undefined,
        espaceClientActif: !!r.clientPasswordHash,
        partenaireNom: r.partenaire.nomCommerce,
        partenaireResponsable: r.partenaire.nomResponsable,
        partenaireLocalisation: r.partenaire.localisation,
      }))
    );
  })
);

/**
 * Relance un paiement Wave en attente : régénère un lien de paiement avec le
 * montant exact de la prime et l'envoie par SMS au souscripteur.
 */
souscriptionsRouter.post(
  "/accident/:id/relance-paiement",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { qrAccidentToken: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.waveStatut === "confirme") {
      return res.status(400).json({ error: "Cette souscription est déjà payée." });
    }
    if (!process.env.WAVE_API_KEY) {
      return res.status(400).json({ error: "Wave n'est pas configuré (WAVE_API_KEY manquant)." });
    }
    if (!s.partenaire.qrAccidentToken) {
      return res.status(400).json({ error: "QR Accidents introuvable pour ce partenaire." });
    }

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/accident/${s.partenaire.qrAccidentToken}?paid=${s.id}`;
    const errorUrl = `${appUrl}/s/accident/${s.partenaire.qrAccidentToken}?paiement=echec`;

    const wave = await initiateWavePayment(s.montantPrime, s.id, successUrl, errorUrl);
    const updated = await prisma.souscriptionAccident.update({
      where: { id: s.id },
      data: {
        waveTransactionId: wave.transactionId,
        waveStatut: "en_attente",
        relanceCount: { increment: 1 },
      },
    });
    await sendSMS(s.telephone, messageRelancePaiement(s.montantPrime, wave.checkoutUrl));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_accident",
      objetId: s.id,
    });
    res.json({ ok: true, relanceCount: updated.relanceCount });
  })
);

/**
 * Relance le RENOUVELLEMENT d'un contrat Accident déjà confirmé (proche de
 * son échéance) : régénère un lien de paiement pour la même prime et l'envoie
 * par SMS. Contrairement à relance-paiement, ne touche jamais `waveStatut`
 * (la couverture en cours reste "confirme" pendant que le renouvellement est
 * en attente de paiement) — voir `renouvellementEnCoursDepuis` et
 * services/accident.ts::confirmerAccident pour la suite du traitement.
 */
souscriptionsRouter.post(
  "/accident/:id/relance-renouvellement",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { qrAccidentToken: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.waveStatut !== "confirme" || !s.numeroPolice) {
      return res.status(400).json({ error: "Cette souscription n'est pas encore confirmée." });
    }
    if (!process.env.WAVE_API_KEY) {
      return res.status(400).json({ error: "Wave n'est pas configuré (WAVE_API_KEY manquant)." });
    }
    if (!s.partenaire.qrAccidentToken) {
      return res.status(400).json({ error: "QR Accidents introuvable pour ce partenaire." });
    }

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/accident/${s.partenaire.qrAccidentToken}?paid=${s.id}`;
    const errorUrl = `${appUrl}/s/accident/${s.partenaire.qrAccidentToken}?paiement=echec`;

    const wave = await initiateWavePayment(s.montantPrime, s.id, successUrl, errorUrl);
    const updated = await prisma.souscriptionAccident.update({
      where: { id: s.id },
      data: {
        waveTransactionId: wave.transactionId,
        renouvellementEnCoursDepuis: new Date(),
        relanceRenouvellementCount: { increment: 1 },
      },
    });
    await sendSMS(s.telephone, messageRelanceRenouvellement(s.prenom, s.montantPrime, wave.checkoutUrl));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_accident_renouvellement",
      objetId: s.id,
    });
    res.json({ ok: true, relanceRenouvellementCount: updated.relanceRenouvellementCount });
  })
);

/** Saisie/màj de la réf.facture par l'admin (souscripteur l'a communiquée via un autre canal) */
souscriptionsRouter.patch(
  "/incendie/:id/facture",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { refFacture, commune, quartier, numeroMaison } = (req.body ?? {}) as {
      refFacture?: string;
      commune?: string;
      quartier?: string;
      numeroMaison?: string;
    };
    if (!refFacture?.trim() || !commune?.trim() || !quartier?.trim())
      return res.status(400).json({
        error: "Réf.facture, commune et quartier sont obligatoires.",
      });

    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    if (!(await refFactureDisponible(refFacture.trim(), s.id))) {
      return res.status(409).json({
        error: `Cette référence facture a déjà été utilisée ${MAX_USAGES_REF_FACTURE} fois.`,
      });
    }

    // Commission de référence depuis le barème Incendie
    const tarif = await prisma.tarifIncendie.findFirst({
      where: { prime: s.montantPrime },
    });

    // Renouvellement (voir routes/public.ts PATCH /souscriptions/incendie/:token
    // pour le même traitement côté client) : une souscription déjà "complet"
    // qui reçoit ici une NOUVELLE réf.facture prolonge l'échéance de 3 mois
    // sur la même ligne, plutôt que de simplement écraser refFacture.
    const estRenouvellement = s.statut === "complet";
    const dateDebut = estRenouvellement && s.dateFin && s.dateFin > new Date() ? s.dateFin : new Date();
    const dateFin = new Date(dateDebut);
    dateFin.setMonth(dateFin.getMonth() + 3);

    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        refFacture: refFacture.trim(),
        commune: commune.trim(),
        quartier: quartier.trim(),
        numeroMaison: numeroMaison?.trim() || s.numeroMaison,
        statut: "complet",
        commissionCalculee: tarif?.commission ?? s.commissionCalculee,
        dateDebut,
        dateFin,
        renouvellementEnCoursDepuis: null,
        ...(estRenouvellement ? { renouveleAt: new Date(), nombrePaiements: { increment: 1 } } : {}),
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "souscription_incendie",
      objetId: s.id,
      valeurApres: { refFacture: updated.refFacture, statut: "complet" },
    });
    res.json({ ...updated, partenaireNom: undefined });
  })
);

/**
 * Relance le RENOUVELLEMENT d'un contrat Incendie déjà complet (proche de son
 * échéance) — contrairement à /relance ci-dessous (relance la complétion
 * INITIALE), et contrairement au renouvellement Accident/générique : pas de
 * paiement Wave pour ce produit (payé via réf.facture à l'achat), donc le SMS
 * renvoie vers le même lien de COMPLÉTION, réutilisé en mode renouvellement
 * (voir PATCH /public/souscriptions/incendie/:token — détecte le
 * renouvellement via `statut === "complet"`, exige une réf.facture NEUVE).
 */
souscriptionsRouter.post(
  "/incendie/:id/relance-renouvellement",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.statut !== "complet" || !s.lienFormulaireToken) {
      return res.status(400).json({ error: "Cette souscription n'est pas encore complète." });
    }
    await sendSMS(
      s.telephone,
      messageRelanceRenouvellementIncendie(lienFormulaire("incendie", s.lienFormulaireToken))
    );
    const updatedRenouv = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        renouvellementEnCoursDepuis: new Date(),
        relanceRenouvellementCount: { increment: 1 },
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_incendie_renouvellement",
      objetId: s.id,
    });
    res.json({ ok: true, relanceRenouvellementCount: updatedRenouv.relanceRenouvellementCount });
  })
);

souscriptionsRouter.post(
  "/incendie/:id/relance",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    const token = s.lienFormulaireToken ?? newFormulaireToken();
    await sendSMS(
      s.telephone,
      messageIncendie(s.prenom, lienFormulaire("incendie", token))
    );
    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        lienFormulaireToken: token,
        whatsappEnvoyeAt: new Date(),
        relanceCount: { increment: 1 },
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_incendie",
      objetId: s.id,
    });
    res.json({ ok: true, relanceCount: updated.relanceCount });
  })
);

souscriptionsRouter.get(
  "/incendie/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.souscriptionIncendie.findMany({
      include: { partenaire: { select: { nomCommerce: true, nomResponsable: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription_incendie",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_incendie.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          telephone: r.telephone,
          nom: r.nom ?? "",
          prenom: r.prenom ?? "",
          refFacture: r.refFacture ?? "",
          commune: r.commune ?? "",
          quartier: r.quartier ?? "",
          numeroMaison: r.numeroMaison ?? "",
          partenaire: r.partenaire.nomResponsable || r.partenaire.nomCommerce,
          statut: r.statut,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);

souscriptionsRouter.delete(
  "/incendie/:id",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    // Le Super Administrateur de la branche peut supprimer un contrat même
    // déjà émis/payé — conservé dans le journal (valeurAvant) puisqu'il n'en
    // restera sinon plus aucune trace après suppression.
    await prisma.souscriptionIncendie.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription_incendie",
      objetId: req.params.id,
      valeurAvant: s,
    });
    res.status(204).end();
  })
);

souscriptionsRouter.delete(
  "/accident/:id",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    // Le Super Administrateur de la branche peut supprimer un contrat même
    // déjà émis/payé — conservé dans le journal (valeurAvant) puisqu'il n'en
    // restera sinon plus aucune trace après suppression.
    await prisma.souscriptionAccident.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription_accident",
      objetId: req.params.id,
      valeurAvant: s,
    });
    res.status(204).end();
  })
);

souscriptionsRouter.get(
  "/accident/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.souscriptionAccident.findMany({
      include: { partenaire: { select: { nomCommerce: true, nomResponsable: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription_accident",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_accident.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          telephone: r.telephone,
          nom: r.nom,
          prenom: r.prenom,
          dateNaissance: r.dateNaissance ? r.dateNaissance.toISOString().slice(0, 10) : "",
          montantPrime: r.montantPrime,
          waveStatut: r.waveStatut,
          numeroPolice: r.numeroPolice ?? "",
          partenaire: r.partenaire.nomResponsable || r.partenaire.nomCommerce,
          statutDossier: r.statutDossier,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);
