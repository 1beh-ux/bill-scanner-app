import { GoogleAuth, Impersonated } from "google-auth-library";
import { google } from "googleapis";

const DRIVE_SA_EMAIL = process.env.DRIVE_SERVICE_ACCOUNT_EMAIL;

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

let cachedClient: Impersonated | null = null;

async function getImpersonatedClient(): Promise<Impersonated> {
  if (cachedClient) return cachedClient;

  if (!DRIVE_SA_EMAIL) {
    throw new Error("DRIVE_SERVICE_ACCOUNT_EMAIL is not set");
  }

  const sourceAuth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const sourceClient = await sourceAuth.getClient();

  cachedClient = new Impersonated({
    sourceClient,
    targetPrincipal: DRIVE_SA_EMAIL,
    lifetime: 3600,
    delegates: [],
    targetScopes: SCOPES,
  });

  return cachedClient;
}

export async function getDriveClient() {
  const auth = await getImpersonatedClient();
  // googleapis bundles its own internal copy of google-auth-library. Ours
  // (installed directly, for the Impersonated class) is structurally the
  // same but TypeScript treats them as distinct types because of a private
  // field. Safe, deliberate cast — no behavior difference at runtime.
  return google.drive({ version: "v3", auth: auth as any });
}

export async function getSheetsClient() {
  const auth = await getImpersonatedClient();
  return google.sheets({ version: "v4", auth: auth as any });
}

export function getDriveServiceAccountEmail(): string {
  return DRIVE_SA_EMAIL ?? "";
}