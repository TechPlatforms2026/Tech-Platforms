import test from "node:test";
import assert from "node:assert/strict";
import {
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
} from "./moderation.js";
test("isValidEmail accepts standard Gmail and custom domains, rejects malformed strings", () => {
  assert.equal(isValidEmail("test.user@gmail.com"), true);
  assert.equal(isValidEmail("dev.user+test@icloud.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("missing@domain"), false);
  assert.equal(isValidEmail("a@b.c"), false);
});
test("inferEmailProvider classifies Gmail, Apple, Microsoft, and custom domains", () => {
  assert.equal(inferEmailProvider("test.user@gmail.com"), "gmail");
  assert.equal(inferEmailProvider("user@icloud.com"), "apple");
  assert.equal(inferEmailProvider("team@outlook.com"), "microsoft");
  assert.equal(inferEmailProvider("ops@techcore.dev"), "other");
});
test("checkProfanityAndRisk blocks abusive terms with 3-day ban reason while allowing safe Turkish prose", () => {
  const clean = checkProfanityAndRisk("DDR5 bellek zamanlamaları FPS değerini etkiliyor mu?");
  assert.equal(clean.safe, true);
  const safeSubstring = checkProfanityAndRisk("Klasik sunucu mimarisinde eksik paket var.");
  assert.equal(safeSubstring.safe, true);
  const blocked = checkProfanityAndRisk("Bu dosya apk-malware içeriyor");
  assert.equal(blocked.safe, false);
  assert.ok(blocked.matchedTerms.includes("apk-malware"));
  assert.match(blocked.reason, /Üç günlüğüne ban yediniz/);
  assert.equal(BAN_DURATION_DAYS, 3);
  assert.equal(BAN_DURATION_MS, 72 * 3600 * 1e3);
});
test("checkCopyrightAndGeneralFileRisk blocks OS ISOs, commercial installers, and cracked files while allowing original configs/code", () => {
  const isoBlocked = checkCopyrightAndGeneralFileRisk("Windows_11_Pro.iso", "application/x-iso9660-image");
  assert.equal(isoBlocked.safe, false);
  assert.match(isoBlocked.reason, /Üç günlüğüne ban yediniz/);
  const crackBlocked = checkCopyrightAndGeneralFileRisk("adobe-photoshop-crack.zip", "application/zip");
  assert.equal(crackBlocked.safe, false);
  assert.match(crackBlocked.reason, /Üç günlüğüne ban yediniz/);
  const exeBlocked = checkCopyrightAndGeneralFileRisk("setup.exe", "application/x-msdownload");
  assert.equal(exeBlocked.safe, false);
  const safeJson = checkCopyrightAndGeneralFileRisk("sunucu-ayarlari.json", "application/json", '{"port": 3000}');
  assert.equal(safeJson.safe, true);
  const safeCode = checkCopyrightAndGeneralFileRisk("firewall-rules.conf", "text/plain", "allow 443/tcp");
  assert.equal(safeCode.safe, true);
});
test("checkCommercialGameRequest rejects real commercial games while allowing original indie prompts", () => {
  const gta = checkCommercialGameRequest("Bana GTA V benzeri açık dünya araba oyunu yap");
  assert.equal(gta.allowed, false);
  assert.equal(gta.matchedTitle, "gta");
  const minecraft = checkCommercialGameRequest("Minecraft");
  assert.equal(minecraft.allowed, false);
  const original = checkCommercialGameRequest("Uzay gemisi ile asteroitlerden kaçtığımız hızlı arcade oyunu");
  assert.equal(original.allowed, true);
});
test("generateVerificationCode always produces a 6-digit numeric string", () => {
  assert.equal(generateVerificationCode(() => 0), "100000");
  assert.equal(generateVerificationCode(() => 0.999999), "999999");
  const randomCode = generateVerificationCode();
  assert.match(randomCode, /^\d{6}$/);
});
test("isCodeExpired respects expiration boundary", () => {
  const expiresAt = 1e4;
  assert.equal(isCodeExpired(expiresAt, 9999), false);
  assert.equal(isCodeExpired(expiresAt, 1e4), false);
  assert.equal(isCodeExpired(expiresAt, 10001), true);
});
test("formatCountdown renders HH:MM:SS cleanly with zero floor", () => {
  assert.equal(formatCountdown(72 * 3600 * 1e3), "72:00:00");
  assert.equal(formatCountdown(3661 * 1e3), "01:01:01");
  assert.equal(formatCountdown(-500), "00:00:00");
});
test("validateUploadMetadata enforces non-empty and size limits", () => {
  assert.equal(validateUploadMetadata("config.json", 2048).valid, true);
  assert.equal(validateUploadMetadata("", 100).valid, false);
  assert.equal(validateUploadMetadata("empty.txt", 0).valid, false);
  assert.equal(validateUploadMetadata("huge.zip", 20 * 1024 * 1024).valid, false);
  assert.equal(formatFileSize(1536), "1.5 KB");
});
import { buildGmailApiRawMessage, encodeMimeSubjectUtf8 } from "./gmailMessage.js";
import { resolveMailConfig } from "../../server/mailer.js";
test("encodeMimeSubjectUtf8 encodes Turkish characters cleanly and strips CRLF injection", () => {
  const encoded = encodeMimeSubjectUtf8("TechCore Doğrulama Kodunuz: 123456\r\nBcc: evil@example.com");
  assert.ok(encoded.startsWith("=?UTF-8?B?"));
  assert.ok(encoded.endsWith("?="));
  const decoded = Buffer.from(encoded.slice(10, -2), "base64").toString("utf8");
  assert.equal(decoded.includes("\r"), false);
  assert.equal(decoded.includes("\n"), false);
  assert.ok(decoded.includes("Doğrulama Kodunuz: 123456"));
});
test("buildGmailApiRawMessage produces valid URL-safe base64 MIME payload", () => {
  const raw = buildGmailApiRawMessage({
    fromEmail: "sender@gmail.com",
    toEmail: "user@gmail.com",
    subject: "TechCore Şifre Sıfırlama",
    textBody: "Kod: 654321",
    htmlBody: "<p>Kod: <strong>654321</strong></p>"
  });
  assert.equal(/[+/=]/.test(raw), false);
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const decodedMime = Buffer.from(padded, "base64").toString("utf8");
  assert.ok(decodedMime.includes("To: user@gmail.com"));
  assert.ok(decodedMime.includes('From: "TechCore Güvenlik" <sender@gmail.com>'));
  assert.ok(decodedMime.includes('Content-Type: text/html; charset="UTF-8"'));
});
test("resolveMailConfig strips Google 4x4 spaces, accidental SMTP prefixes, and surrounding quotes", () => {
  const cfg = resolveMailConfig({
    SMTP_USER: 'SMTP_USER:"tester@gmail.com"',
    SMTP_PASS: "SMTP_PASS: abcd efgh ijkl mnop "
  });
  assert.equal(cfg.smtpUser, "tester@gmail.com");
  assert.equal(cfg.smtpPass, "abcdefghijklmnop");
  assert.equal(cfg.isGmail, true);
  const quoted = resolveMailConfig({
    GMAIL_USER: "'other@gmail.com'",
    GMAIL_APP_PASSWORD: '"qwer tyui opas dfgh"'
  });
  assert.equal(quoted.smtpUser, "other@gmail.com");
  assert.equal(quoted.smtpPass, "qwertyuiopasdfgh");
  assert.equal(quoted.isGmail, true);
});
