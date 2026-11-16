import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  Bot,
  Check,
  Copy,
  Cpu,
  Gamepad2,
  Globe,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Server,
  Share2,
  ShieldCheck,
  Star,
  X
} from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import heroTechcoreImg from "../assets/images/hero_techcore_server_1794634839930.jpg";
import { PWAInstallButton } from "./PWAInstallButton";
const CATEGORIES = ["Tümü", "Donanım", "Yapay Zeka", "Güvenlik", "Sunucu"];
const POST_CATEGORIES = [
  "Donanım",
  "Yapay Zeka",
  "Güvenlik",
  "Sunucu"
];
const LIVE_SOURCES = [
  "Tümü",
  "Tesla (Canlı)",
  "Türkçe Haberler",
  "DEV Community",
  "Hacker News",
  "GitHub Trend",
  "Google Arama (Canlı)"
];
const BOOKMARKS_KEY = "techcore_bookmarks_v1";
function ForumView({
  userId,
  threads,
  stats,
  liveNewsAutoRefresh = true,
  compactView = false,
  selectedThreadFromCmd,
  onClearSelectedThreadFromCmd,
  onThreadCreated,
  onNavigate,
  onSwitchPlatform,
  onUserBanned
}) {
  const [selectedCategory, setSelectedCategory] = useState("Tümü");
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [copiedThreadId, setCopiedThreadId] = useState(null);
  const [sortMode, setSortMode] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeThread, setActiveThread] = useState(null);
  const [liveTopicInput, setLiveTopicInput] = useState("");
  const [liveSourceFilter, setLiveSourceFilter] = useState("Tümü");
  const [liveData, setLiveData] = useState(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [liveError, setLiveError] = useState("");
  const [importingNewsId, setImportingNewsId] = useState(null);
  const [importedNewsIds, setImportedNewsIds] = useState({});
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Donanım");
  const [newBody, setNewBody] = useState("");
  const [submittingThread, setSubmittingThread] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [analyzingThread, setAnalyzingThread] = useState(false);
  const [analysisSources, setAnalysisSources] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiSources, setAiSources] = useState([]);
  const [aiEngine, setAiEngine] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  useEffect(() => {
    if (selectedThreadFromCmd) {
      setActiveThread(selectedThreadFromCmd);
      onClearSelectedThreadFromCmd?.();
    }
  }, [selectedThreadFromCmd, onClearSelectedThreadFromCmd]);
  const fetchLiveNews = useCallback(async (topic) => {
    setLoadingLive(true);
    setLiveError("");
    try {
      const cleanTopic = (topic ?? "").trim();
      const qs = cleanTopic ? `?q=${encodeURIComponent(cleanTopic)}` : "";
      const res = await apiRequest(`/api/news/live${qs}`);
      if (!res.ok) {
        setLiveError(res.data.error || "Canlı teknoloji akışı alınamadı.");
        return;
      }
      setLiveData(res.data);
    } catch {
      setLiveError("Canlı internet akışı şu an geçici olarak meşgul.");
    } finally {
      setLoadingLive(false);
    }
  }, []);
  useEffect(() => {
    fetchLiveNews();
  }, [fetchLiveNews]);
  useEffect(() => {
    if (!liveNewsAutoRefresh) return;
    const timer = window.setInterval(() => {
      fetchLiveNews(liveTopicInput);
    }, 6e4);
    return () => window.clearInterval(timer);
  }, [liveNewsAutoRefresh, liveTopicInput, fetchLiveNews]);
  const handleLiveSearchSubmit = (e) => {
    e.preventDefault();
    fetchLiveNews(liveTopicInput);
  };
  const handleImportNewsToForum = async (item) => {
    setImportingNewsId(item.id);
    try {
      const res = await apiRequest("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: item.title,
          category: item.category,
          body: `${item.summary}

Kaynak: ${item.sourceName} (${item.publishedAt})`,
          sourceUrl: item.url,
          sourceTitle: item.sourceName
        })
      });
      if (res.data.banned && res.data.bannedUntil) {
        onUserBanned(res.data.bannedUntil, res.data.error || "Politika ihlali");
        return;
      }
      if (res.ok) {
        setImportedNewsIds((prev) => ({ ...prev, [item.id]: true }));
        await onThreadCreated();
      }
    } finally {
      setImportingNewsId(null);
    }
  };
  const handleToggleUpvote = async (threadId) => {
    const res = await apiRequest(`/api/forum/${encodeURIComponent(threadId)}/upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    if (res.ok && res.data.thread) {
      if (activeThread?.id === threadId) {
        setActiveThread(res.data.thread);
      }
      await onThreadCreated();
    }
  };
  const handleAnalyzeThread = async (thread) => {
    setAnalyzingThread(true);
    setAnalysisSources([]);
    try {
      const res = await apiRequest(`/api/forum/${encodeURIComponent(thread.id)}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      if (res.ok && res.data.thread) {
        setActiveThread(res.data.thread);
        setAnalysisSources(Array.isArray(res.data.sources) ? res.data.sources : []);
        await onThreadCreated();
      }
    } finally {
      setAnalyzingThread(false);
    }
  };
  const toggleBookmark = (threadId) => {
    setBookmarkedIds((prev) => {
      const next = prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [threadId, ...prev];
      try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  };
  const handleCopyThreadLink = async (thread) => {
    const shareText = `${thread.title} — ${window.location.origin}/?view=home`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedThreadId(thread.id);
      window.setTimeout(() => setCopiedThreadId(null), 2e3);
    } catch {
    }
  };
  const filteredLiveItems = (liveData?.items ?? []).filter(
    (item) => liveSourceFilter === "Tümü" || item.sourceName === liveSourceFilter
  );
  const filteredThreads = threads.filter((t) => {
    const matchesCategory = selectedCategory === "Tümü" || t.category === selectedCategory;
    const matchesBookmark = !onlyBookmarked || bookmarkedIds.includes(t.id);
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.authorName.toLowerCase().includes(q);
    return matchesCategory && matchesBookmark && matchesQuery;
  }).sort((a, b) => {
    if (sortMode === "popular") {
      return (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0);
    }
    if (sortMode === "discussed") {
      return b.replies.length - a.replies.length;
    }
    return b.createdAt - a.createdAt;
  });
  const handleCreateThread = async (e) => {
    e.preventDefault();
    setThreadError("");
    setSubmittingThread(true);
    try {
      const res = await apiRequest("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: newTitle,
          category: newCategory,
          body: newBody
        })
      });
      if (res.data.banned && res.data.bannedUntil) {
        setShowNewModal(false);
        onUserBanned(res.data.bannedUntil, res.data.error || "Kural ihlali");
        return;
      }
      if (!res.ok) {
        setThreadError(res.data.error || "Konu oluşturulamadı.");
        return;
      }
      setNewTitle("");
      setNewBody("");
      setShowNewModal(false);
      await onThreadCreated();
    } catch {
      setThreadError("Konu yayınlanırken bir hata oluştu.");
    } finally {
      setSubmittingThread(false);
    }
  };
  const handleAddReply = async (e) => {
    e.preventDefault();
    if (!activeThread) return;
    setReplyError("");
    setSubmittingReply(true);
    try {
      const res = await apiRequest(`/api/forum/${activeThread.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, body: replyText })
      });
      if (res.data.banned && res.data.bannedUntil) {
        setActiveThread(null);
        onUserBanned(res.data.bannedUntil, res.data.error || "Kural ihlali");
        return;
      }
      if (!res.ok) {
        setReplyError(res.data.error || "Yanıt gönderilemedi.");
        return;
      }
      setReplyText("");
      if (res.data.thread) {
        setActiveThread(res.data.thread);
      }
      await onThreadCreated();
    } catch {
      setReplyError("Yanıt gönderilirken hata oluştu.");
    } finally {
      setSubmittingReply(false);
    }
  };
  const handleAskAi = async (e) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    setAskingAi(true);
    try {
      const res = await apiRequest("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: aiQuestion })
      });
      setAiAnswer(res.data.answer || res.data.error || "Yanıt oluşturulamadı.");
      setAiSources(Array.isArray(res.data.sources) ? res.data.sources : []);
      setAiEngine(res.data.engine || "");
    } catch {
      setAiAnswer("Yapay zeka servisine şu an ulaşılamıyor.");
      setAiSources([]);
    } finally {
      setAskingAi(false);
    }
  };
  const formatDate = (ts) => new Date(ts).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  return <div className="mx-auto max-w-7xl space-y-8">
      {
    /* Hero Banner */
  }
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0F1623]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F1623] via-[#0B1220] to-[#090D16]" />
        <img
    src={heroTechcoreImg}
    alt="TechCore modern veri merkezi sunucu koridoru"
    referrerPolicy="no-referrer"
    className="absolute inset-0 h-full w-full object-cover opacity-40"
  />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090D16]/95 via-[#090D16]/85 to-[#090D16]/45" />

        <div className="relative z-10 flex flex-col justify-between gap-6 p-7 sm:p-10 lg:flex-row lg:items-end">
          <div className="max-w-2xl space-y-3">
            <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              TechCore Canlı Teknoloji ve Dosya Sunucusu
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Gerçek zamanlı Tesla ve Türkçe teknoloji haberleri, DEV Community, Hacker News, GitHub Trend ve
              Google Arama destekli canlı internet akışı, çok kanallı WebSocket sohbeti ve SHA-256 doğrulamalı
              dosya merkezi.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
    type="button"
    onClick={() => setShowNewModal(true)}
    className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
  >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Yeni Konu Aç
              </button>
              <button
    type="button"
    onClick={() => onNavigate("chat")}
    className="inline-flex h-11 items-center whitespace-nowrap rounded-lg border border-slate-700 bg-[#090D16]/80 px-4 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
  >
                Canlı Sohbete Katıl
              </button>
              <button
    type="button"
    onClick={() => onNavigate("settings")}
    className="inline-flex h-11 items-center whitespace-nowrap rounded-lg border border-slate-700 bg-[#090D16]/80 px-4 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
  >
                Hesap Ayarları
              </button>
              <PWAInstallButton />
            </div>
          </div>
        </div>
      </section>

      {
    /* Tech Games Promotional Ad Banner inside TechCore Update */
  }
      {onSwitchPlatform && <section
    aria-label="Tech Games duyurusu"
    className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#0B161A] p-5 sm:p-6"
  >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Gamepad2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                  Tech Platforms · Yeni Sunucu Yayında
                </p>
                <h2 className="font-display mt-0.5 text-lg font-bold text-white sm:text-xl">
                  Tech Games v1 — Oyna, İndir ve Gemini 4 Hydrogen ile Oyun Tasarla
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">
                  Hazır HTML5 oyun salonuna katıl, yapay zeka ile sıfırdan özgün oyunlar üret ve toplulukla paylaş.
                </p>
              </div>
            </div>

            <button
    type="button"
    onClick={() => onSwitchPlatform("techgames")}
    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
  >
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              Tech Games&apos;i Aç
            </button>
          </div>
        </section>}

      {
    /* Platform Summary Strip */
  }
      <section aria-label="Platform özeti" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800/90 bg-[#0F1623] p-4">
          <p className="text-xs font-medium text-slate-400">Canlı İnternet Akışı</p>
          <p className="font-mono mt-1 text-xl font-semibold text-white tabular-nums">
            {liveData?.items.length ?? 0} Akış
          </p>
          <p className="mt-0.5 text-xs text-sky-400">Tesla · Türkçe · DEV · HN · GitHub</p>
        </div>
        <div className="rounded-xl border border-slate-800/90 bg-[#0F1623] p-4">
          <p className="text-xs font-medium text-slate-400">Aktif Tartışma</p>
          <p className="font-mono mt-1 text-xl font-semibold text-white tabular-nums">
            {stats?.totalThreads ?? threads.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">AI Destekli Analiz</p>
        </div>
        <div className="rounded-xl border border-slate-800/90 bg-[#0F1623] p-4">
          <p className="text-xs font-medium text-slate-400">Dosya Kasası</p>
          <p className="font-mono mt-1 text-xl font-semibold text-white tabular-nums">
            {stats?.totalFiles ?? 0} Dosya
          </p>
          <p className="mt-0.5 text-xs text-emerald-400">SHA-256 Doğrulamalı</p>
        </div>
        <div className="rounded-xl border border-slate-800/90 bg-[#0F1623] p-4">
          <p className="text-xs font-medium text-slate-400">Yer İşaretlerim</p>
          <p className="font-mono mt-1 text-xl font-semibold text-white tabular-nums">
            {bookmarkedIds.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Çevrimdışı Hazır</p>
        </div>
      </section>

      {
    /* Main 2-Column Content */
  }
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {
    /* Left: Multi-Source Live Internet Tech Feed + Forum Discussions (8 cols) */
  }
        <div className="space-y-8 lg:col-span-8">
          {
    /* Live Internet Tech Feed */
  }
          <section
    aria-labelledby="live-feed-heading"
    className="rounded-xl border border-slate-800 bg-[#0F1623] p-5 sm:p-6"
  >
            <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
              <div>
                <h2
    id="live-feed-heading"
    className="font-display flex items-center gap-2 text-lg font-semibold text-white"
  >
                  <Globe className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  İnternetten Canlı Teknoloji Akışı
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {liveData?.liveConnected ? `Canlı bağlantı aktif · ${liveData.items.length} akış öğesi · Son güncelleme ${formatDate(liveData.fetchedAt)}` : "Tesla, Türkçe Haberler, DEV Community, Hacker News, GitHub ve Google Arama kaynakları senkronize edilir"}
                </p>
              </div>
              <button
    type="button"
    onClick={() => fetchLiveNews(liveTopicInput)}
    disabled={loadingLive}
    className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 hover:text-white disabled:opacity-50 sm:self-auto"
  >
                <RefreshCw
    className={`h-3.5 w-3.5 ${loadingLive ? "animate-spin text-sky-400" : ""}`}
    aria-hidden="true"
  />
                Canlı Akışı Yenile
              </button>
            </div>

            <form onSubmit={handleLiveSearchSubmit} className="mb-4 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="live-topic-search" className="sr-only">
                İnternette canlı teknoloji konusu ara
              </label>
              <div className="relative flex-1">
                <Search
    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
    aria-hidden="true"
  />
                <input
    id="live-topic-search"
    type="search"
    value={liveTopicInput}
    onChange={(e) => setLiveTopicInput(e.target.value)}
    placeholder="İnternetten canlı ara (örn: Tesla, RTX 5090, Linux kernel, Gemini, Rust)..."
    className="h-10 w-full rounded-lg border border-slate-800 bg-[#090D16] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
              </div>
              <button
    type="submit"
    disabled={loadingLive}
    className="h-10 shrink-0 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
                {loadingLive ? "Çekiliyor..." : "Canlı Ara"}
              </button>
            </form>

            {
    /* Source Filter Bar */
  }
            <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-[#090D16] p-1">
              {LIVE_SOURCES.map((src) => <button
    key={src}
    type="button"
    onClick={() => setLiveSourceFilter(src)}
    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${liveSourceFilter === src ? "bg-slate-800 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
  >
                  {src === "Google Arama (Canlı)" ? "Google Arama" : src}
                </button>)}
            </div>

            {liveError && <p className="mb-3 text-xs text-rose-400">{liveError}</p>}

            {liveData?.groundedSummary && <div className="mb-5 rounded-lg border border-sky-500/30 bg-[#090D16] p-4">
                <p className="mb-1.5 text-xs font-semibold text-sky-400">
                  Canlı Web Özeti (Google Arama + Gemini)
                </p>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
                  {liveData.groundedSummary}
                </p>
                {liveData.groundedSources.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-800 pt-2.5 text-xs">
                    {liveData.groundedSources.map((src) => <a
    key={src.url}
    href={src.url}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
  >
                        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="max-w-[200px] truncate">{src.title}</span>
                      </a>)}
                  </div>}
              </div>}

            {loadingLive && !liveData ? <div className="space-y-3">
                <div className="h-16 animate-pulse rounded-lg bg-[#090D16]" />
                <div className="h-16 animate-pulse rounded-lg bg-[#090D16]" />
                <div className="h-16 animate-pulse rounded-lg bg-[#090D16]" />
              </div> : filteredLiveItems.length > 0 ? <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#090D16]">
                {filteredLiveItems.slice(0, 12).map((item) => {
    const isImported = Boolean(importedNewsIds[item.id]);
    const isImporting = importingNewsId === item.id;
    return <article
      key={item.id}
      className={`flex flex-col justify-between gap-3 sm:flex-row sm:items-center ${compactView ? "px-3.5 py-2.5" : "px-4 py-3.5"}`}
    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-medium text-sky-400">{item.sourceName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{item.publishedAt}</span>
                          {typeof item.stars === "number" && <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-mono text-amber-300 tabular-nums">
                                <Star className="h-3 w-3" aria-hidden="true" />
                                {item.stars.toLocaleString("tr-TR")}
                              </span>
                            </>}
                        </div>
                        <h3 className="text-sm font-semibold text-white">
                          <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 transition-colors hover:text-sky-400"
    >
                            <span>{item.title}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          </a>
                        </h3>
                        <p className="line-clamp-1 text-xs text-slate-400">{item.summary}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
      type="button"
      disabled={isImporting || isImported}
      onClick={() => handleImportNewsToForum(item)}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors ${isImported ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-slate-700 bg-[#0F1623] text-slate-200 hover:border-sky-500/60 hover:text-white"}`}
    >
                          {isImported ? <>
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              Aktarıldı
                            </> : <>
                              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {isImporting ? "Aktarılıyor..." : "Foruma Aktar"}
                            </>}
                        </button>
                      </div>
                    </article>;
  })}
              </div> : <p className="text-xs text-slate-400">
                Seçili kaynak filtresinde sonuç bulunamadı. "Tümü" sekmesine geçin veya "Canlı Akışı Yenile" butonuna tıklayın.
              </p>}
          </section>

          {
    /* Forum Discussions */
  }
          <section aria-labelledby="forum-list-heading" className="space-y-5">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
              <h2 id="forum-list-heading" className="font-display text-xl font-semibold text-white">
                Son Tartışmalar
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="forum-sort-select" className="sr-only">
                  Sıralama
                </label>
                <select
    id="forum-sort-select"
    value={sortMode}
    onChange={(e) => setSortMode(e.target.value)}
    className="h-10 rounded-lg border border-slate-800 bg-[#0F1623] px-3 text-xs font-medium text-slate-200 focus:border-sky-500 focus:outline-none"
  >
                  <option value="newest">En Yeni</option>
                  <option value="popular">En Beğenilen</option>
                  <option value="discussed">En Çok Yanıtlanan</option>
                </select>
                <div className="relative w-full sm:w-56">
                  <Search
    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
    aria-hidden="true"
  />
                  <label htmlFor="forum-search" className="sr-only">
                    Konularda ara
                  </label>
                  <input
    id="forum-search"
    type="search"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder="Konu veya yazar ara..."
    className="h-10 w-full rounded-lg border border-slate-800 bg-[#0F1623] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
                </div>
              </div>
            </div>

            {
    /* Segmented Category & Bookmark Filter */
  }
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0F1623] p-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {CATEGORIES.map((cat) => <button
    key={cat}
    type="button"
    onClick={() => {
      setSelectedCategory(cat);
      setOnlyBookmarked(false);
    }}
    className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${selectedCategory === cat && !onlyBookmarked ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
                    {cat}
                  </button>)}
              </div>
              <button
    type="button"
    onClick={() => setOnlyBookmarked((p) => !p)}
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${onlyBookmarked ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
  >
                <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                Kaydedilenler ({bookmarkedIds.length})
              </button>
            </div>

            {
    /* Thread List */
  }
            {filteredThreads.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-10 text-center">
                <p className="text-sm font-medium text-slate-300">Aramanızla eşleşen tartışma bulunamadı.</p>
                <button
    type="button"
    onClick={() => {
      setSelectedCategory("Tümü");
      setSearchQuery("");
    }}
    className="mt-3 text-xs font-medium text-sky-400 hover:underline"
  >
                  Filtreleri Temizle
                </button>
              </div> : <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-[#0F1623]">
                {filteredThreads.map((thread) => {
    const upvotes = thread.upvotes ?? [];
    const hasUpvoted = Boolean(userId && upvotes.includes(userId));
    return <article
      key={thread.id}
      className={`flex gap-4 transition-colors hover:bg-slate-900/60 ${compactView ? "p-3.5" : "p-5"}`}
    >
                      <button
      type="button"
      onClick={() => handleToggleUpvote(thread.id)}
      aria-label={`Faydalı oyu ver (${upvotes.length})`}
      aria-pressed={hasUpvoted}
      className={`flex h-14 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${hasUpvoted ? "border-sky-500/60 bg-sky-500/15 text-sky-300" : "border-slate-800 bg-[#090D16] text-slate-400 hover:border-slate-600 hover:text-white"}`}
    >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="mt-0.5 font-mono tabular-nums">{upvotes.length}</span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-medium text-sky-400">{thread.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{thread.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatDate(thread.createdAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{thread.replies.length} yanıt</span>
                        </div>
                        <h3 className="font-display mt-1.5 text-lg font-semibold text-white">
                          <button
      type="button"
      onClick={() => {
        setActiveThread(thread);
        setAnalysisSources([]);
      }}
      className="text-left transition-colors hover:text-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
    >
                            {thread.title}
                          </button>
                        </h3>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-400">
                          {thread.body}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          {thread.sourceUrl && <a
      href={thread.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
    >
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                              {thread.sourceTitle || "Dış Kaynağa Git"}
                            </a>}
                          <button
      type="button"
      onClick={() => toggleBookmark(thread.id)}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${bookmarkedIds.includes(thread.id) ? "text-sky-400" : "text-slate-500 hover:text-slate-200"}`}
    >
                            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                            {bookmarkedIds.includes(thread.id) ? "Kaydedildi" : "Kaydet"}
                          </button>
                          <button
      type="button"
      onClick={() => handleCopyThreadLink(thread)}
      className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-200"
    >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            {copiedThreadId === thread.id ? "Kopyalandı" : "Paylaş"}
                          </button>
                        </div>
                      </div>
                    </article>;
  })}
              </div>}
          </section>
        </div>

        {
    /* Right Sidebar: Server Stats + Gemini AI Technical Assistant (4 cols) */
  }
        <aside className="space-y-6 lg:col-span-4">
          {
    /* Real Server Overview */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-base font-semibold text-white">Sunucu Özeti</h2>
              <Server className="h-4 w-4 text-sky-400" aria-hidden="true" />
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">AI Güvenlik Motoru</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium text-sky-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {stats?.geminiConfigured ? "Gemini AI Aktif" : "Ön Filtre Aktif"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">İnternet Akışı</dt>
                <dd className="font-medium text-emerald-400">
                  {liveData?.liveConnected ? "Canlı Bağlı" : "Hazır"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Doğrulanmış E-Posta</dt>
                <dd className="font-mono font-semibold text-white tabular-nums">
                  {stats?.verifiedEmails ?? 0}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Toplam Tartışma</dt>
                <dd className="font-mono font-semibold text-white tabular-nums">
                  {stats?.totalThreads ?? threads.length}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Taranmış Dosya</dt>
                <dd className="font-mono font-semibold text-white tabular-nums">
                  {stats?.totalFiles ?? 0}
                </dd>
              </div>
            </dl>
          </div>

          {
    /* Gemini AI Technical Assistant */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-5">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-base font-semibold text-white">
                TechCore AI Web & Teknik Asistan
              </h2>
              <Bot className="h-4 w-4 text-sky-400" aria-hidden="true" />
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              Donanım, ağ güvenliği veya güncel internet gelişmeleri hakkında doğrudan soru sorun.
            </p>

            <form onSubmit={handleAskAi} className="space-y-3">
              <label htmlFor="ai-question-input" className="sr-only">
                Teknik sorunuz
              </label>
              <textarea
    id="ai-question-input"
    rows={3}
    value={aiQuestion}
    onChange={(e) => setAiQuestion(e.target.value)}
    placeholder="Örn: DDR5 6000 CL30 RAM için ideal tREFI değeri nedir?"
    className="w-full rounded-lg border border-slate-800 bg-[#090D16] p-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
              <button
    type="submit"
    disabled={askingAi || aiQuestion.trim().length < 3}
    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-800 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
  >
                {askingAi ? "Web Araştırılıyor..." : "Yapay Zekaya Sor"}
              </button>
            </form>

            {aiAnswer && <div className="mt-4 rounded-lg border border-slate-800 bg-[#090D16] p-3.5 text-xs leading-relaxed text-slate-200">
                <p className="mb-1.5 font-semibold text-sky-400">
                  {aiEngine.startsWith("gemini-") ? "Gemini Yanıtı" : "Asistan Notu"}
                </p>
                <p className="whitespace-pre-line">{aiAnswer}</p>
                {aiSources.length > 0 && <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
                    {aiSources.map((src) => <a
    key={src.url}
    href={src.url}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
  >
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        <span className="max-w-[180px] truncate">{src.title}</span>
                      </a>)}
                  </div>}
              </div>}
          </div>
        </aside>
      </div>

      {
    /* Create Thread Modal */
  }
      {showNewModal && <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="new-thread-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
  >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0F1623] p-6 shadow-2xl">
            <button
    type="button"
    onClick={() => setShowNewModal(false)}
    aria-label="Kapat"
    className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
  >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 id="new-thread-title" className="font-display mb-4 text-lg font-semibold text-white">
              Yeni Forum Konusu Aç
            </h3>
            <form onSubmit={handleCreateThread} className="space-y-4">
              <div>
                <label htmlFor="thread-title-input" className="mb-1 block text-xs font-semibold text-slate-300">
                  Konu Başlığı
                </label>
                <input
    id="thread-title-input"
    type="text"
    required
    value={newTitle}
    onChange={(e) => setNewTitle(e.target.value)}
    placeholder="Örn: Linux Sunucularda UFW ve Fail2ban Yapılandırması"
    className="h-10 w-full rounded-lg border border-slate-700 bg-[#090D16] px-3 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
              <div>
                <label htmlFor="thread-category-select" className="mb-1 block text-xs font-semibold text-slate-300">
                  Kategori
                </label>
                <select
    id="thread-category-select"
    value={newCategory}
    onChange={(e) => setNewCategory(e.target.value)}
    className="h-10 w-full rounded-lg border border-slate-700 bg-[#090D16] px-3 text-sm text-white focus:border-sky-500 focus:outline-none"
  >
                  {POST_CATEGORIES.map((c) => <option key={c} value={c}>
                      {c}
                    </option>)}
                </select>
              </div>
              <div>
                <label htmlFor="thread-body-input" className="mb-1 block text-xs font-semibold text-slate-300">
                  İçerik
                </label>
                <textarea
    id="thread-body-input"
    rows={4}
    required
    value={newBody}
    onChange={(e) => setNewBody(e.target.value)}
    placeholder="Teknik detayları ve sorunuzu paylaşın..."
    className="w-full rounded-lg border border-slate-700 bg-[#090D16] p-3 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
              {threadError && <p className="text-xs text-rose-400">{threadError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
    type="button"
    onClick={() => setShowNewModal(false)}
    className="h-10 rounded-lg border border-slate-700 px-4 text-xs font-medium text-slate-300 hover:text-white"
  >
                  Vazgeç
                </button>
                <button
    type="submit"
    disabled={submittingThread}
    className="h-10 rounded-lg bg-sky-500 px-5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
  >
                  {submittingThread ? "Denetleniyor..." : "Yayınla"}
                </button>
              </div>
            </form>
          </div>
        </div>}

      {
    /* Thread Detail Modal with AI Technical Analysis */
  }
      {activeThread && <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="detail-thread-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
  >
          <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-[#0F1623] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-sky-400">{activeThread.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeThread.authorName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{formatDate(activeThread.createdAt)}</span>
                </div>
                <h3 id="detail-thread-title" className="font-display mt-1.5 text-xl font-semibold text-white">
                  {activeThread.title}
                </h3>
              </div>
              <button
    type="button"
    onClick={() => setActiveThread(null)}
    aria-label="Tartışmayı kapat"
    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
  >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="custom-scroll flex-1 space-y-5 overflow-y-auto p-6">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">
                {activeThread.body}
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                {activeThread.sourceUrl && <a
    href={activeThread.sourceUrl}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
  >
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    {activeThread.sourceTitle || "Orijinal Web Kaynağını Aç"}
                  </a>}

                <button
    type="button"
    disabled={analyzingThread}
    onClick={() => handleAnalyzeThread(activeThread)}
    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/60 hover:text-white disabled:opacity-50"
  >
                  <Cpu className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  {analyzingThread ? "AI Analiz Ediyor..." : "AI Teknik Analiz"}
                </button>
                <button
    type="button"
    onClick={() => toggleBookmark(activeThread.id)}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${bookmarkedIds.includes(activeThread.id) ? "border-sky-500/40 bg-sky-500/15 text-sky-300" : "border-slate-700 bg-[#090D16] text-slate-300 hover:border-slate-500"}`}
  >
                  <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                  {bookmarkedIds.includes(activeThread.id) ? "Kaydedildi" : "Yer İmine Ekle"}
                </button>
              </div>

              {activeThread.aiAnalysis && <div className="rounded-xl border border-sky-500/30 bg-[#090D16] p-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    Gemini AI Mühendislik Analizi
                  </p>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
                    {activeThread.aiAnalysis}
                  </p>
                  {analysisSources.length > 0 && <div className="mt-2.5 flex flex-wrap gap-3 border-t border-slate-800 pt-2 text-xs">
                      {analysisSources.map((s) => <a
    key={s.url}
    href={s.url}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
  >
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          <span className="max-w-[180px] truncate">{s.title}</span>
                        </a>)}
                    </div>}
                </div>}

              <div className="border-t border-slate-800 pt-5">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <MessageSquare className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  Yanıtlar ({activeThread.replies.length})
                </h4>
                <div className="space-y-3">
                  {activeThread.replies.length === 0 ? <p className="text-xs text-slate-500">Henüz yanıt yok. İlk yanıtı siz yazın.</p> : activeThread.replies.map((reply) => <div
    key={reply.id}
    className="rounded-lg border border-slate-800 bg-[#090D16] p-3.5"
  >
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-medium text-slate-200">{reply.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatDate(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-300">{reply.body}</p>
                      </div>)}
                </div>
              </div>
            </div>

            <form onSubmit={handleAddReply} className="border-t border-slate-800 p-4">
              {replyError && <p className="mb-2 text-xs text-rose-400">{replyError}</p>}
              <div className="flex gap-2">
                <label htmlFor="thread-reply-input" className="sr-only">
                  Yanıtınız
                </label>
                <input
    id="thread-reply-input"
    type="text"
    required
    value={replyText}
    onChange={(e) => setReplyText(e.target.value)}
    placeholder="Tartışmaya yanıt yazın..."
    className="h-10 flex-1 rounded-lg border border-slate-700 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                <button
    type="submit"
    disabled={submittingReply}
    className="h-10 shrink-0 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
  >
                  {submittingReply ? "Gönderiliyor..." : "Yanıtla"}
                </button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}
export {
  ForumView
};
