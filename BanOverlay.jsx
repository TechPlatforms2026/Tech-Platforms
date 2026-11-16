import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { formatCountdown } from "../lib/moderation";
function BanOverlay({ bannedUntil, reason }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, bannedUntil - Date.now()));
  useEffect(() => {
    setRemaining(Math.max(0, bannedUntil - Date.now()));
    const interval = setInterval(() => {
      setRemaining(Math.max(0, bannedUntil - Date.now()));
    }, 1e3);
    return () => clearInterval(interval);
  }, [bannedUntil]);
  if (remaining <= 0) return null;
  return <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="ban-title"
    data-testid="ban-overlay"
    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#18070B] p-6 text-center"
  >
      <Ban className="mb-4 h-16 w-16 text-rose-500" aria-hidden="true" />
      <h1 id="ban-title" className="font-display text-3xl font-bold text-white sm:text-4xl">
        Üç Günlüğüne Ban Yediniz
      </h1>
      <p className="mt-2 text-xs font-semibold tracking-wider text-rose-400 uppercase">
        Gemini 4 Hydrogen Güvenlik ve Telif Koruması
      </p>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-rose-100/90">
        {reason || "Yapay zeka güvenlik sistemi tarafından küfür, uygunsuz içerik veya telif korumalı genel dosya yükleme girişimi tespit edildi. Erişiminiz 3 gün süreyle durdurulmuştur."}
      </p>
      <div className="mt-6 rounded-xl border border-rose-500/30 bg-black/50 px-8 py-4 font-mono text-3xl font-bold text-rose-400 tabular-nums">
        {formatCountdown(remaining)}
      </div>
      <p className="mt-4 text-xs text-rose-300/70">
        Kalan süre sıfırlandığında erişiminiz otomatik olarak yeniden açılacaktır.
      </p>
    </div>;
}
export {
  BanOverlay
};
