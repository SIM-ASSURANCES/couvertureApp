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
}: {
  produit: "incendie" | "accident";
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
}) {
  const { data, loading, error } = useFetch<Qr>(`/me/qr/${produit}`);
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div className="stat-ico" style={{ background: bg, color }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, textTransform: "capitalize" }}>QR {produit}</div>
          <div className="muted" style={{ fontSize: 13 }}>{label}</div>
        </div>
      </div>
      {loading && <Loader label="Génération du QR…" />}
      {error && <div className="empty">QR non disponible pour ce produit.</div>}
      {data && (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src={data.dataUrl}
              alt={`QR ${produit}`}
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
        title="Mon QR code"
        subtitle="Présentez ce QR code à vos clients pour la souscription."
      />
      <div style={{ marginTop: 24, maxWidth: 400 }}>
        {produit === "incendie" ? (
          <QrCard produit="incendie" icon={<Flame size={20} />} color="#b45309" bg="#fdf3e3" label="Souscription via paiement intégré" />
        ) : (
          <QrCard produit="accident" icon={<ShieldCheck size={20} />} color="#15803d" bg="#e8f6ec" label="Souscription + paiement Wave" />
        )}
      </div>
    </>
  );
}
