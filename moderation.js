const BAN_DURATION_DAYS = 3;
const BAN_DURATION_MS = BAN_DURATION_DAYS * 24 * 60 * 60 * 1e3;
const FORBIDDEN_KEYWORDS = [
  "küfür",
  "amk",
  "aq",
  "orospu",
  "piç",
  "yarrak",
  "sik",
  "göt",
  "pezevenk",
  "kahpe",
  "porno",
  "nsfw",
  "seks",
  "trojan",
  "ransomware",
  "keylogger",
  "apk-malware",
  "stealer"
];
const COPYRIGHT_BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  "iso",
  "img",
  "dmg",
  "vhd",
  "vhdx",
  "vmdk",
  "exe",
  "msi",
  "apk",
  "ipa",
  "deb",
  "rpm",
  "pkg",
  "torrent",
  "nsp",
  "xci",
  "cia",
  "rom",
  "gba",
  "nes",
  "sfc",
  "mp4",
  "mkv",
  "avi",
  "mov",
  "mp3",
  "flac",
  "aac"
]);
const COPYRIGHT_FILE_PATTERNS = [
  /\bwindows[\s._-]?(7|8|10|11|server|pro|home|ltsc)\b/i,
  /\bwin[\s._-]?(10|11)\b/i,
  /\bmicrosoft[\s._-]?office\b/i,
  /\boffice[\s._-]?(2016|2019|2021|2024|365)\b/i,
  /\badobe[\s._-]?(photoshop|premiere|after[\s._-]?effects|illustrator|acrobat)\b/i,
  /\b(photoshop|autocad|solidworks|matlab)\b/i,
  /\b(crack|keygen|repack|fitgirl|dodi|warez|kms[\s._-]?pico|activator|pirate|steamapi)\b/i,
  /\b(full[\s._-]?game|full[\s._-]?version|bluray|webrip|bdrip|dvdrip|hdrip)\b/i,
  /\b(gta[\s._-]?v|gta[\s._-]?5|minecraft|fifa|valorant|fortnite|cyberpunk|elden[\s._-]?ring)\b/i
];
const COMMERCIAL_GAME_TITLES = [
  "gta",
  "grand theft auto",
  "minecraft",
  "fifa",
  "ea sports fc",
  "ea fc",
  "valorant",
  "counter-strike",
  "counter strike",
  "cs2",
  "cs:go",
  "csgo",
  "fortnite",
  "call of duty",
  "warzone",
  "cyberpunk 2077",
  "elden ring",
  "red dead redemption",
  "zelda",
  "super mario",
  "mario kart",
  "pokemon",
  "pokémon",
  "roblox",
  "league of legends",
  "dota 2",
  "pubg",
  "apex legends",
  "overwatch",
  "world of warcraft",
  "the witcher",
  "god of war",
  "spider-man",
  "assassin's creed",
  "assassins creed",
  "forza horizon",
  "need for speed",
  "gran turismo",
  "mortal kombat",
  "street fighter",
  "tekken",
  "resident evil",
  "silent hill",
  "hogwarts legacy",
  "baldur's gate",
  "starfield",
  "skyrim",
  "fallout",
  "doom eternal",
  "among us",
  "brawl stars",
  "clash royale",
  "clash of clans",
  "half-life",
  "portal 2",
  "rocket league",
  "sims 4",
  "palworld",
  "hollow knight",
  "stardew valley",
  "terraria",
  "pacman",
  "pac-man"
];
function checkProfanityAndRisk(input) {
  const normalized = input.toLocaleLowerCase("tr-TR").trim();
  if (!normalized) {
    return { safe: true, matchedTerms: [], reason: "" };
  }
  const matchedTerms = [];
  for (const term of FORBIDDEN_KEYWORDS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-zçğıöşü0-9])${escaped}($|[^a-zçğıöşü0-9])`, "iu");
    if (regex.test(normalized) || normalized.includes("apk-malware")) {
      matchedTerms.push(term);
    }
  }
  if (matchedTerms.length > 0) {
    return {
      safe: false,
      matchedTerms: Array.from(new Set(matchedTerms)),
      reason: "Üç günlüğüne ban yediniz: Sohbet veya topluluk alanında küfür/uygunsuz ifade tespit edildi."
    };
  }
  return { safe: true, matchedTerms: [], reason: "Temiz" };
}
function checkCopyrightAndGeneralFileRisk(fileName, mimeType = "", previewText = "") {
  const cleanName = fileName.trim();
  const extMatch = cleanName.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  const ext = extMatch ? extMatch[1] : "";
  if (ext && COPYRIGHT_BINARY_EXTENSIONS.has(ext)) {
    return {
      safe: false,
      matchedTerms: [`.${ext}`],
      reason: `Üç günlüğüne ban yediniz: Dosya Merkezine genel/telif korumalı paket veya çalıştırılabilir dosya (.${ext}) yüklenemez.`
    };
  }
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes("x-iso9660") || lowerMime.includes("x-msdownload") || lowerMime.includes("vnd.android.package-archive") || lowerMime.includes("x-bittorrent") || lowerMime.startsWith("video/") || lowerMime.startsWith("audio/")) {
    return {
      safe: false,
      matchedTerms: [lowerMime],
      reason: "Üç günlüğüne ban yediniz: Telif hakkı riski taşıyan genel medya, disk imajı veya kurulum paketi tespit edildi."
    };
  }
  const combined = `${cleanName}
${previewText.slice(0, 2e3)}`;
  for (const pattern of COPYRIGHT_FILE_PATTERNS) {
    const m = combined.match(pattern);
    if (m) {
      return {
        safe: false,
        matchedTerms: [m[0]],
        reason: `Üç günlüğüne ban yediniz: Dosya içeriğinde veya adında telif korumalı/genel yazılım (${m[0]}) tespit edildi.`
      };
    }
  }
  return { safe: true, matchedTerms: [], reason: "Telif ve güvenlik taramasından geçti." };
}
function checkCommercialGameRequest(input) {
  const normalized = input.toLowerCase().trim();
  if (!normalized) {
    return { allowed: true, reason: "" };
  }
  for (const title of COMMERCIAL_GAME_TITLES) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
    if (regex.test(normalized)) {
      return {
        allowed: false,
        matchedTitle: title,
        reason: `Genel ve gerçek ticari oyunlar ("${title}") telif koruması nedeniyle Tech Games üzerinde oluşturulamaz veya yayınlanamaz.`
      };
    }
  }
  return { allowed: true, reason: "Özgün oyun talebi uygun." };
}
function isValidEmail(email) {
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}
function inferEmailProvider(email) {
  const lower = email.trim().toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return "apple";
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com" || domain === "msn.com") {
    return "microsoft";
  }
  return "other";
}
function generateVerificationCode(randomFn = Math.random) {
  const value = Math.floor(1e5 + randomFn() * 9e5);
  return String(Math.min(999999, Math.max(1e5, value)));
}
function isCodeExpired(expiresAt, now = Date.now()) {
  return now > expiresAt;
}
function formatCountdown(remainingMs) {
  const safeMs = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(safeMs / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function validateUploadMetadata(fileName, sizeBytes, maxBytes = 15 * 1024 * 1024) {
  const cleanName = fileName.trim();
  if (!cleanName) {
    return { valid: false, error: "Dosya adı boş olamaz." };
  }
  if (sizeBytes <= 0) {
    return { valid: false, error: "Boş dosya yüklenemez." };
  }
  if (sizeBytes > maxBytes) {
    return { valid: false, error: `Dosya boyutu ${formatFileSize(maxBytes)} sınırını aşamaz.` };
  }
  return { valid: true };
}
export {
  BAN_DURATION_DAYS,
  BAN_DURATION_MS,
  checkCommercialGameRequest,
  checkCopyrightAndGeneralFileRisk,
  checkProfanityAndRisk,
  formatCountdown,
  formatFileSize,
  generateVerificationCode,
  inferEmailProvider,
  isCodeExpired,
  isValidEmail,
  validateUploadMetadata
};
