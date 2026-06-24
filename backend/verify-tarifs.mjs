import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  const tarifs_acc = await p.tarifAccident.findMany();
  const tarifs_inc = await p.tarifIncendie.findMany();
  const params = await p.parametre.findUnique({ where: { id: 1 } });

  console.log('=== TARIFS ACCIDENT ===');
  console.log(JSON.stringify(tarifs_acc, null, 2));

  console.log('\n=== TARIFS INCENDIE ===');
  console.log(JSON.stringify(tarifs_inc, null, 2));

  console.log('\n=== PARAMETRES ===');
  console.log(JSON.stringify(params, null, 2));

  await p.$disconnect();
})();
