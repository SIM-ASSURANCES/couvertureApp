import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  console.log('Début du nettoyage...\n');

  const journal = await prisma.journalActivite.deleteMany();
  console.log(`✓ JournalActivite supprimés : ${journal.count}`);

  const souscInc = await prisma.souscriptionIncendie.deleteMany();
  console.log(`✓ SouscriptionIncendie supprimées : ${souscInc.count}`);

  const souscAcc = await prisma.souscriptionAccident.deleteMany();
  console.log(`✓ SouscriptionAccident supprimées : ${souscAcc.count}`);

  const partenaires = await prisma.partenaire.deleteMany();
  console.log(`✓ Partenaires supprimés : ${partenaires.count}`);

  const admins = await prisma.admin.deleteMany({
    where: { role: { not: 'SUPER_ADMIN' } }
  });
  console.log(`✓ Admins non-SUPER_ADMIN supprimés : ${admins.count}`);

  // Vérification finale
  const superAdmins = await prisma.admin.findMany({ where: { role: 'SUPER_ADMIN' } });
  console.log(`\n=== SUPER ADMINS CONSERVÉS ===`);
  superAdmins.forEach(a => console.log(`  • ${a.nom} (${a.email})`));

  const tarAccident = await prisma.tarifAccident.count();
  const tarIncendie = await prisma.tarifIncendie.count();
  console.log(`\n=== TARIFICATIONS CONSERVÉES ===`);
  console.log(`  • TarifAccident : ${tarAccident} entrées`);
  console.log(`  • TarifIncendie : ${tarIncendie} entrées`);

  console.log('\nNettoyage terminé ✓');
  await prisma.$disconnect();
})();
