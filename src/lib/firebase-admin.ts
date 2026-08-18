import { initializeApp, getApps, type Credential } from "firebase-admin/app";
import { GoogleAuth } from "google-auth-library";

// firebase-admin's bundled applicationDefault() fails to fetch a token from
// this environment's metadata server ("Cannot create property 'refresh_token'
// on string ''"). The directly-installed google-auth-library (already used
// in drive.ts for the same class of problem) resolves ADC fine, so build a
// Credential from that instead of relying on applicationDefault().
const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

const adcCredential: Credential = {
  async getAccessToken() {
    const client = await googleAuth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Failed to obtain Google OAuth2 access token");
    const expiryDate = (client.credentials as { expiry_date?: number }).expiry_date;
    const expiresIn = expiryDate ? Math.max(0, Math.floor((expiryDate - Date.now()) / 1000)) : 3600;
    return { access_token: token, expires_in: expiresIn };
  },
};

export function initAdmin() {
  if (getApps().length) return;
  initializeApp({ credential: adcCredential });
}
