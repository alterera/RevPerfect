import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create test hotels
  const hotel1 = await prisma.hotel.upsert({
    where: { email: 'testhotel@example.com' },
    update: {},
    create: {
      name: 'Test Hotel',
      email: 'testhotel@example.com',
      totalAvailableRooms: 500,
      isActive: true,
    },
  });

  console.log(`✓ Created hotel: ${hotel1.name} (${hotel1.email})`);

  const hotel2 = await prisma.hotel.upsert({
    where: { email: 'demo.hotel@outlook.com' },
    update: {},
    create: {
      name: 'Demo Hotel',
      email: 'demo.hotel@outlook.com',
      totalAvailableRooms: 300,
      isActive: true,
    },
  });

  console.log(`✓ Created hotel: ${hotel2.name} (${hotel2.email})`);

  // You can add more test hotels here
  const hotel3 = await prisma.hotel.upsert({
    where: { email: 'history.test@outlook.com' },
    update: {},
    create: {
      name: 'History Test Hotel',
      email: 'history.test@outlook.com',
      totalAvailableRooms: 400,
      isActive: true,
    },
  });

  console.log(`✓ Created hotel: ${hotel3.name} (${hotel3.email})`);

  console.log('\n✓ Seeding completed successfully!');
  console.log('\nCreated hotels:');
  console.log(`  1. ${hotel1.name} - ${hotel1.email} - ID: ${hotel1.id}`);
  console.log(`  2. ${hotel2.name} - ${hotel2.email} - ID: ${hotel2.id}`);
  console.log(`  3. ${hotel3.name} - ${hotel3.email} - ID: ${hotel3.id}`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

