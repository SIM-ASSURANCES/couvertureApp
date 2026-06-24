import { Construction } from "lucide-react";
import { PageHeader, Card } from "../components/ui";

export default function Placeholder({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div style={{ marginTop: 24 }}>
        <Card>
          <div className="empty">
            <Construction
              size={36}
              style={{ color: "var(--text-3)", marginBottom: 12 }}
            />
            <div style={{ fontWeight: 600, color: "var(--text)" }}>
              Module en cours de développement
            </div>
            <p style={{ marginTop: 6 }}>
              Cet écran sera disponible dans une prochaine phase.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
