import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from "react";
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
 * Saisie d'un segment JJ ou MM : un premier chiffre trop grand pour être celui des dizaines est
 * complété par un 0 (« 5 » → « 05 », le champ suivant prend la main), et un second chiffre qui
 * ferait dépasser `max` (jour > 31, mois > 12) ou donnerait « 00 » est ignoré — évite « 53 » quand
 * on tape « 5/3/1990 » et les faux jours/mois qui en découlaient.
 */
function brutSegment(e: ChangeEvent<HTMLInputElement>, longueur: number): string {
  const brut = e.target.value;
  if (onlyDigits(brut, 99).length <= longueur) return brut;
  // Champ déjà plein : la nouvelle frappe REMPLACE le contenu au lieu d'être perdue (ou d'être
  // collée en fin de segment, ce qui donnait « 053 » puis un faux jour).
  const insere = (e.nativeEvent as InputEvent).data;
  return onlyDigits(insere ?? brut.slice(-1), longueur);
}

function saisirSegment(brut: string, max: number): string {
  const v = onlyDigits(brut, 2);
  if (v.length === 1 && Number(v) > Math.floor(max / 10)) return "0" + v;
  if (v.length === 2 && (Number(v) > max || Number(v) === 0)) return v.slice(0, 1);
  return v;
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
  minToday = false,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  /** Texte inséré dans les aria-label/title ("Jour {label}", etc.). */
  label?: string;
  /** Plafonne le calendrier à aujourd'hui (vrai pour une naissance, faux pour une date future comme un départ). */
  maxToday?: boolean;
  /** Plancher à aujourd'hui : interdit une date déjà passée (ex. départ d'un voyage). */
  minToday?: boolean;
}) {
  const [jour, setJour] = useState("");
  const [mois, setMois] = useState("");
  const [annee, setAnnee] = useState("");
  const [erreur, setErreur] = useState<"future" | "passee" | "invalide" | null>(null);
  const jourRef = useRef<HTMLInputElement>(null);
  const moisRef = useRef<HTMLInputElement>(null);
  const anneeRef = useRef<HTMLInputElement>(null);
  // Dernière valeur transmise au parent par la saisie locale ("" tant que la date est incomplète
  // ou refusée). Sert à distinguer l'écho de notre propre saisie (à ignorer) d'un changement venu
  // de l'extérieur (calendrier natif, pré-remplissage, réinitialisation) : une date complète mais
  // refusée (future, 31/02…) ne doit PAS vider les champs sous les doigts de l'utilisateur.
  const emis = useRef("");

  useEffect(() => {
    if (value === emis.current) return;
    emis.current = value;
    setErreur(null);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

  // Toujours propager l'état courant au parent — y compris "incomplet" ou "refusé" (chaîne vide) —
  // pour qu'une édition partielle ne laisse jamais une ancienne date silencieusement active.
  function commit(j: string, m: string, a: string) {
    const emettre = (v: string) => {
      emis.current = v;
      onChange(v);
    };
    if (j.length !== 2 || m.length !== 2 || a.length !== 4) {
      setErreur(null);
      emettre("");
      return;
    }
    const jn = Number(j);
    const mn = Number(m);
    const an = Number(a);
    // Date qui n'existe pas (31/02, 29/02 d'une année non bissextile, année < 1900) : refusée,
    // jamais envoyée au serveur, où elle aurait été « corrigée » en une autre date.
    if (an < 1900 || mn < 1 || mn > 12 || jn < 1 || jn > new Date(an, mn, 0).getDate()) {
      setErreur("invalide");
      emettre("");
      return;
    }
    const iso = `${a}-${m}-${j}`;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    // Saisie manuelle (JJ/MM/AAAA) : le calendrier natif applique déjà `max`/`min`, mais taper
    // directement dans les champs les contourne — `maxToday` pour une naissance, `minToday` pour
    // une date future comme un départ de voyage, qui ne peut pas être déjà passé.
    if (maxToday && iso > aujourdhui) {
      setErreur("future");
      emettre("");
      return;
    }
    if (minToday && iso < aujourdhui) {
      setErreur("passee");
      emettre("");
      return;
    }
    setErreur(null);
    emettre(iso);
  }

  /**
   * Touches communes aux trois segments : « / », « . », « - », espace ou virgule terminent le segment
   * (un jour « 5 » devient « 05 ») et passent au suivant ; Retour arrière sur un segment vide revient
   * au précédent ; les autres caractères non numériques sont bloqués.
   */
  function gererTouche(
    e: KeyboardEvent<HTMLInputElement>,
    valeur: string,
    completer: (v: string) => void,
    suivant: HTMLInputElement | null,
    precedent: HTMLInputElement | null
  ) {
    if (["/", ".", "-", " ", ","].includes(e.key)) {
      e.preventDefault();
      // Contenu entièrement sélectionné (champ pré-rempli, pas encore touché) : le séparateur ne
      // vaut rien, sans quoi il sauterait un segment que l'utilisateur n'a pas encore saisi.
      const intact = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === valeur.length;
      if (intact) return;
      if (valeur.length === 1 && valeur !== "0") completer("0" + valeur);
      if (valeur.length > 0) suivant?.focus();
      return;
    }
    if (e.key === "Backspace" && valeur === "" && precedent) {
      e.preventDefault();
      precedent.focus();
      return;
    }
    blockNonDigitKey(e);
  }

  /** Collage d'une date entière (« 25/03/1990 », « 25031990 », « 1990-03-25 ») dans n'importe quel segment. */
  function collerDate(e: ClipboardEvent<HTMLInputElement>) {
    const texte = e.clipboardData.getData("text").trim();
    const jma = texte.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/) ?? texte.match(/^(\d{2})(\d{2})(\d{4})$/);
    const aaaammjj = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const trio = jma ? [jma[1], jma[2], jma[3]] : aaaammjj ? [aaaammjj[3], aaaammjj[2], aaaammjj[1]] : null;
    if (!trio) return; // collage ordinaire : les chiffres seuls sont retenus par onChange
    e.preventDefault();
    const j = trio[0].padStart(2, "0");
    const m = trio[1].padStart(2, "0");
    setJour(j);
    setMois(m);
    setAnnee(trio[2]);
    commit(j, m, trio[2]);
    anneeRef.current?.focus();
  }

  /**
   * Quitte le jour ou le mois resté à un chiffre : « 5 » → « 05 » (« 0 » seul est vidé) et la date en est
   * de nouveau transmise. La valeur est lue dans le champ lui-même, pas dans l'état : quand la frappe d'un
   * 2e chiffre fait passer le focus au segment suivant, l'événement blur part AVANT que l'état soit à jour
   * et voyait encore « 1 » au lieu de « 15 » — d'où « 15 » devenu « 01 » et un mois effacé.
   */
  function finDeSegment(ref: { current: HTMLInputElement | null }, setValeur: (v: string) => void) {
    const brut = ref.current?.value ?? "";
    if (brut.length !== 1) return;
    const v = brut === "0" ? "" : "0" + brut;
    setValeur(v);
    commit(
      ref === jourRef ? v : jourRef.current?.value ?? "",
      ref === moisRef ? v : moisRef.current?.value ?? "",
      anneeRef.current?.value ?? ""
    );
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
    <div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        ref={jourRef}
        value={jour}
        onChange={(e) => {
          const v = saisirSegment(brutSegment(e, 2), 31);
          setJour(v);
          commit(v, mois, annee);
          if (v.length === 2) moisRef.current?.focus();
        }}
        onKeyDown={(e) => gererTouche(e, jour, (v) => { setJour(v); commit(v, mois, annee); }, moisRef.current, null)}
        onPaste={collerDate}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => e.preventDefault()}
        onBlur={() => finDeSegment(jourRef, setJour)}
        placeholder="JJ"
        inputMode="numeric"
        style={segStyle}
        aria-label={`Jour ${label}`}
      />
      <span style={{ color: "var(--text-3, #8fa2bd)" }}>/</span>
      <input
        ref={moisRef}
        value={mois}
        onChange={(e) => {
          const v = saisirSegment(brutSegment(e, 2), 12);
          setMois(v);
          commit(jour, v, annee);
          if (v.length === 2) anneeRef.current?.focus();
        }}
        onKeyDown={(e) => gererTouche(e, mois, (v) => { setMois(v); commit(jour, v, annee); }, anneeRef.current, jourRef.current)}
        onPaste={collerDate}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => e.preventDefault()}
        onBlur={() => finDeSegment(moisRef, setMois)}
        placeholder="MM"
        inputMode="numeric"
        style={segStyle}
        aria-label={`Mois ${label}`}
      />
      <span style={{ color: "var(--text-3, #8fa2bd)" }}>/</span>
      <input
        ref={anneeRef}
        value={annee}
        onChange={(e) => {
          const v = onlyDigits(brutSegment(e, 4), 4);
          setAnnee(v);
          commit(jour, mois, v);
        }}
        onKeyDown={(e) => gererTouche(e, annee, () => {}, null, moisRef.current)}
        onPaste={collerDate}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => e.preventDefault()}
        placeholder="AAAA"
        inputMode="numeric"
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
          min={minToday ? new Date().toISOString().slice(0, 10) : undefined}
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
    {erreur && (
      <div style={{ color: "var(--danger, #dc2626)", fontSize: 12, marginTop: 4 }}>
        {erreur === "future"
          ? `La date ${label} ne peut pas être dans le futur.`
          : erreur === "passee"
          ? `La date ${label} ne peut pas être déjà passée.`
          : `La date ${label} n'existe pas : vérifiez le jour, le mois et l'année.`}
      </div>
    )}
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

/** Date et heure séparées par "à", pour les libellés du type "Renouvelé le … à …". */
export function fmtDateHeure(d: string) {
  const date = new Date(d);
  const jour = date.toLocaleDateString("fr-FR");
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

/**
 * Date d'échéance avec un marqueur de couleur : vert tant qu'elle n'est pas
 * dépassée, rouge dès qu'elle l'est. `dateFin` étant repoussée dans le futur
 * dès qu'un renouvellement est confirmé (voir services/paiementWave.ts), un
 * contrat renouvelé à temps redevient/reste automatiquement vert — pas de
 * statut séparé à maintenir.
 */
export function EcheanceDate({ date }: { date?: string | null }) {
  if (!date) return <span className="muted">—</span>;
  const enRetard = new Date(date).getTime() < Date.now();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        title={enRetard ? "Échéance dépassée" : "Échéance à venir"}
        style={{
          width: 8,
          height: 8,
          minWidth: 8,
          borderRadius: "50%",
          background: enRetard ? "var(--danger)" : "var(--success)",
        }}
      />
      {fmtDate(date)}
    </span>
  );
}
