import { useEffect, useMemo, useState } from "react";

interface Prestataire {
  zone: string;
  reseau: string;
  categorie: string;
  commune: string;
  nom: string;
  telephone: string;
  specialites: string;
  situation: string;
}

/** "CENTRES D'OPTIQUE" → "Centres d'optique" (le document source est tout en majuscules). */
function joli(s: string) {
  const bas = s.toLocaleLowerCase("fr");
  return bas.charAt(0).toLocaleUpperCase("fr") + bas.slice(1);
}

/** Numéro utilisable dans un lien tel: (les numéros du document sont espacés). */
function lienTel(t: string) {
  const chiffres = t.replace(/[^\d+]/g, "");
  return chiffres.length >= 8 ? chiffres : null;
}

const PAR_PAGE = 40;

/**
 * Réseau de soins global (Novelia Assurances) — annuaire des prestataires
 * conventionnés, consultable depuis l'espace client. Les données viennent du
 * document fourni par l'assureur, converti en `public/reseau-soins.json` :
 * elles sont chargées à la demande (≈360 Ko) et non incluses dans le bundle,
 * et affichées par tranches pour rester fluide sur mobile.
 */
export default function ReseauSoins() {
  const [tout, setTout] = useState<Prestataire[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("");
  const [commune, setCommune] = useState("");
  const [limite, setLimite] = useState(PAR_PAGE);

  useEffect(() => {
    fetch("/reseau-soins.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Réseau de soins indisponible"))))
      .then(setTout)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur de chargement"));
  }, []);

  const categories = useMemo(
    () => [...new Set((tout ?? []).map((p) => p.categorie))].sort(),
    [tout]
  );
  const communes = useMemo(() => {
    const pertinents = categorie ? (tout ?? []).filter((p) => p.categorie === categorie) : tout ?? [];
    return [...new Set(pertinents.map((p) => p.commune).filter(Boolean))].sort();
  }, [tout, categorie]);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase("fr");
    return (tout ?? []).filter((p) => {
      if (categorie && p.categorie !== categorie) return false;
      if (commune && p.commune !== commune) return false;
      if (!q) return true;
      return [p.nom, p.commune, p.situation, p.specialites, p.telephone]
        .some((v) => v && v.toLocaleLowerCase("fr").includes(q));
    });
  }, [tout, recherche, categorie, commune]);

  // Revient au début de liste dès qu'un critère change.
  useEffect(() => setLimite(PAR_PAGE), [recherche, categorie, commune]);

  const champ: React.CSSProperties = {
    width: "100%", height: 42, borderRadius: 10, border: "1.5px solid #dde3ec",
    padding: "0 12px", fontSize: 14, fontFamily: "inherit", background: "#fff",
  };

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 1px 3px rgba(15,27,45,.08)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Réseau de soins</div>
        <div style={{ color: "#5b6b80", fontSize: 12.5, marginBottom: 12 }}>
          Établissements et pharmacies conventionnés. Présentez votre carte de prise en charge sur place.
        </div>

        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un établissement, une commune…"
          style={{ ...champ, marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <select value={categorie} onChange={(e) => { setCategorie(e.target.value); setCommune(""); }} style={champ}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{joli(c)}</option>)}
          </select>
          <select value={commune} onChange={(e) => setCommune(e.target.value)} style={champ}>
            <option value="">Toutes communes</option>
            {communes.map((c) => <option key={c} value={c}>{joli(c)}</option>)}
          </select>
        </div>
      </div>

      {erreur && <div style={{ color: "#dc2626", textAlign: "center", padding: 20 }}>{erreur}</div>}
      {!tout && !erreur && <div style={{ textAlign: "center", padding: 30, color: "#5b6b80" }}>Chargement du réseau…</div>}

      {tout && (
        <>
          <div style={{ color: "#5b6b80", fontSize: 12.5, margin: "0 4px 10px" }}>
            {resultats.length} établissement{resultats.length > 1 ? "s" : ""}
            {resultats.length > limite ? ` — ${limite} affichés` : ""}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resultats.slice(0, limite).map((p, i) => {
              const tel = lienTel(p.telephone);
              return (
                <div key={`${p.nom}-${p.commune}-${i}`} style={{ background: "#fff", borderRadius: 12, padding: "13px 15px", boxShadow: "0 1px 3px rgba(15,27,45,.08)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{p.nom}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#004b9c", background: "#eaf1fb", padding: "2px 8px", borderRadius: 20 }}>
                      {joli(p.categorie)}
                    </span>
                    {p.commune && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#5b6b80", background: "#f1f4f9", padding: "2px 8px", borderRadius: 20 }}>
                        {joli(p.commune)}
                      </span>
                    )}
                  </div>
                  {p.specialites && <div style={{ fontSize: 12.5, color: "#3d4b5e", marginBottom: 3 }}>{p.specialites}</div>}
                  {p.situation && <div style={{ fontSize: 12.5, color: "#5b6b80", marginBottom: 6 }}>📍 {p.situation}</div>}
                  {p.telephone && (
                    tel ? (
                      <a href={`tel:${tel}`} style={{ fontSize: 13, fontWeight: 700, color: "#004b9c", textDecoration: "none" }}>
                        📞 {p.telephone}
                      </a>
                    ) : (
                      <span style={{ fontSize: 13, color: "#5b6b80" }}>📞 {p.telephone}</span>
                    )
                  )}
                </div>
              );
            })}
          </div>

          {resultats.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#5b6b80", fontSize: 13 }}>
              Aucun établissement ne correspond à cette recherche.
            </div>
          )}

          {resultats.length > limite && (
            <button
              onClick={() => setLimite((l) => l + PAR_PAGE)}
              style={{ marginTop: 12, width: "100%", padding: "12px 0", background: "#fff", color: "#004b9c", border: "1.5px solid #004b9c", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Afficher plus
            </button>
          )}
        </>
      )}
    </div>
  );
}
