import { BUILTIN_TECH_GAMES } from "./builtinGames";
import { buildGmailApiRawMessage } from "./gmailMessage";
import {
  BAN_DURATION_MS,
  checkCommercialGameRequest,
  checkCopyrightAndGeneralFileRisk,
  checkProfanityAndRisk,
  generateVerificationCode,
  inferEmailProvider,
  isCodeExpired,
  isValidEmail
} from "./moderation";
const EDGE_DB_KEY = "techcore_edge_db_v4";
const DEFAULT_PREFS = {
  liveNewsAutoRefresh: true,
  chatNotifications: true,
  emailAlerts: true,
  compactView: false
};
function createEdgeDefaultDb() {
  return {
    users: [],
    threads: [],
    messages: [],
    files: [],
    games: [],
    builtinGameDownloads: {},
    fileContents: {},
    onlineNotifications: [],
    installedLockHash: void 0
  };
}
function loadEdgeDb() {
  try {
    const raw = localStorage.getItem(EDGE_DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
  }
  const initial = createEdgeDefaultDb();
  saveEdgeDb(initial);
  return initial;
}
function saveEdgeDb(db) {
  try {
    localStorage.setItem(EDGE_DB_KEY, JSON.stringify(db));
  } catch {
  }
}
function getEdgeGuest() {
  return {
    id: "guest-viewer",
    displayName: "Ziyaretçi",
    email: "",
    emailVerified: false,
    phone: "",
    isAdmin: false,
    canUpload: false,
    bannedUntil: 0,
    preferences: { ...DEFAULT_PREFS },
    notifications: [],
    createdAt: Date.now()
  };
}
function getEdgeUser(db, userId) {
  if (userId) {
    const found = db.users.find((x) => x.id === userId);
    if (found) return found;
  }
  return getEdgeGuest();
}
function classifyCat(text) {
  const lower = text.toLowerCase();
  if (/(ai|llm|gemini|gpt|model|neural|python|yapay zeka|fsd)/.test(lower)) return "Yapay Zeka";
  if (/(security|cve|auth|hack|kernel|ssl|ssh|güvenlik)/.test(lower)) return "Güvenlik";
  if (/(tesla|cybertruck|model y|cpu|gpu|ram|ddr5|ssd|nvme|intel|amd|nvidia|rust)/.test(lower))
    return "Donanım";
  return "Sunucu";
}
async function fetchLiveInternetDirectInBrowser(topicQuery) {
  const fetchedAt = Date.now();
  const collected = [];
  let liveConnected = false;
  const rss2jsonTeslaP = (async () => {
    try {
      const q = topicQuery?.trim() ? `Tesla ${topicQuery.trim()}` : "Tesla OR Cybertruck";
      const rssUrl = encodeURIComponent(
        `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`
      );
      const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.status === "ok" && Array.isArray(data.items)) {
        liveConnected = true;
        data.items.slice(0, 5).forEach((item, idx) => {
          if (!item.title || !item.link) return;
          collected.push({
            id: `tesla-rss-${fetchedAt}-${idx}`,
            title: item.title,
            summary: item.author ? `${item.author} · Canlı Tesla Türkçe haber` : "Canlı Tesla haberi",
            category: classifyCat(`tesla ${item.title}`),
            sourceName: "Tesla (Canlı)",
            url: item.link,
            publishedAt: new Date(item.pubDate || fetchedAt).toLocaleString("tr-TR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            })
          });
        });
      }
    } catch {
    }
  })();
  const rss2jsonTrP = (async () => {
    try {
      const targetRss = topicQuery?.trim() ? `https://news.google.com/rss/search?q=${encodeURIComponent(topicQuery.trim())}&hl=tr&gl=TR&ceid=TR:tr` : "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=tr&gl=TR&ceid=TR:tr";
      const r = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(targetRss)}`
      );
      if (!r.ok) return;
      const data = await r.json();
      if (data.status === "ok" && Array.isArray(data.items)) {
        liveConnected = true;
        data.items.slice(0, 5).forEach((item, idx) => {
          if (!item.title || !item.link) return;
          collected.push({
            id: `tr-rss-${fetchedAt}-${idx}`,
            title: item.title,
            summary: item.author ? `${item.author} · Türkçe Teknoloji Haberleri` : "Canlı Türkçe haber akışı",
            category: classifyCat(item.title),
            sourceName: "Türkçe Haberler",
            url: item.link,
            publishedAt: new Date(item.pubDate || fetchedAt).toLocaleString("tr-TR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            })
          });
        });
      }
    } catch {
    }
  })();
  const devToP = (async () => {
    try {
      const url = topicQuery?.trim() ? `https://dev.to/api/articles?per_page=4&tag=${encodeURIComponent(
        topicQuery.trim().toLowerCase().split(/\s+/)[0]
      )}` : "https://dev.to/api/articles?top=1&per_page=4";
      const r = await fetch(url);
      if (!r.ok) return;
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        liveConnected = true;
        for (const a of list.slice(0, 4)) {
          collected.push({
            id: `devto-${a.id}`,
            title: a.title,
            summary: a.description?.trim() || "DEV Community canlı geliştirici makalesi.",
            category: classifyCat(`${a.title} ${(a.tag_list ?? []).join(" ")}`),
            sourceName: "DEV Community",
            url: a.url,
            publishedAt: new Date(a.published_at || fetchedAt).toLocaleString("tr-TR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            })
          });
        }
      }
    } catch {
    }
  })();
  const hnP = (async () => {
    try {
      const topR = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
      if (!topR.ok) return;
      const ids = (await topR.json()).slice(0, 4);
      const stories = await Promise.all(
        ids.map(
          (id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.ok ? r.json() : null).catch(() => null)
        )
      );
      for (const s of stories) {
        if (!s?.title) continue;
        liveConnected = true;
        collected.push({
          id: `hn-${s.id}`,
          title: s.title,
          summary: `${s.by ?? "topluluk"} · ${s.score ?? 0} puan · Canlı Hacker News`,
          category: classifyCat(s.title),
          sourceName: "Hacker News",
          url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
          publishedAt: new Date((s.time ?? Math.floor(fetchedAt / 1e3)) * 1e3).toLocaleString(
            "tr-TR",
            { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
          )
        });
      }
    } catch {
    }
  })();
  const ghP = (async () => {
    try {
      const q = topicQuery?.trim() ? `${encodeURIComponent(topicQuery.trim())} stars:>50` : "stars:>1000 pushed:>2025-01-01";
      const ghR = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=4`
      );
      if (!ghR.ok) return;
      const data = await ghR.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        liveConnected = true;
        for (const repo of data.items.slice(0, 4)) {
          collected.push({
            id: `gh-${repo.id}`,
            title: `${repo.full_name} (${repo.language || "Çoklu Dil"})`,
            summary: repo.description?.trim() || `GitHub üzerinde ${repo.stargazers_count.toLocaleString("tr-TR")} yıldızlı proje.`,
            category: classifyCat(`${repo.full_name} ${repo.description ?? ""}`),
            sourceName: "GitHub Trend",
            url: repo.html_url,
            stars: repo.stargazers_count,
            publishedAt: new Date(repo.updated_at || fetchedAt).toLocaleString("tr-TR", {
              day: "numeric",
              month: "short"
            })
          });
        }
      }
    } catch {
    }
  })();
  await Promise.all([rss2jsonTeslaP, rss2jsonTrP, devToP, hnP, ghP]);
  return {
    items: collected,
    groundedSummary: liveConnected ? `Doğrudan tarayıcı bağlantısı üzerinden ${collected.length} canlı Tesla, Türkçe haber ve teknoloji kaydı çekildi.` : void 0,
    groundedSources: collected.slice(0, 3).map((i) => ({ title: i.title, url: i.url })),
    fetchedAt,
    liveConnected
  };
}
async function apiRequest(url, init) {
  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data2 = await res.json();
      return { ok: res.ok, status: res.status, data: data2 };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        data: {
          error: "Sunucu yanıt vermedi (zaman aşımı veya sunucu hatası). Lütfen birkaç saniye sonra tekrar deneyin."
        }
      };
    }
  } catch {
  }
  const data = await handleEdgeFallback(url, init);
  const errData = data;
  const status = errData.status ?? (errData.error ? 400 : 200);
  return { ok: status >= 200 && status < 300, status, data, isStaticFallback: true };
}
async function handleEdgeFallback(url, init) {
  const parsedUrl = new URL(url, window.location.origin);
  const pathname = parsedUrl.pathname;
  const method = (init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const db = loadEdgeDb();
  if (pathname === "/api/bootstrap") {
    const uid = parsedUrl.searchParams.get("userId") || void 0;
    const user = getEdgeUser(db, uid);
    const mergedGames = [
      ...db.games ?? [],
      ...BUILTIN_TECH_GAMES.map((g) => ({
        ...g,
        downloads: db.builtinGameDownloads?.[g.id] ?? g.downloads
      }))
    ];
    const stats = {
      totalUsers: db.users.length,
      totalThreads: db.threads.length,
      totalMessages: db.messages.length,
      totalFiles: db.files.length,
      totalGames: mergedGames.length,
      verifiedEmails: 0,
      pendingApplications: 0,
      geminiConfigured: false,
      smtpConfigured: false,
      smtpProviderLabel: "Tarayıcı Çevrimdışı Modu",
      runtimeMode: "Statik İstemci Modu (Canlı Web Bağlı)"
    };
    return {
      user,
      onlineNotifications: db.onlineNotifications,
      threads: db.threads,
      messages: db.messages,
      files: db.files,
      games: mergedGames,
      stats
    };
  }
  if (pathname === "/api/notifications" && method === "GET") {
    return { notifications: db.onlineNotifications };
  }
  if (pathname === "/api/notifications" && method === "POST") {
    const text = String(body.text || "").trim();
    if (!text) return { status: 400, error: "Bildirim metni boş olamaz." };
    const user = getEdgeUser(db, String(body.userId || ""));
    const notif = {
      id: `onl-${Date.now()}`,
      text,
      authorName: user.displayName,
      scope: "online",
      createdAt: Date.now()
    };
    db.onlineNotifications.unshift(notif);
    saveEdgeDb(db);
    return { notification: notif, notifications: db.onlineNotifications };
  }
  if (pathname === "/api/app/lock-status") {
    return { configured: Boolean(db.installedLockHash), lockHash: db.installedLockHash || null };
  }
  if (pathname === "/api/app/lock-password" && method === "POST") {
    db.installedLockHash = body.lockHash ? String(body.lockHash) : void 0;
    saveEdgeDb(db);
    return { configured: Boolean(db.installedLockHash), lockHash: db.installedLockHash || null };
  }
  if (pathname === "/api/news/live") {
    const q = parsedUrl.searchParams.get("q") || void 0;
    return await fetchLiveInternetDirectInBrowser(q);
  }
  if (pathname === "/api/ai/ask" && method === "POST") {
    return {
      answer: "Yapay zeka servisi şu anda yanıt veremiyor. Lütfen birkaç saniye sonra tekrar deneyin.",
      sources: [],
      engine: "fallback"
    };
  }
  if (pathname === "/api/chat" && method === "GET") {
    const channel = parsedUrl.searchParams.get("channel");
    const list = channel ? db.messages.filter((m) => (m.channel || "genel-teknoloji") === channel) : db.messages;
    return { messages: list, onlineCount: 1 };
  }
  if (pathname === "/api/chat" && method === "POST") {
    const text = String(body.text || "").trim();
    const userId = String(body.userId || "");
    const channel = body.channel || "genel-teknoloji";
    const pre = checkProfanityAndRisk(text);
    if (!pre.safe) {
      return { status: 403, banned: true, bannedUntil: Date.now() + BAN_DURATION_MS, error: pre.reason };
    }
    const user = getEdgeUser(db, userId);
    const msg = {
      id: `msg-${Date.now()}`,
      channel,
      userId: user.id,
      authorName: user.displayName,
      text,
      moderationStatus: "approved",
      createdAt: Date.now()
    };
    db.messages.push(msg);
    const wantsAi = Boolean(body.askAi) || text.toLowerCase().startsWith("@ai");
    let aiReply = null;
    if (wantsAi) {
      aiReply = {
        id: `msg-ai-${Date.now() + 1}`,
        channel,
        userId: "techcore-ai",
        authorName: "TechCore AI",
        text: "Gemini 4 Hydrogen sohbet yanıtı şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.",
        isAiAssistant: true,
        moderationStatus: "approved",
        createdAt: Date.now() + 1
      };
      db.messages.push(aiReply);
    }
    saveEdgeDb(db);
    return { message: msg, aiReply, messages: db.messages };
  }
  if (pathname === "/api/forum" && method === "POST") {
    const user = getEdgeUser(db, String(body.userId || ""));
    const newThread = {
      id: `thr-${Date.now()}`,
      title: String(body.title || ""),
      category: body.category || "Donanım",
      body: String(body.body || ""),
      aiSummary: String(body.body || "").slice(0, 120),
      sourceUrl: body.sourceUrl ? String(body.sourceUrl) : void 0,
      sourceTitle: body.sourceTitle ? String(body.sourceTitle) : void 0,
      upvotes: [user.id],
      authorId: user.id,
      authorName: user.displayName,
      createdAt: Date.now(),
      replies: []
    };
    db.threads.unshift(newThread);
    saveEdgeDb(db);
    return { thread: newThread };
  }
  const upvoteMatch = pathname.match(/^\/api\/forum\/([^/]+)\/upvote$/);
  if (upvoteMatch && method === "POST") {
    const thread = db.threads.find((t) => t.id === upvoteMatch[1]);
    if (!thread) return { status: 404, error: "Tartışma bulunamadı." };
    const uid = String(body.userId || "");
    const list = thread.upvotes ? [...thread.upvotes] : [];
    const idx = list.indexOf(uid);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(uid);
    thread.upvotes = list;
    saveEdgeDb(db);
    return { thread };
  }
  const analyzeMatch = pathname.match(/^\/api\/forum\/([^/]+)\/analyze$/);
  if (analyzeMatch && method === "POST") {
    const thread = db.threads.find((t) => t.id === analyzeMatch[1]);
    if (!thread) return { status: 404, error: "Tartışma bulunamadı." };
    thread.aiAnalysis = `${thread.category} kategorisindeki "${thread.title}" başlığı için teknik değerlendirme: İçerik sistem kararlılığı ve güvenli yapılandırma pratikleri doğrultusunda doğrulanmalıdır.`;
    saveEdgeDb(db);
    return { thread };
  }
  const replyMatch = pathname.match(/^\/api\/forum\/([^/]+)\/replies$/);
  if (replyMatch && method === "POST") {
    const thread = db.threads.find((t) => t.id === replyMatch[1]);
    if (!thread) return { status: 404, error: "Tartışma bulunamadı." };
    const user = getEdgeUser(db, String(body.userId || ""));
    thread.replies.push({
      id: `rep-${Date.now()}`,
      authorId: user.id,
      authorName: user.displayName,
      body: String(body.body || ""),
      createdAt: Date.now()
    });
    saveEdgeDb(db);
    return { thread };
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    if (!isValidEmail(email) || password.length < 4) {
      return { status: 400, error: "Geçerli e-posta ve en az 4 karakterli şifre girin." };
    }
    let target = db.users.find((u) => u.email.toLowerCase() === email);
    if (target) {
      if (target.passwordHash && target.passwordHash !== password) {
        return { status: 401, error: "E-posta veya şifre hatalı." };
      }
      const { passwordHash: _ignored2, ...safe2 } = target;
      return { user: safe2 };
    }
    target = {
      id: `usr-${Date.now().toString(36)}`,
      displayName: email.split("@")[0],
      email,
      emailVerified: false,
      phone: "",
      isAdmin: false,
      canUpload: false,
      bannedUntil: 0,
      passwordHash: password,
      preferences: { ...DEFAULT_PREFS },
      notifications: [],
      createdAt: Date.now()
    };
    db.users.push(target);
    saveEdgeDb(db);
    const { passwordHash: _ignored, ...safe } = target;
    return { user: safe };
  }
  if (pathname === "/api/auth/register" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "").trim();
    if (!isValidEmail(email)) return { status: 400, error: "Lütfen geçerli bir e-posta adresi girin." };
    if (phone.length < 7) return { status: 400, error: "Lütfen geçerli bir telefon numarası girin." };
    if (password.length < 4) return { status: 400, error: "Şifreniz en az 4 karakter olmalıdır." };
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return { status: 409, error: "Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin." };
    }
    const created = {
      id: `usr-${Date.now().toString(36)}`,
      displayName: email.split("@")[0],
      email,
      phone,
      passwordHash: password,
      emailVerified: false,
      isAdmin: false,
      canUpload: false,
      bannedUntil: 0,
      preferences: { ...DEFAULT_PREFS },
      notifications: [],
      createdAt: Date.now()
    };
    db.users.push(created);
    saveEdgeDb(db);
    const { passwordHash: _ignored, ...safe } = created;
    return { user: safe };
  }
  if (pathname === "/api/email/send-verification" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const purpose = body.purpose || "verify";
    const senderEmail = body.senderEmail ? String(body.senderEmail).trim().toLowerCase() : void 0;
    if (!isValidEmail(email)) return { status: 400, error: "Geçerli e-posta adresi girin." };
    let authVal = "";
    if (init?.headers instanceof Headers) {
      authVal = init.headers.get("Authorization") || init.headers.get("authorization") || "";
    } else if (Array.isArray(init?.headers)) {
      const found = init.headers.find(([k]) => k.toLowerCase() === "authorization");
      authVal = found ? found[1] : "";
    } else if (init?.headers && typeof init.headers === "object") {
      const headersObj = init.headers;
      authVal = headersObj.Authorization || headersObj.authorization || "";
    }
    const token = authVal.toLowerCase().startsWith("bearer ") ? authVal.slice(7).trim() : "";
    const code = generateVerificationCode();
    const now = Date.now();
    const rec = {
      id: `ver-${now.toString(36)}`,
      email,
      purpose,
      code,
      status: "pending",
      createdAt: now,
      expiresAt: now + 15 * 60 * 1e3
    };
    db.emailVerifications = [...db.emailVerifications ?? [], rec];
    saveEdgeDb(db);
    if (token) {
      try {
        const raw = buildGmailApiRawMessage({
          fromEmail: senderEmail,
          toEmail: email,
          subject: `TechCore Doğrulama Kodunuz: ${code}`,
          textBody: `TechCore onay kodunuz: ${code}

Bu kod 15 dakika geçerlidir.`,
          htmlBody: `<div style="font-family:sans-serif;background:#090D16;color:#F1F5F9;padding:24px"><div style="max-width:480px;margin:0 auto;background:#0F1623;border:1px solid #1E293B;border-radius:12px;padding:24px"><h2 style="color:#38BDF8;margin:0 0 12px">TECHCORE</h2><p>TechCore onay kodunuz:</p><div style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#38BDF8;padding:14px;background:#090D16;border-radius:8px;text-align:center">${code}</div><p style="font-size:12px;color:#94A3B8;margin-top:14px">Bu kod 15 dakika geçerlidir.</p></div></div>`
        });
        const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ raw })
        });
        if (gmailRes.ok) {
          const data = await gmailRes.json();
          return {
            verification: {
              id: rec.id,
              email: rec.email,
              provider: inferEmailProvider(email),
              purpose: rec.purpose,
              status: rec.status,
              transport: "gmail-oauth",
              messageId: data.id || `gmail-oauth-${now}`,
              createdAt: rec.createdAt,
              expiresAt: rec.expiresAt
            }
          };
        }
      } catch {
      }
    }
    return {
      verification: {
        id: rec.id,
        email: rec.email,
        provider: inferEmailProvider(email),
        purpose: rec.purpose,
        status: rec.status,
        transport: "sandbox-instant",
        messageId: `sandbox-${now}`,
        sandboxCode: code,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt
      }
    };
  }
  if (pathname === "/api/email/verify-code" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const rec = [...db.emailVerifications ?? []].reverse().find((v) => v.email === email && v.status !== "verified");
    if (!rec) return { status: 404, error: "Doğrulama kaydı bulunamadı. Önce onay kodu isteyin." };
    if (isCodeExpired(rec.expiresAt)) return { status: 400, error: "Kodun süresi dolmuş." };
    if (rec.code !== code) return { status: 400, error: "Doğrulama kodu eşleşmedi." };
    rec.status = "verified";
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (user) {
      user.emailVerified = true;
      user.canUpload = true;
    }
    saveEdgeDb(db);
    return { verified: true, email, user: user ? (({ passwordHash: _i, ...s }) => s)(user) : null };
  }
  if (pathname === "/api/auth/login-with-code" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const rec = [...db.emailVerifications ?? []].reverse().find((v) => v.email === email && (v.purpose === "login" || v.purpose === "verify"));
    if (!rec) return { status: 404, error: "Bu e-posta için aktif giriş onay kodu bulunamadı." };
    if (isCodeExpired(rec.expiresAt)) return { status: 400, error: "Onay kodunun süresi dolmuş." };
    if (rec.code !== code) return { status: 400, error: "Girilen 6 haneli onay kodu eşleşmedi." };
    rec.status = "verified";
    let target = db.users.find((u) => u.email.toLowerCase() === email);
    if (!target) {
      target = {
        id: `usr-${Date.now().toString(36)}`,
        displayName: email.split("@")[0],
        email,
        emailVerified: true,
        phone: "",
        isAdmin: false,
        canUpload: true,
        bannedUntil: 0,
        preferences: { ...DEFAULT_PREFS },
        notifications: [],
        createdAt: Date.now()
      };
      db.users.push(target);
    } else {
      target.emailVerified = true;
      target.canUpload = true;
    }
    saveEdgeDb(db);
    const { passwordHash: _i, ...safe } = target;
    return { user: safe };
  }
  if (pathname === "/api/auth/reset-password" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const newPass = String(body.newPassword || "").trim();
    const rec = [...db.emailVerifications ?? []].reverse().find((v) => v.email === email && v.purpose === "reset");
    if (!rec) return { status: 404, error: "Bu e-posta için aktif sıfırlama kodu bulunamadı." };
    if (isCodeExpired(rec.expiresAt)) return { status: 400, error: "Doğrulama kodunun süresi dolmuş." };
    if (rec.code !== code) return { status: 400, error: "Girilen 6 haneli kod hatalı." };
    rec.status = "verified";
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (user && newPass.length >= 4) {
      user.passwordHash = newPass;
      user.emailVerified = true;
      user.canUpload = true;
    }
    saveEdgeDb(db);
    return { ok: true, user: user ? (({ passwordHash: _i, ...s }) => s)(user) : null };
  }
  if (pathname === "/api/files/scan" && method === "POST") {
    const fileName = String(body.fileName || "dosya.txt");
    const mimeType = String(body.mimeType || "text/plain");
    const previewText = body.previewText ? String(body.previewText) : "";
    const copyright = checkCopyrightAndGeneralFileRisk(fileName, mimeType, previewText);
    if (!copyright.safe) {
      return {
        status: 403,
        banned: true,
        bannedUntil: Date.now() + BAN_DURATION_MS,
        error: copyright.reason
      };
    }
    const pre = checkProfanityAndRisk(`${fileName}
${previewText}`);
    if (!pre.safe) {
      return {
        status: 403,
        banned: true,
        bannedUntil: Date.now() + BAN_DURATION_MS,
        error: pre.reason
      };
    }
    const user = getEdgeUser(db, String(body.userId || ""));
    const id = `file-${Date.now()}`;
    const fileRecord = {
      id,
      fileName,
      fileSize: Number(body.fileSize || 0),
      mimeType,
      sha256: Math.random().toString(16).slice(2) + Date.now().toString(16),
      uploaderId: user.id,
      uploaderName: user.displayName,
      aiVerdict: "Ön telif ve güvenlik taramasından geçti.",
      riskLevel: "clean",
      previewText: previewText || void 0,
      createdAt: Date.now()
    };
    if (body.fileBase64) db.fileContents[id] = String(body.fileBase64);
    db.files.unshift(fileRecord);
    saveEdgeDb(db);
    return { file: fileRecord };
  }
  if (pathname === "/api/games" && method === "GET") {
    const mergedGames = [
      ...db.games ?? [],
      ...BUILTIN_TECH_GAMES.map((g) => ({
        ...g,
        downloads: db.builtinGameDownloads?.[g.id] ?? g.downloads
      }))
    ];
    return { games: mergedGames };
  }
  if (pathname === "/api/games/generate" && method === "POST") {
    const prompt = String(body.prompt || "");
    const commercial = checkCommercialGameRequest(prompt);
    if (!commercial.allowed) {
      return { status: 403, blockedByCopyright: true, error: commercial.reason };
    }
    return {
      status: 503,
      error: "Gemini 4 Hydrogen oyun üreticisi şu anda meşgul. Lütfen kısa süre sonra tekrar deneyin."
    };
  }
  if (pathname === "/api/games" && method === "POST") {
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const codeHtml = String(body.codeHtml || "").trim();
    const commercial = checkCommercialGameRequest(`${title}
${description}`);
    if (!commercial.allowed) {
      return { status: 403, blockedByCopyright: true, error: commercial.reason };
    }
    const prof = checkProfanityAndRisk(`${title}
${description}`);
    if (!prof.safe) {
      return { status: 403, banned: true, bannedUntil: Date.now() + BAN_DURATION_MS, error: prof.reason };
    }
    const user = getEdgeUser(db, String(body.userId || ""));
    const newGame = {
      id: `game-${Date.now()}`,
      title,
      description,
      genre: body.genre || "Arcade",
      controlsHint: String(body.controlsHint || "Klavye ve Fare"),
      codeHtml,
      isBuiltIn: false,
      aiGenerated: Boolean(body.aiGenerated),
      authorId: user.id,
      authorName: user.displayName,
      downloads: 0,
      createdAt: Date.now()
    };
    db.games = [newGame, ...db.games ?? []];
    saveEdgeDb(db);
    const mergedGames = [
      ...db.games,
      ...BUILTIN_TECH_GAMES.map((g) => ({
        ...g,
        downloads: db.builtinGameDownloads?.[g.id] ?? g.downloads
      }))
    ];
    return { game: newGame, games: mergedGames };
  }
  const dlMatch = pathname.match(/^\/api\/games\/([^/]+)\/download$/);
  if (dlMatch && method === "POST") {
    const gid = dlMatch[1];
    const isBuiltIn = BUILTIN_TECH_GAMES.some((g) => g.id === gid);
    if (isBuiltIn) {
      db.builtinGameDownloads = db.builtinGameDownloads ?? {};
      db.builtinGameDownloads[gid] = (db.builtinGameDownloads[gid] ?? 0) + 1;
    } else {
      const target = (db.games ?? []).find((g) => g.id === gid);
      if (target) target.downloads = (target.downloads ?? 0) + 1;
    }
    saveEdgeDb(db);
    const mergedGames = [
      ...db.games ?? [],
      ...BUILTIN_TECH_GAMES.map((g) => ({
        ...g,
        downloads: db.builtinGameDownloads?.[g.id] ?? g.downloads
      }))
    ];
    return { games: mergedGames };
  }
  if (pathname === "/api/user/profile" && method === "PATCH") {
    const user = getEdgeUser(db, String(body.userId || ""));
    if (body.displayName) user.displayName = String(body.displayName);
    if (typeof body.phone === "string") user.phone = body.phone;
    if (typeof body.email === "string") user.email = body.email;
    saveEdgeDb(db);
    return { user };
  }
  if (pathname === "/api/user/preferences" && method === "PATCH") {
    const user = getEdgeUser(db, String(body.userId || ""));
    user.preferences = { ...user.preferences, ...body.preferences };
    saveEdgeDb(db);
    return { user };
  }
  return { ok: true };
}
function getEdgeFileDownloadUrl(file) {
  try {
    const db = loadEdgeDb();
    return db.fileContents[file.id] || null;
  } catch {
    return null;
  }
}
export {
  apiRequest,
  fetchLiveInternetDirectInBrowser,
  getEdgeFileDownloadUrl
};
