import { useState } from "react";
import { Download, FileText, Flame, ShieldCheck, Eye, X, FileSpreadsheet } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  Badge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { exportExcel } from "../../xlsx";
import { genererContratIncendie, genererContratAccident } from "../../contract";

interface Contrat {
  id: string;
  type: "incendie" | "accident";
  numeroPolice: string;
  nom: string;
  prenom: string;
  telephone: string;
  montant: number;
  capitalGaranti: number;
  partenaire: string;
  partenaireResponsable?: string | null;
  partenaireLocalisation?: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  date: string;
  refFacture?: string | null;
  commune?: string | null;
  quartier?: string | null;
  numeroMaison?: string | null;
  primeHT?: number | null;
  primeTTC?: number | null;
  taxes?: number | null;
  fg?: number | null;
  dateNaissance?: string | null;
}

function genererContrat(c: Contrat) {
  const debut = c.dateDebut ?? c.date;
  const fin =
    c.dateFin ??
    new Date(
      new Date(c.date).setMonth(
        new Date(c.date).getMonth() + (c.type === "accident" ? 3 : 12)
      )
    ).toISOString();
  if (c.type === "accident") {
    genererContratAccident({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
    });
  } else {
    genererContratIncendie({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      refFacture: c.refFacture ?? null,
      commune: c.commune ?? null,
      quartier: c.quartier ?? null,
      numeroMaison: c.numeroMaison ?? null,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
    });
  }
}

export default function Contrats() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Contrat | null>(null);
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);

  const { data, loading, error } = useFetch<Contrat[]>(
    `/souscriptions/contrats?${params.toString()}`
  );

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Produit": c.type === "accident" ? "Accident" : "Incendie",
        "N° police": c.numeroPolice,
        "Prénom": c.prenom,
        "Nom": c.nom,
        "Téléphone": c.telephone,
        "Partenaire": c.partenaire,
        "Prime HT": c.primeHT ?? "",
        "Prime TTC": c.primeTTC ?? c.montant,
        "Taxes": c.taxes ?? "",
        "FG": c.fg ?? "",
        "Capital garanti": c.capitalGaranti,
        "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
        "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
      })),
      "contrats.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Polices émises : assurances incendie complètes et accident confirmées."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <Card
        title={data ? `${data.length} contrats` : "Contrats"}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="select"
              style={{ width: 220, height: 40 }}
              placeholder="Rechercher (nom, police, tél.)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 160, height: 40 }}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Tous produits</option>
              <option value="incendie">Incendie</option>
              <option value="accident">Accident</option>
            </select>
          </div>
        }
        noBody
      >
        {loading && <Loader />}
        {error && (
          <div style={{ padding: 20 }}>
            <ErrorBox message={error} />
          </div>
        )}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>N° police</th>
                  <th>Assuré</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Échéance</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={`${c.type}-${c.id}`}>
                    <td>
                      {c.type === "accident" ? (
                        <Badge kind="info">
                          <ShieldCheck size={13} /> Accident
                        </Badge>
                      ) : (
                        <Badge kind="warning">
                          <Flame size={13} /> Incendie
                        </Badge>
                      )}
                    </td>
                    <td>
                      <strong>{c.numeroPolice}</strong>
                    </td>
                    <td>
                      {c.prenom} {c.nom}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.telephone}
                      </div>
                    </td>
                    <td>
                      <strong>{c.partenaire}</strong>
                      {c.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireResponsable}</div>
                      )}
                      {c.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireLocalisation}</div>
                      )}
                    </td>
                    <td>
                      <strong>{fcfa(c.montant)}</strong>
                    </td>
                    <td className="muted">{fcfa(c.capitalGaranti)}</td>
                    <td className="muted">
                      {c.dateFin ? fmtDate(c.dateFin) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetail(c)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Télécharger le contrat"
                          onClick={() => genererContrat(c)}
                        >
                          <Download size={15} /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        <FileText size={28} />
                        <div>Aucun contrat émis pour le moment.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card, #fff)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {detail.type === "accident" ? (
                  <Badge kind="info">
                    <ShieldCheck size={13} /> Accident
                  </Badge>
                ) : (
                  <Badge kind="warning">
                    <Flame size={13} /> Incendie
                  </Badge>
                )}
                <strong style={{ fontSize: 16 }}>{detail.numeroPolice}</strong>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 8px" }}
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
                Détails de la prime
              </div>
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Prime HT</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.primeHT != null ? fcfa(detail.primeHT) : "—"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Prime TTC</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{fcfa(detail.primeTTC ?? detail.montant)}</div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Taxes</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.taxes != null ? fcfa(detail.taxes) : "—"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>FG</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.fg != null ? fcfa(detail.fg) : "—"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 18,
                }}
              >
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
                  Capital garanti
                </div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {fcfa(detail.capitalGaranti)}
                </div>
              </div>

              <table className="tbl" style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td className="muted" style={{ width: "42%" }}>Assuré(e)</td>
                    <td><strong>{detail.prenom} {detail.nom}</strong></td>
                  </tr>
                  <tr>
                    <td className="muted">Téléphone</td>
                    <td>{detail.telephone}</td>
                  </tr>
                  <tr>
                    <td className="muted">Partenaire</td>
                    <td>
                      {detail.partenaire}
                      {detail.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{detail.partenaireResponsable}</div>
                      )}
                      {detail.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{detail.partenaireLocalisation}</div>
                      )}
                    </td>
                  </tr>
                  {detail.refFacture && (
                    <tr>
                      <td className="muted">Réf. facture</td>
                      <td>{detail.refFacture}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="muted">Date d'effet</td>
                    <td>{detail.dateDebut ? fmtDate(detail.dateDebut) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Date d'échéance</td>
                    <td>{detail.dateFin ? fmtDate(detail.dateFin) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Souscrit le</td>
                    <td>{fmtDate(detail.date)}</td>
                  </tr>
                </tbody>
              </table>

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                onClick={() => genererContrat(detail)}
              >
                <Download size={16} /> Télécharger le contrat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
