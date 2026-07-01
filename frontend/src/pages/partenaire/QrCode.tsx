import { Download, Flame, ShieldCheck } from "lucide-react";
import { PageHeader, Card, Loader } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";

interface Qr {
  produit: string;
  token: string;
  dataUrl: string;
}

function QrCard({
  produit,
  icon,
  color,
  bg,
  label,
  sublabel,
}: {
  produit: "incendie1000" | "incendie2000" | "accident";
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  sublabel: string;
}) {
  const { data, loading, error } = useFetch<Qr>(`/me/qr/${produit}`);
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div className="stat-ico" style={{ background: bg, color }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700 }}>{label}</div>
          <div className="muted" style={{ fontSize: 13 }}>{sublabel}</div>
        </div>
      </div>
      {loading && <Loader label="Génération du QR…" />}
      {error && <div className="empty">QR non disponible.</div>}
      {data && (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src={data.dataUrl}
              alt={label}
              style={{ width: 220, height: 220, border: "1px solid var(--border)", borderRadius: 12, padding: 8, background: "#fff" }}
            />
          </div>
          <a className="btn btn-primary btn-block" style={{ marginTop: 18 }} href={data.dataUrl} download={`qr-${produit}.png`}>
            <Download size={17} /> Télécharger (PNG)
          </a>
        </>
      )}
    </Card>
  );
}

export default function PartenaireQr() {
  const { user } = useAuth();
  const produit = user?.produit ?? "accident";

  return (
    <>
      <PageHeader
        title="Mes QR codes"
        subtitle={
          produit === "incendie"
            ? "Deux QR codes selon le montant des achats du client."
            : "Présentez ce QR code à vos clients pour la souscription."
        }
      />
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24, maxWidth: 440 }}>
        {produit === "incendie" ? (
          <>
            <QrCard
              produit="incendie1000"
              icon={<Flame size={20} />}
              color="#b45309"
              bg="#fdf3e3"
              label="QR Incendie — Achats jusqu'à 250 000 FCFA"
              sublabel="Capital garanti 250 000 FCFA"
            />
            <QrCard
              produit="incendie2000"
              icon={<Flame size={20} />}
              color="#dc2626"
              bg="#fef2f2"
              label="QR Incendie — Achats au-dessus de 250 000 FCFA"
              sublabel="Capital garanti 500 000 FCFA"
            />
          </>
        ) : (
          <QrCard
            produit="accident"
            icon={<ShieldCheck size={20} />}
            color="#15803d"
            bg="#e8f6ec"
            label="QR Accident"
            sublabel="Souscription + paiement Wave"
          />
        )}
      </div>
    </>
  );
}
