import { useState } from "react";
import { Copy, KeyRound, X } from "lucide-react";
import { Badge, fmtDate } from "./ui";
import { useFetch } from "../useFetch";
import { api, ApiError } from "../api";

interface Sinistre {
  id: string;
  numeroSinistre: string;
  typeEvenement: string;
  dateSurvenance: string;
  statut: "declare" | "en_cours" | "traite" | "rejete";
}

interface Reinitialisation {
  motDePasse: string;
  telephone: string;
  lienConnexion: string;
  smsEnvoye: boolean;
}

function statutBadge(s: Sinistre["statut"]) {
  if (s === "declare") return <Badge kind="warning">Déclaré</Badge>;
  if (s === "en_cours") return <Badge kind="info">En cours</Badge>;
  if (s === "traite") return <Badge kind="success">Traité</Badge>;
  return <Badge kind="danger">Rejeté</Badge>;
}

/**
 * Section "Accès client" — pas une modale à part entière : à intégrer dans le
 * corps d'une modale de détail déjà existante (voir ClientsAccident.tsx,
 * ClientsIncendie.tsx, accidents/Clients.tsx). Affiche si l'espace client est
 * activé, permet de réinitialiser le mot de passe — envoyé par SMS ET affiché
 * ici une seule fois, pour que l'admin le communique au client quand le SMS
 * n'arrive pas (2026-11-24) — et liste les sinistres déjà déclarés par ce
 * client (lecture seule, la gestion complète se fait sur la page Sinistres).
 */
export default function AccesClientModal({
  souscriptionId,
  produitType,
  espaceClientActif,
  onNotify,
}: {
  souscriptionId: string;
  produitType: "generique" | "incendie" | "accident";
  espaceClientActif: boolean;
  onNotify: (message: string) => void;
}) {
  const [reinitialisation, setReinitialisation] = useState(false);
  // Gardé en mémoire de l'écran seulement (jamais stocké) : disparaît à la fermeture.
  const [resultat, setResultat] = useState<Reinitialisation | null>(null);
  const { data: sinistres } = useFetch<Sinistre[]>(
    `/assurances-branche/sinistres?souscriptionId=${souscriptionId}&produitType=${produitType}`
  );

  async function reinitialiserMotDePasse() {
    if (
      !confirm(
        "Réinitialiser le mot de passe de ce client ? Le nouveau mot de passe lui sera envoyé par SMS et affiché ici pour que vous puissiez le lui communiquer."
      )
    )
      return;
    setReinitialisation(true);
    try {
      const r = await api.post<Reinitialisation>(
        `/assurances-branche/clients/${produitType}/${souscriptionId}/reinitialiser-mot-de-passe`,
        {}
      );
      setResultat(r);
      onNotify(r.smsEnvoye ? "Nouveau mot de passe envoyé par SMS ✓" : "Mot de passe réinitialisé — le SMS n'est pas parti");
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : "Erreur lors de la réinitialisation");
    } finally {
      setReinitialisation(false);
    }
  }

  async function copier(texte: string, quoi: string) {
    try {
      await navigator.clipboard.writeText(texte);
      onNotify(`${quoi} copié ✓`);
    } catch {
      onNotify("Copie impossible : recopiez le texte affiché.");
    }
  }

  // Message prêt à envoyer au client (WhatsApp, etc.) quand le SMS n'arrive pas.
  function messageClient(r: Reinitialisation) {
    return `SIM Assurances — votre espace client : ${r.lienConnexion}\nTéléphone : ${r.telephone}\nMot de passe : ${r.motDePasse}`;
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #e5e7eb)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Accès à l'espace client</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {espaceClientActif ? <Badge kind="success">Espace activé</Badge> : <Badge kind="neutral">Espace non activé</Badge>}
        {espaceClientActif && (
          <button className="btn btn-ghost" style={{ padding: "7px 12px" }} disabled={reinitialisation} onClick={reinitialiserMotDePasse}>
            <KeyRound size={14} /> {reinitialisation ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
          </button>
        )}
      </div>

      {resultat && (
        <div
          role="status"
          style={{
            background: "var(--bg-2, #f5f8fc)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Nouveau mot de passe du client</div>
            <button
              className="btn btn-ghost"
              style={{ padding: "2px 6px" }}
              onClick={() => setResultat(null)}
              aria-label="Masquer le mot de passe"
              title="Masquer"
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0", flexWrap: "wrap" }}>
            <code
              data-testid="mot-de-passe-client"
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.08em",
                background: "var(--bg, #fff)",
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 8,
                padding: "6px 12px",
                userSelect: "all",
              }}
            >
              {resultat.motDePasse}
            </code>
            <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => copier(resultat.motDePasse, "Mot de passe")}>
              <Copy size={14} /> Copier
            </button>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>Lien de connexion à l'espace client</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 8px", flexWrap: "wrap" }}>
            <a
              data-testid="lien-connexion-client"
              href={resultat.lienConnexion}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, wordBreak: "break-all" }}
            >
              {resultat.lienConnexion}
            </a>
            <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => copier(resultat.lienConnexion, "Lien")}>
              <Copy size={14} /> Copier
            </button>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: "7px 12px", marginBottom: 8 }}
            onClick={() => copier(messageClient(resultat), "Message (lien + mot de passe)")}
          >
            <Copy size={14} /> Copier le message pour le client
          </button>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            {resultat.smsEnvoye ? (
              <span>SMS envoyé au {resultat.telephone}. </span>
            ) : (
              <span style={{ color: "var(--danger, #dc2626)", fontWeight: 600 }}>
                Le SMS n'a pas pu être envoyé au {resultat.telephone} : communiquez ce mot de passe au client.{" "}
              </span>
            )}
            <span className="muted">
              Le client se connecte avec son numéro de téléphone et ce mot de passe. Il ne sera plus affiché après fermeture.
            </span>
          </div>
        </div>
      )}

      {sinistres && sinistres.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Sinistres déclarés</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sinistres.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-2, #f5f8fc)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
                <span>{s.typeEvenement} · {fmtDate(s.dateSurvenance)}</span>
                {statutBadge(s.statut)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
