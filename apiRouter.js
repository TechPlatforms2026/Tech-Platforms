import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { BUILTIN_TECH_GAMES } from "../src/lib/builtinGames.js";
import {
  BAN_DURATION_MS,
  generateVerificationCode,
  inferEmailProvider,
  isCodeExpired,
  isValidEmail,
  validateUploadMetadata
} from "../src/lib/moderation.js";
import {
  analyzeForumThreadWithGemini,
  askTechCoreAssistant,
  fetchLiveInternetTechNews,
  generateEmailSecurityNote,
  generatePlayableGameWithGemini4Hydrogen,
  getGeminiDiagnostics,
  isGeminiConfigured,
  moderateGameSubmissionWithGemini,
  moderateWithGemini
} from "./gemini.js";
import {
  dispatchApplicationDecisionEmail,
  dispatchVerificationEmail,
  getSmtpStatus
} from "./mailer.js";
import {
  ADMIN_EMAIL,
  DEFAULT_PREFERENCES,
  UPLOADS_DIR,
  getDb,
  sanitizeUser,
  saveDb
} from "./store.js";
function getVerificationHmacSecret() {
  return process.env.SESSION_SECRET || process.env.GEMINI_API_KEY || process.env.SMTP_PASS || "techcore-stateless-verify-hmac-v1";
}
function createVerificationToken(params) {
  const payload = `${params.id}|${params.email.toLowerCase()}|${params.purpose}|${params.expiresAt}`;
  const sig = crypto.createHmac("sha256", getVerificationHmacSecret()).update(`${payload}|${params.code}`).digest("hex");
  return Buffer.from(`${payload}|${sig}`, "utf-8").toString("base64url");
}
function verifyStatelessToken(params) {
  if (!params.token) return { valid: false };
  try {
    const raw = Buffer.from(params.token, "base64url").toString("utf-8");
    const parts = raw.split("|");
    if (parts.length !== 5) return { valid: false };
    const [id, email, purpose, expStr, sig] = parts;
    const expiresAt = Number(expStr);
    if (!id || !email || !purpose || !Number.isFinite(expiresAt) || !sig) {
      return { valid: false };
    }
    if (email !== params.email.toLowerCase() || !params.allowedPurposes.includes(purpose)) {
      return { valid: false, reason: "mismatch" };
    }
    if (isCodeExpired(expiresAt)) {
      return { valid: false, reason: "expired" };
    }
    const expectedSig = crypto.createHmac("sha256", getVerificationHmacSecret()).update(`${id}|${email}|${purpose}|${expiresAt}|${params.code}`).digest("hex");
    if (sig.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { valid: true, email };
    }
    return { valid: false, reason: "mismatch" };
  } catch {
    return { valid: false };
  }
}
function createTransientGuest(userId) {
  const safeId = userId && userId.startsWith("usr-") ? userId : "guest-viewer";
  return {
    id: safeId,
    displayName: "Ziyaretçi",
    email: "",
    emailVerified: false,
    phone: "",
    isAdmin: false,
    canUpload: false,
    bannedUntil: 0,
    preferences: { ...DEFAULT_PREFERENCES },
    notifications: [],
    createdAt: Date.now()
  };
}
function resolveUser(userId) {
  const db = getDb();
  if (userId) {
    const found = db.users.find((u) => u.id === userId);
    if (found) return { user: found, isPersisted: true };
  }
  return { user: createTransientGuest(userId), isPersisted: false };
}
function collectWorkspaceFiles(dir, rootDir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === "dev-dist") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectWorkspaceFiles(full, rootDir, out);
    } else if (/\.(jsx?|css|html|json)$/i.test(entry.name)) {
      const buf = fs.readFileSync(full);
      const rel = "/" + path.relative(rootDir, full).replace(/\\/g, "/");
      out[rel] = {
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        size: buf.length
      };
    }
  }
}
function buildLiveAppFilesManifest() {
  const cwd = process.cwd();
  const distManifestPath = path.join(cwd, "dist", "app-files-manifest.json");
  if (fs.existsSync(distManifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(distManifestPath, "utf-8"));
    } catch {
    }
  }
  const files = {};
  for (const singleFile of ["index.html", "package.json", "vite.config.js"]) {
    const full = path.join(cwd, singleFile);
    if (fs.existsSync(full)) {
      const buf = fs.readFileSync(full);
      files["/" + singleFile] = {
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        size: buf.length
      };
    }
  }
  collectWorkspaceFiles(path.join(cwd, "src"), cwd, files);
  const sortedKeys = Object.keys(files).sort();
  const digestSource = sortedKeys.map((k) => `${k}:${files[k].sha256}`).join("\n");
  const rootFingerprint = crypto.createHash("sha256").update(digestSource).digest("hex");
  return {
    generatedAt: Date.now(),
    rootFingerprint,
    source: "dev-workspace",
    files
  };
}
function sanitizeFileName(name) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "dosya.bin";
}
async function processIncomingChatMessage(params) {
  const { user, isPersisted } = resolveUser(params.userId);
  if (user.bannedUntil > Date.now()) {
    return {
      ok: false,
      status: 403,
      banned: true,
      bannedUntil: user.bannedUntil,
      error: "Hesabınız kural ihlali nedeniyle 3 gün süreyle askıya alınmıştır."
    };
  }
  const cleanText = (params.text ?? "").trim();
  if (!cleanText) {
    return { ok: false, status: 400, error: "Mesaj boş olamaz." };
  }
  const channel = params.channel || "genel-teknoloji";
  const wantsAi = Boolean(params.askAi || cleanText.toLowerCase().startsWith("@ai"));
  const aiPrompt = cleanText.replace(/^@ai\s*/i, "") || cleanText;
  const [moderation, aiResult] = wantsAi ? await Promise.all([
    moderateWithGemini(cleanText, "chat"),
    askTechCoreAssistant(aiPrompt, `Aktif Sohbet Kanalı: #${channel}`, { skipSearch: true })
  ]) : [await moderateWithGemini(cleanText, "chat"), null];
  if (!moderation.safe) {
    const bannedUntil = Date.now() + BAN_DURATION_MS;
    const reason = moderation.reason.toLowerCase().includes("üç günlüğüne ban yediniz") ? moderation.reason : `Üç günlüğüne ban yediniz: ${moderation.reason}`;
    if (isPersisted) {
      user.bannedUntil = bannedUntil;
      user.banReason = reason;
      saveDb(getDb());
    }
    return {
      ok: false,
      status: 403,
      banned: true,
      bannedUntil,
      error: reason
    };
  }
  const db = getDb();
  const userMessage = {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    channel,
    userId: user.id,
    authorName: user.displayName,
    text: cleanText,
    moderationStatus: moderation.engine === "gemini-4-hydrogen" ? "ai-verified" : "approved",
    createdAt: Date.now()
  };
  db.messages.push(userMessage);
  params.onBroadcast?.(userMessage);
  let aiReplyMessage = null;
  if (wantsAi && aiResult) {
    aiReplyMessage = {
      id: `msg-ai-${crypto.randomUUID().slice(0, 8)}`,
      channel,
      userId: "techcore-ai",
      authorName: aiResult.engine === "gemini-4-hydrogen" ? "Gemini 4 Hydrogen" : aiResult.engine === "fallback" ? "TechCore AI" : "TechCore AI (Gemini)",
      text: aiResult.answer,
      isAiAssistant: true,
      moderationStatus: aiResult.engine === "fallback" ? "approved" : "ai-verified",
      createdAt: Date.now() + 1
    };
    db.messages.push(aiReplyMessage);
    params.onBroadcast?.(aiReplyMessage);
  }
  if (db.messages.length > 300) {
    db.messages = db.messages.slice(-220);
  }
  saveDb(db);
  return {
    ok: true,
    message: userMessage,
    aiReply: aiReplyMessage,
    messages: db.messages.slice(-120)
  };
}
function createApiRouter(options = {}) {
  const router = express.Router();
  const runtimeMode = options.runtimeMode || "Node Full-Stack (Express + WebSocket)";
  function getAllGames() {
    const db = getDb();
    const builtIns = BUILTIN_TECH_GAMES.map((g) => ({
      ...g,
      downloads: db.builtinGameDownloads?.[g.id] ?? g.downloads
    }));
    const community = [...db.games ?? []].sort((a, b) => b.createdAt - a.createdAt);
    return [...community, ...builtIns];
  }
  function buildServerStats() {
    const db = getDb();
    const smtp = getSmtpStatus();
    return {
      totalUsers: db.users.length,
      totalThreads: db.threads.length,
      totalMessages: db.messages.length,
      totalFiles: db.files.length,
      totalGames: BUILTIN_TECH_GAMES.length + (db.games?.length ?? 0),
      verifiedEmails: db.emailVerifications.filter((v) => v.status === "verified").length,
      pendingApplications: db.applications.filter((a) => a.status === "pending").length,
      geminiConfigured: isGeminiConfigured(),
      smtpConfigured: smtp.configured,
      smtpProviderLabel: smtp.providerLabel,
      runtimeMode
    };
  }
  function getMergedOnlineNotifications(user) {
    const db = getDb();
    const map = /* @__PURE__ */ new Map();
    for (const item of db.onlineNotifications) {
      map.set(item.id, { ...item, scope: "online" });
    }
    if (user) {
      for (const item of user.notifications ?? []) {
        if (!map.has(item.id)) {
          map.set(item.id, { ...item, scope: item.scope || "personal" });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  function pushOnlineNotification(text, authorName = "TechCore") {
    const db = getDb();
    const notif = {
      id: `onl-${crypto.randomUUID().slice(0, 8)}`,
      text,
      authorName,
      scope: "online",
      createdAt: Date.now()
    };
    db.onlineNotifications.unshift(notif);
    if (db.onlineNotifications.length > 100) {
      db.onlineNotifications = db.onlineNotifications.slice(0, 100);
    }
    saveDb(db);
    return notif;
  }
  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      onlineChatClients: options.getOnlineClients?.() ?? 1,
      runtimeMode,
      gemini: getGeminiDiagnostics()
    });
  });
  router.get("/app/files-manifest", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(buildLiveAppFilesManifest());
  });
  router.get("/app/lock-status", (_req, res) => {
    const db = getDb();
    res.json({
      configured: Boolean(db.installedLockHash),
      lockHash: db.installedLockHash || null
    });
  });
  router.post("/app/lock-password", (req, res) => {
    const { lockHash } = req.body;
    const clean = (lockHash ?? "").trim();
    if (clean && !/^[a-f0-9]{64}$/i.test(clean)) {
      res.status(400).json({ error: "Geçersiz kilit şifresi özeti." });
      return;
    }
    const db = getDb();
    db.installedLockHash = clean || void 0;
    saveDb(db);
    res.json({ configured: Boolean(db.installedLockHash), lockHash: db.installedLockHash || null });
  });
  router.get("/bootstrap", (req, res) => {
    const requestedId = typeof req.query.userId === "string" ? req.query.userId : void 0;
    const db = getDb();
    const { user, isPersisted } = resolveUser(requestedId);
    res.json({
      user: sanitizeUser(user),
      isGuest: !isPersisted,
      onlineNotifications: getMergedOnlineNotifications(isPersisted ? user : void 0),
      threads: [...db.threads].sort((a, b) => b.createdAt - a.createdAt),
      messages: db.messages.slice(-120),
      files: [...db.files].sort((a, b) => b.createdAt - a.createdAt),
      games: getAllGames(),
      stats: buildServerStats()
    });
  });
  router.get("/notifications", (req, res) => {
    const requestedId = typeof req.query.userId === "string" ? req.query.userId : void 0;
    const { user, isPersisted } = resolveUser(requestedId);
    res.json({
      notifications: getMergedOnlineNotifications(isPersisted ? user : void 0)
    });
  });
  router.post("/notifications", (req, res) => {
    const { userId, text } = req.body;
    const cleanText = (text ?? "").trim();
    if (cleanText.length < 2 || cleanText.length > 280) {
      res.status(400).json({ error: "Bildirim metni 2 ile 280 karakter arasında olmalıdır." });
      return;
    }
    const { user, isPersisted } = resolveUser(userId);
    if (!isPersisted || !user.email) {
      res.status(401).json({ error: "Çevrimiçi bildirim yayınlamak için giriş yapmalısınız." });
      return;
    }
    const created = pushOnlineNotification(cleanText, user.displayName);
    res.json({
      notification: created,
      notifications: getMergedOnlineNotifications(user)
    });
  });
  router.delete("/notifications/:id", (req, res) => {
    const adminUserId = typeof req.query.adminUserId === "string" ? req.query.adminUserId : "";
    const db = getDb();
    const admin = db.users.find((u) => u.id === adminUserId);
    if (!admin?.isAdmin) {
      res.status(403).json({ error: "Çevrimiçi bildirimleri yalnızca yönetici silebilir." });
      return;
    }
    db.onlineNotifications = db.onlineNotifications.filter((n) => n.id !== req.params.id);
    saveDb(db);
    res.json({ notifications: getMergedOnlineNotifications(admin) });
  });
  router.get("/news/live", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : void 0;
    const result = await fetchLiveInternetTechNews(q);
    res.json(result);
  });
  router.post("/auth/login", (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanPass = (password ?? "").trim();
    if (!isValidEmail(cleanEmail) || !cleanPass) {
      res.status(400).json({ error: "Geçerli bir e-posta adresi ve şifre girin." });
      return;
    }
    const db = getDb();
    let target = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (cleanEmail === ADMIN_EMAIL) {
      const adminUser = db.users.find((u) => u.email.toLowerCase() === ADMIN_EMAIL);
      const validPass = adminUser?.passwordHash ?? "z3435";
      if (cleanPass !== validPass) {
        res.status(401).json({ error: "Yönetici şifresi hatalı." });
        return;
      }
      if (adminUser) {
        adminUser.isAdmin = true;
        adminUser.canUpload = true;
        saveDb(db);
        res.json({ user: sanitizeUser(adminUser), message: "Yönetici oturumu açıldı." });
        return;
      }
    }
    if (target) {
      if (target.passwordHash && target.passwordHash !== cleanPass) {
        res.status(401).json({ error: "E-posta veya şifre hatalı." });
        return;
      }
      saveDb(db);
      res.json({ user: sanitizeUser(target), message: `Hoş geldiniz, ${target.displayName}.` });
      return;
    }
    const isVerified = db.emailVerifications.some(
      (v) => v.email.toLowerCase() === cleanEmail && v.status === "verified"
    );
    target = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      displayName: cleanEmail.split("@")[0],
      email: cleanEmail,
      emailVerified: isVerified,
      phone: "",
      isAdmin: false,
      canUpload: isVerified,
      bannedUntil: 0,
      passwordHash: cleanPass,
      preferences: { ...DEFAULT_PREFERENCES },
      notifications: [],
      createdAt: Date.now()
    };
    db.users.push(target);
    saveDb(db);
    res.json({
      user: sanitizeUser(target),
      message: `TechCore oturumu açıldı (${target.displayName}).`
    });
  });
  router.post("/auth/login-with-code", (req, res) => {
    const { email, code, verificationToken } = req.body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanCode = (code ?? "").trim();
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: "Lütfen geçerli bir e-posta adresi girin." });
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      res.status(400).json({ error: "Lütfen gelen kutunuzdaki 6 haneli onay kodunu eksiksiz girin." });
      return;
    }
    const db = getDb();
    const record = [...db.emailVerifications].reverse().find(
      (v) => v.email.toLowerCase() === cleanEmail && (v.purpose === "login" || v.purpose === "verify")
    );
    if (record) {
      if (isCodeExpired(record.expiresAt)) {
        record.status = "expired";
        saveDb(db);
        res.status(400).json({ error: "Onay kodunun süresi dolmuş. Lütfen yeni kod isteyin." });
        return;
      }
      if (record.code !== cleanCode) {
        res.status(400).json({ error: "Girilen 6 haneli onay kodu eşleşmedi." });
        return;
      }
      record.status = "verified";
      record.verifiedAt = Date.now();
    } else {
      const tokenCheck = verifyStatelessToken({
        token: verificationToken,
        email: cleanEmail,
        code: cleanCode,
        allowedPurposes: ["login", "verify"]
      });
      if (!tokenCheck.valid) {
        if (tokenCheck.reason === "expired") {
          res.status(400).json({ error: "Onay kodunun süresi dolmuş. Lütfen yeni kod isteyin." });
          return;
        }
        if (tokenCheck.reason === "mismatch") {
          res.status(400).json({ error: "Girilen 6 haneli onay kodu eşleşmedi." });
          return;
        }
        res.status(404).json({ error: "Bu e-posta için aktif bir giriş onay kodu bulunamadı." });
        return;
      }
    }
    let target = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!target) {
      target = {
        id: `usr-${crypto.randomUUID().slice(0, 8)}`,
        displayName: cleanEmail.split("@")[0],
        email: cleanEmail,
        phone: "",
        passwordHash: "",
        emailVerified: true,
        isAdmin: false,
        canUpload: true,
        bannedUntil: 0,
        preferences: { ...DEFAULT_PREFERENCES },
        notifications: [],
        createdAt: Date.now()
      };
      db.users.push(target);
    } else {
      target.emailVerified = true;
      target.canUpload = true;
    }
    saveDb(db);
    res.json({
      user: sanitizeUser(target),
      message: `Onay kodu doğrulandı, oturum açıldı (${target.displayName}).`
    });
  });
  router.post("/auth/register", (req, res) => {
    const { email, phone, password, displayName } = req.body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanPhone = (phone ?? "").trim();
    const cleanPass = (password ?? "").trim();
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: "Lütfen geçerli bir e-posta adresi girin." });
      return;
    }
    if (cleanPhone.length < 7) {
      res.status(400).json({ error: "Lütfen geçerli bir telefon numarası girin." });
      return;
    }
    if (cleanPass.length < 4) {
      res.status(400).json({ error: "Şifreniz en az 4 karakter olmalıdır." });
      return;
    }
    const db = getDb();
    const existing = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      res.status(409).json({ error: "Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin." });
      return;
    }
    const isVerified = db.emailVerifications.some(
      (v) => v.email.toLowerCase() === cleanEmail && v.status === "verified"
    );
    const user = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      displayName: (displayName ?? "").trim() || cleanEmail.split("@")[0],
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash: cleanPass,
      emailVerified: isVerified,
      isAdmin: false,
      canUpload: isVerified,
      bannedUntil: 0,
      preferences: { ...DEFAULT_PREFERENCES },
      notifications: [],
      createdAt: Date.now()
    };
    db.users.push(user);
    saveDb(db);
    res.json({ user: sanitizeUser(user), message: "Kayıt tamamlandı ve giriş yapıldı." });
  });
  router.post("/auth/reset-password", (req, res) => {
    const { email, code, newPassword, verificationToken } = req.body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanCode = (code ?? "").trim();
    const cleanPass = (newPassword ?? "").trim();
    if (!isValidEmail(cleanEmail) || cleanCode.length !== 6 || cleanPass.length < 4) {
      res.status(400).json({ error: "E-posta, 6 haneli kod ve en az 4 karakterli yeni şifre gereklidir." });
      return;
    }
    const db = getDb();
    const record = [...db.emailVerifications].reverse().find((v) => v.email.toLowerCase() === cleanEmail && v.purpose === "reset");
    if (record) {
      if (isCodeExpired(record.expiresAt)) {
        record.status = "expired";
        saveDb(db);
        res.status(400).json({ error: "Doğrulama kodunun süresi dolmuş. Yeni kod isteyin." });
        return;
      }
      if (record.code !== cleanCode) {
        res.status(400).json({ error: "Girilen 6 haneli doğrulama kodu hatalı." });
        return;
      }
      record.status = "verified";
      record.verifiedAt = Date.now();
    } else {
      const tokenCheck = verifyStatelessToken({
        token: verificationToken,
        email: cleanEmail,
        code: cleanCode,
        allowedPurposes: ["reset"]
      });
      if (!tokenCheck.valid) {
        if (tokenCheck.reason === "expired") {
          res.status(400).json({ error: "Doğrulama kodunun süresi dolmuş. Yeni kod isteyin." });
          return;
        }
        if (tokenCheck.reason === "mismatch") {
          res.status(400).json({ error: "Girilen 6 haneli doğrulama kodu hatalı." });
          return;
        }
        res.status(404).json({ error: "Bu e-posta için aktif bir sıfırlama kodu bulunamadı." });
        return;
      }
    }
    const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (user) {
      user.passwordHash = cleanPass;
      user.emailVerified = true;
      user.canUpload = true;
      user.notifications.unshift({
        id: `notif-${crypto.randomUUID().slice(0, 8)}`,
        text: "Şifreniz e-posta doğrulama kodu ile güncellendi.",
        scope: "personal",
        createdAt: Date.now()
      });
    }
    saveDb(db);
    res.json({
      ok: true,
      user: user ? sanitizeUser(user) : null,
      message: "Şifreniz güncellendi."
    });
  });
  router.patch("/user/profile", (req, res) => {
    const { userId, displayName, phone, email } = req.body;
    const db = getDb();
    const { user, isPersisted } = resolveUser(userId);
    if (!isPersisted) {
      res.status(401).json({ error: "Profil düzenlemek için önce giriş yapmalısınız." });
      return;
    }
    if (typeof displayName === "string" && displayName.trim().length >= 2) {
      user.displayName = displayName.trim().slice(0, 40);
    }
    if (typeof phone === "string") {
      user.phone = phone.trim().slice(0, 24);
    }
    if (typeof email === "string" && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (!isValidEmail(cleanEmail)) {
        res.status(400).json({ error: "Geçerli bir e-posta adresi girin." });
        return;
      }
      if (cleanEmail !== user.email.toLowerCase()) {
        user.email = cleanEmail;
        user.emailVerified = db.emailVerifications.some(
          (v) => v.email.toLowerCase() === cleanEmail && v.status === "verified"
        );
      }
    }
    saveDb(db);
    res.json({ user: sanitizeUser(user), message: "Profil bilgileriniz güncellendi." });
  });
  router.patch("/user/preferences", (req, res) => {
    const { userId, preferences } = req.body;
    const { user, isPersisted } = resolveUser(userId);
    const updatedPrefs = {
      ...DEFAULT_PREFERENCES,
      ...user.preferences,
      ...preferences ?? {}
    };
    if (isPersisted) {
      user.preferences = updatedPrefs;
      saveDb(getDb());
    }
    res.json({ user: sanitizeUser({ ...user, preferences: updatedPrefs }), message: "Tercihler kaydedildi." });
  });
  router.post("/user/change-password", (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    const { user, isPersisted } = resolveUser(userId);
    if (!isPersisted) {
      res.status(401).json({ error: "Şifre değiştirmek için giriş yapmalısınız." });
      return;
    }
    const cleanNew = (newPassword ?? "").trim();
    if (cleanNew.length < 4) {
      res.status(400).json({ error: "Yeni şifre en az 4 karakter olmalıdır." });
      return;
    }
    if (user.passwordHash && user.passwordHash !== (currentPassword ?? "").trim()) {
      res.status(401).json({ error: "Mevcut şifreniz hatalı." });
      return;
    }
    user.passwordHash = cleanNew;
    saveDb(getDb());
    res.json({ user: sanitizeUser(user), message: "Şifreniz güncellendi." });
  });
  router.post("/user/notifications/clear", (req, res) => {
    const { userId } = req.body;
    const { user, isPersisted } = resolveUser(userId);
    if (isPersisted) {
      user.notifications = [];
      saveDb(getDb());
    }
    res.json({ user: sanitizeUser(user) });
  });
  router.post("/email/send-verification", async (req, res) => {
    const { email, purpose = "verify", senderEmail } = req.body;
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const gmailAccessToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const cleanSenderEmail = senderEmail && isValidEmail(senderEmail.trim().toLowerCase()) ? senderEmail.trim().toLowerCase() : void 0;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: "Lütfen geçerli bir e-posta adresi girin (örn. ad@gmail.com)." });
      return;
    }
    const code = generateVerificationCode();
    const defaultNoteMap = {
      verify: "Bu 6 haneli kod TechCore hesabınızın e-posta adresini doğrulamak için üretilmiştir. Kodu kimseyle paylaşmayın.",
      application: "Dosya yükleme yetkisi başvurunuz için e-posta sahipliğiniz doğrulanıyor. İşlemi tamamlamak için kodu girin.",
      reset: "Hesap şifrenizi yenilemek için tek kullanımlık güvenlik kodunuz oluşturuldu. Bu talebi siz yapmadıysanız görmezden gelin.",
      login: "TechCore hesabınıza güvenli giriş yapmak için tek kullanımlık 6 haneli onay kodunuz oluşturuldu. Kodu kimseyle paylaşmayın."
    };
    const aiSecurityNote = await Promise.race([
      generateEmailSecurityNote(cleanEmail, purpose),
      new Promise((resolve) => setTimeout(() => resolve(defaultNoteMap[purpose]), 900))
    ]);
    try {
      const dispatch = await dispatchVerificationEmail({
        recipientEmail: cleanEmail,
        code,
        purpose,
        aiSecurityNote,
        gmailAccessToken: gmailAccessToken || void 0,
        gmailSenderEmail: cleanSenderEmail
      });
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1e3;
      const recordId = `ver-${crypto.randomUUID().slice(0, 8)}`;
      const record = {
        id: recordId,
        email: cleanEmail,
        provider: inferEmailProvider(cleanEmail),
        purpose,
        code,
        status: "pending",
        transport: dispatch.transport,
        messageId: dispatch.messageId,
        aiSecurityNote,
        createdAt: now,
        expiresAt
      };
      const db = getDb();
      db.emailVerifications.push(record);
      saveDb(db);
      const verificationToken = createVerificationToken({
        id: recordId,
        email: cleanEmail,
        code,
        purpose,
        expiresAt
      });
      res.json({
        verification: {
          id: record.id,
          email: record.email,
          provider: record.provider,
          purpose: record.purpose,
          status: record.status,
          transport: record.transport,
          messageId: record.messageId,
          verificationToken,
          sandboxCode: dispatch.sandboxCode,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt
        },
        stats: buildServerStats()
      });
    } catch (err) {
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1e3;
      const recordId = `ver-${crypto.randomUUID().slice(0, 8)}`;
      const record = {
        id: recordId,
        email: cleanEmail,
        provider: inferEmailProvider(cleanEmail),
        purpose,
        code,
        status: "pending",
        transport: "sandbox-instant",
        messageId: `sandbox-${now}`,
        aiSecurityNote,
        createdAt: now,
        expiresAt
      };
      const db = getDb();
      db.emailVerifications.push(record);
      saveDb(db);
      const verificationToken = createVerificationToken({
        id: recordId,
        email: cleanEmail,
        code,
        purpose,
        expiresAt
      });
      res.json({
        verification: {
          id: record.id,
          email: record.email,
          provider: record.provider,
          purpose: record.purpose,
          status: record.status,
          transport: record.transport,
          messageId: record.messageId,
          verificationToken,
          sandboxCode: code,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt
        },
        stats: buildServerStats()
      });
    }
  });
  router.post("/email/verify-code", (req, res) => {
    const { verificationId, email, code, userId, verificationToken } = req.body;
    const cleanCode = (code ?? "").trim();
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!/^\d{6}$/.test(cleanCode)) {
      res.status(400).json({ error: "Lütfen 6 haneli doğrulama kodunu eksiksiz girin." });
      return;
    }
    const db = getDb();
    const record = verificationId ? db.emailVerifications.find((v) => v.id === verificationId) : [...db.emailVerifications].reverse().find((v) => v.email.toLowerCase() === cleanEmail);
    let verifiedEmail = cleanEmail;
    const verifiedAt = Date.now();
    if (record) {
      if (isCodeExpired(record.expiresAt)) {
        record.status = "expired";
        saveDb(db);
        res.status(400).json({ error: "Kodun süresi dolmuş. Lütfen yeni kod isteyin." });
        return;
      }
      if (record.code !== cleanCode) {
        res.status(400).json({ error: "Doğrulama kodu eşleşmedi. Lütfen tekrar kontrol edin." });
        return;
      }
      record.status = "verified";
      record.verifiedAt = verifiedAt;
      verifiedEmail = record.email;
    } else {
      const tokenCheck = verifyStatelessToken({
        token: verificationToken,
        email: cleanEmail,
        code: cleanCode,
        allowedPurposes: ["verify", "application", "login", "reset"]
      });
      if (!tokenCheck.valid) {
        if (tokenCheck.reason === "expired") {
          res.status(400).json({ error: "Kodun süresi dolmuş. Lütfen yeni kod isteyin." });
          return;
        }
        if (tokenCheck.reason === "mismatch") {
          res.status(400).json({ error: "Doğrulama kodu eşleşmedi. Lütfen tekrar kontrol edin." });
          return;
        }
        res.status(404).json({ error: "Doğrulama kaydı bulunamadı. Önce onay kodu isteyin." });
        return;
      }
      verifiedEmail = tokenCheck.email;
    }
    let updatedUser = userId ? db.users.find((u) => u.id === userId) : void 0;
    if (!updatedUser) {
      updatedUser = db.users.find((u) => u.email.toLowerCase() === verifiedEmail.toLowerCase());
    }
    if (updatedUser) {
      updatedUser.email = verifiedEmail;
      updatedUser.emailVerified = true;
      updatedUser.canUpload = true;
    }
    db.applications.forEach((appItem) => {
      if (appItem.accountEmail.toLowerCase() === verifiedEmail.toLowerCase()) {
        appItem.emailVerified = true;
      }
    });
    saveDb(db);
    res.json({
      verified: true,
      email: verifiedEmail,
      verifiedAt,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
      stats: buildServerStats()
    });
  });
  router.get("/forum", (_req, res) => {
    const db = getDb();
    res.json({ threads: [...db.threads].sort((a, b) => b.createdAt - a.createdAt) });
  });
  router.post("/forum", async (req, res) => {
    const { userId, title, category, body, sourceUrl, sourceTitle } = req.body;
    const { user, isPersisted } = resolveUser(userId);
    if (user.bannedUntil > Date.now()) {
      res.status(403).json({ error: "Hesabınız geçici olarak engellenmiştir.", bannedUntil: user.bannedUntil });
      return;
    }
    const cleanTitle = (title ?? "").trim();
    const cleanBody = (body ?? "").trim();
    if (cleanTitle.length < 4 || cleanBody.length < 10) {
      res.status(400).json({ error: "Başlık en az 4, içerik en az 10 karakter olmalıdır." });
      return;
    }
    const moderation = await moderateWithGemini(`${cleanTitle}
${cleanBody}`, "forum");
    if (!moderation.safe) {
      if (isPersisted) {
        user.bannedUntil = Date.now() + BAN_DURATION_MS;
        user.banReason = moderation.reason;
        saveDb(getDb());
      }
      res.status(403).json({
        banned: true,
        bannedUntil: Date.now() + BAN_DURATION_MS,
        error: moderation.reason
      });
      return;
    }
    const db = getDb();
    const newThread = {
      id: `thr-${crypto.randomUUID().slice(0, 8)}`,
      title: cleanTitle,
      category: category || "Donanım",
      body: cleanBody,
      aiSummary: moderation.summary,
      sourceUrl: sourceUrl?.trim() || void 0,
      sourceTitle: sourceTitle?.trim() || void 0,
      upvotes: isPersisted ? [user.id] : [],
      authorId: user.id,
      authorName: user.displayName,
      createdAt: Date.now(),
      replies: []
    };
    db.threads.unshift(newThread);
    saveDb(db);
    res.json({ thread: newThread, moderation, stats: buildServerStats() });
  });
  router.post("/forum/:id/upvote", (req, res) => {
    const { userId } = req.body;
    const { user } = resolveUser(userId);
    const db = getDb();
    const thread = db.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Tartışma bulunamadı." });
      return;
    }
    const list = Array.isArray(thread.upvotes) ? [...thread.upvotes] : [];
    const idx = list.indexOf(user.id);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(user.id);
    }
    thread.upvotes = list;
    saveDb(db);
    res.json({ thread });
  });
  router.post("/forum/:id/analyze", async (req, res) => {
    const db = getDb();
    const thread = db.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Tartışma bulunamadı." });
      return;
    }
    const result = await analyzeForumThreadWithGemini(thread.title, thread.body, thread.category);
    thread.aiAnalysis = result.analysis;
    saveDb(db);
    res.json({ thread, analysis: result.analysis, sources: result.sources });
  });
  router.post("/forum/:id/replies", async (req, res) => {
    const { userId, body } = req.body;
    const cleanBody = (body ?? "").trim();
    if (cleanBody.length < 2) {
      res.status(400).json({ error: "Yanıt metni boş olamaz." });
      return;
    }
    const { user, isPersisted } = resolveUser(userId);
    if (user.bannedUntil > Date.now()) {
      res.status(403).json({ error: "Hesabınız geçici olarak engellenmiştir.", bannedUntil: user.bannedUntil });
      return;
    }
    const moderation = await moderateWithGemini(cleanBody, "forum");
    if (!moderation.safe) {
      if (isPersisted) {
        user.bannedUntil = Date.now() + BAN_DURATION_MS;
        user.banReason = moderation.reason;
        saveDb(getDb());
      }
      res.status(403).json({
        banned: true,
        bannedUntil: Date.now() + BAN_DURATION_MS,
        error: moderation.reason
      });
      return;
    }
    const db = getDb();
    const thread = db.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Tartışma konusu bulunamadı." });
      return;
    }
    const reply = {
      id: `rep-${crypto.randomUUID().slice(0, 8)}`,
      authorId: user.id,
      authorName: user.displayName,
      body: cleanBody,
      createdAt: Date.now()
    };
    thread.replies.push(reply);
    saveDb(db);
    res.json({ thread, reply });
  });
  router.post("/ai/ask", async (req, res) => {
    const { question } = req.body;
    const cleanQuestion = (question ?? "").trim();
    if (cleanQuestion.length < 3) {
      res.status(400).json({ error: "Lütfen en az 3 karakterlik bir soru yazın." });
      return;
    }
    const db = getDb();
    const contextSummary = db.threads.slice(0, 4).map((t) => `- ${t.title} (${t.category})`).join("\n");
    const result = await askTechCoreAssistant(cleanQuestion, contextSummary);
    res.json(result);
  });
  router.get("/chat", (req, res) => {
    const db = getDb();
    const channel = typeof req.query.channel === "string" ? req.query.channel : void 0;
    const list = channel ? db.messages.filter((m) => (m.channel || "genel-teknoloji") === channel) : db.messages;
    res.json({
      messages: list.slice(-100),
      onlineCount: options.getOnlineClients?.() ?? 1
    });
  });
  router.post("/chat", async (req, res) => {
    const { userId, text, askAi, channel } = req.body;
    const result = await processIncomingChatMessage({
      userId,
      text,
      askAi,
      channel,
      onBroadcast: options.onChatBroadcast
    });
    if (!result.ok) {
      res.status(result.status).json({
        banned: result.banned,
        bannedUntil: result.bannedUntil,
        error: result.error
      });
      return;
    }
    res.json({
      message: result.message,
      aiReply: result.aiReply,
      messages: result.messages,
      stats: buildServerStats()
    });
  });
  router.get("/files", (_req, res) => {
    const db = getDb();
    res.json({ files: [...db.files].sort((a, b) => b.createdAt - a.createdAt) });
  });
  router.post("/applications", async (req, res) => {
    const { userId, name, surname, phone, accountType, accountEmail } = req.body;
    const cleanName = (name ?? "").trim();
    const cleanSurname = (surname ?? "").trim();
    const cleanPhone = (phone ?? "").trim();
    const cleanEmail = (accountEmail ?? "").trim().toLowerCase();
    if (!cleanName || !cleanSurname || cleanPhone.length < 7 || !isValidEmail(cleanEmail)) {
      res.status(400).json({ error: "Lütfen tüm başvuru alanlarını geçerli bilgilerle doldurun." });
      return;
    }
    const { user } = resolveUser(userId);
    const db = getDb();
    const isVerified = db.emailVerifications.some(
      (v) => v.email.toLowerCase() === cleanEmail && v.status === "verified"
    );
    const application = {
      id: `app-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      name: cleanName,
      surname: cleanSurname,
      phone: cleanPhone,
      accountType: accountType || "gmail",
      accountEmail: cleanEmail,
      emailVerified: isVerified,
      status: "pending",
      createdAt: Date.now()
    };
    db.applications.unshift(application);
    const admin = db.users.find((u) => u.email.toLowerCase() === ADMIN_EMAIL);
    if (admin) {
      admin.notifications.unshift({
        id: `notif-${crypto.randomUUID().slice(0, 8)}`,
        text: `Yeni yükleme başvurusu: ${cleanName} ${cleanSurname} (${cleanEmail})`,
        scope: "personal",
        createdAt: Date.now()
      });
    }
    saveDb(db);
    res.json({ application, stats: buildServerStats() });
  });
  router.post("/files/scan", async (req, res) => {
    const { userId, fileName, fileSize, mimeType, previewText, fileBase64 } = req.body;
    const { user, isPersisted } = resolveUser(userId);
    if (user.bannedUntil > Date.now()) {
      res.status(403).json({ banned: true, bannedUntil: user.bannedUntil, error: "Hesabınız engelli." });
      return;
    }
    if (!user.canUpload && !user.isAdmin && !user.emailVerified) {
      res.status(403).json({
        error: "Dosya yüklemek için e-posta doğrulaması yapın veya yönetici onayı alın."
      });
      return;
    }
    const metaCheck = validateUploadMetadata(fileName ?? "", fileSize ?? 0);
    if (!metaCheck.valid) {
      res.status(400).json({ error: metaCheck.error });
      return;
    }
    let fileBuffer = null;
    if (typeof fileBase64 === "string" && fileBase64.length > 0) {
      const stripped = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
      fileBuffer = Buffer.from(stripped, "base64");
    } else if (typeof previewText === "string") {
      fileBuffer = Buffer.from(previewText, "utf-8");
    }
    const effectiveSize = fileBuffer ? fileBuffer.length : fileSize ?? 0;
    const sha256 = fileBuffer ? crypto.createHash("sha256").update(fileBuffer).digest("hex") : crypto.createHash("sha256").update(fileName ?? "").digest("hex");
    const derivedText = previewText || (fileBuffer && /^(text\/|application\/(json|javascript|xml|x-sh))/.test(mimeType || "") ? fileBuffer.toString("utf-8").slice(0, 2e3) : void 0);
    const moderation = await moderateWithGemini(fileName ?? "", "file", derivedText, mimeType);
    if (!moderation.safe) {
      const bannedUntil = Date.now() + BAN_DURATION_MS;
      const reason = moderation.reason.toLowerCase().includes("üç günlüğüne ban yediniz") ? moderation.reason : `Üç günlüğüne ban yediniz: ${moderation.reason}`;
      if (isPersisted) {
        user.bannedUntil = bannedUntil;
        user.banReason = reason;
        saveDb(getDb());
      }
      res.status(403).json({
        banned: true,
        bannedUntil,
        error: reason
      });
      return;
    }
    const fileId = `file-${crypto.randomUUID().slice(0, 8)}`;
    const safeName = sanitizeFileName(fileName ?? "dosya.bin");
    const storedFileName = `${fileId}_${safeName}`;
    try {
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      if (fileBuffer) {
        fs.writeFileSync(path.join(UPLOADS_DIR, storedFileName), fileBuffer);
      }
    } catch {
    }
    const db = getDb();
    const fileRecord = {
      id: fileId,
      fileName: (fileName ?? safeName).trim(),
      fileSize: effectiveSize,
      mimeType: mimeType || "application/octet-stream",
      storedFileName,
      sha256,
      uploaderId: user.id,
      uploaderName: user.displayName,
      aiVerdict: moderation.reason,
      riskLevel: moderation.riskLevel === "warning" ? "warning" : "clean",
      previewText: derivedText ? derivedText.slice(0, 2e3) : void 0,
      createdAt: Date.now()
    };
    db.files.unshift(fileRecord);
    saveDb(db);
    pushOnlineNotification(
      `Dosya Merkezine yeni dosya eklendi: ${fileRecord.fileName} (${user.displayName})`,
      user.displayName
    );
    res.json({
      file: fileRecord,
      moderation,
      stats: buildServerStats()
    });
  });
  router.get("/files/:id/download", (req, res) => {
    const db = getDb();
    const file = db.files.find((f) => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: "Dosya bulunamadı." });
      return;
    }
    if (file.storedFileName) {
      const fullPath = path.join(UPLOADS_DIR, file.storedFileName);
      if (fs.existsSync(fullPath)) {
        res.download(fullPath, file.fileName);
        return;
      }
    }
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(file.fileName)}"`);
    res.setHeader("Content-Type", file.mimeType || "text/plain; charset=utf-8");
    res.send(file.previewText || "");
  });
  router.get("/files/:id/raw", (req, res) => {
    const db = getDb();
    const file = db.files.find((f) => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: "Dosya bulunamadı." });
      return;
    }
    if (file.storedFileName) {
      const fullPath = path.join(UPLOADS_DIR, file.storedFileName);
      if (fs.existsSync(fullPath)) {
        res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
        fs.createReadStream(fullPath).pipe(res);
        return;
      }
    }
    res.setHeader("Content-Type", file.mimeType || "text/plain; charset=utf-8");
    res.send(file.previewText || "");
  });
  router.get("/games", (_req, res) => {
    res.json({ games: getAllGames() });
  });
  router.post("/games/generate", async (req, res) => {
    const { userId, prompt } = req.body;
    const cleanPrompt = (prompt ?? "").trim();
    if (cleanPrompt.length < 4) {
      res.status(400).json({ error: "Lütfen oluşturmak istediğiniz oyunu en az 4 karakterle tarif edin." });
      return;
    }
    const { user, isPersisted } = resolveUser(userId);
    if (user.bannedUntil > Date.now()) {
      res.status(403).json({ banned: true, bannedUntil: user.bannedUntil, error: user.banReason || "Hesabınız engelli." });
      return;
    }
    const result = await generatePlayableGameWithGemini4Hydrogen(cleanPrompt);
    if (!result.ok) {
      if (result.banned) {
        const bannedUntil = Date.now() + BAN_DURATION_MS;
        if (isPersisted) {
          user.bannedUntil = bannedUntil;
          user.banReason = result.error;
          saveDb(getDb());
        }
        res.status(403).json({ banned: true, bannedUntil, error: result.error });
        return;
      }
      res.status(result.blockedByCopyright ? 403 : 503).json({
        blockedByCopyright: Boolean(result.blockedByCopyright),
        error: result.error
      });
      return;
    }
    res.json({
      gameDraft: {
        title: result.title,
        genre: result.genre,
        description: result.description,
        controlsHint: result.controlsHint,
        codeHtml: result.codeHtml,
        engine: result.engine
      }
    });
  });
  router.post("/games", async (req, res) => {
    const { userId, title, description, genre, controlsHint, codeHtml, aiGenerated } = req.body;
    const cleanTitle = (title ?? "").trim();
    const cleanDesc = (description ?? "").trim();
    const cleanCode = (codeHtml ?? "").trim();
    if (cleanTitle.length < 2 || cleanDesc.length < 4 || cleanCode.length < 40) {
      res.status(400).json({ error: "Oyun adı, açıklaması ve geçerli HTML5 oyun kodu gereklidir." });
      return;
    }
    if (cleanCode.length > 35e4) {
      res.status(400).json({ error: "Oyun kodu 350 KB boyut sınırını aşamaz." });
      return;
    }
    const { user, isPersisted } = resolveUser(userId);
    if (user.bannedUntil > Date.now()) {
      res.status(403).json({ banned: true, bannedUntil: user.bannedUntil, error: user.banReason || "Hesabınız engelli." });
      return;
    }
    const review = await moderateGameSubmissionWithGemini(cleanTitle, cleanDesc, cleanCode);
    if (!review.allowed) {
      if (!review.isCommercialOrRealGame && review.reason.toLowerCase().includes("ban yediniz")) {
        const bannedUntil = Date.now() + BAN_DURATION_MS;
        if (isPersisted) {
          user.bannedUntil = bannedUntil;
          user.banReason = review.reason;
          saveDb(getDb());
        }
        res.status(403).json({ banned: true, bannedUntil, error: review.reason });
        return;
      }
      res.status(403).json({
        blockedByCopyright: review.isCommercialOrRealGame,
        error: review.reason
      });
      return;
    }
    const validGenres = ["Arcade", "Bulmaca", "Refleks", "Uzay", "Strateji"];
    const safeGenre = validGenres.includes(genre) ? genre : "Arcade";
    const db = getDb();
    const newGame = {
      id: `game-${crypto.randomUUID().slice(0, 8)}`,
      title: cleanTitle.slice(0, 80),
      description: cleanDesc.slice(0, 320),
      genre: safeGenre,
      controlsHint: (controlsHint ?? "Klavye ve Fare").trim().slice(0, 120),
      codeHtml: cleanCode,
      isBuiltIn: false,
      aiGenerated: Boolean(aiGenerated),
      authorId: user.id,
      authorName: user.displayName,
      downloads: 0,
      createdAt: Date.now()
    };
    db.games.unshift(newGame);
    if (db.games.length > 100) {
      db.games = db.games.slice(0, 100);
    }
    saveDb(db);
    pushOnlineNotification(
      `Tech Games'te yeni oyun yayınlandı: ${newGame.title} (${user.displayName})`,
      user.displayName
    );
    res.json({
      game: newGame,
      games: getAllGames(),
      stats: buildServerStats()
    });
  });
  router.post("/games/:id/download", (req, res) => {
    const db = getDb();
    const builtIn = BUILTIN_TECH_GAMES.find((g) => g.id === req.params.id);
    if (builtIn) {
      db.builtinGameDownloads[builtIn.id] = (db.builtinGameDownloads[builtIn.id] ?? 0) + 1;
      saveDb(db);
      res.json({
        downloads: db.builtinGameDownloads[builtIn.id],
        games: getAllGames()
      });
      return;
    }
    const custom = db.games.find((g) => g.id === req.params.id);
    if (!custom) {
      res.status(404).json({ error: "Oyun bulunamadı." });
      return;
    }
    custom.downloads = (custom.downloads ?? 0) + 1;
    saveDb(db);
    res.json({
      downloads: custom.downloads,
      games: getAllGames()
    });
  });
  router.get("/games/:id/bundle", (req, res) => {
    const game = getAllGames().find((g) => g.id === req.params.id);
    if (!game) {
      res.status(404).json({ error: "Oyun bulunamadı." });
      return;
    }
    const slug = sanitizeFileName(game.title.toLowerCase().replace(/\s+/g, "-"));
    res.setHeader("Content-Disposition", `attachment; filename="${slug || "tech-game"}.html"`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(game.codeHtml);
  });
  router.get("/admin/overview", (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const db = getDb();
    const requester = db.users.find((u) => u.id === userId);
    if (!requester?.isAdmin) {
      res.status(403).json({ error: "Bu işlem için yönetici yetkisi gereklidir." });
      return;
    }
    res.json({
      applications: db.applications,
      users: db.users.map(sanitizeUser),
      emailLogs: [...db.emailVerifications].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(({ code: _c, ...pub }) => pub),
      stats: buildServerStats()
    });
  });
  router.post("/admin/applications/:id/decide", async (req, res) => {
    const { adminUserId, approved } = req.body;
    const db = getDb();
    const admin = db.users.find((u) => u.id === adminUserId);
    if (!admin?.isAdmin) {
      res.status(403).json({ error: "Yetkisiz işlem." });
      return;
    }
    const application = db.applications.find((a) => a.id === req.params.id);
    if (!application) {
      res.status(404).json({ error: "Başvuru bulunamadı." });
      return;
    }
    application.status = approved ? "approved" : "rejected";
    const targetUser = db.users.find((u) => u.id === application.userId);
    if (targetUser) {
      if (approved) {
        targetUser.canUpload = true;
      }
      targetUser.notifications.unshift({
        id: `notif-${crypto.randomUUID().slice(0, 8)}`,
        text: approved ? "Başvurunuz kabul edildi. Artık Dosya Merkezi üzerinden dosya yükleyebilirsiniz." : "Dosya yükleme başvurunuz yönetici tarafından reddedildi.",
        scope: "personal",
        createdAt: Date.now()
      });
    }
    saveDb(db);
    const emailResult = await dispatchApplicationDecisionEmail({
      recipientEmail: application.accountEmail,
      applicantName: `${application.name} ${application.surname}`,
      approved: Boolean(approved)
    });
    res.json({
      application,
      emailResult,
      stats: buildServerStats()
    });
  });
  router.post("/admin/users/:id/unban", (req, res) => {
    const { adminUserId } = req.body;
    const db = getDb();
    const admin = db.users.find((u) => u.id === adminUserId);
    if (!admin?.isAdmin) {
      res.status(403).json({ error: "Yetkisiz işlem." });
      return;
    }
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }
    target.bannedUntil = 0;
    target.banReason = void 0;
    saveDb(db);
    res.json({ user: sanitizeUser(target) });
  });
  router.post("/admin/users/:id/toggle-upload", (req, res) => {
    const { adminUserId } = req.body;
    const db = getDb();
    const admin = db.users.find((u) => u.id === adminUserId);
    if (!admin?.isAdmin) {
      res.status(403).json({ error: "Yetkisiz işlem." });
      return;
    }
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }
    target.canUpload = !target.canUpload;
    saveDb(db);
    res.json({ user: sanitizeUser(target) });
  });
  return router;
}
export {
  createApiRouter,
  processIncomingChatMessage,
  resolveUser,
  sanitizeFileName
};
