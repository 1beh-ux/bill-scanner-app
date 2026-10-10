import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { prisma } from "@/lib/prisma";
import { sanitizeUiPrefs } from "@/lib/ui-prefs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // The organization this request acts in, and (super-admin) home -- the switcher and the "Pracujete v organizaci" strip.
  const actingId = await getActingOrgId(user);
  const orgSelect = { id: true, name: true, shortName: true } as const;
  const [organization, homeOrganization] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actingId }, select: orgSelect }),
    prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: orgSelect }),
  ]);
  return NextResponse.json({
    id: user.id,
    organization,
    homeOrganization,
    email: user.email,
    displayName: user.displayName,
    // Effective role in the acting organization (a super-admin is admin there); the UI keys off this.
    role: isOrgAdmin(user) ? "admin" : user.role,
    isSuperAdmin: user.isSuperAdmin,
    preferredLang: user.preferredLang,
    preferredTheme: user.preferredTheme,
    landingPath: user.landingPath,
    emailSignature: user.emailSignature,
    emailBodySignature: user.emailBodySignature,
    hiddenModules: user.hiddenModules,
    uiPrefs: user.uiPrefs ?? {},
  });
}

// Personal preferences (src/lib/i18n.tsx, src/app/settings/page.tsx) --
// localStorage still seeds the instant paint before this loads (see
// I18nProvider's own comment), this is what makes a choice follow the
// person across devices/browsers instead of resetting every time.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { preferredLang, preferredTheme, landingPath, emailSignature, emailBodySignature, hiddenModules, uiPrefs } = await req.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(preferredLang !== undefined && { preferredLang }),
      ...(preferredTheme !== undefined && { preferredTheme }),
      ...(landingPath !== undefined && { landingPath: landingPath || null }),
      ...(emailSignature !== undefined && { emailSignature: emailSignature || null }),
      ...(typeof emailBodySignature === "string" || emailBodySignature === null ? { emailBodySignature: emailBodySignature?.trim().slice(0, 2000) || null } : {}),
      ...(hiddenModules !== undefined && { hiddenModules }),
      // Merged, not replaced: each screen saves only its own keys.
      ...(uiPrefs !== undefined && { uiPrefs: { ...sanitizeUiPrefs(user.uiPrefs), ...sanitizeUiPrefs(uiPrefs) } }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    preferredLang: updated.preferredLang,
    preferredTheme: updated.preferredTheme,
    landingPath: updated.landingPath,
    emailSignature: updated.emailSignature,
    emailBodySignature: updated.emailBodySignature,
    hiddenModules: updated.hiddenModules,
    uiPrefs: updated.uiPrefs ?? {},
  });
}
