ALTER TABLE "PushSubscription"
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "deviceLabel" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "PushSubscription_tenantId_userId_deviceId_idx"
ON "PushSubscription"("tenantId", "userId", "deviceId");
