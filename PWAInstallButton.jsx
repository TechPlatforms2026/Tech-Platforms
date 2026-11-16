import { useState } from "react";
import { CheckCircle2, Download, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
function PWAInstallButton({ variant = "compact", onInstalled }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  if (isInstalled) {
    if (variant === "card") {
      return <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Uygulama Olarak Kurulu (Bağımsız Mod)
        </div>;
    }
    return null;
  }
  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) onInstalled?.();
      return;
    }
    setShowGuideModal(true);
  };
  return <>
      <button
    type="button"
    onClick={handleInstallClick}
    className={variant === "card" ? "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-sky-500 px-5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400" : "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"}
  >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isInstallable ? "Uygulamayı İndir" : "Uygulamayı Kur"}</span>
      </button>

      {showGuideModal && <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="pwa-guide-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    onClick={(e) => {
      if (e.target === e.currentTarget) setShowGuideModal(false);
    }}
  >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0F1623] p-6 shadow-2xl">
            <button
    type="button"
    onClick={() => setShowGuideModal(false)}
    aria-label="Kapat"
    className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
  >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="mb-4 flex items-center gap-2.5">
              <Smartphone className="h-5 w-5 text-sky-400" aria-hidden="true" />
              <h3 id="pwa-guide-title" className="font-display text-lg font-semibold text-white">
                {isIOS ? "iPhone / iPad Kurulumu" : "TechCore Uygulamasını Cihaza İndir"}
              </h3>
            </div>

            {isIOS ? <ol className="space-y-2.5 text-sm leading-relaxed text-slate-300">
                <li>1. Safari alt çubuğundaki <strong>Paylaş</strong> simgesine dokunun.</li>
                <li>2. Aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğine dokunun.</li>
                <li>3. Sağ üstten <strong>Ekle</strong> butonuna basın; TechCore tam ekran uygulama olarak açılacaktır.</li>
              </ol> : <div className="space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  TechCore, tarayıcı içi önizleme dışındaki doğrudan adres çubuğundan tek tıkla <strong>Android, Windows ve macOS</strong> cihazlara kurulabilir.
                </p>
                <ol className="space-y-2 rounded-xl border border-slate-800 bg-[#090D16] p-4 text-xs text-slate-300">
                  <li>1. Netlify veya canlı site adresinizi Chrome / Edge ile doğrudan yeni sekmede açın.</li>
                  <li>2. Adres çubuğunun sağındaki <strong>Uygulamayı Yükle</strong> simgesine veya tarayıcı menüsünden <strong>Ana ekrana ekle / TechCore&apos;u yükle</strong> seçeneğine dokunun.</li>
                  <li>3. Google Play Store için <strong>Ayarlar → Android &amp; Google Play Yayın Merkezi</strong> bölümündeki adımları kullanabilirsiniz.</li>
                </ol>
              </div>}

            <button
    type="button"
    onClick={() => setShowGuideModal(false)}
    className="mt-5 h-10 w-full rounded-lg bg-slate-800 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
  >
              Anladım
            </button>
          </div>
        </div>}
    </>;
}
export {
  PWAInstallButton
};
