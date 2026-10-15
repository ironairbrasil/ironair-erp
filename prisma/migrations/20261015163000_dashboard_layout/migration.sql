CREATE TABLE "DashboardLayout" (
    "tenantId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "expanded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
