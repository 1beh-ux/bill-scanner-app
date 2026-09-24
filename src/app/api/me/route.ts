import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeUiPrefs } from "@/lib/ui-prefs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    preferredLang: user.preferredLang,
    preferredTheme: user.preferredTheme,
    landingPath: user.landingPath,
    emailSignature: user.emailSignature,
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
  const { preferredLang, preferredTheme, landingPath, emailSignature, hiddenModules, uiPrefs } = await req.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(preferredLang !== undefined && { preferredLang }),
      ...(preferredTheme !== undefined && { preferredTheme }),
      ...(landingPath !== undefined && { landingPath: landingPath || null }),
      ...(emailSignature !== undefined && { emailSignature: emailSignature || null }),
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
    hiddenModules: updated.hiddenModules,
    uiPrefs: updated.uiPrefs ?? {},
  });
}
