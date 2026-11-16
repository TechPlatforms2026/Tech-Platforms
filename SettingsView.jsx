import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Copy,
  Download,
  FileDiff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Smartphone,
  User
} from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import {
  connectGmailWithGoogle,
  disconnectGmailAccount,
  subscribeGmailAuth
} from "../lib/googleGmailAuth";
import {
  checkForRealWebUpdates,
  installRealWebUpdate
} from "../lib/appUpdater";
import {
  getInstalledLockEnabled,
  getLocalLockHash,
  hashLockPassword,
  isInstalledAppMode,
  saveLocalLockHash,
  setInstalledLockEnabled
} from "./InstalledLockScreen";
import { PWAInstallButton } from "./PWAInstallButton";
const DEFAULT_PREFS = {
  liveNewsAutoRefresh: true,
  chatNotifications: true,
  emailAlerts: true,
  compactView: false
};
function SettingsView({
  user,
  stats,
  onlineNotifications,
  onUserUpdated,
  onOpenVerifyEmail,
  onOpenAuth,
  onLogout,
  onPreviewInstalledLock
}) {
  const isSignedIn = Boolean(user?.email);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [passErr, setPassErr] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [prefs, setPrefs] = useState(user?.preferences ?? DEFAULT_PREFS);
  const [prefMsg, setPrefMsg] = useState("");
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setPhone(user.phone);
      setEmail(user.email);
      setPrefs(user.preferences ?? DEFAULT_PREFS);
    }
  }, [user]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [updateError, setUpdateError] = useState("");
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [installProgressText, setInstallProgressText] = useState("");
  const [lockEnabled, setLockEnabled] = useState(() => getInstalledLockEnabled());
  const [hasLockHash, setHasLockHash] = useState(() => Boolean(getLocalLockHash()));
  const [lockNewPassword, setLockNewPassword] = useState("");
  const [lockMsg, setLockMsg] = useState("");
  const [lockErr, setLockErr] = useState("");
  const [savingLock, setSavingLock] = useState(false);
  const runningInstalled = isInstalledAppMode();
  const [gmailAuth, setGmailAuth] = useState({
    connected: false,
    email: null,
    accessToken: null
  });
  useEffect(() => subscribeGmailAuth(setGmailAuth), []);
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest(
          "/api/app/lock-status"
        );
        if (res.ok && res.data.lockHash) {
          saveLocalLockHash(res.data.lockHash);
          setHasLockHash(true);
        }
      } catch {
      }
    })();
  }, []);
  const [androidPkg, setAndroidPkg] = useState("com.techcore.app");
  const [androidSha256, setAndroidSha256] = useState(
    "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00"
  );
  const [copiedAssetLinks, setCopiedAssetLinks] = useState(false);
  const assetLinksJson = JSON.stringify(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: androidPkg.trim() || "com.techcore.app",
          sha256_cert_fingerprints: [androidSha256.trim()]
        }
      }
    ],
    null,
    2
  );
  const handleDownloadAssetLinks = () => {
    const blob = new Blob([assetLinksJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assetlinks.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleCopyAssetLinks = async () => {
    try {
      await navigator.clipboard.writeText(assetLinksJson);
      setCopiedAssetLinks(true);
      window.setTimeout(() => setCopiedAssetLinks(false), 2e3);
    } catch {
    }
  };
  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateError("");
    try {
      const res = await checkForRealWebUpdates();
      setScanResult(res);
    } catch {
      setUpdateError("Canlı web dosyaları taranırken bağlantı hatası oluştu.");
    } finally {
      setCheckingUpdates(false);
    }
  };
  const handleInstallRealUpdate = async () => {
    if (!scanResult?.hasUpdate) return;
    setInstallingUpdate(true);
    setUpdateError("");
    try {
      await installRealWebUpdate((step) => setInstallProgressText(step));
    } catch {
      setUpdateError("Güncelleme kurulurken bir hata oluştu.");
      setInstallingUpdate(false);
    }
  };
  const handleToggleAppLock = () => {
    const next = !lockEnabled;
    setLockEnabled(next);
    setInstalledLockEnabled(next);
    setLockMsg(
      next ? "TechCore şifre koruması kurulu uygulamalar için etkinleştirildi." : "TechCore açılış şifresi devre dışı bırakıldı."
    );
    setLockErr("");
  };
  const handleSaveAppLockPassword = async (e) => {
    e.preventDefault();
    setLockMsg("");
    setLockErr("");
    const clean = lockNewPassword.trim();
    if (clean.length < 4) {
      setLockErr("Kurulu uygulama şifresi en az 4 karakter olmalıdır.");
      return;
    }
    setSavingLock(true);
    try {
      const hash = await hashLockPassword(clean);
      saveLocalLockHash(hash);
      setHasLockHash(true);
      setLockEnabled(true);
      setInstalledLockEnabled(true);
      await apiRequest("/api/app/lock-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id ?? "", lockHash: hash })
      });
      setLockNewPassword("");
      setLockMsg(
        "TechCore kurulu uygulama şifresi kaydedildi ve sunucu ile senkronize edildi. Normal web tarayıcısı girişlerini etkilemez."
      );
    } catch {
      setLockErr("TechCore şifresi kaydedilemedi.");
    } finally {
      setSavingLock(false);
    }
  };
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user || !isSignedIn) return;
    setProfileMsg("");
    setProfileErr("");
    setSavingProfile(true);
    try {
      const res = await apiRequest("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, displayName, phone, email })
      });
      if (!res.ok || !res.data.user) {
        setProfileErr(res.data.error || "Profil güncellenemedi.");
        return;
      }
      onUserUpdated(res.data.user);
      setProfileMsg("Profil bilgileriniz kaydedildi.");
    } catch {
      setProfileErr("Profil güncellenirken hata oluştu.");
    } finally {
      setSavingProfile(false);
    }
  };
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!user || !isSignedIn) return;
    setPassMsg("");
    setPassErr("");
    setSavingPass(true);
    try {
      const res = await apiRequest("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword
        })
      });
      if (!res.ok || !res.data.user) {
        setPassErr(res.data.error || "Şifre değiştirilemedi.");
        return;
      }
      onUserUpdated(res.data.user);
      setCurrentPassword("");
      setNewPassword("");
      setPassMsg("Şifreniz güncellendi.");
    } catch {
      setPassErr("Şifre güncellenirken hata oluştu.");
    } finally {
      setSavingPass(false);
    }
  };
  const handleTogglePreference = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setPrefMsg("");
    if (!user || !isSignedIn) return;
    try {
      const res = await apiRequest("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, preferences: updated })
      });
      if (res.ok && res.data.user) {
        onUserUpdated(res.data.user);
        setPrefMsg("Tercihleriniz güncellendi.");
      }
    } catch {
    }
  };
  const preferenceItems = [
    {
      key: "liveNewsAutoRefresh",
      title: "Canlı İnternet Akışını Otomatik Yenile",
      desc: "Forum ekranındaki canlı Tesla ve Türkçe teknoloji haberlerini arka planda periyodik olarak günceller."
    },
    {
      key: "chatNotifications",
      title: "Canlı Sohbet Bildirimleri",
      desc: "Yeni sohbet iletileri ve AI moderasyon yanıtları için anlık görsel uyarıları açar."
    },
    {
      key: "emailAlerts",
      title: "E-Posta Durum Uyarıları",
      desc: "Başvuru onayları ve güvenlik olayları için e-posta bildirimlerini etkinleştirir."
    },
    {
      key: "compactView",
      title: "Kompakt Liste Görünümü",
      desc: "Forum ve dosya listelerinde daha yoğun satır aralığı kullanır."
    }
  ];
  const diffStatusLabel = (status) => {
    if (status === "same") return { label: "Aynı", cls: "text-emerald-400" };
    if (status === "modified") return { label: "Değişti", cls: "text-amber-400" };
    if (status === "added") return { label: "Yeni Dosya", cls: "text-sky-400" };
    return { label: "Kaldırıldı", cls: "text-rose-400" };
  };
  return <section aria-labelledby="settings-heading" className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 id="settings-heading" className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Hesap ve Sistem Ayarları
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {runningInstalled ? "Canlı dosya sürüm tarayıcısı, TechCore kurulu uygulama kilidi, profil ayarları ve Google Play TWA yapılandırması." : "TechCore kurulu uygulama kilidi, profil ayarları ve Google Play TWA yapılandırması."}
          </p>
        </div>
        {isSignedIn ? <button
    type="button"
    onClick={onLogout}
    className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
  >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Oturumu Kapat
          </button> : <button
    type="button"
    onClick={onOpenAuth}
    className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
  >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Giriş Yap / Doğrula
          </button>}
      </div>

      {
    /* Real Live Web File-Comparison Updater (Installed App Only) & TechCore Standalone Lock Row */
  }
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {
    /* Live Web Update Center — only shown when running as an installed app (PWA/APK) */
  }
        {runningInstalled && <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
                <FileDiff className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Uygulama Güncelleme Merkezi
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Canlı web sunucusundaki dosyaları SHA-256 ile tarar ve kurulu sürümle gerçek dosya farkı olup olmadığını denetler.
              </p>
            </div>
            <button
    type="button"
    disabled={checkingUpdates || installingUpdate}
    onClick={handleCheckUpdates}
    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
              <RefreshCw
    className={`h-3.5 w-3.5 ${checkingUpdates ? "animate-spin" : ""}`}
    aria-hidden="true"
  />
              {checkingUpdates ? "Dosyalar Taranıyor..." : "Güncellemeleri Kontrol Et"}
            </button>
          </div>

          {updateError && <p className="mb-3 text-xs text-rose-400">{updateError}</p>}

          {!scanResult ? <div className="rounded-lg border border-slate-800 bg-[#090D16] p-4 text-xs leading-relaxed text-slate-400">
              Canlı sunucudaki güncel HTML/JS/TS dosya özetlerini mevcut kurulu sürümünüzle karşılaştırmak için{" "}
              <strong className="text-slate-200">Güncellemeleri Kontrol Et</strong> butonuna tıklayın. Dosyalar birebir aynıysa sahte güncelleme başlatılmaz.
            </div> : <div className="space-y-4">
              <div
    className={`rounded-lg border p-4 ${scanResult.hasUpdate ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}
  >
                <p
    className={`text-xs font-semibold ${scanResult.hasUpdate ? "text-amber-300" : "text-emerald-300"}`}
  >
                  {scanResult.hasUpdate ? "Yeni Sürüm Tespit Edildi" : "Uygulamanız Güncel"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-200">{scanResult.summary}</p>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-400">
                  <span>Kaynak: {scanResult.sourceLabel}</span>
                  <span>Taranan: {scanResult.totalScanned} dosya</span>
                  <span>Farklı: {scanResult.changedCount} dosya</span>
                  <span>Yerel Kök: {scanResult.localFingerprint.slice(0, 10)}</span>
                  <span>Web Kök: {scanResult.remoteFingerprint.slice(0, 10)}</span>
                </div>
              </div>

              {scanResult.fileChecks.length > 0 && <div className="custom-scroll max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-[#090D16] divide-y divide-slate-800/80">
                  {scanResult.fileChecks.slice(0, 40).map((f) => {
    const st = diffStatusLabel(f.status);
    return <div
      key={f.path}
      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
    >
                        <span className="truncate font-mono text-slate-300">{f.path}</span>
                        <span className={`shrink-0 font-medium ${st.cls}`}>{st.label}</span>
                      </div>;
  })}
                </div>}

              {scanResult.hasUpdate && <div className="space-y-2">
                  <button
    type="button"
    disabled={installingUpdate}
    onClick={handleInstallRealUpdate}
    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-50"
  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {installingUpdate ? "Eski Dosyalar Silinip Yeniden Kuruluyor..." : "Güncellemeyi Kur (Önbelleği Sil ve Yeniden Kur)"}
                  </button>
                  {installProgressText && <p className="text-center text-xs text-sky-300">{installProgressText}</p>}
                </div>}
            </div>}
        </div>}

        {
    /* TechCore Installed-App-Only Lock Card */
  }
        <div
    className={`rounded-xl border border-slate-800 bg-[#0F1623] p-6 ${runningInstalled ? "lg:col-span-5" : "lg:col-span-12"}`}
  >
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
              <Lock className="h-4 w-4 text-sky-400" aria-hidden="true" />
              TechCore Kurulu Uygulama Şifresi
            </h2>
            <span className="text-[11px] font-medium text-sky-300">
              {runningInstalled ? "Kurulu Mod" : "Web Tarayıcı"}
            </span>
          </div>

          <div className={runningInstalled ? "space-y-4" : "grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start"}>
            <div className={runningInstalled ? "space-y-4" : "space-y-4 lg:col-span-6"}>
              <p className="text-xs leading-relaxed text-slate-400">
                Bu şifre <strong className="text-slate-200">yalnızca cihaza kurulmuş uygulama</strong> (PWA / APK / Google Play) açılışında istenir. Normal web sitesi ziyaretçilerine sorulmaz.
              </p>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#090D16] p-3.5">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Kurulu Uygulamada Şifre İste</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {hasLockHash ? "TechCore uygulama şifresi tanımlı" : "Henüz şifre belirlenmedi"}
                  </p>
                </div>
                <button
    type="button"
    role="switch"
    aria-checked={lockEnabled}
    aria-label="Kurulu uygulamada şifre iste"
    onClick={handleToggleAppLock}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${lockEnabled ? "bg-sky-500" : "bg-slate-700"}`}
  >
                  <span
    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${lockEnabled ? "translate-x-6" : "translate-x-1"}`}
  />
                </button>
              </div>
            </div>

            <form
    onSubmit={handleSaveAppLockPassword}
    className={runningInstalled ? "space-y-3" : "space-y-3 lg:col-span-6"}
  >
              <div>
                <label htmlFor="techcore-lock-settings-pass" className="mb-1 block text-xs font-semibold text-slate-300">
                  {hasLockHash ? "Yeni TechCore Şifresi Belirle" : "TechCore Şifresi Oluştur"}
                </label>
                <input
    id="techcore-lock-settings-pass"
    type="password"
    value={lockNewPassword}
    onChange={(e) => setLockNewPassword(e.target.value)}
    placeholder="En az 4 karakter"
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
              </div>

              {lockErr && <p className="text-xs text-rose-400">{lockErr}</p>}
              {lockMsg && <p className="text-xs text-emerald-400">{lockMsg}</p>}

              <div className="flex flex-wrap gap-2">
                <button
    type="submit"
    disabled={savingLock}
    className="h-9 flex-1 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
  >
                  {savingLock ? "Kaydediliyor..." : "TechCore Şifresini Kaydet"}
                </button>
                <button
    type="button"
    onClick={onPreviewInstalledLock}
    className="h-9 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60"
  >
                  Kilidi Önizle
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {
    /* Left: Profile & Password (7 cols) */
  }
        <div className="space-y-6 lg:col-span-7">
          {!isSignedIn ? <>
            <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
              <h2 className="font-display mb-2 flex items-center gap-2 text-lg font-semibold text-white">
                <User className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Kişisel Hesap Ayarları
              </h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                Profil bilgilerinizi düzenlemek, Gmail adresinizi doğrulamak veya hesap şifrenizi güncellemek için hesabınıza giriş yapın.
              </p>
              <button
    type="button"
    onClick={onOpenAuth}
    className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 hover:bg-sky-400"
  >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Giriş Yap / E-Posta Doğrula
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
              <h2 className="font-display mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-lg font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Yetki ve Çevrimiçi Bildirim Özeti
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-400">Oturum Durumu</dt>
                  <dd className="text-xs font-medium text-slate-200">Ziyaretçi</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-400">Dosya Yükleme Yetkisi</dt>
                  <dd className="text-amber-400">Onay Bekliyor</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-400">Hesap Rolü</dt>
                  <dd className="text-slate-200">Standart Üye</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-400">Kalıcı Çevrimiçi Bildirimler</dt>
                  <dd className="font-mono tabular-nums text-white">{onlineNotifications.length}</dd>
                </div>
              </dl>
            </div>
            </> : <>
              {
    /* Profile Card */
  }
              <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
                <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
                    <User className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    Profil Bilgileri
                  </h2>
                  <span
    className={`text-xs font-medium ${user?.emailVerified ? "text-emerald-400" : "text-amber-400"}`}
  >
                    {user?.emailVerified ? "E-Posta Doğrulandı" : "E-Posta Doğrulanmadı"}
                  </span>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label htmlFor="settings-display-name" className="mb-1.5 block text-xs font-semibold text-slate-300">
                      Görünen Ad
                    </label>
                    <input
    id="settings-display-name"
    type="text"
    required
    value={displayName}
    onChange={(e) => setDisplayName(e.target.value)}
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                  </div>

                  <div>
                    <label htmlFor="settings-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                      E-Posta Adresi
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
    id="settings-email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    placeholder="ornek@gmail.com"
    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                      {!user?.emailVerified && <button
    type="button"
    onClick={() => onOpenVerifyEmail(email)}
    className="h-11 shrink-0 whitespace-nowrap rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
  >
                          Doğrula
                        </button>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="settings-phone" className="mb-1.5 block text-xs font-semibold text-slate-300">
                      Telefon Numarası
                    </label>
                    <input
    id="settings-phone"
    type="tel"
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    placeholder="05XX XXX XX XX"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                  </div>

                  {profileErr && <p className="text-xs text-rose-400">{profileErr}</p>}
                  {profileMsg && <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {profileMsg}
                    </p>}

                  <button
    type="submit"
    disabled={savingProfile}
    className="h-10 rounded-lg bg-sky-500 px-5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
                    {savingProfile ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                  </button>
                </form>
              </div>

              {
    /* Password Change Card */
  }
              <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
                <h2 className="font-display mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-lg font-semibold text-white">
                  <KeyRound className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  Güvenlik ve Şifre Güncelleme
                </h2>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="settings-current-pass" className="mb-1.5 block text-xs font-semibold text-slate-300">
                        Mevcut Şifre (varsa)
                      </label>
                      <input
    id="settings-current-pass"
    type="password"
    value={currentPassword}
    onChange={(e) => setCurrentPassword(e.target.value)}
    placeholder="Mevcut şifreniz"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                    </div>
                    <div>
                      <label htmlFor="settings-new-pass" className="mb-1.5 block text-xs font-semibold text-slate-300">
                        Yeni Şifre
                      </label>
                      <input
    id="settings-new-pass"
    type="password"
    required
    value={newPassword}
    onChange={(e) => setNewPassword(e.target.value)}
    placeholder="En az 4 karakter"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                    </div>
                  </div>
                  {passErr && <p className="text-xs text-rose-400">{passErr}</p>}
                  {passMsg && <p className="text-xs text-emerald-400">{passMsg}</p>}
                  <button
    type="submit"
    disabled={savingPass}
    className="h-10 rounded-lg border border-slate-700 bg-[#090D16] px-5 text-xs font-semibold text-white transition-colors hover:border-slate-500 disabled:opacity-50"
  >
                    {savingPass ? "Güncelleniyor..." : "Şifreyi Güncelle"}
                  </button>
                </form>
              </div>
            </>}
        </div>

        {
    /* Right: Preferences, Account Status & Deployment Diagnostics (5 cols) */
  }
        <div className="space-y-6 lg:col-span-5">
          {
    /* Preferences */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
                <Sliders className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Platform Tercihleri
              </h2>
              {prefMsg && <span className="text-xs text-emerald-400">{prefMsg}</span>}
            </div>

            <div className="divide-y divide-slate-800/80">
              {preferenceItems.map((item) => {
    const enabled = prefs[item.key];
    return <div key={item.key} className="flex items-start justify-between gap-4 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.desc}</p>
                    </div>
                    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={item.title}
      onClick={() => handleTogglePreference(item.key)}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${enabled ? "bg-sky-500" : "bg-slate-700"}`}
    >
                      <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
    />
                    </button>
                  </div>;
  })}
            </div>
          </div>

          {
    /* Account Permissions & Cross-Device Online Notifications Summary (shown on right only when signed in) */
  }
          {isSignedIn && <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
            <h2 className="font-display mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-lg font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Yetki ve Çevrimiçi Bildirim Özeti
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Oturum Durumu</dt>
                <dd className="text-xs font-medium text-slate-200">
                  {user?.displayName}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Dosya Yükleme Yetkisi</dt>
                <dd
    className={user?.canUpload || user?.isAdmin || user?.emailVerified ? "font-medium text-emerald-400" : "text-amber-400"}
  >
                  {user?.canUpload || user?.isAdmin || user?.emailVerified ? "Açık" : "Onay Bekliyor"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Hesap Rolü</dt>
                <dd className="text-slate-200">{user?.isAdmin ? "Sistem Yöneticisi" : "Standart Üye"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Kalıcı Çevrimiçi Bildirimler</dt>
                <dd className="font-mono tabular-nums text-white">{onlineNotifications.length}</dd>
              </div>
            </dl>
          </div>}

          {
    /* Observational Deployment & Runtime Info */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
            <h2 className="font-display mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-lg font-semibold text-white">
              <Activity className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Sunucu ve Dağıtım Durumu
            </h2>
            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Çalışma Ortamı</dt>
                <dd className="text-right font-mono text-sky-300">
                  {stats?.runtimeMode || "Node Full-Stack"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Gemini AI</dt>
                <dd className={stats?.geminiConfigured ? "font-medium text-emerald-400" : "text-amber-400"}>
                  {stats?.geminiConfigured ? "Sunucu Anahtarı Aktif" : "İstemci Yedek Modu"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">E-Posta Taşıyıcısı</dt>
                <dd
    className={`max-w-[200px] truncate text-right ${stats?.smtpConfigured || gmailAuth.connected ? "font-medium text-emerald-400" : "text-slate-300"}`}
  >
                  {stats?.smtpConfigured ? stats.smtpProviderLabel : gmailAuth.connected ? `Gmail API (${gmailAuth.email || "Bağlı"})` : stats?.smtpProviderLabel || "Google Gmail Bağlantısı Hazır"}
                </dd>
              </div>
              <div className="pt-2">
                {gmailAuth.connected ? <button
    type="button"
    onClick={() => void disconnectGmailAccount()}
    className="h-9 w-full rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white"
  >
                    Gmail Bağlantısını Kes ({gmailAuth.email})
                  </button> : <button
    type="button"
    onClick={() => void connectGmailWithGoogle().catch(() => {
    })}
    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-100"
  >
                    <span>Google ile Gmail Bağla</span>
                  </button>}
              </div>
            </dl>
          </div>
        </div>
      </div>

      {
    /* App Install & Google Play Store TWA Publishing Center */
  }
      <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
              <Smartphone className="h-5 w-5 text-sky-400" aria-hidden="true" />
              Uygulama Kurulumu &amp; Google Play Yayın Merkezi
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              TechCore tam PWA (Progressive Web App) mimarisine sahiptir: telefonunuza veya bilgisayarınıza bağımsız uygulama olarak indirebilir, ayrıca Google Play Console için Trusted Web Activity (.aab) paketi üretebilirsiniz.
            </p>
          </div>
          <PWAInstallButton variant="card" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            <p className="text-xs font-semibold text-slate-200">Uygulama &amp; Mağaza Hazırlık Kontrolü</p>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Bağımsız Görünüm (display: standalone) ve Web Manifest aktif</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Android 192px / 512px + Maskable ve iOS 180px PNG ikonlar hazır</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Service Worker &amp; Çevrimdışı Önbellek (Workbox) yapılandırıldı</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>
                  Play Store TWA doğrulama dosyası (<code className="font-mono text-sky-300">/.well-known/assetlinks.json</code>) yayında
                </span>
              </li>
            </ul>
            <div className="rounded-lg border border-slate-800 bg-[#090D16] p-3.5 text-xs leading-relaxed text-slate-400">
              <p className="font-semibold text-slate-200">Google Play&apos;e Yükleme Adımları (.aab)</p>
              <p className="mt-1">
                1. Canlı HTTPS adresinizi (örn. Netlify URL) <strong>PWABuilder</strong> veya Google <strong>Bubblewrap CLI</strong> aracına girin.<br />
                2. Üretilen <strong>SHA-256</strong> imzasını sağdaki kutuya yapıştırıp <code className="font-mono text-slate-200">assetlinks.json</code> dosyasını indirin.<br />
                3. Çıktı alınan imzalı <code className="font-mono text-slate-200">.aab</code> paketini Google Play Console hesabınıza yükleyin.
              </p>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-7">
            <p className="text-xs font-semibold text-slate-200">
              Android Digital Asset Links (<code className="font-mono text-sky-300">assetlinks.json</code>) Oluşturucu
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="twa-pkg" className="mb-1 block text-[11px] font-medium text-slate-400">
                  Android Paket Adı (Application ID)
                </label>
                <input
    id="twa-pkg"
    type="text"
    value={androidPkg}
    onChange={(e) => setAndroidPkg(e.target.value)}
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
              <div>
                <label htmlFor="twa-sha" className="mb-1 block text-[11px] font-medium text-slate-400">
                  Play Console App Signing SHA-256
                </label>
                <input
    id="twa-sha"
    type="text"
    value={androidSha256}
    onChange={(e) => setAndroidSha256(e.target.value)}
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
            </div>
            <pre className="custom-scroll max-h-40 overflow-auto rounded-lg border border-slate-800 bg-[#090D16] p-3 font-mono text-[11px] text-sky-300">
              {assetLinksJson}
            </pre>
            <div className="flex flex-wrap gap-2.5">
              <button
    type="button"
    onClick={handleCopyAssetLinks}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-3.5 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white"
  >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copiedAssetLinks ? "Kopyalandı" : "JSON Kopyala"}
              </button>
              <button
    type="button"
    onClick={handleDownloadAssetLinks}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 text-xs font-medium text-white hover:bg-slate-700"
  >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                assetlinks.json İndir
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>;
}
export {
  SettingsView
};
