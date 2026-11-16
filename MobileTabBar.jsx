import {
  BookOpen,
  FolderUp,
  Gamepad2,
  Globe,
  MessageSquare,
  Settings,
  ShieldAlert,
  Sparkles
} from "lucide-react";
function MobileTabBar({
  activePlatform,
  activeView,
  activeGamesTab,
  isAdmin,
  onNavigate,
  onSelectPlatform,
  onSelectGamesTab
}) {
  if (activePlatform === "techgames") {
    const gameTabs = [
      { id: "arcade", label: "Oyunlar", icon: Gamepad2, active: activeGamesTab === "arcade", onClick: () => onSelectGamesTab("arcade") },
      { id: "studio", label: "AI Stüdyo", icon: Sparkles, active: activeGamesTab === "studio", onClick: () => onSelectGamesTab("studio") },
      { id: "chat", label: "Sohbet", icon: MessageSquare, active: activeGamesTab === "chat", onClick: () => onSelectGamesTab("chat") },
      { id: "techcore", label: "TechCore", icon: Globe, active: false, onClick: () => onSelectPlatform("techcore") }
    ];
    return <nav
      aria-label="Mobil alt menü"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md md:hidden"
    >
        <div className="grid h-16 grid-cols-4 items-center">
          {gameTabs.map((tab) => {
      const Icon = tab.icon;
      return <button
        key={tab.id}
        type="button"
        onClick={tab.onClick}
        className={`flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${tab.active ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
      >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </button>;
    })}
        </div>
      </nav>;
  }
  if (activePlatform === "techdocs") {
    const docTabs = [
      { id: "docs", label: "Dokümanlar", icon: BookOpen, active: true, onClick: () => onSelectPlatform("techdocs") },
      { id: "techcore", label: "TechCore", icon: Globe, active: false, onClick: () => onSelectPlatform("techcore") },
      { id: "techgames", label: "Tech Games", icon: Gamepad2, active: false, onClick: () => onSelectPlatform("techgames") }
    ];
    return <nav
      aria-label="Mobil alt menü"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md md:hidden"
    >
        <div className="grid h-16 grid-cols-3 items-center">
          {docTabs.map((tab) => {
      const Icon = tab.icon;
      return <button
        key={tab.id}
        type="button"
        onClick={tab.onClick}
        className={`flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${tab.active ? "text-sky-400" : "text-slate-400 hover:text-slate-200"}`}
      >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </button>;
    })}
        </div>
      </nav>;
  }
  const tabs = [
    { id: "home", label: "Forum", icon: Globe },
    { id: "chat", label: "Sohbet", icon: MessageSquare },
    { id: "upload", label: "Dosyalar", icon: FolderUp },
    { id: "settings", label: "Ayarlar", icon: Settings }
  ];
  if (isAdmin) {
    tabs.push({ id: "admin", label: "Yönetim", icon: ShieldAlert });
  }
  return <nav
    aria-label="Mobil alt menü"
    className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-[#090D16]/95 backdrop-blur-md md:hidden"
  >
      <div
    className={`grid h-16 items-center ${tabs.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}
  >
        {tabs.map((tab) => {
    const Icon = tab.icon;
    const active = activeView === tab.id;
    return <button
      key={tab.id}
      type="button"
      onClick={() => onNavigate(tab.id)}
      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${active ? "text-sky-400" : "text-slate-400 hover:text-slate-200"}`}
    >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </button>;
  })}
      </div>
    </nav>;
}
export {
  MobileTabBar
};
