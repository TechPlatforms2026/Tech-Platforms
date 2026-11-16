import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  checkCommercialGameRequest,
  checkCopyrightAndGeneralFileRisk,
  checkProfanityAndRisk
} from "../src/lib/moderation.js";
let quotaCooldownUntil = 0;
let searchQuotaCooldownUntil = 0;
function resolveServerGeminiKey() {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY
  ];
  for (const raw of candidates) {
    const val = raw?.trim();
    if (val && val !== "MY_GEMINI_API_KEY") {
      return val;
    }
  }
  return "";
}
function isQuotaError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota");
}
let lastGeminiError = "";
let preferredEnterpriseMode = null;
function sanitizeErrorText(raw) {
  return raw.replace(/AIza[0-9A-Za-z_-]{10,}|AQ\.[0-9A-Za-z_.-]{10,}/g, "[REDACTED_KEY]");
}
function handleGeminiError(contextLabel, err, isSearchOnly = false) {
  const msg = sanitizeErrorText(err instanceof Error ? err.message : String(err ?? "Bilinmeyen hata"));
  lastGeminiError = `${contextLabel}: ${msg}`;
  if (isSearchOnly) {
    searchQuotaCooldownUntil = Date.now() + 5 * 60 * 1e3;
    console.warn(`[TechCore AI] ${contextLabel}: Web arama aracı geçici olarak devre dışı bırakıldı, doğrudan Gemini 4 Hydrogen kullanılıyor.`);
    return;
  }
  if (isQuotaError(err)) {
    quotaCooldownUntil = Date.now() + 8 * 1e3;
    console.warn(`[TechCore AI] ${contextLabel}: Gemini kota/hız sınırı geçici olarak aşıldı.`);
    return;
  }
  console.warn(`[TechCore AI] ${contextLabel} hata:`, msg);
}
function createGenAiInstance(apiKey, useEnterprise) {
  return new GoogleGenAI({
    apiKey,
    ...useEnterprise ? { enterprise: true } : {},
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function shouldRetryWithAlternateEndpoint(err) {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("api keys are not supported") || msg.includes("aiplatform.googleapis.com") || msg.includes("service_disabled") || msg.includes("credentials") || msg.includes("permission_denied");
}
async function runGeminiCall(fn, ignoreCooldown = false) {
  if (!ignoreCooldown && Date.now() < quotaCooldownUntil) {
    throw new Error("RESOURCE_EXHAUSTED: Geçici hız sınırı.");
  }
  const apiKey = resolveServerGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY tanımlı değil.");
  }
  const primaryEnterprise = preferredEnterpriseMode === true;
  try {
    const res = await fn(createGenAiInstance(apiKey, primaryEnterprise));
    if (preferredEnterpriseMode === null) {
      preferredEnterpriseMode = primaryEnterprise;
    }
    return res;
  } catch (err) {
    if (preferredEnterpriseMode === null && shouldRetryWithAlternateEndpoint(err)) {
      const altEnterprise = !primaryEnterprise;
      try {
        const altRes = await fn(createGenAiInstance(apiKey, altEnterprise));
        preferredEnterpriseMode = altEnterprise;
        return altRes;
      } catch (altErr) {
        const msg1 = sanitizeErrorText(err instanceof Error ? err.message : String(err));
        const msg2 = sanitizeErrorText(altErr instanceof Error ? altErr.message : String(altErr));
        lastGeminiError = `DualModeCheck: primary=${msg1} | alt=${msg2}`;
        throw altErr;
      }
    }
    throw err;
  }
}
function isGeminiConfigured() {
  return Boolean(resolveServerGeminiKey());
}
function getGeminiDiagnostics() {
  const k = resolveServerGeminiKey();
  const keyFormat = !k ? "none" : k.startsWith("AIza") ? "aistudio" : k.startsWith("AQ.") ? "aq-express" : "other";
  return {
    configured: Boolean(k),
    keyFormat,
    endpointMode: preferredEnterpriseMode === null ? "auto" : preferredEnterpriseMode ? "enterprise" : "developer-api",
    lastError: lastGeminiError
  };
}
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    )
  ]);
}
async function moderateWithGemini(content, context, fileSnippet, mimeType) {
  if (context === "file") {
    const copyrightCheck = checkCopyrightAndGeneralFileRisk(content, mimeType ?? "", fileSnippet ?? "");
    if (!copyrightCheck.safe) {
      return {
        safe: false,
        riskLevel: "blocked",
        reason: copyrightCheck.reason,
        summary: "Genel veya telif korumalı dosya engellendi (3 gün ban).",
        engine: "deterministic-fallback"
      };
    }
  }
  const preCheck = checkProfanityAndRisk(
    fileSnippet ? `${content}
${fileSnippet.slice(0, 1500)}` : content
  );
  if (!preCheck.safe) {
    return {
      safe: false,
      riskLevel: "blocked",
      reason: preCheck.reason,
      summary: "İçerik politika ihlali nedeniyle engellendi (3 gün ban).",
      engine: "deterministic-fallback"
    };
  }
  if (!isGeminiConfigured()) {
    return {
      safe: true,
      riskLevel: "clean",
      reason: context === "file" ? "Temel telif ve güvenlik taramasından geçti." : "Temel güvenlik kontrolünden geçti.",
      summary: context === "forum" ? content.slice(0, 120).trim() + (content.length > 120 ? "..." : "") : "İçerik güvenli olarak işaretlendi.",
      engine: "deterministic-fallback"
    };
  }
  try {
    const promptText = context === "file" ? `Dosya Adı: ${content}
MIME Türü: ${mimeType || "bilinmiyor"}
Dosya İçerik Önizlemesi:
${(fileSnippet ?? "").slice(0, 2e3)}` : content.slice(0, 2e3);
    const systemInstruction = context === "file" ? 'Sen TechCore Dosya Merkezi telif ve güvenlik yapay zekasısın (Gemini 4 Hydrogen). Görevin platform sahibini telif ve korsan cezalarından korumaktır. Eğer dosya adı veya içeriği genel/ticari bir yazılım, işletim sistemi (Windows/macOS/ISO), ticari oyun, crack/keygen/repack, telif korumalı film/müzik/kitap, başkasına ait lisanslı kurulum dosyası veya zararlı yazılım içeriyorsa KESİNLİKLE safe=false ve riskLevel="blocked" döndür ve reason alanına "Üç günlüğüne ban yediniz: ..." ile başlayan net Türkçe neden yaz. Yalnızca kullanıcının kendi ürettiği zararsız kod, yapılandırma (.json/.conf/.ts/.md/.txt) ve özgün teknik belgeler için safe=true, riskLevel="clean" döndür.' : 'Sen TechCore & Tech Games topluluk güvenlik yapay zekasısın (Gemini 4 Hydrogen). Küfür, ağır hakaret, cinsel/müstehcen içerik, zararlı yazılım/exploit kodu veya tehlikeli kimlik avı girişimi varsa safe=false ve riskLevel="blocked" döndür ve reason alanını "Üç günlüğüne ban yediniz: ..." ile başlat. Normal teknik tartışmalar ve oyun sohbeti için safe=true, riskLevel="clean" döndür. reason ve summary alanlarını kısa, net Türkçe yaz.';
    const response = await withTimeout(
      runGeminiCall(
        (ai) => ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Aşağıdaki ${context === "chat" ? "sohbet mesajını" : context === "forum" ? "forum gönderisini" : "dosya adını ve içeriğini"} analiz et:

${promptText}`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                safe: { type: Type.BOOLEAN },
                riskLevel: { type: Type.STRING },
                reason: { type: Type.STRING },
                summary: { type: Type.STRING }
              },
              required: ["safe", "riskLevel", "reason", "summary"]
            }
          }
        })
      ),
      4500,
      "Gemini moderation"
    );
    const parsed = JSON.parse((response.text ?? "{}").trim());
    const isSafe = parsed.safe !== false;
    const riskLevel = !isSafe || parsed.riskLevel === "blocked" ? "blocked" : parsed.riskLevel === "warning" ? "warning" : "clean";
    const rawReason = parsed.reason || (isSafe ? "İçerik güvenli." : "Politika ihlali tespit edildi.");
    const formattedReason = !isSafe && !rawReason.toLowerCase().includes("üç günlüğüne ban yediniz") ? `Üç günlüğüne ban yediniz: ${rawReason}` : rawReason;
    return {
      safe: isSafe,
      riskLevel,
      reason: formattedReason,
      summary: parsed.summary || "Gemini 4 Hydrogen incelemesi tamamlandı.",
      engine: "gemini-4-hydrogen"
    };
  } catch (err) {
    handleGeminiError("Moderasyon", err);
    return {
      safe: true,
      riskLevel: "clean",
      reason: "İçerik ön güvenlik taramasından geçti.",
      summary: context === "forum" ? content.slice(0, 120).trim() + (content.length > 120 ? "..." : "") : "Güvenli içerik.",
      engine: "deterministic-fallback"
    };
  }
}
async function askTechCoreAssistant(question, recentContext, options) {
  if (!isGeminiConfigured()) {
    return {
      answer: "Gemini API anahtarı sunucu ortamında tanımlı değil. AI Studio üzerinde Settings > Secrets panelinden (veya Netlify kullanıyorsanız Site configuration > Environment variables altından) GEMINI_API_KEY ekleyin.",
      sources: [],
      engine: "fallback"
    };
  }
  const promptContents = recentContext ? `Platform Bağlamı:
${recentContext}

Kullanıcı Sorusu:
${question}` : question;
  const systemInstruction = "Sen TechCore platformunun Gemini 4 Hydrogen tabanlı kıdemli sistem mühendisi ve canlı web araştırma asistanısın. Güncel teknoloji, yazılım, donanım, oyun veya güvenlik sorularını Türkçe, net, uygulanabilir ve doğru biçimde yanıtla.";
  if (!options?.skipSearch && Date.now() >= searchQuotaCooldownUntil) {
    try {
      const response = await withTimeout(
        runGeminiCall(
          (ai) => ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents: promptContents,
            config: {
              systemInstruction,
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            }
          })
        ),
        4500,
        "Gemini assistant (grounded)"
      );
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks.map((c) => c.web).filter((w) => Boolean(w?.uri)).slice(0, 4).map((w) => ({ title: w.title || w.uri, url: w.uri }));
      if (response.text?.trim()) {
        return {
          answer: response.text.trim(),
          sources,
          engine: "gemini-4-hydrogen"
        };
      }
    } catch (err) {
      handleGeminiError("Asistan (Google Search)", err, true);
    }
  }
  for (const modelName of ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]) {
    try {
      const response = await withTimeout(
        runGeminiCall(
          (ai) => ai.models.generateContent({
            model: modelName,
            contents: promptContents,
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel: modelName === "gemini-3.1-flash-lite" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW
              }
            }
          })
        ),
        7500,
        `Gemini assistant (${modelName})`
      );
      if (response.text?.trim()) {
        return {
          answer: response.text.trim(),
          sources: [],
          engine: modelName
        };
      }
    } catch (err) {
      if (modelName === "gemini-3.1-flash-lite") {
        handleGeminiError("Asistan", err);
        return {
          answer: isQuotaError(err) ? "Gemini 4 Hydrogen kullanım kotası geçici olarak aşıldı. Kısa bir süre sonra tekrar deneyebilirsiniz." : "Gemini 4 Hydrogen servisine şu anda ulaşılamıyor. Lütfen API anahtarınızı ve bağlantıyı kontrol edin.",
          sources: [],
          engine: "fallback"
        };
      }
    }
  }
  return {
    answer: "Yanıt üretilemedi, lütfen soruyu biraz daha detaylandırın.",
    sources: [],
    engine: "fallback"
  };
}
async function analyzeForumThreadWithGemini(title, body, category) {
  const buildFallback = () => ({
    analysis: `${category} kategorisindeki "${title}" başlığı için teknik değerlendirme:
• Temel Odak: Paylaşılan içerik üretim/geliştirme ortamlarında performans, kararlılık ve mimari yapılandırma kararlarını hedeflemektedir.
• Risk & Sınır: Değişiklikleri canlı ortama almadan önce ölçümleme (benchmark) ve geri dönüş planı oluşturulmalıdır.
• Öneri: Konudaki adımları izole test ortamında doğrulayıp sürüm notlarıyla kayıt altına alın.`,
    sources: []
  });
  if (!isGeminiConfigured()) {
    return buildFallback();
  }
  try {
    const response = await withTimeout(
      runGeminiCall(
        (ai) => ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Kategori: ${category}
Başlık: ${title}
İçerik: ${body}

Bu teknik forum tartışmasını kıdemli bir sistem mühendisi gözüyle analiz et:
1) Temel teknik çıkarım
2) Dikkat edilmesi gereken risk veya sınırlar
3) Uygulanabilir somut öneri
Kısa, net ve profesyonel Türkçe yaz.`,
          config: {
            systemInstruction: "Sen TechCore platformunun kıdemli sistem mühendisisin. Verilen forum başlığı ve içeriğini doğrudan teknik açıdan analiz edip 3 kısa, net Türkçe madde halinde yanıt ver.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        })
      ),
      8e3,
      "Gemini thread analysis"
    );
    return {
      analysis: response.text?.trim() || buildFallback().analysis,
      sources: []
    };
  } catch (err) {
    handleGeminiError("Konu Analizi", err);
    return buildFallback();
  }
}
async function generateEmailSecurityNote(recipientEmail, purpose) {
  const fallbackMap = {
    verify: "Bu 6 haneli kod TechCore hesabınızın e-posta adresini doğrulamak için üretilmiştir. Kodu kimseyle paylaşmayın.",
    application: "Dosya yükleme yetkisi başvurunuz için e-posta sahipliğiniz doğrulanıyor. İşlemi tamamlamak için kodu girin.",
    reset: "Hesap şifrenizi yenilemek için tek kullanımlık güvenlik kodunuz oluşturuldu. Bu talebi siz yapmadıysanız görmezden gelin.",
    login: "TechCore hesabınıza güvenli giriş yapmak için tek kullanımlık 6 haneli onay kodunuz oluşturuldu. Kodu kimseyle paylaşmayın."
  };
  if (!isGeminiConfigured()) return fallbackMap[purpose];
  try {
    const response = await withTimeout(
      runGeminiCall(
        (ai) => ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Alıcı: ${recipientEmail}, Amaç: ${purpose}. Tek cümlelik resmi Türkçe güvenlik notu yaz.`,
          config: {
            systemInstruction: "TechCore platformu adına gönderilen doğrulama e-postası için en fazla 1-2 cümlelik kısa, güven veren, Türkçe bir güvenlik hatırlatması yaz. Sadece düz metin döndür.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        })
      ),
      2500,
      "Gemini email note"
    );
    return response.text?.trim() || fallbackMap[purpose];
  } catch (err) {
    handleGeminiError("E-Posta Notu", err);
    return fallbackMap[purpose];
  }
}
function decodeXmlEntities(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec))).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractXmlTag(block, tag) {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1]) : "";
}
function parseRssItems(xml, limit = 6) {
  const items = [];
  const itemMatches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  for (const rawItem of itemMatches.slice(0, limit)) {
    const title = extractXmlTag(rawItem, "title");
    const link = extractXmlTag(rawItem, "link");
    const pubDate = extractXmlTag(rawItem, "pubDate");
    const source = extractXmlTag(rawItem, "source");
    const description = extractXmlTag(rawItem, "description");
    if (title && link) {
      items.push({ title, link, pubDate, source, description });
    }
  }
  return items;
}
function classifyTechCategory(text) {
  const lower = text.toLowerCase();
  if (/(ai|llm|gemini|gpt|model|neural|agent|machine learning|python|pytorch|yapay zeka|fsd|otonom)/.test(lower))
    return "Yapay Zeka";
  if (/(security|cve|auth|hack|breach|kernel|zero-day|encryption|ssl|ssh|firewall|güvenlik|siber)/.test(lower))
    return "Güvenlik";
  if (/(tesla|cybertruck|model y|model 3|batarya|pil|donanım|cpu|gpu|ram|ddr5|ssd|nvme|chip|hardware|intel|amd|nvidia|rust)/.test(lower))
    return "Donanım";
  return "Sunucu";
}
function formatTurkishDate(input, fallback) {
  const ts = input ? new Date(input).getTime() : fallback;
  const validTs = Number.isFinite(ts) ? ts : fallback;
  return new Date(validTs).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const liveNewsCache = /* @__PURE__ */ new Map();
async function fetchLiveInternetTechNews(topicQuery) {
  const normalizedKey = (topicQuery?.trim() || "__default__").toLowerCase();
  const now = Date.now();
  const cached = liveNewsCache.get(normalizedKey);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }
  const fetchedAt = now;
  const teslaItems = [];
  const turkishItems = [];
  const otherItems = [];
  let liveConnected = false;
  let groundedSummary;
  let groundedSources = [];
  const teslaNewsPromise = (async () => {
    try {
      const q = topicQuery?.trim() ? `Tesla ${topicQuery.trim()}` : 'Tesla OR "Tesla Model Y" OR Cybertruck OR "Elon Musk"';
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`;
      const res = await fetch(url, {
        headers: { "User-Agent": "TechCore-NewsBot/1.0" },
        signal: AbortSignal.timeout(5e3)
      });
      if (!res.ok) return;
      const xml = await res.text();
      const parsed = parseRssItems(xml, 6);
      if (parsed.length > 0) {
        liveConnected = true;
        parsed.forEach((item, idx) => {
          teslaItems.push({
            id: `tesla-${fetchedAt}-${idx}`,
            title: item.title,
            summary: item.source ? `${item.source} · Canlı Tesla Türkçe haber akışı` : "Canlı Google Haberler (TR) Tesla akışı",
            category: classifyTechCategory(`tesla ${item.title}`),
            sourceName: "Tesla (Canlı)",
            url: item.link,
            publishedAt: formatTurkishDate(item.pubDate, fetchedAt)
          });
        });
      }
    } catch {
    }
  })();
  const turkishNewsPromise = (async () => {
    try {
      const url = topicQuery?.trim() ? `https://news.google.com/rss/search?q=${encodeURIComponent(topicQuery.trim())}&hl=tr&gl=TR&ceid=TR:tr` : "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=tr&gl=TR&ceid=TR:tr";
      const res = await fetch(url, {
        headers: { "User-Agent": "TechCore-NewsBot/1.0" },
        signal: AbortSignal.timeout(5e3)
      });
      if (res.ok) {
        const xml = await res.text();
        const parsed = parseRssItems(xml, 6);
        if (parsed.length > 0) {
          liveConnected = true;
          parsed.forEach((item, idx) => {
            const isTesla = /tesla|cybertruck|supercharger|model y|model 3/i.test(item.title);
            const targetBucket = isTesla ? teslaItems : turkishItems;
            targetBucket.push({
              id: `trnews-${fetchedAt}-${idx}`,
              title: item.title,
              summary: item.source ? `${item.source} · Türkiye canlı teknoloji gündemi` : "Canlı Türkçe teknoloji haberi",
              category: classifyTechCategory(item.title),
              sourceName: isTesla ? "Tesla (Canlı)" : "Türkçe Haberler",
              url: item.link,
              publishedAt: formatTurkishDate(item.pubDate, fetchedAt)
            });
          });
        }
      }
    } catch {
    }
    if (!topicQuery?.trim()) {
      try {
        const wr = await fetch("https://webrazzi.com/feed/", {
          headers: { "User-Agent": "TechCore-NewsBot/1.0" },
          signal: AbortSignal.timeout(4500)
        });
        if (wr.ok) {
          const xml = await wr.text();
          const parsed = parseRssItems(xml, 4);
          if (parsed.length > 0) {
            liveConnected = true;
            parsed.forEach((item, idx) => {
              turkishItems.push({
                id: `webrazzi-${fetchedAt}-${idx}`,
                title: item.title,
                summary: item.description?.slice(0, 160) || "Webrazzi · Canlı Türkçe teknoloji yayını",
                category: classifyTechCategory(item.title + " " + (item.description ?? "")),
                sourceName: "Türkçe Haberler",
                url: item.link,
                publishedAt: formatTurkishDate(item.pubDate, fetchedAt)
              });
            });
          }
        }
      } catch {
      }
    }
  })();
  const devToPromise = (async () => {
    try {
      const url = topicQuery?.trim() ? `https://dev.to/api/articles?per_page=4&tag=${encodeURIComponent(
        topicQuery.trim().toLowerCase().split(/\s+/)[0]
      )}` : "https://dev.to/api/articles?top=1&per_page=4";
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) return;
      const articles = await res.json();
      if (Array.isArray(articles) && articles.length > 0) {
        liveConnected = true;
        for (const art of articles.slice(0, 4)) {
          if (!art.title || !art.url) continue;
          otherItems.push({
            id: `devto-${art.id}`,
            title: art.title,
            summary: art.description?.trim() || `${(art.tag_list ?? []).slice(0, 3).join(", ")} üzerine güncel geliştirici makalesi.`,
            category: classifyTechCategory(`${art.title} ${(art.tag_list ?? []).join(" ")}`),
            sourceName: "DEV Community",
            url: art.url,
            publishedAt: formatTurkishDate(art.published_at, fetchedAt)
          });
        }
      }
    } catch {
    }
  })();
  const hnPromise = (async () => {
    try {
      const topRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
        signal: AbortSignal.timeout(4500)
      });
      if (!topRes.ok) return;
      const ids = await topRes.json();
      const topIds = Array.isArray(ids) ? ids.slice(0, 4) : [];
      const itemPromises = topIds.map(
        (id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(3500)
        }).then((r) => r.ok ? r.json() : null).catch(() => null)
      );
      const items = await Promise.all(itemPromises);
      for (const item of items) {
        if (!item?.title) continue;
        liveConnected = true;
        const targetUrl = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
        otherItems.push({
          id: `hn-${item.id}`,
          title: item.title,
          summary: `${item.by ?? "topluluk"} · ${item.score ?? 0} puan · Canlı Hacker News akışı`,
          category: classifyTechCategory(item.title),
          sourceName: "Hacker News",
          url: targetUrl,
          publishedAt: formatTurkishDate((item.time ?? Math.floor(fetchedAt / 1e3)) * 1e3, fetchedAt)
        });
      }
    } catch {
    }
  })();
  const githubPromise = (async () => {
    try {
      const query = topicQuery?.trim() ? `${encodeURIComponent(topicQuery.trim())} stars:>50` : "stars:>1000 pushed:>2025-01-01";
      const ghRes = await fetch(
        `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=4`,
        {
          headers: { "User-Agent": "TechCore-Platform" },
          signal: AbortSignal.timeout(4500)
        }
      );
      if (!ghRes.ok) return;
      const ghData = await ghRes.json();
      if (Array.isArray(ghData.items) && ghData.items.length > 0) {
        liveConnected = true;
        for (const repo of ghData.items.slice(0, 4)) {
          otherItems.push({
            id: `gh-${repo.id}`,
            title: `${repo.full_name} (${repo.language || "Çoklu Dil"})`,
            summary: repo.description?.trim() || `GitHub üzerinde ${repo.stargazers_count.toLocaleString("tr-TR")} yıldızlı aktif açık kaynak projesi.`,
            category: classifyTechCategory(`${repo.full_name} ${repo.description ?? ""} ${repo.language ?? ""}`),
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
  const geminiSearchPromise = (async () => {
    if (!isGeminiConfigured() || !topicQuery?.trim() || Date.now() < searchQuotaCooldownUntil) return;
    try {
      const queryPrompt = `"${topicQuery.trim()}" konusunda internetten en güncel gelişmeleri Türkçe olarak 3 kısa maddeyle özetle.`;
      const response = await withTimeout(
        runGeminiCall(
          (ai) => ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents: queryPrompt,
            config: {
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            }
          })
        ),
        6e3,
        "Gemini live search"
      );
      const text = response.text?.trim();
      if (text) {
        groundedSummary = text;
        liveConnected = true;
      }
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      groundedSources = chunks.map((c) => c.web).filter((w) => Boolean(w?.uri)).slice(0, 5).map((w) => ({ title: w.title || w.uri, url: w.uri }));
      if (groundedSources.length > 0) {
        groundedSources.forEach((src, idx) => {
          otherItems.unshift({
            id: `gsearch-${fetchedAt}-${idx}`,
            title: src.title,
            summary: `Google Arama canlı sonucu: "${topicQuery.trim()}" aramasıyla eşleşen güncel web kaynağı.`,
            category: classifyTechCategory(src.title + " " + topicQuery),
            sourceName: "Google Arama (Canlı)",
            url: src.url,
            publishedAt: "Şimdi"
          });
        });
      }
    } catch (err) {
      handleGeminiError("Google Search Grounding", err, true);
    }
  })();
  await Promise.all([
    teslaNewsPromise,
    turkishNewsPromise,
    devToPromise,
    hnPromise,
    githubPromise,
    geminiSearchPromise
  ]);
  const seen = /* @__PURE__ */ new Set();
  const collected = [];
  for (const item of [...teslaItems, ...turkishItems, ...otherItems]) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push(item);
  }
  if (!groundedSummary && collected.length > 0) {
    const highlights = collected.slice(0, 3).map((item) => `• [${item.sourceName}] ${item.title}`).join("\n");
    groundedSummary = `Canlı Tesla, Türkçe haber ve teknoloji kaynaklarından (${collected.length} öğe) derlenen öne çıkan başlıklar:
${highlights}`;
    groundedSources = collected.slice(0, 3).map((item) => ({ title: item.title, url: item.url }));
  }
  const payload = {
    items: collected.slice(0, 24),
    groundedSummary,
    groundedSources,
    fetchedAt,
    liveConnected
  };
  if (liveConnected) {
    liveNewsCache.set(normalizedKey, {
      expiresAt: fetchedAt + (topicQuery?.trim() ? 2 * 60 * 1e3 : 3 * 60 * 1e3),
      payload
    });
  }
  return payload;
}
async function moderateGameSubmissionWithGemini(title, description, codeHtml) {
  const combined = `${title}
${description}
${codeHtml.slice(0, 1500)}`;
  const profanity = checkProfanityAndRisk(combined);
  if (!profanity.safe) {
    return {
      allowed: false,
      isCommercialOrRealGame: false,
      reason: profanity.reason,
      engine: "deterministic-fallback"
    };
  }
  const commercial = checkCommercialGameRequest(`${title}
${description}`);
  if (!commercial.allowed) {
    return {
      allowed: false,
      isCommercialOrRealGame: true,
      reason: commercial.reason,
      engine: "deterministic-fallback"
    };
  }
  if (!isGeminiConfigured()) {
    return {
      allowed: true,
      isCommercialOrRealGame: false,
      reason: "Özgün HTML5 oyun doğrulandı.",
      engine: "deterministic-fallback"
    };
  }
  try {
    const response = await withTimeout(
      runGeminiCall(
        (ai) => ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Oyun Başlığı: ${title}
Açıklama: ${description}
Kod Önizleme:
${codeHtml.slice(0, 2200)}`,
          config: {
            systemInstruction: "Sen Tech Games platformunun Gemini 4 Hydrogen telif ve güvenlik denetçisisin. Eğer oyun bilinen gerçek/ticari bir oyunun (GTA, Minecraft, FIFA, Valorant, Fortnite, Mario, Call of Duty, PUBG, CS2, Roblox, Elden Ring vb.) adı, kopyası veya telifli markasıysa isCommercialOrRealGame=true ve allowed=false döndür. Eğer zararlı script (dış sunucuya cookie/veri sızdırma, küfür) varsa allowed=false döndür. Özgün bağımsız HTML5 mini oyunlar için allowed=true, isCommercialOrRealGame=false döndür. reason alanını kısa Türkçe yaz.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                allowed: { type: Type.BOOLEAN },
                isCommercialOrRealGame: { type: Type.BOOLEAN },
                reason: { type: Type.STRING }
              },
              required: ["allowed", "isCommercialOrRealGame", "reason"]
            }
          }
        })
      ),
      5e3,
      "Gemini 4 Hydrogen game review"
    );
    const parsed = JSON.parse((response.text ?? "{}").trim());
    const allowed = parsed.allowed !== false && !parsed.isCommercialOrRealGame;
    return {
      allowed,
      isCommercialOrRealGame: Boolean(parsed.isCommercialOrRealGame),
      reason: parsed.reason || (allowed ? "Gemini 4 Hydrogen özgün oyun kontrolünden geçti." : "Genel veya gerçek ticari oyunlar Tech Games üzerinde yayınlanamaz."),
      engine: "gemini-4-hydrogen"
    };
  } catch (err) {
    handleGeminiError("Oyun Telif Kontrolü", err);
    return {
      allowed: true,
      isCommercialOrRealGame: false,
      reason: "Ön güvenlik taramasından geçti.",
      engine: "deterministic-fallback"
    };
  }
}
async function generatePlayableGameWithGemini4Hydrogen(prompt) {
  const cleanPrompt = prompt.trim();
  const profanity = checkProfanityAndRisk(cleanPrompt);
  if (!profanity.safe) {
    return { ok: false, banned: true, error: profanity.reason };
  }
  const commercial = checkCommercialGameRequest(cleanPrompt);
  if (!commercial.allowed) {
    return { ok: false, blockedByCopyright: true, error: commercial.reason };
  }
  if (!isGeminiConfigured()) {
    return {
      ok: false,
      error: "Gemini 4 Hydrogen API anahtarı sunucu ortamında tanımlı değil. Lütfen sunucu ortamında GEMINI_API_KEY tanımlayın."
    };
  }
  const systemInstruction = `Sen Tech Games platformunun Gemini 4 Hydrogen oyun geliştirme motorusun.
1. Eğer kullanıcı gerçek, ticari veya telif korumalı bir oyun (GTA, Minecraft, FIFA, Mario, Fortnite, Valorant, Call of Duty, Roblox vb.) oluşturmanı istiyorsa REFUSE et: rejected=true döndür ve rejectReason alanına Türkçe olarak gerçek/genel oyunların telif koruması nedeniyle üretilemeyeceğini yaz.
2. Özgün bir oyun fikriyse tek dosyalık, harici ağ/CDN isteği olmayan, koyu (#090D16) temalı, responsive <canvas> veya DOM tabanlı, Skor HUD'u ve "Tekrar Oyna" yeniden başlatma butonu bulunan, Türkçe arayüzlü eksiksiz çalışan HTML5 oyun kodu üret (<!doctype html> ile başlayan tam HTML). ASLA localStorage, sessionStorage veya document.cookie kullanma; en yüksek skoru yalnızca bellek içi JavaScript değişkeninde tut (sandboxed iframe içinde çalışır).`;
  for (const modelName of ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]) {
    try {
      const response = await withTimeout(
        runGeminiCall(
          (ai) => ai.models.generateContent({
            model: modelName,
            contents: `Kullanıcı Oyun İsteği:
${cleanPrompt}

Lütfen tamamen özgün, tek HTML dosyasında çalışan, eğlenceli ve klavye/fare ile oynanabilir bir HTML5 oyunu tasarla.`,
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel: modelName === "gemini-3.1-flash-lite" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW
              },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rejected: { type: Type.BOOLEAN },
                  rejectReason: { type: Type.STRING },
                  title: { type: Type.STRING },
                  genre: { type: Type.STRING },
                  description: { type: Type.STRING },
                  controlsHint: { type: Type.STRING },
                  htmlCode: { type: Type.STRING }
                },
                required: ["rejected", "title", "genre", "description", "controlsHint", "htmlCode"]
              }
            }
          })
        ),
        15e3,
        `Gemini 4 Hydrogen game gen (${modelName})`
      );
      const parsed = JSON.parse((response.text ?? "{}").trim());
      if (parsed.rejected) {
        return {
          ok: false,
          blockedByCopyright: true,
          error: parsed.rejectReason || "Genel veya gerçek ticari oyunlar telif koruması nedeniyle oluşturulamaz."
        };
      }
      const rawHtml = (parsed.htmlCode || "").trim();
      if (!rawHtml || rawHtml.length < 150) {
        continue;
      }
      const storageShim = `<script>(function(){var f=function(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}}};try{window.localStorage}catch(_){try{Object.defineProperty(window,'localStorage',{value:f(),configurable:true})}catch(__){}}try{window.sessionStorage}catch(_){try{Object.defineProperty(window,'sessionStorage',{value:f(),configurable:true})}catch(__){}}})();<\/script>`;
      const safeHtml = /localStorage|sessionStorage/i.test(rawHtml) ? rawHtml.includes("<head>") ? rawHtml.replace("<head>", `<head>${storageShim}`) : `${storageShim}${rawHtml}` : rawHtml;
      const postCheck = checkCommercialGameRequest(`${parsed.title || ""}
${parsed.description || ""}`);
      if (!postCheck.allowed) {
        return {
          ok: false,
          blockedByCopyright: true,
          error: postCheck.reason
        };
      }
      const validGenres = ["Arcade", "Bulmaca", "Refleks", "Uzay", "Strateji"];
      const genre = validGenres.includes(parsed.genre) ? parsed.genre : "Arcade";
      return {
        ok: true,
        title: (parsed.title || "Özgün Mini Oyun").trim().slice(0, 80),
        genre,
        description: (parsed.description || "Gemini 4 Hydrogen ile üretilen özgün HTML5 oyun.").trim(),
        controlsHint: (parsed.controlsHint || "Klavye ve Fare").trim(),
        codeHtml: safeHtml,
        engine: modelName
      };
    } catch (err) {
      if (modelName === "gemini-3.1-flash-lite") {
        handleGeminiError("Oyun Üretimi", err);
        return {
          ok: false,
          error: isQuotaError(err) ? "Gemini 4 Hydrogen kullanım kotası geçici olarak aşıldı." : "Gemini 4 Hydrogen sunucusuna şu anda ulaşılamıyor."
        };
      }
    }
  }
  return {
    ok: false,
    error: "Oyun üretilemedi, lütfen isteğinizi biraz daha detaylandırın."
  };
}
export {
  analyzeForumThreadWithGemini,
  askTechCoreAssistant,
  fetchLiveInternetTechNews,
  generateEmailSecurityNote,
  generatePlayableGameWithGemini4Hydrogen,
  getGeminiDiagnostics,
  isGeminiConfigured,
  moderateGameSubmissionWithGemini,
  moderateWithGemini
};
