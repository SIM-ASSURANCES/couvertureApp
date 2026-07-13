import { Landmark } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";

interface Moi {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  roleImf: "AGENT" | "RESPONSABLE_ZONE";
  statut: "actif" | "inactif";
  agenceNom: string | null;
  zoneNom: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch<Moi>("/agent-imf/moi");

  return (
    <>
      <PageHeader
        title={`Bienvenue, ${user?.nom ?? ""}`}
        subtitle="Espace Agent IMF — SIM Assurances."
      />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {data && (
        <div style={{ marginTop: 24, maxWidth: 520 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: "var(--primary-50, #eef2ff)",
                display: "grid", placeItems: "center", flex: "none",
              }}>
                <Landmark size={22} color="var(--primary, #004b9c)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{data.prenom} {data.nom}</div>
                <Badge kind={data.roleImf === "AGENT" ? "neutral" : "info"}>
                  {data.roleImf === "AGENT" ? "Agent" : "Responsable de zone"}
                </Badge>
              </div>
            </div>
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                <tr><td className="muted" style={{ width: "40%" }}>Email</td><td>{data.email}</td></tr>
                <tr><td className="muted">Téléphone</td><td>{data.telephone}</td></tr>
                {data.agenceNom && <tr><td className="muted">Agence</td><td>{data.agenceNom}</td></tr>}
                <tr><td className="muted">Zone</td><td>{data.zoneNom ?? "—"}</td></tr>
              </tbody>
            </table>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              Votre espace de souscription (SECURPRO, SECURSTOCK, SECURECOLTE, COUPS DURS)
              sera activé dans une prochaine mise à jour.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
