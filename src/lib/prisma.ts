import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// BigInt columns (sizeBytes, usage metering) must survive NextResponse.json() of whole rows --
// JSON.stringify throws on BigInt otherwise. Byte sizes stay far below 2^53, so a number is exact.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
