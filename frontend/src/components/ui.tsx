import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type KeyboardEvent } from "react";
import { Calendar } from "lucide-react";

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

/** Formate un nombre (compteur, quantité...) avec séparateur de milliers, sans unité. */
export function nb(n: number) {
  return n.toLocaleString("fr-FR");
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

/** Ne garde que les chiffres, tronqué à `max` (10 par défaut — numéro ivoirien sans indicatif). */
export function onlyDigits(v: string, max = 10): string {
  return v.replace(/\D/g, "").slice(0, max);
}

export function isValidPhone10(v: string): boolean {
  return /^\d{10}$/.test(v);
}

function blockNonDigitKey(e: KeyboardEvent<HTMLInputElement>) {
  // Laisse passer les touches de contrôle/navigation (Backspace, Tab, flèches,
  // Ctrl/Cmd+V etc.) — ne bloque que les caractères imprimables non numériques.
  if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
  }
}

/**
 * Champ numéro de téléphone : chiffres uniquement (les lettres/symboles sont
 * bloqués à la frappe et retirés au collage), exactement 10 chiffres — ni
 * plus (tronqué), ni moins (bloque la soumission du formulaire englobant via
 * `pattern`, tant que l'utilisateur n'a pas complété les 10 chiffres).
 */
export function PhoneInput({
  value,
  onChange,
  required,
  placeholder = "07 00 00 00 00",
  className = "input",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <input
      className={className}
      style={style}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      required={required}
      value={value}
      onChange={(e) => onChange(onlyDigits(e.target.value))}
      onKeyDown={blockNonDigitKey}
      maxLength={10}
      pattern="\d{10}"
      title="Le numéro doit contenir exactement 10 chiffres."
      placeholder={placeholder}
    />
  );
}

/**
 * Champ date (naissance, départ, etc.) : trois champs JJ / MM / AAAA
 * saisissables au clavier (en plus du calendrier natif) — utile sur mobile
 * où le calendrier seul est lent pour une date ancienne (naviguer des
 * dizaines d'années en arrière) ou peu pratique pour une date précise.
 * `value`/`onChange` utilisent le format ISO `AAAA-MM-JJ` (comme
 * `<input type="date">`), pour rester compatible avec l'existant.
 */
export function DateNaissanceInput({
  value,
  onChange,
  required,
  label = "de naissance",
  maxToday = true,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  /** Texte inséré dans les aria-label/title ("Jour {label}", etc.). */
  label?: string;
  /** Plafonne le calendrier à aujourd'hui (vrai pour une naissance, faux pour une date future comme un départ). */
  maxToday?: boolean;
}) {
  const [jour, setJour] = useState("");
  const [mois, setMois] = useState("");
  const [annee, setAnnee] = useState("");
  const moisRef = useRef<HTMLInputElement>(null);
  const anneeRef = useRef<HTMLInputElement>(null);

  // Resynchronise depuis l'extérieur (calendrier natif, réinitialisation du
  // formulaire, pré-remplissage) — sans écraser une saisie manuelle en cours.
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [a, m, j] = value.split("-");
      setAnnee(a);
      setMois(m);
      setJour(j);
    } else if (!value) {
      setJour("");
      setMois("");
      setAnnee("");
    }
  }, [value]);

  function commit(j: string, m: string, a: string) {
    if (j.length === 2 && m.length === 2 && a.length === 4) {
      onChange(`${a}-${m}-${j}`);
    } else if (!j && !m && !a) {
      onChange("");
    }
  }

  const segStyle: CSSProperties = {
    width: 52,
    height: 42,
    textAlign: "center",
    border: "1px solid var(--border-strong, #dde3ec)",
    borderRadius: 10,
    fontFamily: "inherit",
    fontSize: 13.5,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        value={jour}
        onChange={(e) => {
          const v = onlyDigits(e.target.value, 2);
          setJour(v);
          commit(v, mois, annee);
          if (v.length === 2) moisRef.current?.focus();
        }}
        onKeyDown={blockNonDigitKey}
        onBlur={() => jour && setJour(String(Math.min(31, Math.max(1, Number(jour)))).padStart(2, "0"))}
        placeholder="JJ"
        inputMode="numeric"
        maxLength={2}
        style={segStyle}
        aria-label={`Jour ${label}`}
      />
      <span style={{ color: "var(--text-3, #8fa2bd)" }}>/</span>
      <input
        ref={moisRef}
        value={mois}
        onChange={(e) => {
          const v = onlyDigits(e.target.value, 2);
          setMois(v);
          commit(jour, v, annee);
          if (v.length === 2) anneeRef.current?.focus();
        }}
        onKeyDown={blockNonDigitKey}
        onBlur={() => mois && setMois(String(Math.min(12, Math.max(1, Number(mois)))).padStart(2, "0"))}
        placeholder="MM"
        inputMode="numeric"
        maxLength={2}
        style={segStyle}
        aria-label={`Mois ${label}`}
      />
      <span style={{ color: "var(--text-3, #8fa2bd)" }}>/</span>
      <input
        ref={anneeRef}
        value={annee}
        onChange={(e) => {
          const v = onlyDigits(e.target.value, 4);
          setAnnee(v);
          commit(jour, mois, v);
        }}
        onKeyDown={blockNonDigitKey}
        placeholder="AAAA"
        inputMode="numeric"
        maxLength={4}
        style={{ ...segStyle, width: 68 }}
        aria-label={`Année ${label}`}
      />
      <div style={{ position: "relative", width: 42, height: 42, flex: "none" }}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required && !value}
          max={maxToday ? new Date().toISOString().slice(0, 10) : undefined}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            padding: 0,
            border: "1px solid var(--border-strong, #dde3ec)",
            borderRadius: 10,
            color: "transparent",
            background: "var(--card, #fff)",
            cursor: "pointer",
            // Le texte de la valeur reste transparent (JJ/MM/AAAA l'affichent
            // déjà à côté) mais l'icône calendrier native est peu fiable/
            // invisible selon les navigateurs — remplacée par l'icône visible
            // ci-dessous, superposée mais neutre aux clics (pointerEvents none).
          }}
          aria-label={`Choisir la date ${label} dans le calendrier`}
          title="Choisir dans le calendrier"
        />
        <Calendar
          size={18}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "var(--sim-primary, #004b9c)",
            pointerEvents: "none",
          }}
        />
      </div>
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
