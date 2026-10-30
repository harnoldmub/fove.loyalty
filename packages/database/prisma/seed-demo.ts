import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: resolve(__dirname, "../../../.env.local") });
config({ path: resolve(__dirname, "../../../.env") });
import { createPrismaClient } from "../src/index";
import { createCard } from "../../../apps/api/src/loyalty/cards";

const prisma = createPrismaClient(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);

async function main() {
  // 1. Messages de contact & demandes reçues
  await prisma.contactMessage.deleteMany();
  await prisma.contactMessage.createMany({
    data: [
      {
        name: "Jean-Paul Kasongo",
        email: "jp.kasongo@kinshasa-retail.cd",
        phone: "+243825551234",
        companyName: "Supermarchés Express Kinshasa (3 magasins)",
        subject: "Démonstration et raccordement caisses tactiles",
        message:
          "Bonjour l’équipe FOVE, nous gérons 3 supermarchés de proximité à Kinshasa. Nous aimerions mettre en place vos cartes dématérialisées Apple/Google Wallet avec intégration à nos caisses. Serait-il possible d’avoir une démo cette semaine ?",
        status: "NEW",
        source: "WEBSITE",
        createdAt: new Date(Date.now() - 3600 * 1000 * 3),
      },
      {
        name: "Dr. Mireille Yumba",
        email: "direction@pharmacie-centrale.cd",
        phone: "+243814448888",
        companyName: "Pharmacie Centrale Lubumbashi",
        subject: "Demande de devis pour programme de fidélité santé",
        message:
          "Nous cherchons un système moderne sans carte plastique pour fidéliser nos patients réguliers. Vos notifications sur écran de verrouillage nous intéressent vivement.",
        status: "NEW",
        source: "DEMO_REQUEST",
        createdAt: new Date(Date.now() - 3600 * 1000 * 7),
      },
      {
        name: "Eric Tambwe",
        email: "eric@tambwe-coiffure.com",
        phone: "+243892223344",
        companyName: "Tambwe Barber Lounge",
        subject: "Question sur les relances WhatsApp et le scanner",
        message:
          "Bonjour, vos caissiers peuvent-ils utiliser leur propre smartphone pour scanner ? Combien coûte l’abonnement annuel en RDC ?",
        status: "IN_PROGRESS",
        notes: "Contacté sur WhatsApp par l’équipe commerciale, très intéressé par le pack Business.",
        source: "WEBSITE",
        createdAt: new Date(Date.now() - 3600 * 1000 * 24),
      },
      {
        name: "Sophie Mbayo",
        email: "sophie.mbayo@hotel-fleuve.cd",
        phone: "+243851119900",
        companyName: "Hôtel & Spa Le Fleuve",
        subject: "Partenariat VIP et conciergerie",
        message:
          "Intéressés pour équiper notre bar lounge et notre espace bien-être. Merci pour la démonstration très convaincante.",
        status: "CONTACTED",
        notes: "Offre Réseau annuelle envoyée par email avec accord de principe.",
        source: "PRICING_PAGE",
        createdAt: new Date(Date.now() - 3600 * 1000 * 48),
      },
    ],
  });
  console.log("✓ Messages de contact créés.");

  // 2. Clients complets pour Café Matonge
  const cafe = await prisma.tenant.findFirst({ where: { slug: "cafe-matonge" }, include: { programs: true } });
  if (cafe && cafe.programs[0]) {
    const prog = cafe.programs[0];

    // Marc Mwamba (VIP)
    const marc = await prisma.customer.upsert({
      where: { tenantId_id: { tenantId: cafe.id, id: "a1b2c3d4-0001-4000-8000-000000000001" } },
      update: {},
      create: {
        id: "a1b2c3d4-0001-4000-8000-000000000001",
        tenantId: cafe.id,
        firstName: "Marc",
        lastName: "Mwamba",
        phone: "+243820000001",
        email: "marc.mwamba@gmail.com",
        tags: ["VIP", "Prescripteur", "Amateur Espresso"],
        notes: "Client fidèle du matin. Aime s’installer en terrasse. Offrir la dégustation du nouveau cru.",
        totalVisits: 16,
        totalSpend: 210,
        lastVisitAt: new Date(Date.now() - 3600 * 1000 * 24 * 2),
      },
    });
    await prisma.customerIdentity.upsert({
      where: { tenantId_kind_value: { tenantId: cafe.id, kind: "PHONE", value: "+243820000001" } },
      update: {},
      create: { tenantId: cafe.id, customerId: marc.id, kind: "PHONE", value: "+243820000001" },
    });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyAccount.findFirst({ where: { customerId: marc.id, programId: prog.id } });
      if (!existing) {
        const card = await createCard(tx, { tenantId: cafe.id, programId: prog.id, customerId: marc.id, status: "ACTIVE" }, "Café Matonge");
        await tx.loyaltyAccount.update({ where: { id: card.accountId }, data: { balance: 9, lifetimeEarned: 19 } });
      }
    });

    // Sarah Tshisekedi (Nouvelle)
    const sarah = await prisma.customer.upsert({
      where: { tenantId_id: { tenantId: cafe.id, id: "a1b2c3d4-0002-4000-8000-000000000002" } },
      update: {},
      create: {
        id: "a1b2c3d4-0002-4000-8000-000000000002",
        tenantId: cafe.id,
        firstName: "Sarah",
        lastName: "Tshisekedi",
        phone: "+243820000002",
        email: "sarah.tshis@yahoo.fr",
        tags: ["Nouveau"],
        notes: "Découverte par le QR code comptoir lors de sa première visite.",
        totalVisits: 1,
        totalSpend: 15,
        lastVisitAt: new Date(Date.now() - 3600 * 1000 * 12),
      },
    });
    await prisma.customerIdentity.upsert({
      where: { tenantId_kind_value: { tenantId: cafe.id, kind: "PHONE", value: "+243820000002" } },
      update: {},
      create: { tenantId: cafe.id, customerId: sarah.id, kind: "PHONE", value: "+243820000002" },
    });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyAccount.findFirst({ where: { customerId: sarah.id, programId: prog.id } });
      if (!existing) {
        const card = await createCard(tx, { tenantId: cafe.id, programId: prog.id, customerId: sarah.id, status: "ACTIVE" }, "Café Matonge");
        await tx.loyaltyAccount.update({ where: { id: card.accountId }, data: { balance: 1, lifetimeEarned: 1 } });
      }
    });

    // Christian Bolamba (En risque)
    const christian = await prisma.customer.upsert({
      where: { tenantId_id: { tenantId: cafe.id, id: "a1b2c3d4-0003-4000-8000-000000000003" } },
      update: {},
      create: {
        id: "a1b2c3d4-0003-4000-8000-000000000003",
        tenantId: cafe.id,
        firstName: "Christian",
        lastName: "Bolamba",
        phone: "+243820000003",
        email: "christian.bol@outlook.com",
        tags: ["Habitué du midi", "À réengager"],
        notes: "Ne s’est pas présenté depuis plus de 40 jours. Envoyer relance WhatsApp offre déjeuner.",
        totalVisits: 6,
        totalSpend: 75,
        lastVisitAt: new Date(Date.now() - 3600 * 1000 * 24 * 45),
      },
    });
    await prisma.customerIdentity.upsert({
      where: { tenantId_kind_value: { tenantId: cafe.id, kind: "PHONE", value: "+243820000003" } },
      update: {},
      create: { tenantId: cafe.id, customerId: christian.id, kind: "PHONE", value: "+243820000003" },
    });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyAccount.findFirst({ where: { customerId: christian.id, programId: prog.id } });
      if (!existing) {
        const card = await createCard(tx, { tenantId: cafe.id, programId: prog.id, customerId: christian.id, status: "ACTIVE" }, "Café Matonge");
        await tx.loyaltyAccount.update({ where: { id: card.accountId }, data: { balance: 4, lifetimeEarned: 6 } });
      }
    });
    console.log("✓ Clients Café Matonge créés.");
  }

  // 3. Deuxième commerce : La Braise Kinshasa
  const planPremium = await prisma.subscriptionPlan.findUnique({ where: { code: "premium" } });
  const laBraise = await prisma.tenant.upsert({
    where: { slug: "la-braise" },
    update: {},
    create: {
      name: "La Braise Kinshasa",
      slug: "la-braise",
      status: "ACTIVE",
      subscription: planPremium
        ? {
            create: {
              planId: planPremium.id,
              status: "ACTIVE",
              provider: "MANUAL",
            },
          }
        : undefined,
    },
  });

  const progBraise = await prisma.loyaltyProgram.upsert({
    where: { tenantId_id: { tenantId: laBraise.id, id: "b1b2c3d4-0001-4000-8000-000000000001" } },
    update: {},
    create: {
      id: "b1b2c3d4-0001-4000-8000-000000000001",
      tenantId: laBraise.id,
      name: "Points Gourmands",
      mode: "POINTS",
      currency: "CDF",
      spendStep: 1000,
      pointsPerStep: 1,
      terms: "1000 CDF = 1 point accumulé sur toutes vos commandes au restaurant et au bar.",
    },
  });

  const patrick = await prisma.customer.upsert({
    where: { tenantId_id: { tenantId: laBraise.id, id: "c1b2c3d4-0001-4000-8000-000000000001" } },
    update: {},
    create: {
      id: "c1b2c3d4-0001-4000-8000-000000000001",
      tenantId: laBraise.id,
      firstName: "Patrick",
      lastName: "Ilunga",
      phone: "+243819999001",
      email: "p.ilunga@invest.cd",
      tags: ["VIP", "Table d’affaires"],
      totalVisits: 12,
      totalSpend: 1450,
      lastVisitAt: new Date(Date.now() - 3600 * 1000 * 24 * 3),
    },
  });
  await prisma.$transaction(async (tx) => {
    const existing = await tx.loyaltyAccount.findFirst({ where: { customerId: patrick.id, programId: progBraise.id } });
    if (!existing) {
      const card = await createCard(tx, { tenantId: laBraise.id, programId: progBraise.id, customerId: patrick.id, status: "ACTIVE" }, "La Braise Kinshasa");
      await tx.loyaltyAccount.update({ where: { id: card.accountId }, data: { balance: 1450, lifetimeEarned: 1450 } });
    }
  });
  console.log("✓ La Braise Kinshasa et clients créés.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
