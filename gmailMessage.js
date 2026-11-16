function toBase64Utf8(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function toBase64UrlUtf8(input) {
  return toBase64Utf8(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sanitizeHeaderValue(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
}
function encodeMimeSubjectUtf8(subject) {
  const clean = sanitizeHeaderValue(subject);
  return `=?UTF-8?B?${toBase64Utf8(clean)}?=`;
}
function buildGmailApiRawMessage(input) {
  const to = sanitizeHeaderValue(input.toEmail);
  const from = input.fromEmail ? sanitizeHeaderValue(input.fromEmail) : "";
  const boundary = `techcore_alt_${Math.random().toString(36).slice(2, 10)}`;
  const headers = [];
  if (from) {
    headers.push(`From: "TechCore Güvenlik" <${from}>`);
  }
  headers.push(`To: ${to}`);
  headers.push(`Subject: ${encodeMimeSubjectUtf8(input.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const mimeParts = [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Utf8(input.textBody),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Utf8(input.htmlBody),
    "",
    `--${boundary}--`
  ];
  return toBase64UrlUtf8(mimeParts.join("\r\n"));
}
export {
  buildGmailApiRawMessage,
  encodeMimeSubjectUtf8
};
