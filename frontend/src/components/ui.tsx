import type { ReactNode, CSSProperties } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 10 }}>{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  extra,
  children,
  noBody,
  style,
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  noBody?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {title && (
        <div className="card-head">
          <h3 className="card-title">{title}</h3>
          {extra}
        </div>
      )}
      {noBody ? children : <div className="card-body">{children}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  trendUp,
  color = "var(--sim-primary)",
  bg = "var(--sim-primary-50)",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  bg?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <div className="stat-ico" style={{ background: bg, color }}>
          {icon}
        </div>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div
          className="stat-trend"
          style={{ color: trendUp ? "var(--success)" : "var(--text-2)" }}
        >
          {trend}
        </div>
      )}
    </div>
  );
}

type BadgeKind = "success" | "warning" | "danger" | "info" | "neutral";

export function Badge({
  kind,
  children,
}: {
  kind: BadgeKind;
  children: ReactNode;
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function statutIncendieBadge(s: string) {
  if (s === "complet")
    return <Badge kind="success">Souscription complète</Badge>;
  if (s === "en_cours")
    return <Badge kind="warning">En cours de souscription</Badge>;
  return <Badge kind="neutral">Expiré</Badge>;
}

export function waveBadge(s: string) {
  if (s === "confirme") return <Badge kind="success">Confirmé</Badge>;
  if (s === "en_attente") return <Badge kind="warning">En attente</Badge>;
  return <Badge kind="danger">Échoué</Badge>;
}

export function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

export function Loader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="empty" style={{ padding: 48 }}>
      <div className="spinner" />
      <div style={{ marginTop: 12 }}>{label}</div>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 20,
        color: "var(--danger)",
        background: "var(--danger-50)",
        borderColor: "transparent",
      }}
    >
      {message}
    </div>
  );
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
