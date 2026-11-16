import { useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  Gamepad2,
  Maximize2,
  MessageSquare,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import heroTechGamesImg from "../assets/images/hero_tech_games_arcade_1794730974437.jpg";
import { ChatView } from "./ChatView";
const GENRES = ["Tümü", "Uzay", "Arcade", "Bulmaca", "Refleks", "Strateji"];
const STARTER_TEMPLATE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>Özgün Mini Oyun</title>
<style>
  body{margin:0;background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:12px}
  canvas{border:1px solid #1e293b;border-radius:10px;background:#05080f}
  button{background:#10b981;color:#052e16;border:0;border-radius:8px;padding:8px 18px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
  <div>Skor: <b id="s">0</b></div>
  <canvas id="c" width="480" height="300"></canvas>
  <button id="r" type="button">Tekrar Oyna</button>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d'),s=document.getElementById('s');
let x=240,y=150,tx=120,ty=90,score=0;
function reset(){score=0;s.textContent=0;tx=60+Math.random()*360;ty=60+Math.random()*180;}
c.onclick=e=>{
  const r=c.getBoundingClientRect();
  const mx=(e.clientX-r.left)*(480/r.width),my=(e.clientY-r.top)*(300/r.height);
  if(Math.hypot(mx-tx,my-ty)<26){score+=10;s.textContent=score;tx=40+Math.random()*400;ty=40+Math.random()*220;}
};
document.getElementById('r').onclick=reset;
function draw(){
  ctx.fillStyle='#05080f';ctx.fillRect(0,0,480,300);
  ctx.beginPath();ctx.arc(tx,ty,20,0,Math.PI*2);ctx.fillStyle='#10b981';ctx.fill();
  requestAnimationFrame(draw);
}
draw();
<\/script>
</body>
</html>`;
function TechGamesView({
  userId,
  games,
  messages,
  activeTab,
  onTabChange,
  onGamesUpdated,
  onMessagesUpdated,
  onUserBanned
}) {
  const [genreFilter, setGenreFilter] = useState("Tümü");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingGame, setPlayingGame] = useState(null);
  const iframeContainerRef = useRef(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDraft, setAiDraft] = useState(null);
  const [pubTitle, setPubTitle] = useState("");
  const [pubGenre, setPubGenre] = useState("Arcade");
  const [pubDesc, setPubDesc] = useState("");
  const [pubControls, setPubControls] = useState("Klavye ve Fare");
  const [pubCode, setPubCode] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishSuccess, setPublishSuccess] = useState("");
  const codeFileRef = useRef(null);
  const filteredGames = games.filter((g) => {
    const matchesGenre = genreFilter === "Tümü" || g.genre === genreFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q) || g.authorName.toLowerCase().includes(q);
    return matchesGenre && matchesSearch;
  });
  const handleDownloadGame = async (game) => {
    const slug = game.title.toLowerCase().replace(/[^a-z0-9çğıöşü]+/gi, "-").replace(/^-|-$/g, "") || "tech-game";
    const blob = new Blob([game.codeHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (game.id) {
      const res = await apiRequest(
        `/api/games/${encodeURIComponent(game.id)}/download`,
        { method: "POST" }
      );
      if (res.ok && Array.isArray(res.data.games)) {
        onGamesUpdated(res.data.games);
      }
    }
  };
  const handleGenerateGame = async (e) => {
    e.preventDefault();
    const clean = aiPrompt.trim();
    if (!clean || generating) return;
    setGenerating(true);
    setAiError("");
    setPublishSuccess("");
    try {
      const res = await apiRequest("/api/games/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, prompt: clean })
      });
      if (res.data.banned && res.data.bannedUntil) {
        onUserBanned(res.data.bannedUntil, res.data.error || "Üç günlüğüne ban yediniz");
        return;
      }
      if (!res.ok || !res.data.gameDraft) {
        setAiError(res.data.error || "Oyun üretilemedi.");
        return;
      }
      setAiDraft(res.data.gameDraft);
    } catch {
      setAiError("Gemini 4 Hydrogen servisine şu an ulaşılamıyor.");
    } finally {
      setGenerating(false);
    }
  };
  const publishGamePayload = async (payload) => {
    setPublishing(true);
    setPublishError("");
    setPublishSuccess("");
    try {
      const res = await apiRequest("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload })
      });
      if (res.data.banned && res.data.bannedUntil) {
        onUserBanned(res.data.bannedUntil, res.data.error || "Üç günlüğüne ban yediniz");
        return false;
      }
      if (!res.ok) {
        setPublishError(res.data.error || "Oyun yayınlanamadı.");
        return false;
      }
      if (Array.isArray(res.data.games)) {
        onGamesUpdated(res.data.games);
      }
      setPublishSuccess(`"${payload.title}" Tech Games Oyun Salonunda yayınlandı! Diğer kullanıcılar artık oynayabilir ve indirebilir.`);
      return true;
    } catch {
      setPublishError("Oyun yayınlanırken bağlantı hatası oluştu.");
      return false;
    } finally {
      setPublishing(false);
    }
  };
  const handlePublishAiDraft = async () => {
    if (!aiDraft) return;
    const ok = await publishGamePayload({
      title: aiDraft.title,
      genre: aiDraft.genre,
      description: aiDraft.description,
      controlsHint: aiDraft.controlsHint,
      codeHtml: aiDraft.codeHtml,
      aiGenerated: true
    });
    if (ok) {
      setAiDraft(null);
      setAiPrompt("");
      onTabChange("arcade");
    }
  };
  const handleManualPublish = async (e) => {
    e.preventDefault();
    const ok = await publishGamePayload({
      title: pubTitle,
      genre: pubGenre,
      description: pubDesc,
      controlsHint: pubControls,
      codeHtml: pubCode,
      aiGenerated: false
    });
    if (ok) {
      setPubTitle("");
      setPubDesc("");
      setPubCode("");
      onTabChange("arcade");
    }
  };
  const handleHtmlUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPubCode(text.slice(0, 34e4));
    if (!pubTitle) {
      setPubTitle(file.name.replace(/\.(html?|txt)$/i, ""));
    }
    e.target.value = "";
  };
  const requestFullscreen = () => {
    const el = iframeContainerRef.current;
    if (el && el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {
      });
    }
  };
  return <div className="mx-auto max-w-7xl space-y-8">
      {
    /* Tech Games Hero */
  }
      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#0F1623]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B161A] via-[#0A131C] to-[#090D16]" />
        <img
    src={heroTechGamesImg}
    alt="Tech Games arcade ve yapay zeka oyun stüdyosu"
    referrerPolicy="no-referrer"
    className="absolute inset-0 h-full w-full object-cover opacity-40"
  />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090D16]/95 via-[#090D16]/85 to-[#090D16]/45" />

        <div className="relative z-10 flex flex-col justify-between gap-6 p-7 sm:p-10 lg:flex-row lg:items-end">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              Tech Platforms · Tech Games v1.0
            </p>
            <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tech Games Oyun Salonu &amp; Gemini 4 Hydrogen Stüdyosu
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              Hazır tarayıcı oyunlarını anında oynayın veya indirin, Gemini 4 Hydrogen ile sıfırdan özgün HTML5
              oyunları oluşturun ve toplulukla paylaşın. Genel ve gerçek ticari oyunlar telif koruması nedeniyle yayınlanamaz.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
    type="button"
    onClick={() => onTabChange("studio")}
    className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
  >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Gemini 4 Hydrogen ile Oyun Yap
              </button>
              <button
    type="button"
    onClick={() => onTabChange("chat")}
    className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700 bg-[#090D16]/80 px-4 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-white"
  >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Oyun Sohbeti
              </button>
              {games.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const pick = games[Math.floor(Math.random() * games.length)];
                    if (pick) setPlayingGame(pick);
                  }}
                  className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <Shuffle className="h-4 w-4" aria-hidden="true" />
                  Rastgele Oyun
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
            <div className="rounded-xl border border-slate-800 bg-[#090D16]/85 p-3.5">
              <p className="text-xs text-slate-400">Oyun Kütüphanesi</p>
              <p className="font-mono mt-1 text-xl font-bold text-white tabular-nums">{games.length}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#090D16]/85 p-3.5">
              <p className="text-xs text-slate-400">AI Oyun Motoru</p>
              <p className="font-mono mt-1 text-sm font-bold text-emerald-400">Hidrojen 4</p>
            </div>
          </div>
        </div>
      </section>

      {
    /* Internal Tech Games Sub-navigation (Strictly NO File/Document Center) */
  }
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div role="tablist" aria-label="Tech Games bölümleri" className="flex flex-wrap gap-2">
          <button
    type="button"
    role="tab"
    aria-selected={activeTab === "arcade"}
    onClick={() => onTabChange("arcade")}
    className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${activeTab === "arcade" ? "bg-emerald-500 text-slate-950" : "border border-slate-800 bg-[#0F1623] text-slate-300 hover:text-white"}`}
  >
            <Gamepad2 className="h-4 w-4" aria-hidden="true" />
            Oyun Salonu ({games.length})
          </button>
          <button
    type="button"
    role="tab"
    aria-selected={activeTab === "studio"}
    onClick={() => onTabChange("studio")}
    className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${activeTab === "studio" ? "bg-emerald-500 text-slate-950" : "border border-slate-800 bg-[#0F1623] text-slate-300 hover:text-white"}`}
  >
            <Bot className="h-4 w-4" aria-hidden="true" />
            AI Oyun Stüdyosu &amp; Yayınla
          </button>
          <button
    type="button"
    role="tab"
    aria-selected={activeTab === "chat"}
    onClick={() => onTabChange("chat")}
    className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${activeTab === "chat" ? "bg-emerald-500 text-slate-950" : "border border-slate-800 bg-[#0F1623] text-slate-300 hover:text-white"}`}
  >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Canlı Sohbet
          </button>
        </div>

        <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Yalnızca özgün oyunlar · Dosya Merkezi bu sunucuda kapalıdır
        </p>
      </div>

      {publishSuccess && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{publishSuccess}</span>
        </div>}

      {
    /* TAB 1: ARCADE LIBRARY + ACTIVE GAME STAGE */
  }
      {activeTab === "arcade" && <div className="space-y-6">
          {playingGame && <section
    ref={iframeContainerRef}
    aria-label={`Oynanıyor: ${playingGame.title}`}
    className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-[#0B111E]"
  >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">{playingGame.title}</h2>
                  <p className="text-xs text-slate-400">
                    {playingGame.genre} · {playingGame.controlsHint} · Geliştirici: {playingGame.authorName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
    type="button"
    onClick={() => handleDownloadGame(playingGame)}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:text-white"
  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    İndir (.html)
                  </button>
                  <button
    type="button"
    onClick={requestFullscreen}
    aria-label="Tam ekran yap"
    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-[#090D16] text-slate-300 hover:text-white"
  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
    type="button"
    onClick={() => setPlayingGame(null)}
    aria-label="Oyunu kapat"
    className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700"
  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Kapat
                  </button>
                </div>
              </div>
              <iframe
    key={playingGame.id}
    title={playingGame.title}
    srcDoc={playingGame.codeHtml}
    sandbox="allow-scripts"
    data-testid="techgames-player-iframe"
    className="h-[480px] w-full border-0 bg-[#05080f]"
  />
            </section>}

          {
    /* Filter & Search Toolbar */
  }
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1 rounded-lg bg-[#0F1623] p-1">
              {GENRES.map((genre) => <button
    key={genre}
    type="button"
    onClick={() => setGenreFilter(genre)}
    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${genreFilter === genre ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
  >
                  {genre}
                </button>)}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    aria-hidden="true"
  />
                <label htmlFor="games-search-input" className="sr-only">
                  Oyun ara
                </label>
                <input
    id="games-search-input"
    type="search"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder="Oyun veya yazar ara..."
    className="h-9 w-52 rounded-lg border border-slate-800 bg-[#0F1623] pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
  />
              </div>
              <button
    type="button"
    onClick={() => onTabChange("studio")}
    className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
  >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Oyun Ekle
              </button>
            </div>
          </div>

          {
    /* Game Cards Grid */
  }
          {filteredGames.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-12 text-center text-sm text-slate-400">
              Aradığınız kritere uygun oyun bulunamadı.
            </div> : <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game) => <article
    key={game.id}
    className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0F1623] p-5 transition-colors hover:border-emerald-500/40"
  >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-emerald-400">{game.genre}</span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {game.downloads} indirme
                      </span>
                    </div>
                    <h3 className="font-display mt-2 text-lg font-bold text-white">{game.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{game.description}</p>
                    <p className="mt-3 text-[11px] text-slate-500">
                      Kontrol: <span className="text-slate-300">{game.controlsHint}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Yayınlayan: <span className="text-slate-300">{game.authorName}</span>
                      {game.aiGenerated && " · Gemini 4 Hydrogen"}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-slate-800/80 pt-4">
                    <button
    type="button"
    onClick={() => setPlayingGame(game)}
    aria-label={`${game.title} oyna`}
    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
  >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Oyna
                    </button>
                    <button
    type="button"
    onClick={() => handleDownloadGame(game)}
    aria-label={`${game.title} indir`}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
  >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      İndir
                    </button>
                  </div>
                </article>)}
            </div>}
        </div>}

      {
    /* TAB 2: GEMINI 4 HYDROGEN AI GAME STUDIO + COMMUNITY PUBLISH */
  }
      {activeTab === "studio" && <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {
    /* Left: Gemini 4 Hydrogen Generator (7 cols) */
  }
          <section
    aria-labelledby="ai-game-studio-heading"
    className="space-y-5 rounded-2xl border border-slate-800 bg-[#0F1623] p-6 lg:col-span-7"
  >
            <div>
              <h2
    id="ai-game-studio-heading"
    className="font-display flex items-center gap-2 text-xl font-bold text-white"
  >
                <Sparkles className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                Gemini 4 Hydrogen Oyun Üreticisi
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Hayalinizdeki özgün oyunu Türkçe tarif edin; Gemini 4 Hydrogen doğrudan tarayıcıda oynanabilir ve
                indirilebilir eksiksiz HTML5 kodu üretsin.
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                <strong>Genel / Gerçek Oyun Yasağı:</strong> GTA, Minecraft, FIFA, Valorant, Fortnite, Mario, Call of
                Duty gibi gerçek ticari oyunların oluşturulması ve yayınlanması sistem tarafından engellenir.
              </span>
            </div>

            <form onSubmit={handleGenerateGame} className="space-y-4">
              <div>
                <label htmlFor="ai-game-prompt" className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Oyun Fikriniz
                </label>
                <textarea
    id="ai-game-prompt"
    rows={4}
    required
    value={aiPrompt}
    onChange={(e) => setAiPrompt(e.target.value)}
    placeholder="Örnek: Lazer duvarlarından kaçarak enerji kristalleri toplayan hızlı bir uzay aracı oyunu yap..."
    className="w-full rounded-xl border border-slate-700/80 bg-[#090D16] p-3.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
  />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
    "Lazerlerden kaçan hızlı neon top refleks oyunu",
    "Asteroit madenlerinden kristal toplayan uzay gemisi",
    "İki renkli blokları eşleştiren hızlı mantık bulmacası"
  ].map((idea) => <button
    key={idea}
    type="button"
    onClick={() => setAiPrompt(idea)}
    className="rounded-lg border border-slate-800 bg-[#090D16] px-2.5 py-1.5 text-xs text-slate-300 hover:border-emerald-500/40 hover:text-white"
  >
                    {idea}
                  </button>)}
              </div>

              {aiError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {aiError}
                </div>}

              <button
    type="submit"
    disabled={generating || aiPrompt.trim().length < 4}
    className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
  >
                <Bot className="h-4 w-4" aria-hidden="true" />
                {generating ? "Gemini 4 Hydrogen Oyunu Kodluyor..." : "Gemini 4 Hydrogen ile Oluştur"}
              </button>
            </form>

            {aiDraft && <div className="space-y-4 border-t border-slate-800 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-white">{aiDraft.title}</h3>
                    <p className="text-xs text-slate-400">
                      {aiDraft.genre} · {aiDraft.controlsHint} · Motor: {aiDraft.engine}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
    type="button"
    onClick={() => handleDownloadGame({ title: aiDraft.title, codeHtml: aiDraft.codeHtml })}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-slate-200 hover:text-white"
  >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      İndir (.html)
                    </button>
                    <button
    type="button"
    disabled={publishing}
    onClick={handlePublishAiDraft}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
  >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      {publishing ? "Yayınlanıyor..." : "Tech Games'te Yayınla"}
                    </button>
                  </div>
                </div>
                <iframe
    title={`Önizleme: ${aiDraft.title}`}
    srcDoc={aiDraft.codeHtml}
    sandbox="allow-scripts"
    className="h-[380px] w-full rounded-xl border border-slate-800 bg-[#05080f]"
  />
              </div>}
          </section>

          {
    /* Right: Manual Community Game Publish (5 cols) */
  }
          <section
    aria-labelledby="publish-game-heading"
    className="space-y-4 rounded-2xl border border-slate-800 bg-[#0F1623] p-6 lg:col-span-5"
  >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="publish-game-heading" className="font-display text-lg font-bold text-white">
                  Hazır HTML5 Oyunu Yayınla
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Kendi yazdığınız özgün HTML5 oyununu yükleyin; Gemini 4 Hydrogen denetiminden geçtikten sonra herkes
                  oynayıp indirebilir.
                </p>
              </div>
              <button
    type="button"
    onClick={() => {
      if (!pubTitle) setPubTitle("Hedef Tıkla Mini Oyun");
      if (!pubDesc) setPubDesc("Özgün canvas tabanlı hızlı nişan ve refleks mini oyunu.");
      setPubCode(STARTER_TEMPLATE_HTML);
    }}
    className="shrink-0 rounded-md border border-slate-700 bg-[#090D16] px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:border-emerald-500/50"
  >
                Şablon Doldur
              </button>
            </div>

            <form onSubmit={handleManualPublish} className="space-y-3.5">
              <div>
                <label htmlFor="pub-game-title" className="mb-1 block text-xs font-semibold text-slate-300">
                  Oyun Adı
                </label>
                <input
    id="pub-game-title"
    type="text"
    required
    value={pubTitle}
    onChange={(e) => setPubTitle(e.target.value)}
    placeholder="Özgün oyun başlığı"
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
  />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pub-game-genre" className="mb-1 block text-xs font-semibold text-slate-300">
                    Tür
                  </label>
                  <select
    id="pub-game-genre"
    value={pubGenre}
    onChange={(e) => setPubGenre(e.target.value)}
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
  >
                    <option value="Arcade">Arcade</option>
                    <option value="Uzay">Uzay</option>
                    <option value="Bulmaca">Bulmaca</option>
                    <option value="Refleks">Refleks</option>
                    <option value="Strateji">Strateji</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pub-game-controls" className="mb-1 block text-xs font-semibold text-slate-300">
                    Kontroller
                  </label>
                  <input
    id="pub-game-controls"
    type="text"
    value={pubControls}
    onChange={(e) => setPubControls(e.target.value)}
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
  />
                </div>
              </div>

              <div>
                <label htmlFor="pub-game-desc" className="mb-1 block text-xs font-semibold text-slate-300">
                  Kısa Açıklama
                </label>
                <input
    id="pub-game-desc"
    type="text"
    required
    value={pubDesc}
    onChange={(e) => setPubDesc(e.target.value)}
    placeholder="Oyunun amacı ve kuralları..."
    className="h-10 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
  />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="pub-game-code" className="text-xs font-semibold text-slate-300">
                    HTML5 Oyun Kodu
                  </label>
                  <input
    ref={codeFileRef}
    type="file"
    accept=".html,.htm,.txt"
    onChange={handleHtmlUpload}
    className="hidden"
  />
                  <button
    type="button"
    onClick={() => codeFileRef.current?.click()}
    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:underline"
  >
                    <Code2 className="h-3 w-3" aria-hidden="true" />
                    .html Dosyasından Yükle
                  </button>
                </div>
                <textarea
    id="pub-game-code"
    rows={6}
    required
    value={pubCode}
    onChange={(e) => setPubCode(e.target.value)}
    placeholder="<!doctype html>..."
    className="w-full rounded-lg border border-slate-700/80 bg-[#090D16] p-3 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
  />
              </div>

              {publishError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {publishError}
                </div>}

              <button
    type="submit"
    disabled={publishing}
    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
  >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {publishing ? "Gemini 4 Hydrogen Denetliyor..." : "Denetle ve Yayınla"}
              </button>
            </form>
          </section>
        </div>}

      {
    /* TAB 3: TECH GAMES LIVE CHAT */
  }
      {activeTab === "chat" && <ChatView
    userId={userId}
    messages={messages}
    mode="techgames"
    onMessagesUpdated={onMessagesUpdated}
    onUserBanned={onUserBanned}
  />}
    </div>;
}
export {
  TechGamesView
};
