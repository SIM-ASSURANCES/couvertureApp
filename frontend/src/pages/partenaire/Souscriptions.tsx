import {
  PageHeader,
  Card,
  Badge,
  Loader,
  ErrorBox,
  waveBadge,
  statutIncendieBadge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";

interface Sous {
  incendie: {
    id: string;
    telephone: string;
    nom?: string;
    prenom?: string;
    numeroFacture?: string;
    statut: string;
    createdAt: string;
  }[];
  accident: {
    id: string;
    prenom: string;
    nom: string;
    telephone: string;
    montantPrime: number;
    waveStatut: string;
    statutDossier: string;
    createdAt: string;
  }[];
}

export default function PartenaireSouscriptions() {
  const { user } = useAuth();
  const produit = user?.produit ?? "accident";
  const { data, loading, error } = useFetch<Sous>("/me/souscriptions");

  return (
    <>
      <PageHeader
        title="Mes souscriptions"
        subtitle="Toutes les souscriptions générées via votre QR code."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        produit === "incendie" ? (
          <Card noBody>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Téléphone</th><th>Nom</th><th>N° facture</th><th>Statut</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {data.incendie.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.telephone}</strong></td>
                      <td>{c.prenom || c.nom ? `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() : <span className="muted">Non renseigné</span>}</td>
                      <td>{c.numeroFacture ?? <span className="muted">—</span>}</td>
                      <td>{statutIncendieBadge(c.statut)}</td>
                      <td className="muted">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                  {data.incendie.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucune souscription Incendie.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card noBody>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Client</th><th>Prime</th><th>Paiement</th><th>Dossier</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {data.accident.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.prenom} {c.nom}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                      </td>
                      <td>{fcfa(c.montantPrime)}</td>
                      <td>{waveBadge(c.waveStatut)}</td>
                      <td>{c.statutDossier === "complet" ? <Badge kind="success">Complet</Badge> : <Badge kind="warning">En attente</Badge>}</td>
                      <td className="muted">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                  {data.accident.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucune souscription Accident.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
    </>
  );
}
