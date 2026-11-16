import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
let auth = null;
let provider = null;
try {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: "consent select_account",
    include_granted_scopes: "true"
  });
} catch {
  auth = null;
  provider = null;
}
let cachedAccessToken = null;
let cachedSenderEmail = null;
let isSigningIn = false;
const listeners = /* @__PURE__ */ new Set();
function notifyListeners() {
  const snap = {
    connected: Boolean(cachedAccessToken),
    email: cachedSenderEmail,
    accessToken: cachedAccessToken
  };
  listeners.forEach((cb) => cb(snap));
}
function subscribeGmailAuth(listener) {
  listeners.add(listener);
  listener({
    connected: Boolean(cachedAccessToken),
    email: cachedSenderEmail,
    accessToken: cachedAccessToken
  });
  return () => {
    listeners.delete(listener);
  };
}
function initGmailAuth() {
  if (!auth) return () => {};
  try {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        if (cachedAccessToken) {
          cachedSenderEmail = user.email ?? cachedSenderEmail;
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          cachedSenderEmail = null;
        }
      } else {
        cachedAccessToken = null;
        cachedSenderEmail = null;
      }
      notifyListeners();
    });
  } catch {
    return () => {};
  }
}
async function connectGmailWithGoogle() {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Google erişim anahtarı alınamadı. Lütfen Gmail gönderme iznini onaylayın.");
    }
    cachedAccessToken = credential.accessToken;
    cachedSenderEmail = result.user.email ?? null;
    if (typeof window !== "undefined") {
      window.focus();
    }
    notifyListeners();
    return {
      connected: true,
      email: cachedSenderEmail,
      accessToken: cachedAccessToken
    };
  } catch (err) {
    if (typeof window !== "undefined") {
      window.focus();
    }
    const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new Error("Google giriş penceresi kapatıldı. Gmail gönderimi için izin vermeniz gerekir.");
    }
    if (code === "auth/popup-blocked") {
      throw new Error("Tarayıcı açılır pencereyi engelledi. Lütfen açılır pencereye izin verip tekrar deneyin.");
    }
    if (code === "auth/unauthorized-domain") {
      throw new Error(
        "Bu adreste otomatik Gmail bağlantısı şu an kullanılamıyor. Şifre ile giriş yapabilir veya yeni hesap oluşturabilirsiniz."
      );
    }
    throw err instanceof Error ? err : new Error("Google ile Gmail bağlantısı kurulamadı.");
  } finally {
    isSigningIn = false;
  }
}
async function disconnectGmailAccount() {
  await auth.signOut();
  cachedAccessToken = null;
  cachedSenderEmail = null;
  notifyListeners();
}
function invalidateGmailAccessToken() {
  cachedAccessToken = null;
  notifyListeners();
}
function getGmailAccessToken() {
  return cachedAccessToken;
}
function getGmailSenderEmail() {
  return cachedSenderEmail;
}
export {
  SCOPES,
  connectGmailWithGoogle,
  disconnectGmailAccount,
  getGmailAccessToken,
  getGmailSenderEmail,
  initGmailAuth,
  invalidateGmailAccessToken,
  subscribeGmailAuth
};
