import { useState } from "react";
import { Download, MessageCircle, Trash2, FileText, X, Eye, FileSpreadsheet, Flame, ShieldCheck, Bell, Send } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  statutIncendieBadge,
  waveBadge,
  Badge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api, downloadCsv } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel } from "../../xlsx";
import type { ClientIncendie, Partenaire, SouscriptionBranche } from "../../types";

function statutRenouvellement(c: { renouvellementEnCoursDepuis?: string | null; renouveleAt?: string | null }) {
  if (c.renouvellementEnCoursDepuis) return <Badge kind="warning">Renouvellement en attente</Badge>;
  if (c.renouveleAt) return <Badge kind="success">Renouvelé le {fmtDate(c.renouveleAt)}</Badge>;
  return <span className="muted">—</span>;
}

export default function ClientsIncendie() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const [statut, setStatut] = useState("");
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  if (statut) params.set("statut", statut);
  if (part) params.set("partenaireId", part);

  const { data, loading, error, reload } = useFetch<ClientIncendie[]>(
    `/souscriptions/incendie?${params.toString()}`
  );
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  // Complète la liste avec les produits Dommages du modèle générique
  // (SecurHome+, SecurPro) — cette page reçoit désormais toutes les
  // souscriptions Dommages, pas seulement Incendie. Le filtre "Réf. facture"
  // et le workflow de complétion restent spécifiques à Incendie.
  const dommagesParams = new URLSearchParams();
  dommagesParams.set("sousBranche", "ASSURANCES_DOMMAGES");
  if (part) dommagesParams.set("partenaireId", part);
  const { data: dommagesGenerique, reload: reloadGenerique } = useFetch<SouscriptionBranche[]>(
    `/assurances-branche/souscriptions?${dommagesParams.toString()}`
  );
  const generiqueSeul = (dommagesGenerique ?? []).filter((r) => r.produit !== "incendie_historique");

  // Alerte renouvellement (échéance ≤ 2 semaines) — Incendie historique +
  // SecurHome+/SecurPro (modèle générique), toutes deux à formule unique de 3
  // mois, combinées dans une même section.
  const { data: incendieProches, reload: reloadIncendieProches } = useFetch<ClientIncendie[]>(
    "/souscriptions/incendie?renouvellementProche=1"
  );
  const { data: genProches, reload: reloadGenProches } = useFetch<SouscriptionBranche[]>(
    "/assurances-branche/souscriptions?sousBranche=ASSURANCES_DOMMAGES&renouvellementProche=1"
  );
  const renouvellementsProches = [
    ...(incendieProches ?? []).map((c) => ({
      id: c.id,
      genre: "incendie" as const,
      nom: [c.prenom, c.nom].filter(Boolean).join(" ") || "Non renseigné",
      telephone: c.telephone,
      produitLibelle: "Incendie Habitation en Inclusion",
      partenaireNom: c.partenaireNom,
      dateFin: c.dateFin,
      renouvellementEnCoursDepuis: c.renouvellementEnCoursDepuis,
      renouveleAt: c.renouveleAt,
    })),
    ...(genProches ?? [])
      .filter((r) => r.produit !== "incendie_historique")
      .map((r) => ({
      id: r.id,
      genre: "generique" as const,
      nom: [r.prenom, r.nom].filter(Boolean).join(" ") || "Non renseigné",
      telephone: r.telephone,
      produitLibelle: r.produitLibelle,
      partenaireNom: r.partenaireNom,
      dateFin: r.dateFin,
      renouvellementEnCoursDepuis: r.renouvellementEnCoursDepuis,
      renouveleAt: r.renouveleAt,
    })),
  ].sort((a, b) => new Date(a.dateFin ?? 0).getTime() - new Date(b.dateFin ?? 0).getTime());

  const [detailFor, setDetailFor] = useState<ClientIncendie | null>(null);
  const [detailGenerique, setDetailGenerique] = useState<SouscriptionBranche | null>(null);
  const [factureFor, setFactureFor] = useState<ClientIncendie | null>(null);
  const [factureVal, setFactureVal] = useState("");
  const [communeVal, setCommuneVal] = useState("");
  const [quartierVal, setQuartierVal] = useState("");
  const [numeroMaisonVal, setNumeroMaisonVal] = useState("");
  const [savingFacture, setSavingFacture] = useState(false);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function saveFacture() {
    if (
      !factureFor ||
      !factureVal.trim() ||
      !communeVal.trim() ||
      !quartierVal.trim()
    )
      return;
    setSavingFacture(true);
    try {
      await api.patch(`/souscriptions/incendie/${factureFor.id}/facture`, {
        refFacture: factureVal.trim(),
        commune: communeVal.trim(),
        quartier: quartierVal.trim(),
        numeroMaison: numeroMaisonVal.trim(),
      });
      notify("Réf.facture enregistrée ✓");
      setFactureFor(null);
      reload();
      reloadIncendieProches();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSavingFacture(false);
    }
  }

  async function relance(id: string) {
    await api.post(`/souscriptions/incendie/${id}/relance`);
    notify("Relance SMS envoyée ✓");
    reload();
  }

  async function relancerRenouvellementIncendie(id: string) {
    try {
      await api.post(`/souscriptions/incendie/${id}/relance-renouvellement`, {});
      notify("SMS de renouvellement envoyé ✓");
      reloadIncendieProches();
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function relancerRenouvellementGenerique(id: string) {
    try {
      await api.post(`/assurances-branche/souscriptions/${id}/relance-renouvellement`, {});
      notify("SMS de renouvellement envoyé ✓");
      reloadGenProches();
      reloadGenerique();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer définitivement ce client ?")) return;
    try {
      await api.del(`/souscriptions/incendie/${id}`);
      notify("Client supprimé ✓");
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function supprimerGenerique(id: string) {
    if (!confirm("Supprimer définitivement ce client ?")) return;
    try {
      await api.del(`/assurances-branche/souscriptions/${id}`);
      notify("Client supprimé ✓");
      setDetailGenerique(null);
      reloadGenerique();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      [
        ...(data ?? []).map((c) => ({
          "Produit": "Incendie Habitation en Inclusion",
          "Téléphone": c.telephone,
          "Prénom": c.prenom ?? "",
          "Nom": c.nom ?? "",
          "Partenaire": c.partenaireNom,
          "Prime": c.montantPrime,
          "Capital garanti": c.capitalGaranti,
          "Réf. facture": c.refFacture ?? "",
          "Commune": c.commune ?? "",
          "Quartier": c.quartier ?? "",
          "N° de maison": c.numeroMaison ?? "",
          "Statut": c.statut,
          "Relances SMS": c.relanceCount ?? 0,
          "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
          "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
        })),
        ...generiqueSeul.map((r) => ({
          "Produit": r.produitLibelle,
          "Téléphone": r.telephone,
          "Prénom": r.prenom ?? "",
          "Nom": r.nom ?? "",
          "Partenaire": r.partenaireNom,
          "Prime": r.montantPrime,
          "Capital garanti": "",
          "Réf. facture": "",
          "Commune": "",
          "Quartier": "",
          "N° de maison": "",
          "Statut": r.statut,
          "Relances SMS": "",
          "Date d'échéance": r.dateFin ? fmtDate(r.dateFin) : "",
          "Date d'effet": r.dateDebut ? fmtDate(r.dateDebut) : "",
        })),
      ],
      "clients_dommages.xlsx"
    );
  }

  const total = (data?.length ?? 0) + generiqueSeul.length;

  return (
    <>
      <PageHeader
        title="Clients — Assurances Dommages"
        subtitle="Toutes les souscriptions Dommages : Incendie Habitation en Inclusion, SecurHome+, SecurPro."
        actions={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => downloadCsv("/souscriptions/incendie/export.csv", "clients_incendie.csv")}
            >
              <Download size={16} /> CSV (Incendie)
            </button>
            <button className="btn btn-danger-soft" onClick={exportXlsx}>
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </>
        }
      />

      <Card
        title="Renouvellements à venir (échéance ≤ 2 semaines)"
        extra={<Bell size={18} color="#b45309" />}
        style={{ marginTop: 24 }}
        noBody
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Produit</th>
                <th>Partenaire</th>
                <th>Date d'échéance</th>
                <th>Statut renouvellement</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {renouvellementsProches.map((r) => (
                <tr key={`${r.genre}-${r.id}`}>
                  <td>
                    <strong>{r.nom}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{r.telephone}</div>
                  </td>
                  <td>
                    <Badge kind="warning"><Flame size={12} /> {r.produitLibelle}</Badge>
                  </td>
                  <td>{r.partenaireNom}</td>
                  <td className="muted">{r.dateFin ? fmtDate(r.dateFin) : "—"}</td>
                  <td>{statutRenouvellement(r)}</td>
                  <td>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "7px 12px" }}
                      disabled={!!r.renouvellementEnCoursDepuis}
                      onClick={() =>
                        r.genre === "incendie"
                          ? relancerRenouvellementIncendie(r.id)
                          : relancerRenouvellementGenerique(r.id)
                      }
                      title={
                        r.genre === "incendie"
                          ? "Envoyer un SMS invitant à renouveler avec une nouvelle réf.facture"
                          : "Envoyer un SMS avec lien de paiement pour le renouvellement"
                      }
                    >
                      <Send size={14} /> Relance
                    </button>
                  </td>
                </tr>
              ))}
              {renouvellementsProches.length === 0 && (
                <tr><td colSpan={6}><div className="empty">Aucun renouvellement à venir dans les 2 prochaines semaines.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`${total} souscriptions`}
        style={{ marginTop: 24 }}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <select className="select" style={{ width: 180, height: 40 }} value={part} onChange={(e) => setPart(e.target.value)}>
              <option value="">Tous partenaires</option>
              {partenaires?.map((p) => (
                <option key={p.id} value={p.id}>{p.nomCommerce}</option>
              ))}
            </select>
            <select className="select" style={{ width: 170, height: 40 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous statuts (Incendie)</option>
              <option value="en_cours">En cours</option>
              <option value="complet">Complète</option>
              <option value="expire">Expiré</option>
            </select>
          </div>
        }
        noBody
      >
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Téléphone</th>
                  <th>Nom / Prénom</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Réf. facture</th>
                  <th>Statut</th>
                  <th>Date d'échéance</th>
                  <th>Renouvellement</th>
                  <th>Date d'effet</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={`inc-${c.id}`}>
                    <td><Badge kind="warning"><Flame size={12} /> Incendie</Badge></td>
                    <td><strong>{c.telephone}</strong></td>
                    <td>
                      {c.nom || c.prenom ? (
                        `${c.prenom ?? ""} ${c.nom ?? ""}`.trim()
                      ) : (
                        <span className="muted">Non renseigné</span>
                      )}
                    </td>
                    <td>
                      <strong>{c.partenaireNom}</strong>
                      {c.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireResponsable}</div>
                      )}
                      {c.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireLocalisation}</div>
                      )}
                    </td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td>{c.refFacture ?? <span className="muted">—</span>}</td>
                    <td>{statutIncendieBadge(c.statut)}</td>
                    <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                    <td>{statutRenouvellement(c)}</td>
                    <td className="muted">{c.dateDebut ? fmtDate(c.dateDebut) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetailFor(c)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Saisir / modifier la réf.facture"
                          onClick={() => {
                            setFactureFor(c);
                            setFactureVal(c.refFacture ?? "");
                            setCommuneVal(c.commune ?? "");
                            setQuartierVal(c.quartier ?? "");
                            setNumeroMaisonVal(c.numeroMaison ?? "");
                          }}
                        >
                          <FileText size={15} color="var(--sim-primary)" />
                        </button>
                        {c.statut !== "complet" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px", position: "relative" }}
                            title={
                              c.relanceCount
                                ? `Relancer par SMS (${c.relanceCount} relance${c.relanceCount > 1 ? "s" : ""} déjà envoyée${c.relanceCount > 1 ? "s" : ""})`
                                : "Relancer par SMS"
                            }
                            onClick={() => relance(c.id)}
                          >
                            <MessageCircle size={15} />
                            {!!c.relanceCount && c.relanceCount > 0 && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: -6,
                                  right: -6,
                                  minWidth: 17,
                                  height: 17,
                                  padding: "0 4px",
                                  borderRadius: 9,
                                  background: "var(--danger, #dc2626)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  lineHeight: "17px",
                                  textAlign: "center",
                                  boxShadow: "0 0 0 2px var(--card, #fff)",
                                }}
                              >
                                {c.relanceCount}
                              </span>
                            )}
                          </button>
                        )}
                        {isSuper && c.statut !== "complet" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Supprimer"
                            onClick={() => supprimer(c.id)}
                          >
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {generiqueSeul.map((r) => (
                  <tr key={`gen-${r.id}`}>
                    <td><Badge kind="warning"><Flame size={12} /> {r.produitLibelle}</Badge></td>
                    <td><strong>{r.telephone}</strong></td>
                    <td>
                      {r.nom || r.prenom ? (
                        `${r.prenom ?? ""} ${r.nom ?? ""}`.trim()
                      ) : (
                        <span className="muted">Non renseigné</span>
                      )}
                    </td>
                    <td><strong>{r.partenaireNom}</strong></td>
                    <td><strong>{fcfa(r.montantPrime)}</strong></td>
                    <td><span className="muted">—</span></td>
                    <td>{waveBadge(r.statut)}</td>
                    <td className="muted">{r.dateFin ? fmtDate(r.dateFin) : "—"}</td>
                    <td>{statutRenouvellement(r)}</td>
                    <td className="muted">{r.dateDebut ? fmtDate(r.dateDebut) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetailGenerique(r)}
                        >
                          <Eye size={15} />
                        </button>
                        {isSuper && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Supprimer"
                            onClick={() => supprimerGenerique(r.id)}
                          >
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {total === 0 && (
                  <tr><td colSpan={11}><div className="empty">Aucune souscription.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {detailFor && (
        <div
          onClick={() => setDetailFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 17 }}>Détails du client</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setDetailFor(null)}><X size={18} /></button>
            </div>
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                <tr><td className="muted" style={{ width: "42%" }}>Nom / Prénom</td><td><strong>{[detailFor.prenom, detailFor.nom].filter(Boolean).join(" ") || "—"}</strong></td></tr>
                <tr><td className="muted">Téléphone</td><td>{detailFor.telephone}</td></tr>
                <tr><td className="muted">Email</td><td>{detailFor.email || "—"}</td></tr>
                <tr><td className="muted">Partenaire</td><td>
                  {detailFor.partenaireNom}
                  {detailFor.partenaireResponsable && (
                    <div className="muted" style={{ fontSize: 12 }}>{detailFor.partenaireResponsable}</div>
                  )}
                  {detailFor.partenaireLocalisation && (
                    <div className="muted" style={{ fontSize: 12 }}>{detailFor.partenaireLocalisation}</div>
                  )}
                </td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailFor.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Capital garanti</td><td>{fcfa(detailFor.capitalGaranti)}</td></tr>
                <tr><td className="muted">Réf. facture</td><td>{detailFor.refFacture || "—"}</td></tr>
                <tr><td className="muted">Commune</td><td>{detailFor.commune || "—"}</td></tr>
                <tr><td className="muted">Quartier</td><td>{detailFor.quartier || "—"}</td></tr>
                <tr><td className="muted">N° de maison</td><td>{detailFor.numeroMaison || "—"}</td></tr>
                <tr><td className="muted">Statut</td><td>{statutIncendieBadge(detailFor.statut)}</td></tr>
                <tr><td className="muted">Date d'effet</td><td>{detailFor.dateDebut ? fmtDate(detailFor.dateDebut) : "—"}</td></tr>
                <tr><td className="muted">Date d'échéance</td><td>{detailFor.dateFin ? fmtDate(detailFor.dateFin) : "—"}</td></tr>
                <tr><td className="muted">Renouvellement</td><td>{statutRenouvellement(detailFor)}</td></tr>
                <tr><td className="muted">Relances SMS</td><td>{detailFor.relanceCount ?? 0}</td></tr>
                <tr><td className="muted">Date de souscription</td><td>{fmtDate(detailFor.createdAt)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {detailGenerique && (
        <div
          onClick={() => setDetailGenerique(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} />
                <strong style={{ fontSize: 17 }}>{detailGenerique.produitLibelle}</strong>
              </div>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setDetailGenerique(null)}><X size={18} /></button>
            </div>
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                <tr><td className="muted" style={{ width: "42%" }}>Nom / Prénom</td><td><strong>{[detailGenerique.prenom, detailGenerique.nom].filter(Boolean).join(" ") || "—"}</strong></td></tr>
                <tr><td className="muted">Téléphone</td><td>{detailGenerique.telephone}</td></tr>
                <tr><td className="muted">Partenaire</td><td>{detailGenerique.partenaireNom}</td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailGenerique.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Statut</td><td>{waveBadge(detailGenerique.statut)}</td></tr>
                <tr><td className="muted">Date d'effet</td><td>{detailGenerique.dateDebut ? fmtDate(detailGenerique.dateDebut) : "—"}</td></tr>
                <tr><td className="muted">Date d'échéance</td><td>{detailGenerique.dateFin ? fmtDate(detailGenerique.dateFin) : "—"}</td></tr>
                <tr><td className="muted">Renouvellement</td><td>{statutRenouvellement(detailGenerique)}</td></tr>
                <tr><td className="muted">Date de souscription</td><td>{fmtDate(detailGenerique.createdAt)}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Détail complet (garanties, montants) disponible dans <strong>Contrats</strong>.
            </p>
          </div>
        </div>
      )}
      {factureFor && (
        <div
          onClick={() => setFactureFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: "100%", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 16 }}>Réf. facture</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setFactureFor(null)}><X size={18} /></button>
            </div>
            {factureFor.statut === "complet" && (
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 14, background: "var(--bg-2)", padding: 8, borderRadius: 8 }}>
                Ce contrat est déjà complet — saisir ici une NOUVELLE réf.facture le renouvelle (prolonge l'échéance de 3 mois).
              </p>
            )}
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Souscripteur : <strong>{factureFor.telephone}</strong>
              {factureFor.prenom || factureFor.nom ? ` — ${factureFor.prenom ?? ""} ${factureFor.nom ?? ""}`.trimEnd() : ""}
            </p>
            <div className="field">
              <label className="label">Réf. facture communiquée</label>
              <input
                className="input"
                autoFocus
                value={factureVal}
                placeholder="ex: FAC-2026-00123"
                onChange={(e) => setFactureVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveFacture(); }}
              />
            </div>
            <div className="field">
              <label className="label">Commune</label>
              <input
                className="input"
                value={communeVal}
                placeholder="ex: Cocody"
                onChange={(e) => setCommuneVal(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Quartier</label>
              <input
                className="input"
                value={quartierVal}
                placeholder="ex: Angré"
                onChange={(e) => setQuartierVal(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">N° de maison (optionnel)</label>
              <input
                className="input"
                value={numeroMaisonVal}
                placeholder="ex: Ilot 12, lot 34"
                onChange={(e) => setNumeroMaisonVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveFacture(); }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                La souscription passera au statut « complète ».
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={
                  savingFacture ||
                  !factureVal.trim() ||
                  !communeVal.trim() ||
                  !quartierVal.trim()
                }
                onClick={saveFacture}
              >
                {savingFacture ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="btn btn-ghost" onClick={() => setFactureFor(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
