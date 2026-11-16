import { useCallback, useEffect, useState } from "react";
import { BookOpen, Gamepad2, Server } from "lucide-react";
import { AdminView } from "./components/AdminView";
import { AuthModal } from "./components/AuthModal";
import { BanOverlay } from "./components/BanOverlay";
import { ChatView } from "./components/ChatView";
import { CommandPalette } from "./components/CommandPalette";
import { FileCenterView } from "./components/FileCenterView";
import { ForumView } from "./components/ForumView";
import { InstalledLockScreen } from "./components/InstalledLockScreen";
import { MobileTabBar } from "./components/MobileTabBar";
import { Navbar } from "./components/Navbar";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { ScrollToTop } from "./components/ScrollToTop";
import { SettingsView } from "./components/SettingsView";
import { TechDocsView } from "./components/TechDocsView";
import { TechGamesView } from "./components/TechGamesView";
import { apiRequest } from "./lib/apiClient";
import { ensureBaselineManifestRecorded } from "./lib/appUpdater";
import { BUILTIN_TECH_GAMES } from "./lib/builtinGames";
import { initGmailAuth } from "./lib/googleGmailAuth";
const SESSION_KEY = "techcore_user_id";
const LOCAL_BAN_KEY = "techcore_local_ban_v1";
function readLocalBan() {
  try {
    const raw = localStorage.getItem(LOCAL_BAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.bannedUntil > Date.now()) {
      return parsed;
    }
    localStorage.removeItem(LOCAL_BAN_KEY);
  } catch {
  }
  return null;
}
function App() {
  const [activePlatform, setActivePlatform] = useState(() => {
    if (typeof window !== "undefined") {
      const plat = new URLSearchParams(window.location.search).get("platform");
      if (plat === "techcore" || plat === "techgames" || plat === "techdocs") {
        return plat;
      }
    }
    return "techcore";
  });
  const [activeView, setActiveView] = useState(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("view");
      if (param === "home" || param === "chat" || param === "upload" || param === "settings") {
        return param;
      }
    }
    return "home";
  });
  const [activeGamesTab, setActiveGamesTab] = useState("arcade");
  const [user, setUser] = useState(null);
  const [localBan, setLocalBan] = useState(() => readLocalBan());
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [games, setGames] = useState(BUILTIN_TECH_GAMES);
  const [onlineNotifications, setOnlineNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [authPrefillEmail, setAuthPrefillEmail] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [selectedThreadFromCmd, setSelectedThreadFromCmd] = useState(null);
  const [previewLockScreen, setPreviewLockScreen] = useState(false);
  const fetchBootstrap = useCallback(async (explicitUserId) => {
    const storedId = explicitUserId ?? (localStorage.getItem(SESSION_KEY) || "");
    const qs = storedId ? `?userId=${encodeURIComponent(storedId)}` : "";
    try {
      const res = await apiRequest(`/api/bootstrap${qs}`);
      if (!res.ok) return;
      if (res.data.user?.id && res.data.user.id !== "guest-viewer" && res.data.user.email) {
        localStorage.setItem(SESSION_KEY, res.data.user.id);
      } else if (!explicitUserId) {
        localStorage.removeItem(SESSION_KEY);
      }
      if (res.data.user?.email && res.data.user.bannedUntil === 0) {
        setLocalBan((prev) => {
          if (prev && prev.userId === res.data.user?.id) {
            localStorage.removeItem(LOCAL_BAN_KEY);
            return null;
          }
          return prev;
        });
      }
      setUser(res.data.user ?? null);
      setThreads(res.data.threads ?? []);
      setMessages(res.data.messages ?? []);
      setFiles(res.data.files ?? []);
      if (Array.isArray(res.data.games) && res.data.games.length > 0) {
        setGames(res.data.games);
      }
      setOnlineNotifications(res.data.onlineNotifications ?? []);
      setStats(res.data.stats ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchBootstrap();
    void ensureBaselineManifestRecorded();
    const unsubGmail = initGmailAuth();
    return () => {
      unsubGmail();
    };
  }, [fetchBootstrap]);
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((p) => !p);
      } else if (e.key === "Escape") {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const openAuthModal = (tab = "login", prefill = "") => {
    setAuthTab(tab);
    setAuthPrefillEmail(prefill);
    setShowAuthModal(true);
  };
  const handleSelectPlatform = (platform) => {
    setShowNotifs(false);
    setActivePlatform(platform);
    if (platform === "techgames") {
      setActiveGamesTab("arcade");
    }
  };
  const handleNavigate = (view) => {
    setShowNotifs(false);
    if (view === "admin" && !user?.isAdmin) {
      openAuthModal("login");
      return;
    }
    setActivePlatform("techcore");
    setActiveView(view);
  };
  const handleAuthSuccess = async (authenticatedUser) => {
    localStorage.setItem(SESSION_KEY, authenticatedUser.id);
    setUser(authenticatedUser);
    await fetchBootstrap(authenticatedUser.id);
    if (authenticatedUser.isAdmin) {
      setActivePlatform("techcore");
      setActiveView("admin");
    }
  };
  const handleLogout = async () => {
    localStorage.removeItem(SESSION_KEY);
    setShowNotifs(false);
    setActivePlatform("techcore");
    setActiveView("home");
    await fetchBootstrap("");
  };
  const handlePublishOnlineNotif = async (text) => {
    const res = await apiRequest("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user?.id ?? "", text })
    });
    if (res.ok && Array.isArray(res.data.notifications)) {
      setOnlineNotifications(res.data.notifications);
    }
  };
  const handleUserBanned = useCallback(
    (bannedUntil, reason) => {
      const banRecord = {
        userId: user?.id || "guest-viewer",
        bannedUntil,
        reason
      };
      try {
        localStorage.setItem(LOCAL_BAN_KEY, JSON.stringify(banRecord));
      } catch {
      }
      setLocalBan(banRecord);
      setUser((prev) => prev ? { ...prev, bannedUntil, banReason: reason } : prev);
    },
    [user?.id]
  );
  const liveNewsAutoRefresh = user?.preferences?.liveNewsAutoRefresh ?? true;
  const compactView = user?.preferences?.compactView ?? false;
  const now = Date.now();
  const activeBanUntil = user && user.bannedUntil > now ? user.bannedUntil : localBan && localBan.bannedUntil > now ? localBan.bannedUntil : 0;
  const activeBanReason = user && user.bannedUntil > now ? user.banReason : localBan && localBan.bannedUntil > now ? localBan.reason : void 0;
  return <div className="flex min-h-screen flex-col bg-[#090D16] text-slate-100">
      <InstalledLockScreen
    forcePreview={previewLockScreen}
    onExitPreview={() => setPreviewLockScreen(false)}
  />

      <Navbar
    activePlatform={activePlatform}
    activeView={activeView}
    activeGamesTab={activeGamesTab}
    onSelectPlatform={handleSelectPlatform}
    onNavigate={handleNavigate}
    onSelectGamesTab={setActiveGamesTab}
    user={user}
    onlineNotifications={onlineNotifications}
    onOpenAuth={(tab) => openAuthModal(tab ?? "login", user?.email ?? "")}
    onOpenCommandPalette={() => setShowCommandPalette(true)}
    onLogout={handleLogout}
    onPublishOnlineNotif={handlePublishOnlineNotif}
    showNotifs={showNotifs}
    onToggleNotifs={() => setShowNotifs((p) => !p)}
  />

      <main className="flex-1 px-4 pt-5 pb-24 sm:px-6 sm:py-7 lg:px-8">
        {
    /* Tech Platforms Segmented Switcher */
  }
        <div className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#0B111E] px-4 py-2.5">
          <span className="font-display text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Tech Platforms
          </span>
          <div role="navigation" aria-label="Tech Platforms sunucu seçimi" className="flex flex-wrap gap-1.5">
            <button
    type="button"
    onClick={() => handleSelectPlatform("techcore")}
    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors ${activePlatform === "techcore" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
  >
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              TechCore
            </button>
            <button
    type="button"
    onClick={() => handleSelectPlatform("techgames")}
    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors ${activePlatform === "techgames" ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
  >
              <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
              Tech Games
            </button>
            <button
    type="button"
    onClick={() => handleSelectPlatform("techdocs")}
    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors ${activePlatform === "techdocs" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
  >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Tech Documentations
            </button>
          </div>
        </div>

        {loading ? <div className="mx-auto max-w-7xl space-y-6">
            <div className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-[#0F1623]" />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="h-72 animate-pulse rounded-xl border border-slate-800 bg-[#0F1623] lg:col-span-8" />
              <div className="h-72 animate-pulse rounded-xl border border-slate-800 bg-[#0F1623] lg:col-span-4" />
            </div>
          </div> : <>
            {activePlatform === "techcore" && <>
                {activeView === "home" && <ForumView
    userId={user?.id ?? ""}
    threads={threads}
    stats={stats}
    liveNewsAutoRefresh={liveNewsAutoRefresh}
    compactView={compactView}
    selectedThreadFromCmd={selectedThreadFromCmd}
    onClearSelectedThreadFromCmd={() => setSelectedThreadFromCmd(null)}
    onThreadCreated={() => fetchBootstrap()}
    onNavigate={handleNavigate}
    onSwitchPlatform={handleSelectPlatform}
    onUserBanned={handleUserBanned}
  />}

                {activeView === "chat" && <ChatView
    userId={user?.id ?? ""}
    messages={messages}
    mode="techcore"
    onMessagesUpdated={setMessages}
    onUserBanned={handleUserBanned}
  />}

                {activeView === "upload" && <FileCenterView
    user={user}
    files={files}
    compactView={compactView}
    onRefreshBootstrap={() => fetchBootstrap()}
    onOpenVerifyAuth={(email) => openAuthModal("verify", email || user?.email || "")}
    onUserBanned={handleUserBanned}
  />}

                {activeView === "settings" && <SettingsView
    user={user}
    stats={stats}
    onlineNotifications={onlineNotifications}
    onUserUpdated={setUser}
    onOpenVerifyEmail={(email) => openAuthModal("verify", email)}
    onOpenAuth={() => openAuthModal("login", user?.email ?? "")}
    onLogout={handleLogout}
    onPreviewInstalledLock={() => setPreviewLockScreen(true)}
  />}

                {activeView === "admin" && user?.isAdmin && <AdminView
    adminUser={user}
    onRefreshBootstrap={() => fetchBootstrap()}
  />}
              </>}

            {activePlatform === "techgames" && <TechGamesView
    userId={user?.id ?? ""}
    games={games}
    messages={messages}
    activeTab={activeGamesTab}
    onTabChange={setActiveGamesTab}
    onGamesUpdated={setGames}
    onMessagesUpdated={setMessages}
    onUserBanned={handleUserBanned}
  />}

            {activePlatform === "techdocs" && <TechDocsView onSwitchPlatform={handleSelectPlatform} />}
          </>}
      </main>

      <footer className="hidden border-t border-slate-800/80 px-6 py-5 text-xs text-slate-500 md:block">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <span>Tech Platforms · TechCore · Tech Games · Tech Documentations</span>
          <div className="flex items-center gap-4">
            <button
    type="button"
    onClick={() => handleSelectPlatform("techcore")}
    className="hover:text-slate-300"
  >
              TechCore
            </button>
            <button
    type="button"
    onClick={() => handleSelectPlatform("techgames")}
    className="hover:text-slate-300"
  >
              Tech Games
            </button>
            <button
    type="button"
    onClick={() => handleSelectPlatform("techdocs")}
    className="hover:text-slate-300"
  >
              Tech Documentations
            </button>
          </div>
        </div>
      </footer>

      <CommandPalette
    open={showCommandPalette}
    onClose={() => setShowCommandPalette(false)}
    threads={threads}
    files={files}
    isAdmin={Boolean(user?.isAdmin)}
    onSelectPlatform={handleSelectPlatform}
    onNavigate={handleNavigate}
    onSelectThread={(thr) => setSelectedThreadFromCmd(thr)}
    onOpenVerify={() => openAuthModal("verify", user?.email ?? "")}
  />

      <AuthModal
    open={showAuthModal}
    initialTab={authTab}
    prefillEmail={authPrefillEmail}
    userId={user?.id ?? ""}
    smtpConfigured={Boolean(stats?.smtpConfigured)}
    onClose={() => setShowAuthModal(false)}
    onAuthSuccess={handleAuthSuccess}
  />

      {activeBanUntil > 0 && <BanOverlay bannedUntil={activeBanUntil} reason={activeBanReason} />}

      <OfflineIndicator />
      <ScrollToTop />
      <MobileTabBar
    activePlatform={activePlatform}
    activeView={activeView}
    activeGamesTab={activeGamesTab}
    isAdmin={Boolean(user?.isAdmin)}
    onNavigate={handleNavigate}
    onSelectPlatform={handleSelectPlatform}
    onSelectGamesTab={setActiveGamesTab}
  />
    </div>;
}
export {
  App as default
};
