import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  // ── Accident ──
  await p.tarifAccident.update({
    where: { prime: 500 },
    data: { primeHT: 466.2004662, fg: 69.93006993, taxes: 33.7995338 }
  });
  console.log('✓ Accident 500 FCFA mis à jour');

  await p.tarifAccident.update({
    where: { prime: 1000 },
    data: { primeHT: 932.4009324, fg: 139.8601399, taxes: 67.5990676 }
  });
  console.log('✓ Accident 1000 FCFA mis à jour');

  // ── Incendie ──
  await p.tarifIncendie.update({
    where: { prime: 1000 },
    data: { primeHT: 888.8888889, fg: 133.3333333, taxes: 111.111111 }
  });
  console.log('✓ Incendie 1000 FCFA mis à jour');

  await p.tarifIncendie.update({
    where: { prime: 2000 },
    data: { primeHT: 1777.777778, fg: 266.6666667, taxes: 222.222222 }
  });
  console.log('✓ Incendie 2000 FCFA mis à jour');

  // Vérification
  console.log('\n=== VÉRIFICATION ===');
  console.log('Accident:', JSON.stringify(await p.tarifAccident.findMany({ orderBy: { prime: 'asc' } }), null, 2));
  console.log('Incendie:', JSON.stringify(await p.tarifIncendie.findMany({ orderBy: { prime: 'asc' } }), null, 2));

  await p.$disconnect();
})();
