import { useState } from "react";
import { FileDown, IdCard } from "lucide-react";
import { api } from "../api";
import { telechargerCarte } from "../carte";
import { genererContratDepuisDonnees, type DonneesContrat } from "../contract";

// Produits assurant une personne — seuls ceux-là ont une carte de prise en
// charge (mêmes codes que TYPES_AVEC_CARTE dans pages/admin/Contrats.tsx).
const TYPES_AVEC_CARTE = [
  "incendie",
  "accident",
  "relaxaccidents_fraismedicaux",
  "relaxvoyage",
  "relaxmoto",
  "relaxauto",
];

/**
 * Boutons de téléchargement (contrat PDF + carte de prise en charge) à
 * intégrer dans une modale de détail client — même logique que la page
 * Contrats, rendue accessible depuis les pages Clients. Le contrat est
 * récupéré via /souscriptions/contrats (filtré sur le n° de police) pour
 * réutiliser exactement le même transformateur que partout ailleurs plutôt
 * que de reconstruire les données du contrat à la main.
 */
export default function ActionsDocumentsClient({
  souscriptionId,
  type,
  numeroPolice,
  onNotify,
}: {
  souscriptionId: string;
  /** Code produit ("relaxmoto", "incendie", "accident"…). */
  type: string;
  numeroPolice?: string | null;
  onNotify: (message: string) => void;
}) {
  const [busyContrat, setBusyContrat] = useState(false);
  const [busyCarte, setBusyCarte] = useState(false);

  async function telechargerContrat() {
    setBusyContrat(true);
    try {
      const params = numeroPolice ? `?q=${encodeURIComponent(numeroPolice)}` : "";
      const contrats = await api.get<DonneesContrat[]>(`/souscriptions/contrats${params}`);
      const contrat = contrats.find((c) => c.id === souscriptionId);
      if (!contrat) {
        onNotify("Contrat introuvable pour ce client.");
        return;
      }
      await genererContratDepuisDonnees(contrat);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Erreur lors de la génération du contrat");
    } finally {
      setBusyContrat(false);
    }
  }

  async function voirCarte() {
    setBusyCarte(true);
    try {
      await telechargerCarte(type, souscriptionId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Erreur lors de la génération de la carte");
    } finally {
      setBusyCarte(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #e5e7eb)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Documents</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" disabled={busyContrat} onClick={telechargerContrat}>
          <FileDown size={15} /> {busyContrat ? "Génération…" : "Contrat PDF"}
        </button>
        {TYPES_AVEC_CARTE.includes(type) && (
          <button className="btn btn-ghost" disabled={busyCarte} onClick={voirCarte}>
            <IdCard size={15} /> {busyCarte ? "Génération…" : "Carte de prise en charge"}
          </button>
        )}
      </div>
    </div>
  );
}
