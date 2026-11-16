import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Mail, X } from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import {
  connectGmailWithGoogle,
  disconnectGmailAccount,
  invalidateGmailAccessToken,
  subscribeGmailAuth
} from "../lib/googleGmailAuth";
function GoogleIcon() {
  return <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    className="h-4 w-4 shrink-0"
    aria-hidden="true"
  >
      <path
    fill="#EA4335"
    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
  />
      <path
    fill="#4285F4"
    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
  />
      <path
    fill="#FBBC05"
    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
  />
      <path
    fill="#34A853"
    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
  />
    </svg>;
}
function AuthModal({
  open,
  initialTab = "login",
  prefillEmail = "",
  userId,
  smtpConfigured = false,
  onClose,
  onAuthSuccess
}) {
  const [tab, setTab] = useState(initialTab);
  const [loginMode, setLoginMode] = useState("password");
  const [loading, setLoading] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [gmailAuth, setGmailAuth] = useState({
    connected: false,
    email: null,
    accessToken: null
  });
  const [pendingSendConfirm, setPendingSendConfirm] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [showLoginOtpInput, setShowLoginOtpInput] = useState(false);
  const [activeLogin, setActiveLogin] = useState(null);
  const [verifyEmail, setVerifyEmail] = useState(prefillEmail);
  const [verifyCode, setVerifyCode] = useState("");
  const [showVerifyOtpInput, setShowVerifyOtpInput] = useState(false);
  const [activeVerify, setActiveVerify] = useState(null);
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPass, setRegPass] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPass, setResetPass] = useState("");
  const [activeReset, setActiveReset] = useState(null);
  useEffect(() => subscribeGmailAuth(setGmailAuth), []);
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      if (prefillEmail) {
        setVerifyEmail(prefillEmail);
        setForgotEmail(prefillEmail);
        setLoginEmail(prefillEmail);
      }
      setError("");
      setInfo("");
      setPendingSendConfirm(null);
    }
  }, [open, initialTab, prefillEmail]);
  if (!open) return null;
  const switchTab = (next) => {
    setError("");
    setInfo("");
    setPendingSendConfirm(null);
    setTab(next);
  };
  const handleDisconnectGmail = async () => {
    setPendingSendConfirm(null);
    await disconnectGmailAccount();
    setInfo("Google Gmail bağlantısı kapatıldı.");
  };
  const executeDispatchVerification = async (targetEmail, purpose, overrideToken, overrideSender) => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const token = overrideToken ?? gmailAuth.accessToken;
      const sender = overrideSender ?? gmailAuth.email ?? void 0;
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await apiRequest(
        "/api/email/send-verification",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: targetEmail.trim(),
            purpose,
            senderEmail: sender
          })
        }
      );
      if (!res.ok || !res.data.verification) {
        if (res.status === 401) {
          invalidateGmailAccessToken();
        }
        setError(res.data.error || "Doğrulama e-postası gönderilemedi.");
        return;
      }
      const v = res.data.verification;
      const codeMsg = v.sandboxCode ? `Test Modu / Doğrudan Giriş: Onay kodunuz: ${v.sandboxCode} (Otomatik dolduruldu)` : `${v.email} adresinin posta kutusuna 6 haneli kod gönderildi.`;
      if (v.sandboxCode) {
        if (purpose === "login") setLoginOtpCode(v.sandboxCode);
        else if (purpose === "verify") setVerifyCode(v.sandboxCode);
        else if (purpose === "reset") setResetCode(v.sandboxCode);
      }
      if (purpose === "login") {
        setActiveLogin(v);
        setShowLoginOtpInput(true);
        setInfo(codeMsg);
      } else if (purpose === "verify") {
        setActiveVerify(v);
        setShowVerifyOtpInput(true);
        setInfo(codeMsg);
      } else {
        setActiveReset(v);
        setInfo(codeMsg);
        setTab("reset");
      }
    } catch {
      setError("Doğrulama isteği işlenemedi.");
    } finally {
      setLoading(false);
      setPendingSendConfirm(null);
    }
  };
  const startConnectAndSendFlow = async (targetEmail, purpose, forceGoogleOAuth = false) => {
    const cleanTarget = targetEmail.trim();
    if (!cleanTarget) {
      setError("Lütfen önce e-posta adresinizi yazın.");
      return;
    }
    if (smtpConfigured && !forceGoogleOAuth) {
      await executeDispatchVerification(cleanTarget, purpose);
      return;
    }
    if (gmailAuth.connected && gmailAuth.accessToken) {
      setError("");
      setPendingSendConfirm({
        email: cleanTarget,
        purpose,
        senderEmail: gmailAuth.email ?? void 0,
        accessToken: gmailAuth.accessToken
      });
      return;
    }
    setError("");
    setInfo("");
    setConnectingGoogle(true);
    try {
      const snap = await connectGmailWithGoogle();
      setPendingSendConfirm({
        email: cleanTarget,
        purpose,
        senderEmail: snap.email ?? void 0,
        accessToken: snap.accessToken ?? void 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google ile Gmail bağlantısı kurulamadı.");
    } finally {
      setConnectingGoogle(false);
    }
  };
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: loginEmail, password: loginPass })
      });
      if (!res.ok || !res.data.user) {
        setError(res.data.error || "Giriş yapılamadı.");
        return;
      }
      onAuthSuccess(res.data.user);
      onClose();
    } catch {
      setError("Giriş yapılırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };
  const handleCodeLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest(
        "/api/auth/login-with-code",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: loginEmail.trim(),
            code: loginOtpCode.trim(),
            verificationToken: activeLogin?.verificationToken
          })
        }
      );
      if (!res.ok || !res.data.user) {
        setError(res.data.error || "Onay kodu ile giriş yapılamadı.");
        return;
      }
      onAuthSuccess(res.data.user);
      onClose();
    } catch {
      setError("Onay kodu doğrulanırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };
  const handleConfirmVerifyCode = async (e) => {
    e.preventDefault();
    const targetEmail = (activeVerify?.email || verifyEmail).trim();
    if (!targetEmail) return;
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest(
        "/api/email/verify-code",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verificationId: activeVerify?.id,
            email: targetEmail,
            code: verifyCode.trim(),
            userId,
            verificationToken: activeVerify?.verificationToken
          })
        }
      );
      if (!res.ok) {
        setError(res.data.error || "Doğrulama kodu onaylanamadı.");
        return;
      }
      setInfo(`${res.data.email} başarıyla doğrulandı.`);
      setActiveVerify(null);
      setShowVerifyOtpInput(false);
      if (res.data.user) {
        onAuthSuccess(res.data.user);
      }
    } catch {
      setError("Kod doğrulanırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: regEmail,
          phone: regPhone,
          password: regPass
        })
      });
      if (!res.ok || !res.data.user) {
        setError(res.data.error || "Kayıt olunamadı.");
        return;
      }
      onAuthSuccess(res.data.user);
      onClose();
    } catch {
      setError("Kayıt sırasında hata oluştu.");
    } finally {
      setLoading(false);
    }
  };
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: resetCode.trim(),
          newPassword: resetPass,
          verificationToken: activeReset?.verificationToken
        })
      });
      if (!res.ok) {
        setError(res.data.error || "Şifre sıfırlanamadı.");
        return;
      }
      if (res.data.user) {
        onAuthSuccess(res.data.user);
        onClose();
      } else {
        setInfo("Şifreniz güncellendi, yeni şifrenizle giriş yapabilirsiniz.");
        setTab("login");
      }
    } catch {
      setError("Şifre güncellenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };
  const sendButtonLabel = smtpConfigured ? "Onay Kodu Gönder" : gmailAuth.connected ? "Gmail ile E-Posta Gönder" : "Gmail'e Bağlan ve E-Posta Gönder";
  const renderConnectedBadge = () => {
    if (smtpConfigured || !gmailAuth.connected) return null;
    return <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
        <p className="truncate text-[11px] text-emerald-300">
          Gmail Bağlı: <strong>{gmailAuth.email || "Google Hesabı"}</strong>
        </p>
        <button
      type="button"
      onClick={handleDisconnectGmail}
      className="shrink-0 text-[11px] font-medium text-slate-300 underline-offset-2 hover:text-white hover:underline"
    >
          Çıkış
        </button>
      </div>;
  };
  const renderSendConfirmBox = (purpose) => {
    if (!pendingSendConfirm || pendingSendConfirm.purpose !== purpose) return null;
    return <div
      role="alertdialog"
      aria-label="Gmail gönderim onayı"
      className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3.5"
    >
        <p className="text-xs leading-relaxed text-slate-100">
          <strong>{pendingSendConfirm.senderEmail || gmailAuth.email || "Google hesabınız"}</strong>{" "}
          üzerinden <strong>{pendingSendConfirm.email}</strong> adresine TechCore 6 haneli onay kodu
          gönderilsin mi?
        </p>
        <div className="flex gap-2">
          <button
      type="button"
      disabled={loading}
      onClick={() => executeDispatchVerification(
        pendingSendConfirm.email,
        pendingSendConfirm.purpose,
        pendingSendConfirm.accessToken,
        pendingSendConfirm.senderEmail
      )}
      className="h-9 flex-1 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
    >
            {loading ? "Gönderiliyor..." : "Onayla ve E-Posta Gönder"}
          </button>
          <button
      type="button"
      disabled={loading}
      onClick={() => setPendingSendConfirm(null)}
      className="h-9 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-300 hover:text-white"
    >
            İptal
          </button>
        </div>
      </div>;
  };
  return <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-modal-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
  >
      <div className="custom-scroll relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-800 bg-[#0F1623] p-6 shadow-2xl">
        <button
    type="button"
    onClick={onClose}
    aria-label="Kapat"
    className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
  >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {
    /* Top Modal Mode Switcher */
  }
        <div className="mb-5 mr-8 grid grid-cols-3 gap-1 rounded-lg bg-[#090D16] p-1">
          <button
    type="button"
    onClick={() => switchTab("login")}
    className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${tab === "login" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
            Giriş Yap
          </button>
          <button
    type="button"
    onClick={() => switchTab("verify")}
    className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${tab === "verify" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
            Hesap Doğrula
          </button>
          <button
    type="button"
    onClick={() => switchTab("forgot")}
    className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${tab === "forgot" || tab === "reset" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
            Şifre Sıfırla
          </button>
        </div>

        {tab === "login" && <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
                Sisteme Giriş
              </h2>
              <div className="inline-flex rounded-lg border border-slate-800 bg-[#090D16] p-0.5 text-[11px]">
                <button
    type="button"
    onClick={() => {
      setLoginMode("password");
      setError("");
      setPendingSendConfirm(null);
    }}
    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${loginMode === "password" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
                  Şifre ile
                </button>
                <button
    type="button"
    onClick={() => {
      setLoginMode("code");
      setError("");
      setPendingSendConfirm(null);
    }}
    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${loginMode === "code" ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
  >
                  Onay Kodu ile
                </button>
              </div>
            </div>

            {loginMode === "password" ? <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    E-Posta
                  </label>
                  <input
    id="login-email-input"
    type="email"
    required
    value={loginEmail}
    onChange={(e) => setLoginEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                </div>
                <div>
                  <label htmlFor="login-pass-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    Şifre
                  </label>
                  <input
    id="login-pass-input"
    type="password"
    required
    value={loginPass}
    onChange={(e) => setLoginPass(e.target.value)}
    placeholder="Şifreniz"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                </div>

                {error && <p className="text-xs text-rose-400">{error}</p>}
                {info && <p className="text-xs text-emerald-400">{info}</p>}

                <button
    type="submit"
    disabled={loading}
    className="h-11 w-full rounded-lg bg-sky-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
                  {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
                </button>
              </form> : <div className="space-y-3.5">
                <p className="text-xs leading-relaxed text-slate-400">
                  E-posta adresinizi girin; TechCore logolu tek kullanımlık onay kodu doğrudan Gmail gelen
                  kutunuza gönderilir.
                </p>

                {renderConnectedBadge()}

                <div>
                  <label htmlFor="login-otp-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    E-Posta Adresi
                  </label>
                  <input
    id="login-otp-email"
    type="email"
    required
    value={loginEmail}
    onChange={(e) => setLoginEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(loginEmail, "login")}
    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-60"
  >
                    {!smtpConfigured && !gmailAuth.connected && <GoogleIcon />}
                    <span>
                      {connectingGoogle ? "Bağlanıyor..." : loading ? "Gönderiliyor..." : sendButtonLabel}
                    </span>
                  </button>
                  <button
    type="button"
    onClick={() => setShowLoginOtpInput((prev) => !prev)}
    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-4 text-xs font-semibold text-sky-300 hover:border-sky-500/60 hover:text-white"
  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Kod Gir</span>
                  </button>
                </div>

                {renderSendConfirmBox("login")}

                {error && <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-rose-400">{error}</p>
                    {smtpConfigured && <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(loginEmail, "login", true)}
    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white"
  >
                        <GoogleIcon />
                        <span>Alternatif: Google ile Gmail Bağla ve Gönder</span>
                      </button>}
                  </div>}
                {info && <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{info}</span>
                  </div>}

                {showLoginOtpInput && <form onSubmit={handleCodeLoginSubmit} className="space-y-3 border-t border-slate-800 pt-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Mail className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                      <span>Posta kutunuza gelen 6 haneli onay kodunu girin</span>
                    </p>
                    <div className="flex gap-2">
                      <label htmlFor="login-otp-code" className="sr-only">
                        6 haneli giriş onay kodu
                      </label>
                      <input
    id="login-otp-code"
    type="text"
    inputMode="numeric"
    maxLength={6}
    required
    value={loginOtpCode}
    onChange={(e) => setLoginOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="6 haneli kod"
    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 font-mono text-base tracking-[0.25em] text-white tabular-nums focus:border-sky-500 focus:outline-none"
  />
                      <button
    type="submit"
    disabled={loading || loginOtpCode.length !== 6}
    className="h-11 shrink-0 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
  >
                        Kod ile Giriş Yap
                      </button>
                    </div>
                  </form>}
              </div>}

            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
              <button
    type="button"
    onClick={() => switchTab("forgot")}
    className="text-slate-400 hover:text-sky-400"
  >
                Şifremi Unuttum
              </button>
              <button
    type="button"
    onClick={() => switchTab("register")}
    className="font-semibold text-sky-400 hover:text-sky-300"
  >
                Yeni Hesap Oluştur
              </button>
            </div>
          </div>}

        {tab === "verify" && <div className="space-y-4">
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
              Hesap Doğrulama
            </h2>
            <p className="text-xs leading-relaxed text-slate-400">
              E-posta adresinizi yazıp <strong className="text-slate-200">{sendButtonLabel}</strong>{" "}
              butonuna basın; TechCore onay kodu doğrudan Gmail gelen kutunuza gönderilir.
            </p>

            {renderConnectedBadge()}

            <div className="space-y-3">
              <div>
                <label htmlFor="auth-verify-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                  E-Posta Adresi
                </label>
                <input
    id="auth-verify-email"
    type="email"
    required
    value={verifyEmail}
    onChange={(e) => setVerifyEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(verifyEmail, "verify")}
    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-60"
  >
                  {!smtpConfigured && !gmailAuth.connected && <GoogleIcon />}
                  <span>
                    {connectingGoogle ? "Bağlanıyor..." : loading ? "Gönderiliyor..." : sendButtonLabel}
                  </span>
                </button>
                <button
    type="button"
    onClick={() => setShowVerifyOtpInput((prev) => !prev)}
    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-4 text-xs font-semibold text-sky-300 hover:border-sky-500/60 hover:text-white"
  >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Kod Gir</span>
                </button>
              </div>
            </div>

            {renderSendConfirmBox("verify")}

            {error && <div className="space-y-2">
                <p className="text-xs leading-relaxed text-rose-400">{error}</p>
                {smtpConfigured && <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(verifyEmail, "verify", true)}
    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white"
  >
                    <GoogleIcon />
                    <span>Alternatif: Google ile Gmail Bağla ve Gönder</span>
                  </button>}
              </div>}
            {info && <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{info}</span>
              </div>}

            {(showVerifyOtpInput || activeVerify) && <div className="space-y-3 border-t border-slate-800 pt-4">
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Mail className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>Gelen kutunuzdaki 6 haneli kodu girin ({activeVerify?.email || verifyEmail || "e-posta"})</span>
                </p>

                <form onSubmit={handleConfirmVerifyCode} className="flex gap-2">
                  <label htmlFor="auth-verify-otp" className="sr-only">
                    6 haneli doğrulama kodu
                  </label>
                  <input
    id="auth-verify-otp"
    type="text"
    inputMode="numeric"
    maxLength={6}
    required
    value={verifyCode}
    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="6 haneli kod"
    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 font-mono text-base tracking-[0.25em] text-white tabular-nums focus:border-sky-500 focus:outline-none"
  />
                  <button
    type="submit"
    disabled={loading || verifyCode.length !== 6}
    className="h-11 shrink-0 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
  >
                    Onayla
                  </button>
                </form>
              </div>}
          </div>}

        {tab === "register" && <form onSubmit={handleRegister} className="space-y-4">
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
              Yeni Hesap Oluştur
            </h2>
            <div>
              <label htmlFor="reg-email-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Gmail veya E-Posta Adresiniz
              </label>
              <input
    id="reg-email-input"
    type="email"
    required
    value={regEmail}
    onChange={(e) => setRegEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>
            <div>
              <label htmlFor="reg-phone-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Telefon Numarası
              </label>
              <input
    id="reg-phone-input"
    type="tel"
    required
    value={regPhone}
    onChange={(e) => setRegPhone(e.target.value)}
    placeholder="05XX XXX XX XX"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>
            <div>
              <label htmlFor="reg-pass-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Şifre Belirleyin
              </label>
              <input
    id="reg-pass-input"
    type="password"
    required
    value={regPass}
    onChange={(e) => setRegPass(e.target.value)}
    placeholder="En az 4 karakter"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
    type="submit"
    disabled={loading}
    className="h-11 w-full rounded-lg bg-sky-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
              {loading ? "Kaydediliyor..." : "Kayıt Ol ve Giriş Yap"}
            </button>

            <button
    type="button"
    onClick={() => switchTab("login")}
    className="w-full py-1 text-center text-xs text-slate-400 hover:text-white"
  >
              Zaten hesabınız var mı? Giriş Yapın
            </button>
          </form>}

        {tab === "forgot" && <div className="space-y-4">
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
              Şifre Sıfırlama
            </h2>
            <p className="text-xs leading-relaxed text-slate-400">
              Kayıtlı e-posta adresinizi girin; TechCore 6 haneli şifre sıfırlama onay kodu doğrudan
              Gmail posta kutunuza gönderilecektir.
            </p>

            {renderConnectedBadge()}

            <div>
              <label htmlFor="forgot-email-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Kayıtlı E-Posta Adresi
              </label>
              <input
    id="forgot-email-input"
    type="email"
    required
    value={forgotEmail}
    onChange={(e) => setForgotEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(forgotEmail, "reset")}
    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
  >
                {!smtpConfigured && !gmailAuth.connected && <GoogleIcon />}
                <span>
                  {connectingGoogle ? "Bağlanıyor..." : loading ? "Gönderiliyor..." : sendButtonLabel}
                </span>
              </button>
              <button
    type="button"
    onClick={() => switchTab("reset")}
    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-4 text-xs font-semibold text-amber-300 hover:border-amber-400/60 hover:text-white"
  >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Kod Gir</span>
              </button>
            </div>

            {renderSendConfirmBox("reset")}

            {error && <div className="space-y-2">
                <p className="text-xs leading-relaxed text-rose-400">{error}</p>
                {smtpConfigured && <button
    type="button"
    disabled={loading || connectingGoogle}
    onClick={() => void startConnectAndSendFlow(forgotEmail, "reset", true)}
    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white"
  >
                    <GoogleIcon />
                    <span>Alternatif: Google ile Gmail Bağla ve Gönder</span>
                  </button>}
              </div>}
            {info && <p className="text-xs leading-relaxed text-emerald-400">{info}</p>}

            <button
    type="button"
    onClick={() => switchTab("login")}
    className="w-full py-1 text-center text-xs text-slate-400 hover:text-white"
  >
              Giriş Ekranına Dön
            </button>
          </div>}

        {tab === "reset" && <form onSubmit={handleResetSubmit} className="space-y-4">
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
              Yeni Şifre Belirle
            </h2>
            {info && <p className="text-xs text-emerald-400">{info}</p>}
            <p className="text-xs text-slate-400">
              {activeReset?.email || forgotEmail || "E-posta"} gelen kutusundaki 6 haneli onay kodunu girin.
            </p>
            <div>
              <label htmlFor="reset-email-confirm" className="mb-1.5 block text-xs font-semibold text-slate-300">
                E-Posta Adresi
              </label>
              <input
    id="reset-email-confirm"
    type="email"
    required
    value={forgotEmail}
    onChange={(e) => setForgotEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>
            <div>
              <label htmlFor="reset-code-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                6 Haneli Onay Kodu
              </label>
              <input
    id="reset-code-input"
    type="text"
    inputMode="numeric"
    maxLength={6}
    required
    value={resetCode}
    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="000000"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 font-mono text-base tracking-widest text-white focus:border-sky-500 focus:outline-none"
  />
            </div>
            <div>
              <label htmlFor="reset-new-pass-input" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Yeni Şifreniz
              </label>
              <input
    id="reset-new-pass-input"
    type="password"
    required
    value={resetPass}
    onChange={(e) => setResetPass(e.target.value)}
    placeholder="En az 4 karakter"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
    type="submit"
    disabled={loading}
    className="h-11 w-full rounded-lg bg-emerald-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
  >
              {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
            </button>
            <button
    type="button"
    onClick={() => switchTab("forgot")}
    className="w-full py-1 text-center text-xs text-slate-400 hover:text-white"
  >
              Geri Dön
            </button>
          </form>}
      </div>
    </div>;
}
export {
  AuthModal
};
