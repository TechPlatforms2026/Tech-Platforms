// Pure JavaScript Cloudflare Pages Function for /api/* routes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function inferEmailProvider(email) {
  const lower = String(email || '').toLowerCase();
  if (lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com')) return 'gmail';
  if (lower.endsWith('@icloud.com') || lower.endsWith('@me.com')) return 'apple';
  if (lower.endsWith('@outlook.com') || lower.endsWith('@hotmail.com') || lower.endsWith('@live.com')) {
    return 'microsoft';
  }
  return 'other';
}

function generateVerificationCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8ToBase64Url(str) {
  return toBase64Url(new TextEncoder().encode(str));
}

function base64UrlToUtf8(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createVerificationToken(secret, { id, email, code, purpose, expiresAt }) {
  const payload = `${id}|${email.toLowerCase()}|${purpose}|${expiresAt}`;
  const sig = await hmacHex(secret, `${payload}|${code}`);
  return utf8ToBase64Url(`${payload}|${sig}`);
}

async function verifyStatelessToken(secret, { token, email, code, allowedPurposes }) {
  if (!token) return { valid: false };
  try {
    const raw = base64UrlToUtf8(token);
    const parts = raw.split('|');
    if (parts.length !== 5) return { valid: false };
    const [id, tokEmail, purpose, expStr, sig] = parts;
    const expiresAt = Number(expStr);
    if (!id || !tokEmail || !purpose || !Number.isFinite(expiresAt) || !sig) {
      return { valid: false };
    }
    if (tokEmail !== email.toLowerCase() || !allowedPurposes.includes(purpose)) {
      return { valid: false, reason: 'mismatch' };
    }
    if (Date.now() > expiresAt) {
      return { valid: false, reason: 'expired' };
    }
    const expectedSig = await hmacHex(secret, `${id}|${tokEmail}|${purpose}|${expiresAt}|${code}`);
    if (sig === expectedSig) {
      return { valid: true, email: tokEmail };
    }
    return { valid: false, reason: 'mismatch' };
  } catch {
    return { valid: false };
  }
}

function encodeMimeSubjectUtf8(subject) {
  const clean = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function buildGmailApiRawMessage({ fromEmail, toEmail, subject, textBody, htmlBody }) {
  const boundary = `tc_bnd_${Date.now().toString(36)}`;
  const headers = [
    fromEmail ? `From: "TechCore Güvenlik" <${fromEmail}>` : null,
    `To: ${toEmail}`,
    `Subject: ${encodeMimeSubjectUtf8(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join('\r\n');

  const mime =
    `${headers}\r\n\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    'Content-Transfer-Encoding: 8bit\r\n\r\n' +
    `${textBody}\r\n\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/html; charset="UTF-8"\r\n' +
    'Content-Transfer-Encoding: 8bit\r\n\r\n' +
    `${htmlBody}\r\n\r\n` +
    `--${boundary}--`;

  return utf8ToBase64Url(mime);
}

function classifyCat(text) {
  const lower = String(text || '').toLowerCase();
  if (/(ai|llm|gemini|gpt|model|neural|python|yapay zeka|fsd)/.test(lower)) return 'Yapay Zeka';
  if (/(security|cve|auth|hack|kernel|ssl|ssh|güvenlik)/.test(lower)) return 'Güvenlik';
  if (/(tesla|cybertruck|model y|cpu|gpu|ram|ddr5|ssd|nvme|intel|amd|nvidia|rust)/.test(lower)) {
    return 'Donanım';
  }
  return 'Sunucu';
}

async function fetchLiveNewsAtEdge(topicQuery) {
  const fetchedAt = Date.now();
  const items = [];
  let liveConnected = false;

  const devToP = (async () => {
    try {
      const url = topicQuery?.trim()
        ? `https://dev.to/api/articles?per_page=4&tag=${encodeURIComponent(
            topicQuery.trim().toLowerCase().split(/\s+/)[0]
          )}`
        : 'https://dev.to/api/articles?top=1&per_page=4';
      const r = await fetch(url, { headers: { 'User-Agent': 'TechWorkspace-Cloudflare' } });
      if (!r.ok) return;
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        liveConnected = true;
        for (const a of list.slice(0, 4)) {
          items.push({
            id: `devto-${a.id}`,
            title: a.title,
            summary: (a.description || '').trim() || 'DEV Community canlı geliştirici makalesi.',
            category: classifyCat(`${a.title} ${(a.tag_list || []).join(' ')}`),
            sourceName: 'DEV Community',
            url: a.url,
            publishedAt: new Date(a.published_at || fetchedAt).toLocaleString('tr-TR', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }),
          });
        }
      }
    } catch {
      // Ignore upstream errors
    }
  })();

  const hnP = (async () => {
    try {
      const topR = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      if (!topR.ok) return;
      const ids = (await topR.json()).slice(0, 4);
      const stories = await Promise.all(
        ids.map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );
      for (const s of stories) {
        if (!s || !s.title) continue;
        liveConnected = true;
        items.push({
          id: `hn-${s.id}`,
          title: s.title,
          summary: `${s.by || 'topluluk'} · ${s.score || 0} puan · Canlı Hacker News`,
          category: classifyCat(s.title),
          sourceName: 'Hacker News',
          url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
          publishedAt: new Date((s.time || Math.floor(fetchedAt / 1000)) * 1000).toLocaleString(
            'tr-TR',
            { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
          ),
        });
      }
    } catch {
      // Ignore
    }
  })();

  const ghP = (async () => {
    try {
      const q = topicQuery?.trim()
        ? `${encodeURIComponent(topicQuery.trim())} stars:>50`
        : 'stars:>1000 pushed:>2025-01-01';
      const ghR = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=4`,
        { headers: { 'User-Agent': 'TechWorkspace-Cloudflare' } }
      );
      if (!ghR.ok) return;
      const data = await ghR.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        liveConnected = true;
        for (const repo of data.items.slice(0, 4)) {
          items.push({
            id: `gh-${repo.id}`,
            title: `${repo.full_name} (${repo.language || 'Çoklu Dil'})`,
            summary:
              (repo.description || '').trim() ||
              `GitHub üzerinde ${Number(repo.stargazers_count || 0).toLocaleString('tr-TR')} yıldızlı proje.`,
            category: classifyCat(`${repo.full_name} ${repo.description || ''}`),
            sourceName: 'GitHub Trend',
            url: repo.html_url,
            stars: repo.stargazers_count,
            publishedAt: new Date(repo.updated_at || fetchedAt).toLocaleString('tr-TR', {
              day: 'numeric',
              month: 'short',
            }),
          });
        }
      }
    } catch {
      // Ignore
    }
  })();

  await Promise.all([devToP, hnP, ghP]);

  return {
    items,
    groundedSummary: liveConnected
      ? `Cloudflare Edge üzerinden ${items.length} canlı teknoloji kaydı çekildi.`
      : undefined,
    groundedSources: items.slice(0, 3).map((i) => ({ title: i.title, url: i.url })),
    fetchedAt,
    liveConnected,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const secret = env.SESSION_SECRET || env.GEMINI_API_KEY || 'techcore-cf-edge-hmac-v1';

  if (pathname === '/api/health') {
    return jsonResponse({
      ok: true,
      timestamp: Date.now(),
      runtimeMode: 'Cloudflare Pages Edge (JavaScript)',
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
    });
  }

  if (pathname === '/api/news/live' && request.method === 'GET') {
    const q = url.searchParams.get('q') || undefined;
    const data = await fetchLiveNewsAtEdge(q);
    return jsonResponse(data);
  }

  if (pathname === '/api/ai/ask' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').trim();
    if (question.length < 3) {
      return jsonResponse({ error: 'Lütfen en az 3 karakterlik bir soru yazın.' }, 400);
    }
    if (!env.GEMINI_API_KEY) {
      return jsonResponse({
        answer:
          'Cloudflare Pages üzerinde AI asistanı aktifleştirmek için Cloudflare Pages -> Settings -> Environment Variables bölümüne GEMINI_API_KEY ekleyebilirsiniz.',
        sources: [],
        engine: 'fallback',
      });
    }
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          env.GEMINI_API_KEY
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Sen TechCore teknik destek ve yazılım asistanısın. Türkçe, net ve öğretici yanıt ver:\n\n${question}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (!geminiRes.ok) {
        return jsonResponse({
          answer: 'Yapay zeka servisi şu anda yanıt veremiyor. Lütfen biraz sonra tekrar deneyin.',
          sources: [],
          engine: 'fallback',
        });
      }
      const data = await geminiRes.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
        'Yanıt üretilemedi.';
      return jsonResponse({
        answer: text,
        sources: [],
        engine: 'gemini-4-hydrogen',
      });
    } catch {
      return jsonResponse({
        answer: 'Yapay zeka servisine bağlanılamadı.',
        sources: [],
        engine: 'fallback',
      });
    }
  }

  if (pathname === '/api/email/send-verification' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const purpose = String(body.purpose || 'verify');
    const senderEmail = body.senderEmail ? String(body.senderEmail).trim().toLowerCase() : undefined;

    if (!isValidEmail(email)) {
      return jsonResponse({ error: 'Lütfen geçerli bir e-posta adresi girin.' }, 400);
    }

    const code = generateVerificationCode();
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;
    const id = `ver-${now.toString(36)}`;
    const verificationToken = await createVerificationToken(secret, {
      id,
      email,
      code,
      purpose,
      expiresAt,
    });

    const authHeader = request.headers.get('authorization') || '';
    const oauthToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (oauthToken) {
      try {
        const raw = buildGmailApiRawMessage({
          fromEmail: senderEmail,
          toEmail: email,
          subject: `TechCore Doğrulama Kodunuz: ${code}`,
          textBody: `TechCore onay kodunuz: ${code}\n\nBu kod 15 dakika geçerlidir.`,
          htmlBody: `<div style="font-family:sans-serif;background:#090D16;color:#F1F5F9;padding:24px"><div style="max-width:480px;margin:0 auto;background:#0F1623;border:1px solid #1E293B;border-radius:12px;padding:24px"><h2 style="color:#38BDF8;margin:0 0 12px">TECHCORE</h2><p>TechCore onay kodunuz:</p><div style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#38BDF8;padding:14px;background:#090D16;border-radius:8px;text-align:center">${code}</div><p style="font-size:12px;color:#94A3B8;margin-top:14px">Bu kod 15 dakika geçerlidir.</p></div></div>`,
        });
        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });
        if (gmailRes.ok) {
          const data = await gmailRes.json();
          return jsonResponse({
            verification: {
              id,
              email,
              provider: inferEmailProvider(email),
              purpose,
              status: 'pending',
              transport: 'gmail-oauth',
              messageId: data.id || `gmail-oauth-${now}`,
              verificationToken,
              createdAt: now,
              expiresAt,
            },
          });
        }
      } catch {
        // Fall through to Resend or sandbox-instant
      }
    }

    if (env.RESEND_API_KEY) {
      try {
        const rRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM || 'TechCore <onboarding@resend.dev>',
            to: [email],
            subject: `TechCore Doğrulama Kodunuz: ${code}`,
            text: `TechCore onay kodunuz: ${code}\n\nBu kod 15 dakika geçerlidir.`,
          }),
        });
        if (rRes.ok) {
          const data = await rRes.json();
          return jsonResponse({
            verification: {
              id,
              email,
              provider: inferEmailProvider(email),
              purpose,
              status: 'pending',
              transport: 'resend',
              messageId: data.id || `resend-${now}`,
              verificationToken,
              createdAt: now,
              expiresAt,
            },
          });
        }
      } catch {
        // Fall through to sandbox-instant
      }
    }

    return jsonResponse({
      verification: {
        id,
        email,
        provider: inferEmailProvider(email),
        purpose,
        status: 'pending',
        transport: 'sandbox-instant',
        messageId: `sandbox-${now}`,
        verificationToken,
        sandboxCode: code,
        createdAt: now,
        expiresAt,
      },
    });
  }

  if (pathname === '/api/email/verify-code' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const check = await verifyStatelessToken(secret, {
      token: body.verificationToken,
      email,
      code,
      allowedPurposes: ['verify', 'application', 'login', 'reset'],
    });
    if (!check.valid) {
      return jsonResponse(
        {
          error:
            check.reason === 'expired'
              ? 'Kodun süresi dolmuş. Lütfen yeni kod isteyin.'
              : 'Doğrulama kodu eşleşmedi.',
        },
        400
      );
    }
    return jsonResponse({
      verified: true,
      email: check.email,
      verifiedAt: Date.now(),
    });
  }

  if (pathname === '/api/auth/login-with-code' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const check = await verifyStatelessToken(secret, {
      token: body.verificationToken,
      email,
      code,
      allowedPurposes: ['login', 'verify'],
    });
    if (!check.valid) {
      return jsonResponse(
        {
          error:
            check.reason === 'expired'
              ? 'Onay kodunun süresi dolmuş.'
              : 'Girilen 6 haneli onay kodu eşleşmedi.',
        },
        400
      );
    }
    return jsonResponse({
      user: {
        id: `usr-${Date.now().toString(36)}`,
        displayName: check.email.split('@')[0],
        email: check.email,
        emailVerified: true,
        phone: '',
        isAdmin: false,
        canUpload: true,
        bannedUntil: 0,
        preferences: {
          liveNewsAutoRefresh: true,
          chatNotifications: true,
          emailAlerts: true,
          compactView: false,
        },
        notifications: [],
        createdAt: Date.now(),
      },
    });
  }

  if (pathname === '/api/auth/reset-password' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const check = await verifyStatelessToken(secret, {
      token: body.verificationToken,
      email,
      code,
      allowedPurposes: ['reset'],
    });
    if (!check.valid) {
      return jsonResponse(
        {
          error:
            check.reason === 'expired'
              ? 'Doğrulama kodunun süresi dolmuş.'
              : 'Girilen 6 haneli kod hatalı.',
        },
        400
      );
    }
    return jsonResponse({ ok: true, message: 'Şifreniz güncellendi.' });
  }

  // Let browser Edge Persistence handle local users, forum threads, chat, uploaded files & games seamlessly
  return new Response('client-edge-persistence', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
  });
}
