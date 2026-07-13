import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const nom = process.env.SUPER_ADMIN_NOM ?? "Super Admin";

  if (!email || !password) {
    console.log("[seed] SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD non définis — création du super admin ignorée.");
    return;
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} existe déjà.`);
    return;
  }

  await prisma.admin.create({
    data: {
      nom,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "SUPER_ADMIN",
    },
  });

  console.log(`[seed] Super admin ${email} créé avec succès.`);
}

/**
 * Correction ponctuelle : le capital garanti Incendie était deux fois trop
 * faible (250 000/500 000 FCFA au lieu de 500 000/1 000 000 FCFA). Ne
 * corrige que les lignes encore sur l'ancienne valeur, pour ne jamais
 * écraser un ajustement manuel fait depuis via la page Paramètres.
 */
async function corrigerCapitalGarantiIncendie() {
  const corrections = [
    { prime: 1000, ancien: 250000, correct: 500000 },
    { prime: 2000, ancien: 500000, correct: 1000000 },
  ];

  for (const c of corrections) {
    const tarif = await prisma.tarifIncendie.findUnique({ where: { prime: c.prime } });
    if (tarif && tarif.capitalGaranti === c.ancien) {
      await prisma.tarifIncendie.update({
        where: { prime: c.prime },
        data: { capitalGaranti: c.correct },
      });
      console.log(`[seed] TarifIncendie prime=${c.prime} : capitalGaranti corrigé ${c.ancien} -> ${c.correct}.`);
    }

    const backfill = await prisma.souscriptionIncendie.updateMany({
      where: { montantPrime: c.prime, capitalGaranti: c.ancien },
      data: { capitalGaranti: c.correct },
    });
    if (backfill.count > 0) {
      console.log(
        `[seed] SouscriptionIncendie prime=${c.prime} : ${backfill.count} contrat(s) corrigé(s) (capitalGaranti).`
      );
    }
  }
}

async function main() {
  await seedSuperAdmin();
  await corrigerCapitalGarantiIncendie();
}

main()
  .catch((e) => { console.error("[seed] Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
