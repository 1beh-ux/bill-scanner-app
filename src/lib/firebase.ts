import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

/**
 * Apple browsers (any iOS browser, desktop Safari) and home-screen web apps:
 * a popup can't hand the result back there, so the login page uses a
 * full-page redirect instead.
 */
export function prefersRedirectSignIn(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/.test(ua));
  return standalone || apple;
}

/**
 * Firebase's sign-in helper runs on our own host (proxied at /__/auth/*, see
 * next.config.ts), so Google's window says "continue to tabornik.online" and
 * Safari's cross-site storage blocking doesn't apply. Requires
 * https://<host>/__/auth/handler among the OAuth client's redirect URIs and the
 * host among Firebase's authorized domains (docs/custom-domain.md).
 * Dev hosts (localhost, Cloud Shell) aren't registered there: Chrome & co. keep
 * <project>.firebaseapp.com, Apple browsers the same-origin helper as before.
 */
function authDomain(): string | undefined {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const { hostname, host } = window.location;
  const dev = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".cloudshell.dev");
  return !dev || prefersRedirectSignIn() ? host : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: authDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
