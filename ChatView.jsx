import { useEffect, useRef, useState } from "react";
import { Bot, Hash, Search, Send, ShieldCheck, Users } from "lucide-react";
import { apiRequest } from "../lib/apiClient";
const TECHCORE_CHANNELS = [
  { id: "genel-teknoloji", label: "genel-teknoloji", topic: "Genel yazılım, sunucu ve günlük teknoloji sohbeti" },
  { id: "donanim-oc", label: "donanim-oc", topic: "CPU, GPU, DDR5 overclock ve termal testler" },
  { id: "yapay-zeka-lab", label: "yapay-zeka-lab", topic: "LLM modelleri, ajan sistemleri ve @ai web araması" },
  { id: "siber-guvenlik", label: "siber-guvenlik", topic: "Ağ güvenliği, Linux sertleştirme ve güvenlik yamaları" }
];
const TECHGAMES_CHANNELS = [
  { id: "oyun-sohbeti", label: "oyun-sohbeti", topic: "Tech Games oyuncuları, taktikler ve yeni mini oyun fikirleri" },
  { id: "ai-oyun-atolyesi", label: "ai-oyun-atolyesi", topic: "Gemini 4 Hydrogen ile oyun üretimi, HTML5 Canvas ipuçları" },
  { id: "skor-paylasimi", label: "skor-paylasimi", topic: "Yüksek skorlar, hız koşuları ve topluluk meydan okumaları" }
];
function ChatView({
  userId,
  messages,
  mode = "techcore",
  onMessagesUpdated,
  onUserBanned
}) {
  const channels = mode === "techgames" ? TECHGAMES_CHANNELS : TECHCORE_CHANNELS;
  const defaultChannel = channels[0].id;
  const [activeChannel, setActiveChannel] = useState(defaultChannel);
  const [filterText, setFilterText] = useState("");
  const [text, setText] = useState("");
  const [askAi, setAskAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [awaitingAi, setAwaitingAi] = useState(false);
  const [error, setError] = useState("");
  const [transportMode, setTransportMode] = useState("https");
  const [onlineCount, setOnlineCount] = useState(1);
  const wsRef = useRef(null);
  const messagesRef = useRef(messages);
  const onMessagesUpdatedRef = useRef(onMessagesUpdated);
  const onUserBannedRef = useRef(onUserBanned);
  const bottomRef = useRef(null);
  useEffect(() => {
    setActiveChannel(mode === "techgames" ? "oyun-sohbeti" : "genel-teknoloji");
  }, [mode]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    onMessagesUpdatedRef.current = onMessagesUpdated;
  }, [onMessagesUpdated]);
  useEffect(() => {
    onUserBannedRef.current = onUserBanned;
  }, [onUserBanned]);
  const channelMessages = messages.filter((m) => {
    const ch = m.channel || "genel-teknoloji";
    const matchesChannel = ch === activeChannel;
    const q = filterText.trim().toLowerCase();
    const matchesSearch = !q || m.text.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q);
    return matchesChannel && matchesSearch;
  });
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length, activeChannel]);
  useEffect(() => {
    let closed = false;
    let pollTimer = null;
    let wsFailedOnce = false;
    const startPolling = () => {
      if (pollTimer || closed) return;
      setTransportMode("https");
      pollTimer = setInterval(async () => {
        if (closed) return;
        const res = await apiRequest("/api/chat");
        if (!closed && res.ok && Array.isArray(res.data.messages)) {
          onMessagesUpdatedRef.current(res.data.messages);
          if (typeof res.data.onlineCount === "number") {
            setOnlineCount(res.data.onlineCount);
          }
        }
      }, 3e3);
    };
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!closed) setTransportMode("ws");
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (payload.type === "chat:init") {
            if (Array.isArray(payload.messages)) {
              onMessagesUpdatedRef.current(payload.messages);
            }
            if (typeof payload.onlineCount === "number") {
              setOnlineCount(payload.onlineCount);
            }
          } else if (payload.type === "chat:presence") {
            if (typeof payload.onlineCount === "number") {
              setOnlineCount(payload.onlineCount);
            }
          } else if (payload.type === "chat:message" && payload.message) {
            const incoming = payload.message;
            const current = messagesRef.current;
            if (!current.some((m) => m.id === incoming.id)) {
              onMessagesUpdatedRef.current([...current, incoming].slice(-120));
            }
            if (incoming.isAiAssistant) {
              setAwaitingAi(false);
            }
            setSending(false);
          } else if (payload.type === "chat:error") {
            setSending(false);
            setAwaitingAi(false);
            if (payload.banned && payload.bannedUntil) {
              onUserBannedRef.current(
                payload.bannedUntil,
                payload.error || "Üç günlüğüne ban yediniz: Sohbet kural ihlali"
              );
            } else if (payload.error) {
              setError(payload.error);
            }
          }
        } catch {
        }
      };
      ws.onerror = () => {
        wsFailedOnce = true;
        startPolling();
      };
      ws.onclose = () => {
        if (closed) return;
        if (!wsFailedOnce) {
          startPolling();
        }
      };
    } catch {
      startPolling();
    }
    return () => {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      wsRef.current?.close();
    };
  }, []);
  const handleSend = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    const wantsAi = askAi || clean.toLowerCase().startsWith("@ai");
    setError("");
    setSending(true);
    if (wantsAi) setAwaitingAi(true);
    const ws = wsRef.current;
    if (!wantsAi && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat:send",
          userId,
          text: clean,
          askAi: false,
          channel: activeChannel
        })
      );
      setText("");
      return;
    }
    try {
      const res = await apiRequest("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text: clean, askAi: wantsAi, channel: activeChannel })
      });
      if (res.data.banned && res.data.bannedUntil) {
        setText("");
        onUserBannedRef.current(
          res.data.bannedUntil,
          res.data.error || "Üç günlüğüne ban yediniz: Sohbet kural ihlali"
        );
        return;
      }
      if (!res.ok) {
        setError(res.data.error || "Mesaj gönderilemedi.");
        return;
      }
      setText("");
      if (Array.isArray(res.data.messages)) {
        onMessagesUpdatedRef.current(res.data.messages);
      }
    } catch {
      setError("Sunucu yanıt vermedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setSending(false);
      setAwaitingAi(false);
    }
  };
  const formatTime = (ts) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const currentChannelMeta = channels.find((c) => c.id === activeChannel) || channels[0];
  const accentColor = mode === "techgames" ? "text-emerald-400" : "text-sky-400";
  return <section
    aria-labelledby="chat-heading"
    className="mx-auto grid h-[74vh] min-h-[520px] max-w-6xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-800 bg-[#0F1623] md:grid-cols-12"
  >
      {
    /* Left Channel Rail */
  }
      <aside className="flex flex-col border-b border-slate-800 bg-[#0B111E] p-4 md:col-span-3 md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {mode === "techgames" ? "Tech Games Kanalları" : "Sohbet Kanalları"}
          </h2>
          <span className={`font-mono text-xs tabular-nums ${accentColor}`}>{channels.length}</span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {channels.map((ch) => {
    const isActive = ch.id === activeChannel;
    const msgCount = messages.filter((m) => (m.channel || "genel-teknoloji") === ch.id).length;
    return <button
      key={ch.id}
      type="button"
      onClick={() => setActiveChannel(ch.id)}
      className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${isActive ? mode === "techgames" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"}`}
    >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{ch.label}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">{msgCount}</span>
              </button>;
  })}
        </div>

        <div className="mt-auto hidden space-y-2 border-t border-slate-800/80 pt-4 text-xs text-slate-400 md:block">
          <p className="font-medium text-slate-300">Aktif Kanal Bilgisi</p>
          <p className="leading-relaxed text-slate-500">{currentChannelMeta.topic}</p>
          <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-[11px] text-rose-300">
            Küfür ve hakaret tespiti Gemini 4 Hydrogen tarafından otomatik 3 gün ban ile sonuçlanır.
          </p>
        </div>
      </aside>

      {
    /* Main Chat Pane */
  }
      <div className="flex min-h-0 flex-col md:col-span-9">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div>
            <h1 id="chat-heading" className="font-display flex items-center gap-1.5 text-base font-semibold text-white">
              <Hash className={`h-4 w-4 ${accentColor}`} aria-hidden="true" />
              {currentChannelMeta.label}
            </h1>
            <p className="text-xs text-slate-400">{currentChannelMeta.topic}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="relative">
              <Search
    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    aria-hidden="true"
  />
              <label htmlFor="chat-filter-input" className="sr-only">
                Kanal içinde ara
              </label>
              <input
    id="chat-filter-input"
    type="search"
    value={filterText}
    onChange={(e) => setFilterText(e.target.value)}
    placeholder="İleti ara..."
    className="h-8 w-36 rounded-md border border-slate-800 bg-[#090D16] pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:w-44"
  />
            </div>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-300 tabular-nums">
              <Users className={`h-3.5 w-3.5 ${accentColor}`} aria-hidden="true" />
              {transportMode === "ws" ? `${onlineCount} çevrimiçi (WS)` : "Canlı Senkron"}
            </span>
            <span className={`inline-flex items-center gap-1 font-medium ${accentColor}`}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              AI 3 Gün Ban Koruması
            </span>
          </div>
        </div>

        <div className="custom-scroll flex-1 space-y-4 overflow-y-auto bg-[#090D16]/60 p-5">
          {channelMessages.length === 0 ? <div className="py-16 text-center text-xs text-slate-500">
              #{currentChannelMeta.label} kanalında henüz ileti yok. İlk mesajı gönderin.
            </div> : channelMessages.map((msg) => {
    const isMe = msg.userId === userId;
    const isAi = Boolean(msg.isAiAssistant);
    return <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div className="mb-1 flex items-center gap-2 px-1 text-xs text-slate-400">
                    {isAi && <Bot className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />}
                    <span className={isAi ? "font-semibold text-sky-400" : "font-medium text-slate-300"}>
                      {msg.authorName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums text-slate-500">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div
      className={`max-w-md whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isMe ? mode === "techgames" ? "rounded-tr-sm bg-emerald-500 font-medium text-slate-950" : "rounded-tr-sm bg-sky-500 font-medium text-slate-950" : isAi ? "rounded-tl-sm border border-sky-500/30 bg-sky-500/10 text-slate-100" : "rounded-tl-sm border border-slate-800 bg-[#0F1623] text-slate-200"}`}
    >
                    {msg.text}
                  </div>
                </div>;
  })}
          {awaitingAi && <div className="flex items-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-300">
                <Bot className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                Gemini 4 Hydrogen yanıt oluşturuyor...
              </div>
            </div>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="border-t border-slate-800 bg-[#0F1623] p-4">
          {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <label htmlFor="chat-message-input" className="sr-only">
              Sohbet mesajınız
            </label>
            <input
    id="chat-message-input"
    type="text"
    value={text}
    onChange={(e) => setText(e.target.value)}
    placeholder={`#${currentChannelMeta.label} kanalına yazın veya @ai ile soru sorun...`}
    autoComplete="off"
    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-[#090D16] px-4 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
            <div className="flex items-center gap-2">
              <button
    type="button"
    onClick={() => setAskAi((prev) => !prev)}
    aria-pressed={askAi}
    className={`inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-xs font-medium transition-colors ${askAi ? "border-sky-500/60 bg-sky-500/15 text-sky-300" : "border-slate-700 bg-[#090D16] text-slate-400 hover:text-white"}`}
  >
                <Bot className="h-4 w-4" aria-hidden="true" />
                AI Yanıtla
              </button>
              <button
    type="submit"
    disabled={sending || !text.trim()}
    className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-5 text-sm font-semibold text-slate-950 transition-colors disabled:opacity-50 ${mode === "techgames" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-sky-500 hover:bg-sky-400"}`}
  >
                <Send className="h-4 w-4" aria-hidden="true" />
                {sending ? "İletiliyor..." : "Gönder"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>;
}
export {
  ChatView
};
