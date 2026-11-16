import { useState } from "react";
import { Bell, LogOut, Search, Send, ShieldAlert } from "lucide-react";
function Navbar({
  activePlatform,
  activeView,
  activeGamesTab,
  onSelectPlatform,
  onNavigate,
  onSelectGamesTab,
  user,
  onlineNotifications,
  onOpenAuth,
  onOpenCommandPalette,
  onLogout,
  onPublishOnlineNotif,
  showNotifs,
  onToggleNotifs
}) {
  const isSignedIn = Boolean(user?.email);
  const unreadCount = onlineNotifications.length;
  const [newNotifText, setNewNotifText] = useState("");
  const [sendingNotif, setSendingNotif] = useState(false);
  const techCoreNavItems = [
    { id: "home", label: "Forum" },
    { id: "chat", label: "Canlı Sohbet" },
    { id: "upload", label: "Dosya Merkezi" },
    { id: "settings", label: "Ayarlar" }
  ];
  if (user?.isAdmin) {
    techCoreNavItems.push({ id: "admin", label: "Yönetim" });
  }
  const techGamesNavItems = [
    { id: "arcade", label: "Oyun Salonu" },
    { id: "studio", label: "AI Oyun Stüdyosu" },
    { id: "chat", label: "Canlı Sohbet" }
  ];
  const handleSendNotif = async (e) => {
    e.preventDefault();
    const clean = newNotifText.trim();
    if (!clean || sendingNotif) return;
    setSendingNotif(true);
    try {
      await onPublishOnlineNotif(clean);
      setNewNotifText("");
    } finally {
      setSendingNotif(false);
    }
  };
  const brandWordmark = activePlatform === "techgames" ? "TECH GAMES" : activePlatform === "techdocs" ? "TECH DOCS" : "TECHCORE";
  return <header className="z-40 border-b border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md md:sticky md:top-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        {
    /* Zone 1: Brand Wordmark */
  }
        <button
    type="button"
    onClick={() => {
      if (activePlatform === "techgames") onSelectGamesTab("arcade");
      else if (activePlatform === "techcore") onNavigate("home");
      else onSelectPlatform("techdocs");
    }}
    className={`font-display shrink-0 whitespace-nowrap text-xl font-bold tracking-tight text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${activePlatform === "techgames" ? "hover:text-emerald-400 focus-visible:outline-emerald-400" : "hover:text-sky-400 focus-visible:outline-sky-400"}`}
  >
          {brandWordmark}
        </button>

        {
    /* Zone 2: Navigation Links (Platform-specific; Tech Games omits File/Doc Center) */
  }
        <nav aria-label="Ana menü" className="hidden items-center gap-6 md:flex">
          {activePlatform === "techcore" && techCoreNavItems.map((item) => {
    const isActive = activeView === item.id;
    const isAdminLink = item.id === "admin";
    return <button
      key={item.id}
      type="button"
      onClick={() => onNavigate(item.id)}
      className={`relative shrink-0 whitespace-nowrap py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400 ${isActive ? isAdminLink ? "text-rose-400" : "text-sky-400" : isAdminLink ? "text-rose-300/80 hover:text-rose-300" : "text-slate-300 hover:text-white"}`}
    >
                  <span className="inline-flex items-center gap-1.5">
                    {isAdminLink && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.label}
                  </span>
                  {isActive && <span
      aria-hidden="true"
      className={`absolute inset-x-0 -bottom-[15px] h-0.5 ${isAdminLink ? "bg-rose-400" : "bg-sky-400"}`}
    />}
                </button>;
  })}

          {activePlatform === "techgames" && techGamesNavItems.map((item) => {
    const isActive = activeGamesTab === item.id;
    return <button
      key={item.id}
      type="button"
      onClick={() => onSelectGamesTab(item.id)}
      className={`relative shrink-0 whitespace-nowrap py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 ${isActive ? "text-emerald-400" : "text-slate-300 hover:text-white"}`}
    >
                  {item.label}
                  {isActive && <span
      aria-hidden="true"
      className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-emerald-400"
    />}
                </button>;
  })}

          {activePlatform === "techdocs" && <>
              <button
    type="button"
    onClick={() => onSelectPlatform("techdocs")}
    className="relative shrink-0 whitespace-nowrap py-1 text-sm font-medium text-sky-400"
  >
                Dokümanlar
                <span aria-hidden="true" className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-sky-400" />
              </button>
              <button
    type="button"
    onClick={() => onSelectPlatform("techcore")}
    className="shrink-0 whitespace-nowrap py-1 text-sm font-medium text-slate-300 hover:text-white"
  >
                TechCore
              </button>
              <button
    type="button"
    onClick={() => onSelectPlatform("techgames")}
    className="shrink-0 whitespace-nowrap py-1 text-sm font-medium text-slate-300 hover:text-white"
  >
                Tech Games
              </button>
            </>}
        </nav>

        {
    /* Zone 3: Quick Command + Online Notifications + Primary Account Action */
  }
        <div className="relative flex shrink-0 items-center gap-2.5">
          <button
    type="button"
    onClick={onOpenCommandPalette}
    aria-label="Hızlı arama ve komut paleti (Ctrl+K)"
    className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-800 bg-[#0F1623] px-3 text-xs font-medium text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
  >
            <Search className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span className="hidden sm:inline">Hızlı Ara</span>
            <kbd className="hidden rounded border border-slate-700 bg-[#090D16] px-1.5 py-0.5 font-mono text-[10px] text-slate-400 lg:inline">
              Ctrl K
            </kbd>
          </button>

          <button
    type="button"
    onClick={onToggleNotifs}
    aria-expanded={showNotifs}
    aria-label={`Çevrimiçi bildirimler (${unreadCount})`}
    className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700/80 bg-[#0F1623] px-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
  >
            <Bell className="h-4 w-4 text-sky-400" aria-hidden="true" />
            {isSignedIn && user && <span className="hidden max-w-[120px] truncate sm:inline">{user.displayName}</span>}
            {unreadCount > 0 && <span className="tabular-nums text-xs font-semibold text-sky-400">
                ({unreadCount})
              </span>}
          </button>

          {showNotifs && <div
    role="region"
    aria-label="Çevrimiçi bildirimler"
    className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-slate-700/90 bg-[#0F1623] p-4 shadow-2xl"
  >
              {isSignedIn && user && <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
                    <p className="truncate text-xs text-slate-400">
                      {user.email} · {user.emailVerified ? "Doğrulandı" : "Doğrulanmadı"}
                    </p>
                  </div>
                  <button
    type="button"
    onClick={onLogout}
    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Çıkış
                  </button>
                </div>}

              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-200">Çevrimiçi Bildirimler</p>
                <span className="text-[11px] text-slate-400">Tüm cihazlarda kalıcı</span>
              </div>

              <div className="custom-scroll max-h-56 space-y-2 overflow-y-auto">
                {onlineNotifications.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">
                    Henüz çevrimiçi bildirim yayınlanmadı.
                  </p> : onlineNotifications.map((notif) => <div
    key={notif.id}
    className="rounded-lg border border-slate-800 bg-[#090D16] p-2.5 text-xs leading-relaxed text-slate-300"
  >
                      <p>{notif.text}</p>
                      <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        {notif.authorName || "TechCore"} ·{" "}
                        {new Date(notif.createdAt).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })}
                      </p>
                    </div>)}
              </div>

              {isSignedIn && <form onSubmit={handleSendNotif} className="mt-3 flex gap-1.5 border-t border-slate-800 pt-3">
                  <input
    type="text"
    value={newNotifText}
    onChange={(e) => setNewNotifText(e.target.value)}
    placeholder="Tüm cihazlara bildirim yayınla..."
    className="h-9 flex-1 rounded-lg border border-slate-700 bg-[#090D16] px-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
  />
                  <button
    type="submit"
    disabled={sendingNotif || !newNotifText.trim()}
    aria-label="Bildirim yayınla"
    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-50"
  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </form>}
            </div>}

          {!isSignedIn && <button
    type="button"
    onClick={() => onOpenAuth("login")}
    className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
  >
              Giriş Yap
            </button>}
        </div>
      </div>
    </header>;
}
export {
  Navbar
};
