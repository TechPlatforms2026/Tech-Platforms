import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
const LOCK_HASH_KEY = "techcore_lock_hash_v1";
const LOCK_ENABLED_KEY = "techcore_lock_enabled_v1";
const SESSION_UNLOCKED_KEY = "techcore_session_unlocked_v1";
function isInstalledAppMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || window.navigator.standalone === true;
}
async function hashLockPassword(plain) {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function getInstalledLockEnabled() {
  try {
    const raw = localStorage.getItem(LOCK_ENABLED_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}
function setInstalledLockEnabled(enabled) {
  try {
    localStorage.setItem(LOCK_ENABLED_KEY, String(enabled));
  } catch {
  }
}
function getLocalLockHash() {
  try {
    return localStorage.getItem(LOCK_HASH_KEY) || "";
  } catch {
    return "";
  }
}
function saveLocalLockHash(hash) {
  try {
    if (hash) {
      localStorage.setItem(LOCK_HASH_KEY, hash);
    } else {
      localStorage.removeItem(LOCK_HASH_KEY);
    }
  } catch {
  }
}
function InstalledLockScreen({
  forcePreview = false,
  onExitPreview
}) {
  const [installedMode, setInstalledMode] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [storedHash, setStoredHash] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const standalone = isInstalledAppMode();
    setInstalledMode(standalone);
    const enabled = getInstalledLockEnabled();
    const sessionOk = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "1";
    if (forcePreview) {
      setUnlocked(false);
    } else if (standalone && enabled && !sessionOk) {
      setUnlocked(false);
    } else {
      setUnlocked(true);
    }
    const localHash = getLocalLockHash();
    if (localHash) {
      setStoredHash(localHash);
    }
    void (async () => {
      try {
        const res = await apiRequest(
          "/api/app/lock-status"
        );
        if (res.ok && res.data.lockHash) {
          saveLocalLockHash(res.data.lockHash);
          setStoredHash(res.data.lockHash);
        }
      } catch {
      }
    })();
  }, [forcePreview]);
  if (!forcePreview && (!installedMode || unlocked)) {
    return null;
  }
  if (forcePreview && unlocked) {
    return null;
  }
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const clean = passwordInput.trim();
    if (clean.length < 4) {
      setError("Şifreniz en az 4 karakter olmalıdır.");
      return;
    }
    setChecking(true);
    try {
      const candidateHash = await hashLockPassword(clean);
      if (!storedHash) {
        saveLocalLockHash(candidateHash);
        setStoredHash(candidateHash);
        void apiRequest("/api/app/lock-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lockHash: candidateHash })
        });
        sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
        setPasswordInput("");
        setUnlocked(true);
        onExitPreview?.();
        return;
      }
      if (candidateHash !== storedHash) {
        setError("Girilen şifre hatalı. Lütfen tekrar deneyin.");
        return;
      }
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
      setPasswordInput("");
      setUnlocked(true);
      onExitPreview?.();
    } finally {
      setChecking(false);
    }
  };
  return <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="techcore-lock-heading"
    className="fixed inset-0 z-[100] flex items-center justify-center bg-[#090D16] px-4"
  >
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0F1623] p-8 shadow-2xl">
        <div className="mb-7 text-center">
          <h1
    id="techcore-lock-heading"
    className="font-display text-3xl font-bold tracking-tight text-white"
  >
            TechCore
          </h1>
          {!storedHash && <p className="mt-2 text-xs text-slate-400">
              Kurulu uygulama için ilk giriş şifrenizi belirleyin.
            </p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
    htmlFor="techcore-lock-password-input"
    className="mb-1.5 block text-xs font-semibold text-slate-300"
  >
              Şifreniz
            </label>
            <input
    id="techcore-lock-password-input"
    type="password"
    required
    autoFocus
    value={passwordInput}
    onChange={(e) => setPasswordInput(e.target.value)}
    placeholder="Şifreniz"
    className="h-12 w-full rounded-xl border border-slate-700/80 bg-[#090D16] px-4 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
    type="submit"
    disabled={checking}
    className="h-12 w-full rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
            {checking ? "Doğrulanıyor..." : "Giriş"}
          </button>

          {forcePreview && onExitPreview && <button
    type="button"
    onClick={onExitPreview}
    className="w-full pt-1 text-center text-xs text-slate-400 hover:text-slate-200"
  >
              Önizlemeyi Kapat
            </button>}
        </form>
      </div>
    </div>;
}
export {
  InstalledLockScreen,
  getInstalledLockEnabled,
  getLocalLockHash,
  hashLockPassword,
  isInstalledAppMode,
  saveLocalLockHash,
  setInstalledLockEnabled
};
