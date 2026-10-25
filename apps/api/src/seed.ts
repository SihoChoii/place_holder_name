/**
 * Seed a small bright-star catalog for local development.
 * Run: pnpm --filter @stargaze/api seed
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@stargaze/db";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const STARS = [
  { catalogId: "HIP677", name: "Sirius", raHours: 6.7525, decDegrees: -16.7161, magnitude: -1.46, constellation: "Canis Major" },
  { catalogId: "HIP21421", name: "Aldebaran", raHours: 4.5987, decDegrees: 16.5093, magnitude: 0.85, constellation: "Taurus" },
  { catalogId: "HIP27989", name: "Betelgeuse", raHours: 5.9195, decDegrees: 7.4071, magnitude: 0.42, constellation: "Orion" },
  { catalogId: "HIP24436", name: "Rigel", raHours: 5.2423, decDegrees: -8.2016, magnitude: 0.13, constellation: "Orion" },
  { catalogId: "HIP37279", name: "Procyon", raHours: 7.655, decDegrees: 5.225, magnitude: 0.34, constellation: "Canis Minor" },
  { catalogId: "HIP69673", name: "Arcturus", raHours: 14.261, decDegrees: 19.1824, magnitude: -0.05, constellation: "Boötes" },
  { catalogId: "HIP91262", name: "Vega", raHours: 18.6156, decDegrees: 38.7837, magnitude: 0.03, constellation: "Lyra" },
  { catalogId: "HIP97649", name: "Altair", raHours: 19.8464, decDegrees: 8.8683, magnitude: 0.76, constellation: "Aquila" },
  { catalogId: "HIP65474", name: "Spica", raHours: 13.4199, decDegrees: -11.1613, magnitude: 0.97, constellation: "Virgo" },
  { catalogId: "HIP80763", name: "Antares", raHours: 16.4901, decDegrees: -26.4319, magnitude: 1.06, constellation: "Scorpius" },
  { catalogId: "HIP32349", name: "Pollux", raHours: 7.7553, decDegrees: 28.0262, magnitude: 1.14, constellation: "Gemini" },
  { catalogId: "HIP24608", name: "Capella", raHours: 5.2782, decDegrees: 45.998, magnitude: 0.08, constellation: "Auriga" },
];

async function main() {
  for (const star of STARS) {
    await prisma.star.upsert({
      where: { catalogId: star.catalogId },
      create: star,
      update: {
        name: star.name,
        raHours: star.raHours,
        decDegrees: star.decDegrees,
        magnitude: star.magnitude,
        constellation: star.constellation,
      },
    });
  }
  console.log(`Seeded ${STARS.length} stars`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
