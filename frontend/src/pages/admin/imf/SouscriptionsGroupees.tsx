import { Download } from "lucide-react";
import { Badge, fcfa, fmtDate } from "../../../components/ui";
import { genererContratImf, contratImfDisponible } from "../../../contract";
import type { SouscriptionImf } from "../../../types";

function statutBadge(s: SouscriptionImf["statut"]) {
  if (s === "active") return <Badge kind="success">Active</Badge>;
  if (s === "annulee") return <Badge kind="neutral">Annulée</Badge>;
  return <Badge kind="warning">En cours</Badge>;
}

interface Groupe {
  zone: string; // libellé de zone, ou intitulé du groupe des souscriptions directes
  directe: boolean;
  agences: { agence: string; rows: SouscriptionImf[] }[];
}

/**
 * Regroupe les souscriptions par zone puis par agence. Les souscriptions
 * directes de l'admin (sans agent/zone/agence) sont rassemblées dans un groupe
 * distinct « Souscriptions directes (Direction) », placé en dernier.
 */
function grouperParZoneAgence(rows: SouscriptionImf[]): Groupe[] {
  const directes = rows.filter((r) => r.directe);
  const reseau = rows.filter((r) => !r.directe);

  const parZone = new Map<string, Map<string, SouscriptionImf[]>>();
  for (const r of reseau) {
    const zone = r.zoneNom ?? "Zone non renseignée";
    const agence = r.agenceNom ?? "Agence non renseignée";
    if (!parZone.has(zone)) parZone.set(zone, new Map());
    const agences = parZone.get(zone)!;
    if (!agences.has(agence)) agences.set(agence, []);
    agences.get(agence)!.push(r);
  }

  const groupes: Groupe[] = [...parZone.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([zone, agences]) => ({
      zone,
      directe: false,
      agences: [...agences.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([agence, r]) => ({ agence, rows: r })),
    }));

  if (directes.length > 0) {
    groupes.push({
      zone: "Souscriptions directes (Direction)",
      directe: true,
      agences: [{ agence: "", rows: directes }],
    });
  }
  return groupes;
}

/** Tableau des souscriptions/contrats IMF, regroupé par zone puis par agence. */
export default function SouscriptionsGroupees({ rows }: { rows: SouscriptionImf[] }) {
  if (rows.length === 0) {
    return <div className="empty" style={{ padding: 20 }}>Aucune souscription.</div>;
  }
  const groupes = grouperParZoneAgence(rows);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: 4 }}>
      {groupes.map((g) => (
        <div key={g.zone}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>{g.directe ? g.zone : `Zone : ${g.zone}`}</h3>
          {g.agences.map((a) => (
            <div key={a.agence || "directes"} style={{ marginBottom: 14 }}>
              {!g.directe && (
                <div className="muted" style={{ fontSize: 13, fontWeight: 600, margin: "6px 0" }}>
                  Agence : {a.agence} · {a.rows.length}
                </div>
              )}
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>N° de police</th>
                      <th>Client</th>
                      <th>Produit</th>
                      <th>{g.directe ? "Souscrit par" : "Agent"}</th>
                      <th>Prime TTC</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rows.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.numeroPolice}</strong></td>
                        <td>
                          {s.prenom} {s.nom}
                          <div className="muted" style={{ fontSize: 12 }}>{s.telephone}</div>
                        </td>
                        <td className="muted">{s.produitCode}</td>
                        <td className="muted">{g.directe ? (s.adminNom ?? "Direction") : s.agentNom}</td>
                        <td><strong>{fcfa(s.primeTTC)}</strong></td>
                        <td>{statutBadge(s.statut)}</td>
                        <td className="muted">{fmtDate(s.createdAt)}</td>
                        <td>
                          {contratImfDisponible(s.produitCode) && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "7px 10px" }}
                              title="Télécharger le contrat"
                              onClick={() => genererContratImf(s)}
                            >
                              <Download size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
