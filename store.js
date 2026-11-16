import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function resolveWritableDataDir() {
  const isServerless = Boolean(
    process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL
  );
  if (isServerless) {
    return path.join(os.tmpdir(), "techcore-data");
  }
  const localDir = path.resolve(process.cwd(), ".data");
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    return path.join(os.tmpdir(), "techcore-data");
  }
}
const DATA_DIR = resolveWritableDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "techcore-db.json");
const ADMIN_EMAIL = "asafselimerkut34@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "z3435";
const DEFAULT_PREFERENCES = {
  liveNewsAutoRefresh: true,
  chatNotifications: true,
  emailAlerts: true,
  compactView: false
};
function createInitialDb() {
  const now = Date.now();
  return {
    users: [
      {
        id: "admin-asaf",
        displayName: "Asaf",
        email: ADMIN_EMAIL,
        emailVerified: true,
        phone: "",
        isAdmin: true,
        canUpload: true,
        bannedUntil: 0,
        passwordHash: DEFAULT_ADMIN_PASSWORD,
        preferences: { ...DEFAULT_PREFERENCES },
        notifications: [],
        createdAt: now
      }
    ],
    threads: [],
    messages: [],
    applications: [],
    files: [],
    games: [],
    builtinGameDownloads: {},
    emailVerifications: [],
    onlineNotifications: [],
    installedLockHash: void 0
  };
}
let cachedDb = null;
function getDb() {
  if (cachedDb) return cachedDb;
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      parsed.users = (parsed.users ?? []).filter((u) => u.id !== "user-kerem" && !(u.displayName.startsWith("Misafir_") && !u.email)).map((u) => ({
        ...u,
        notifications: (u.notifications ?? []).filter((n) => n.id !== "notif-init-1"),
        preferences: { ...DEFAULT_PREFERENCES, ...u.preferences ?? {} }
      }));
      parsed.threads = (parsed.threads ?? []).filter((t) => t.authorId !== "user-kerem" && t.id !== "thread-ddr5" && t.id !== "thread-ai-sec" && t.id !== "thread-smtp").map((t) => ({
        ...t,
        upvotes: Array.isArray(t.upvotes) ? t.upvotes : []
      }));
      parsed.messages = (parsed.messages ?? []).filter((m) => m.userId !== "user-kerem" && !["msg-1", "msg-2", "msg-3", "msg-4"].includes(m.id)).map((m) => ({
        ...m,
        channel: m.channel ?? "genel-teknoloji"
      }));
      parsed.files = (parsed.files ?? []).filter(
        (f) => f.id !== "file-seed-1" && f.id !== "file-seed-2" && f.uploaderId !== "user-kerem"
      );
      parsed.games = Array.isArray(parsed.games) ? parsed.games : [];
      parsed.builtinGameDownloads = parsed.builtinGameDownloads && typeof parsed.builtinGameDownloads === "object" ? parsed.builtinGameDownloads : {};
      parsed.onlineNotifications = Array.isArray(parsed.onlineNotifications) ? parsed.onlineNotifications : [];
      cachedDb = parsed;
      return cachedDb;
    }
  } catch (err) {
    console.error("Veritabanı okuma hatası, varsayılan oluşturuluyor:", err);
  }
  cachedDb = createInitialDb();
  saveDb(cachedDb);
  return cachedDb;
}
function saveDb(db) {
  cachedDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Veritabanı kaydetme hatası:", err);
  }
}
function sanitizeUser(user) {
  const { passwordHash: _ignored, ...safe } = user;
  return {
    ...safe,
    preferences: { ...DEFAULT_PREFERENCES, ...safe.preferences ?? {} }
  };
}
export {
  ADMIN_EMAIL,
  DATA_DIR,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_PREFERENCES,
  UPLOADS_DIR,
  getDb,
  sanitizeUser,
  saveDb
};
