import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

/**
 * Apple browsers (any iOS browser, desktop Safari) and home-screen web apps
 * block the cross-site storage Firebase's default sign-in helper on
 * <project>.firebaseapp.com relies on -- sign-in silently never completed. For
 * them the helper is used from our own domain instead (proxied at /__/auth/*,
 * see next.config.ts). Requires https://<app host>/__/auth/handler among the
 * OAuth client's authorized redirect URIs.
 */
export function needsSameOriginAuth(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/.test(ua));
  return standalone || apple;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: needsSameOriginAuth() ? window.location.host : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
