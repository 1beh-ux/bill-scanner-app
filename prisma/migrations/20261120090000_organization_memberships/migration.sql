-- One person in several organizations (additive).
CREATE TABLE "organization_memberships" (
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id","organization_id")
);
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
