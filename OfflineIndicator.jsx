import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return <div
    role="status"
    aria-live="polite"
    className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#0F1623] px-3.5 py-2 text-xs font-medium text-amber-300 shadow-lg md:bottom-4"
  >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Çevrimdışı Mod — Önbelleğe alınmış veriler gösteriliyor</span>
    </div>;
}
export {
  OfflineIndicator
};
