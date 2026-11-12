# API partenaire SIM Assurances — guide d'intégration

Accès **serveur-à-serveur** au catalogue produits et à la souscription.
Base : `https://<domaine-sim>/api/partner/v1`

- Spécification OpenAPI : `GET /api/partner/v1/openapi.json`
- Documentation navigable (Redoc) : `GET /api/partner/v1/docs`

---

## 1. Authentification

Chaque requête porte l'en-tête :

```
Authorization: Bearer LA_CLE_FOURNIE_PAR_SIM
```

- La clé est générée par un administrateur SIM et **affichée une seule fois**.
- Une seule clé active par partenaire : en générer une nouvelle **révoque immédiatement** l'ancienne.
- Préfixe `sk_live_` (production) ou `sk_test_` (bac à sable — à venir).
- Une clé peut être restreinte à une liste d'adresses IP.

### Portées

| Portée | Donne accès à |
|---|---|
| `catalogue:read` | `/catalogue`, `/produits/{code}`, `/devis` |
| `souscriptions:write` | `POST /souscriptions`, `/souscriptions/{id}/confirmer-paiement` |
| `souscriptions:read` | `GET /souscriptions`, `/souscriptions/{id}`, `/souscriptions/{id}/evenements` |
| `documents:read` | `/souscriptions/{id}/carte.png`, `/souscriptions/{id}/contrat.pdf` |

`GET /ping` ne demande aucune portée (auth seule).

---

## 2. Format des réponses

Succès — toujours enveloppé :

```json
{ "data": { ... }, "meta": { ... } }
```

Erreur — toujours :

```json
{ "error": { "code": "code_stable", "message": "Texte lisible.", "details": [] } }
```

Intégrez sur le `code`, jamais sur le `message` (susceptible d'évoluer).

### Codes d'erreur

| HTTP | `code` | Sens |
|---|---|---|
| 401 | `non_authentifie` | En-tête `Authorization` absent/mal formé |
| 401 | `cle_invalide` / `cle_revoquee` / `cle_expiree` | Problème de clé |
| 403 | `partenaire_inactif` | Compte partenaire désactivé |
| 403 | `ip_refusee` | IP appelante hors liste blanche |
| 403 | `scope_manquant` | Portée requise non accordée |
| 429 | `rate_limite` | > 120 requêtes/minute pour cette clé |
| 400 | `idempotency_key_requis` | En-tête `Idempotency-Key` manquant sur une écriture |
| 409 | `idempotency_en_cours` | Une requête avec cette clé est déjà en traitement |
| 409 | `idempotency_key_reutilisee` | Même clé, corps différent |
| 404 | `produit_inconnu` | Code produit inexistant ou inactif |
| 403 | `produit_non_autorise` | Produit non rattaché à votre compte |
| 403 | `produit_desactive` | Produit désactivé pour votre compte |
| 403 | `produit_verrouille` | Produit verrouillé sur l'API : les trois Assurances Santé (`sante_solo`, `sante_duo`, `sante_famille`) — devis et souscription indisponibles |
| 501 | `devis_calcule_non_supporte` | Produit sans barème exploitable (ne concerne aucun des 13 produits aujourd'hui) |
| 501 | `produit_non_supporte_api` | Garde-fou : produit ajouté au catalogue sans être branché à la souscription API |
| 400 | `formule_requise` / `formule_inconnue` | Formule absente ou non reconnue |
| 400 | `entrees_invalides` | Paramètres de tarification (`entrees`) manquants ou hors barème — détail dans `error.details` |
| 400 | `devis_invalide` | Combinaison refusée par le barème (ex. capital au-dessus de la limite SecurPro) |
| 400 | `nombre_periodes_non_applicable` | `nombrePeriodes` hors RelaxMoto/RelaxAuto |
| 400 | `option_deces_supprimee` | Le champ `optionDeces` n'existe plus (Décès inclus dans la formule RAF) |
| 400 | `kyc_requis` | Pièce d'identité (et selfie selon le produit) manquante |
| 400 | `beneficiaire_requis` | Bénéficiaire Décès obligatoire (RelaxVoyage, RelaxAccidents) |
| 400 | `voyage_requis` / `date_depart_passee` | Bloc `voyage` absent / date de départ passée (RelaxVoyage) |
| 400 | `sante_requis`, `date_naissance_requise`, `age_non_eligible`, `sexe_requis`, `personnes_assurees_invalides`, `fiches_invalides`, `questionnaire_invalide` | Dossier Santé incomplet ou incohérent |
| 409 | `souscription_doublon` | Souscription confirmée déjà existante (nom + téléphone + produit) |
| 409 | `cumul_relaxaccidents` | Un seul produit RelaxAccidents par client (RelaxVoyage excepté) |
| 409 | `demande_en_cours` | Une demande Santé est déjà en cours pour ce nom et ce téléphone |
| 409 | `validation_requise` | `confirmer-paiement` sur une demande Santé non encore validée (ou refusée) |
| 404 | `souscription_inconnue` | ID inconnu **ou** appartenant à un autre partenaire |
| 409 | `deja_confirmee` | Paiement déjà confirmé |
| 400 | `montant_incoherent` | `montantPercu` ≠ prime due (égalité stricte exigée) |
| 400 | `selfie_absent` / 404 `carte_indisponible` | Carte pas encore générable |
| 501 | `contrat_pdf_non_disponible` | Endpoint contrat PDF pas encore exposé |

---

## 3. Idempotence

Les écritures (`POST /souscriptions`, `confirmer-paiement`) exigent :

```
Idempotency-Key: <chaîne unique, 8 à 255 caractères>
```

Générez-la vous-même (UUID recommandé), **une par opération métier**. Rejouer
la requête avec la même clé **et le même corps** renvoie la réponse mémorisée
sans recréer la ressource — utilisez-le pour retenter après une coupure réseau.

---

## 4. Pagination

`GET /souscriptions` pagine par curseur :

```
GET /souscriptions?limit=50
→ { "data": [...], "meta": { "limit": 50, "nextCursor": "b1f2..." } }

GET /souscriptions?limit=50&cursor=b1f2...
```

`nextCursor: null` = dernière page.

---

## 5. Parcours de souscription (option B — vous encaissez)

```
1. GET  /catalogue                         → produits, formules, kycRequis
2. POST /devis                             → prime, commissionApi, montantAReverser, priseEffet
3. POST /souscriptions                     → { id, statut: "en_attente_confirmation" }
       (+ Idempotency-Key)
4. Vous encaissez la prime auprès du client.
5. POST /souscriptions/{id}/confirmer-paiement   → { statut: "confirmee", numeroPolice, dateDebut, dateFin }
       (+ Idempotency-Key ; montantPercu STRICTEMENT égal à la prime)
6. GET  /souscriptions/{id}/carte.png      → carte de prise en charge
```

Le catalogue liste **13 produits**, dont **10 sont ouverts** à `POST /devis` et
`POST /souscriptions` (data URL image ≤ 2 Mo pour les pièces). Les trois
**Assurances Santé sont verrouillées** sur l'API : visibles au catalogue
(`verrouille: true`, `souscriptionApi: false`), mais devis et souscription
répondent `403 produit_verrouille`. Les lignes `sante_*` du tableau et la
section Santé ci-dessous sont donc **réservées** : elles décrivent le parcours
qui sera ouvert si le verrou est levé. Trois familles :

| Produits | Prime | À fournir en plus du `prospect` |
|---|---|---|
| `relaxmoto`, `relaxauto`, `relaxaccidents_fraismedicaux`, `relaxaccidents_fraismedicaux_livreurs` | par `formule` (+ `nombrePeriodes` Moto/Auto) | `pieceIdentiteUrl` + `selfieUrl` |
| `relaxvoyage` | `formule` (`250`, `400`, `600`, `1000`) | `voyage{…}`, `pieceIdentiteUrl`, `beneficiaire` |
| `relaxaccidents` (générale) | `entrees{classe, cnpsDeclare, cycle, moyenDeplacement}` | `pieceIdentiteUrl` + `selfieUrl`, `beneficiaire` |
| `securhome` | `entrees{nombrePieces, statutOccupation, cycle}` | — |
| `securhome_dommages`, `securpro_dommages`, `securmoto` | `entrees{…}` (mêmes champs que le devis partageable) | — (`commerce{…}` facultatif) |
| `sante_solo`, `sante_duo`, `sante_famille` | `formule` (`70`, `80`…) | `prospect.dateNaissance` + `sexe`, `sante{ficheSante, personnesAssurees, questionnaireSante}` |

**La prime n'est jamais lue dans la requête** : elle est recalculée par SIM
Assurances (entière, en FCFA) ; `POST /devis` avec les mêmes `entrees` vous
donne le montant exact à encaisser.

**Assurances Santé — parcours en plus.** La souscription est une *demande*
(`statut: "en_attente_validation"`, `echeanceId: null`). SIM Assurances la
valide (ou la refuse : `statut: "refusee"`) ; le client reçoit alors par SMS le
lien de dépôt de ses pièces. Tant que la demande n'est pas validée,
`confirmer-paiement` répond `409 validation_requise`. Après validation, vous
pouvez confirmer l'encaissement comme pour les autres produits — ou laisser le
client payer lui-même par le lien Wave de son SMS (la souscription passe alors
`confirmee`, à lire par `GET /souscriptions/{id}`).

`montantAReverser` = prime encaissée − commission « canal API ». C'est le
montant dû à SIM Assurances (rapprochement mensuel).

### Référence des paramètres par produit

`POST /devis` et `POST /souscriptions` reçoivent **les mêmes** `produit`,
`formule` et `entrees`. Une valeur hors barème renvoie `400 entrees_invalides`
(avec le détail des champs en cause) ou `400 devis_invalide`.

**Formules (`formule`)**

| Produit | Valeurs |
|---|---|
| `relaxmoto`, `relaxauto` | `mensuel`, `annuel` (+ `nombrePeriodes` 1 à 12) |
| `relaxaccidents_fraismedicaux`, `…_livreurs` | `500`, `1000` (prime en FCFA ; Décès inclus dans la formule) |
| `relaxvoyage` | `250`, `400`, `600`, `1000` |
| `sante_solo`, `sante_duo` | `70`, `80` (taux de prise en charge, %) |
| `sante_famille` | `70`, `80`, `80-2`, `80-3` |

Pour `relaxvoyage` et `sante_*`, `formule` peut aussi être placée dans
`entrees.formule`. Les valeurs exactes du moment se lisent dans
`GET /catalogue` (`formules[].libelleVariante`).

**Paramètres `entrees` des produits calculés**

| Produit | Champs |
|---|---|
| `relaxaccidents` | `classe` (1 à 4), `cnpsDeclare` (booléen), `cycle` (`annuel` \| `mensuel`), `moyenDeplacement` (`voiture` \| `moto_tricycle` \| `autres` — le supplément moto/tricycle est inclus dans la prime) |
| `securhome` | `nombrePieces` (1 à 5), `statutOccupation` (`proprietaire` \| `locataire`), `cycle` (`annuel` par défaut, `mensuel` = prime annuelle ÷ 10) |
| `securhome_dommages` | `statutOccupation`, `valeurBatiment` (propriétaire) ou `loyerMensuel` (locataire), `contenu`, `gardien`, `extincteur`, `camera`, `volContenu` (booléens), capitaux facultatifs `ddeCapital` (1 M ou 2 M), `deCapital`, `bdgCapital`, `cycle` |
| `securpro_dommages` | `classe` (1 à 4), `statutOccupation`, `valeurBatiment` ou `loyerMensuel`, `contenu`, `dansMarche`, `gardien`, `extincteur`, `volContenu` (booléens), facultatifs : `majorationVolContenu`, `volCaisseCapital`, `majorationVolCaisse`, `ddeCapital`, `deCapital`, `bdgCapital`, `cycle` |
| `securmoto` | `valeurMoto` (1 à 700 000 FCFA), `ageMoto` (`NEUVE` \| `1 AN` \| `2 ANS`), `cycle` |

Capitaux autorisés : `ddeCapital` 1 000 000 / 2 000 000 ; `deCapital`
100 000 à 2 000 000 ; `bdgCapital` 250 000 à 2 000 000 ; `volCaisseCapital`
25 000 à 500 000. Un capital hors liste est refusé.

**Blocs métier de `POST /souscriptions`**

| Bloc | Produit | Contenu |
|---|---|---|
| `voyage` | `relaxvoyage` (obligatoire) | `compagnie`, `lieuDepart`, `lieuArrivee`, `numeroTicket`, `dateDepart` (`AAAA-MM-JJ`, pas dans le passé), `numeroPersonneContact`, `typePiece` (`CNI` \| `Permis` \| `Passeport`, facultatif) |
| `commerce` | `securhome_dommages`, `securpro_dommages` (facultatif) | `nomCommercial`, `ville`, `communeQuartier`, `refFacture` |
| `beneficiaire` | obligatoire : `relaxvoyage`, `relaxaccidents` ; facultatif : Moto, Auto, RAF | `{ "nom", "telephone" }` — bénéficiaire de la garantie Décès |
| `sante` | `sante_*` (obligatoire) | `ficheSante`, `personnesAssurees`, `questionnaireSante` (voir ci-dessous) |

**Assurances Santé — contenu du bloc `sante`**

- `prospect.dateNaissance` (assuré principal de 15 à 65 ans) et `prospect.sexe` sont obligatoires.
- `ficheSante` : `profession`, `lieuResidence`, `situationMatrimoniale` (`celibataire`, `marie`, `divorce`, `veuf`, `union_libre`), `poidsKg`, `tailleCm`, `tensionArterielle` (`120/80`), `groupeSanguin` (`A+`…`O-` ou `inconnu`), `numeroCmu` facultatif.
- `personnesAssurees` : Solo → aucune ; Duo → le conjoint ; Famille → le conjoint et jusqu'à 3 enfants. Chacune : `lien` (`conjoint` \| `enfant`), `nom`, `prenom`, `dateNaissance`, `sexe`, `lieuResidence` (+ `profession` pour le conjoint).
- `questionnaireSante` : `declareExactEtSincere: true` et `personnes[]` — une entrée par personne assurée (souscripteur en tête), avec une réponse `true`/`false` à chaque question applicable à son sexe. Un questionnaire incomplet renvoie `400 questionnaire_invalide` avec la question manquante.

**Pièces d'identité (data URL image ≤ 2 Mo)**

| Produits | `pieceIdentiteUrl` | `selfieUrl` |
|---|---|---|
| Moto, Auto, RAF ×2, RelaxAccidents | obligatoire | obligatoire |
| RelaxVoyage | obligatoire | non requis |
| SecurHome, SecurHome+, SecurPro, SecurMoto | facultative | facultatif |
| Santé | facultative (les pièces sont déposées par le client via le lien SMS) | facultatif |

### Exemple

```bash
BASE=https://<domaine-sim>/api/partner/v1
KEY=LA_CLE_FOURNIE_PAR_SIM

# Devis
curl -s "$BASE/devis" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"produit":"relaxmoto","formule":"mensuel","nombrePeriodes":3}'

# Souscription
curl -s "$BASE/souscriptions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "produit":"relaxmoto","formule":"mensuel","nombrePeriodes":3,
    "prospect":{"nom":"KOUAME","prenom":"Ama","telephone":"+2250700000000"},
    "pieceIdentiteUrl":"data:image/jpeg;base64,...",
    "selfieUrl":"data:image/jpeg;base64,..."
  }'

# Produit « calculé » (ici SecurMoto) : mêmes paramètres pour /devis et /souscriptions
curl -s "$BASE/devis" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"produit":"securmoto","entrees":{"valeurMoto":500000,"ageMoto":"NEUVE","cycle":"annuel"}}'

curl -s "$BASE/souscriptions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "produit":"securmoto",
    "entrees":{"valeurMoto":500000,"ageMoto":"NEUVE","cycle":"annuel"},
    "prospect":{"nom":"KOUAME","prenom":"Ama","telephone":"+2250700000000"}
  }'

# RelaxVoyage : bloc voyage + pièce + bénéficiaire
curl -s "$BASE/souscriptions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "produit":"relaxvoyage","formule":"250",
    "prospect":{"nom":"KOUAME","prenom":"Ama","telephone":"+2250700000000","dateNaissance":"1990-05-15","sexe":"feminin"},
    "pieceIdentiteUrl":"data:image/jpeg;base64,...",
    "beneficiaire":{"nom":"KOUAME Yao","telephone":"+2250500000000"},
    "voyage":{"typePiece":"CNI","compagnie":"UTB","lieuDepart":"Abidjan","lieuArrivee":"Bouaké",
              "numeroTicket":"T123456","dateDepart":"2026-12-01","numeroPersonneContact":"+2250100000000"}
  }'

# Santé Duo — RÉSERVÉ : verrouillé aujourd'hui (403 produit_verrouille). Parcours prévu si le verrou est levé :
# demande (statut en_attente_validation), validée ensuite par SIM
curl -s "$BASE/souscriptions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "produit":"sante_duo","formule":"70",
    "prospect":{"nom":"KOUAME","prenom":"Ama","telephone":"+2250700000000","dateNaissance":"1990-05-15","sexe":"masculin","email":"ama@example.com"},
    "sante":{
      "ficheSante":{"profession":"Enseignant","lieuResidence":"Abidjan Cocody","situationMatrimoniale":"marie",
                    "poidsKg":75,"tailleCm":178,"tensionArterielle":"120/80","groupeSanguin":"O+"},
      "personnesAssurees":[{"lien":"conjoint","nom":"KOUAME","prenom":"Awa","dateNaissance":"1992-03-10",
                            "sexe":"feminin","lieuResidence":"Abidjan","profession":"Couturière"}],
      "questionnaireSante":{"declareExactEtSincere":true,
                            "personnes":[{"reponses":{"hta":false,"asthme":false,"...":false}},
                                         {"reponses":{"hta":false,"asthme":false,"...":false}}]}
    }
  }'

# Confirmation de paiement
curl -s "$BASE/souscriptions/<id>/confirmer-paiement" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"referencePaiement":"WAVE-ABC123","montantPercu":7500}'
```

---

## 6. Webhooks

Si une URL webhook est configurée sur votre clé, SIM Assurances y envoie un
`POST` à chaque événement souscrit.

### En-têtes

```
X-SIM-Evenement: souscription.confirmee
X-SIM-Signature: t=1717171717,v1=<hmac_sha256_hex>
Content-Type: application/json
```

### Corps

```json
{
  "evenement": "souscription.confirmee",
  "cree_le": "2026-09-03T10:00:00.000Z",
  "donnees": { "souscriptionId": "…", "numeroPolice": "…", "dateDebut": "…", "dateFin": "…", "montantAReverser": 6750 }
}
```

### Vérification de signature

Calculez `HMAC-SHA256( "<t>.<corps_brut>", secret_webhook )` et comparez, en
temps constant, à la valeur `v1`. Rejetez si `t` s'écarte de plus de 5 minutes
de l'heure courante.

```js
const [t, v1] = header.split(",").map(p => p.split("=")[1]);
const attendu = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(attendu));
```

### Événements

| Événement | Quand |
|---|---|
| `souscription.creee` | après `POST /souscriptions` |
| `paiement.recu` | après `confirmer-paiement` |
| `souscription.confirmee` | couverture activée (police émise) |
| `contrat.disponible` | carte / documents générés |
| `souscription.rejetee` | (réservé) |

### Livraison

Réponse `2xx` attendue sous 10 s. En cas d'échec : nouvelles tentatives à
`+1 min`, `+5`, `+30`, `+120`, `+360`, puis abandon (au plus 24 h). Rendez
votre endpoint idempotent (un même événement peut arriver plusieurs fois).
