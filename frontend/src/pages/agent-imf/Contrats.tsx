import { Download } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";
import { genererContratImf, contratImfDisponible } from "../../contract";
import type { SouscriptionImf } from "../../types";

export default function Contrats() {
  const { user } = useAuth();
  const estResponsable = user?.roleImf && user.roleImf !== "AGENT";
  const { data, loading, error } = useFetch<SouscriptionImf[]>("/agent-imf/contrats");

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle={estResponsable ? "Contrats actifs de votre réseau." : "Vos contrats actifs."}
      />

      <Card title={data ? `${data.length} contrats` : "Contrats"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N° de police</th>
                  <th>Client</th>
                  <th>Produit</th>
                  {estResponsable && <th>Agent</th>}
                  <th>Prime TTC</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.numeroPolice}</strong></td>
                    <td>
                      {s.prenom} {s.nom}
                      <div className="muted" style={{ fontSize: 12 }}>{s.telephone}</div>
                    </td>
                    <td className="muted">{s.produitCode}</td>
                    {estResponsable && <td className="muted">{s.agentNom}</td>}
                    <td><strong>{fcfa(s.primeTTC)}</strong></td>
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
                {data.length === 0 && (
                  <tr><td colSpan={estResponsable ? 7 : 6}><div className="empty">Aucun contrat pour l'instant.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
