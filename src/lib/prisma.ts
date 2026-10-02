import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { flowsendPrisma?: PrismaClient };

export const prisma = globalForPrisma.flowsendPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.flowsendPrisma = prisma;
