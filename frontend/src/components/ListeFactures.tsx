import { useEffect, useState } from "react";
import { listerFactures, telechargerFacture, type FactureResume } from "../facture";

const fcfa = (n: number) => n.toLocaleString("fr-FR") + " FCFA";
const jour = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

/**
 * Factures d'une souscription, une par paiement confirmé (première
 * souscription puis chaque renouvellement), avec téléchargement du PDF.
 * Partagé entre l'espace client et les fiches admin : l'accès est contrôlé par
 * le serveur (session admin, ou client propriétaire). N'affiche rien tant
 * qu'il n'y a aucune facture — c'est le cas des anciens modèles Incendie et
 * Accident, qui n'ont pas de ligne de paiement.
 */
export default function ListeFactures({
  souscriptionId,
  onNotify,
}: {
  souscriptionId: string;
  onNotify: (message: string) => void;
}) {
  const [factures, setFactures] = useState<FactureResume[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerFactures(souscriptionId)
      .then((f) => {
        if (!annule) setFactures(f);
      })
      .catch(() => {
        // Best-effort : une liste indisponible ne doit jamais bloquer le reste de la page.
        if (!annule) setFactures([]);
      });
    return () => {
      annule = true;
    };
  }, [souscriptionId]);

  async function telecharger(f: FactureResume) {
    setEnCours(f.paiementId);
    try {
      await telechargerFacture(f.paiementId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Erreur lors de la génération de la facture");
    } finally {
      setEnCours(null);
    }
  }

  if (factures.length === 0) return null;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eef1f5" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Factures</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {factures.map((f) => (
          <div
            key={f.paiementId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              background: "#f5f8fc",
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f1b2d" }}>{f.numeroFacture}</div>
              <div style={{ fontSize: 12, color: "#5b6b80" }}>
                {f.estRenouvellement ? "Renouvellement" : "Souscription"} · {jour(f.datePaiement)} · {fcfa(f.montant)}
              </div>
            </div>
            <button
              onClick={() => telecharger(f)}
              disabled={enCours === f.paiementId}
              style={{
                flexShrink: 0,
                background: "#fff",
                color: "#004b9c",
                border: "1.5px solid #004b9c",
                borderRadius: 10,
                padding: "7px 12px",
                fontWeight: 700,
                fontSize: 13,
                cursor: enCours === f.paiementId ? "default" : "pointer",
                opacity: enCours === f.paiementId ? 0.5 : 1,
              }}
            >
              {enCours === f.paiementId ? "Génération…" : "⬇ PDF"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
