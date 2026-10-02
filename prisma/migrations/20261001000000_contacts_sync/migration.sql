CREATE TYPE "OrganizationPlan" AS ENUM ('STARTER', 'PRO', 'SCALE');
CREATE TYPE "MessagingProvider" AS ENUM ('EVOLUTION', 'WAHA');
CREATE TYPE "InstanceStatus" AS ENUM ('CONNECTED', 'CONNECTING', 'DISCONNECTED', 'ERROR');
CREATE TYPE "ContactPipelineStatus" AS ENUM ('NOVO', 'CONTATADO', 'RESPONDEU', 'INTERESSADO', 'PROPOSTA', 'NEGOCIACAO', 'CLIENTE', 'SEM_INTERESSE');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plan" "OrganizationPlan" NOT NULL DEFAULT 'STARTER',
  "maxWhatsapp" INTEGER NOT NULL DEFAULT 1,
  "maxMessages" INTEGER NOT NULL DEFAULT 2000,
  "maxProspects" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInstance" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "MessagingProvider" NOT NULL,
  "instanceName" TEXT NOT NULL,
  "status" "InstanceStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "phone" TEXT NOT NULL DEFAULT '',
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInstance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsAppInstance_organizationId_instanceName_key" ON "WhatsAppInstance"("organizationId", "instanceName");
CREATE INDEX "WhatsAppInstance_organizationId_status_idx" ON "WhatsAppInstance"("organizationId", "status");

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "instanceId" TEXT,
  "remoteJid" TEXT,
  "phone" TEXT NOT NULL,
  "phoneNormalized" TEXT,
  "name" TEXT NOT NULL,
  "company" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "segment" TEXT NOT NULL DEFAULT '',
  "status" "ContactPipelineStatus" NOT NULL DEFAULT 'NOVO',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "leadValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "optedIn" BOOLEAN NOT NULL DEFAULT false,
  "optedOut" BOOLEAN NOT NULL DEFAULT false,
  "lastContact" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Contact_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Contact_instanceId_remoteJid_key" ON "Contact"("instanceId", "remoteJid");
CREATE UNIQUE INDEX "Contact_instanceId_phoneNormalized_key" ON "Contact"("instanceId", "phoneNormalized");
CREATE INDEX "Contact_organizationId_name_idx" ON "Contact"("organizationId", "name");
CREATE INDEX "Contact_organizationId_updatedAt_idx" ON "Contact"("organizationId", "updatedAt");
CREATE INDEX "Contact_organizationId_status_idx" ON "Contact"("organizationId", "status");
CREATE INDEX "Contact_organizationId_optedOut_idx" ON "Contact"("organizationId", "optedOut");
