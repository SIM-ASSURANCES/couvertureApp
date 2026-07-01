import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const nom = process.env.SUPER_ADMIN_NOM ?? "Super Admin";

  if (!email || !password) {
    console.log("[seed] SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD non définis — seed ignoré.");
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

main()
  .catch((e) => { console.error("[seed] Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
