import nodemailer from "nodemailer";
import { buildGmailApiRawMessage } from "../src/lib/gmailMessage.js";
class MailNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "MailNotConfiguredError";
  }
}
class MailDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = "MailDeliveryError";
  }
}
function cleanEnvCredential(raw, prefixPattern) {
  let val = raw.trim();
  if (prefixPattern.test(val)) {
    val = val.replace(prefixPattern, "").trim();
  }
  if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1).trim();
  }
  return val;
}
function resolveMailConfig(env = process.env) {
  const smtpUser = cleanEnvCredential(
    env.SMTP_USER || env.GMAIL_USER || "",
    /^(SMTP_USER|GMAIL_USER)\s*[:=]\s*/i
  );
  let smtpPass = cleanEnvCredential(
    env.SMTP_PASS || env.GMAIL_APP_PASSWORD || "",
    /^(SMTP_PASS|GMAIL_APP_PASSWORD)\s*[:=]\s*/i
  );
  const smtpHost = (env.SMTP_HOST || "").trim();
  const smtpPort = Number(env.SMTP_PORT || "465");
  const smtpFrom = cleanEnvCredential(env.SMTP_FROM || smtpUser || "", /^SMTP_FROM\s*[:=]\s*/i);
  const resendApiKey = (env.RESEND_API_KEY || "").trim();
  const resendFrom = (env.RESEND_FROM || smtpFrom || "TechCore <onboarding@resend.dev>").trim();
  const isGmail = smtpHost.includes("gmail") || smtpUser.toLowerCase().endsWith("@gmail.com") || Boolean(env.GMAIL_USER);
  if (isGmail || /^[a-z0-9]{4}(?:\s+[a-z0-9]{4}){3}$/i.test(smtpPass)) {
    smtpPass = smtpPass.replace(/\s+/g, "");
  }
  return {
    smtpUser,
    smtpPass,
    smtpHost,
    smtpPort,
    smtpFrom,
    resendApiKey,
    resendFrom,
    isGmail
  };
}
function getSmtpStatus() {
  const cfg = resolveMailConfig();
  if (cfg.smtpUser && cfg.smtpPass) {
    return {
      configured: true,
      providerLabel: cfg.isGmail ? "Gmail Posta Sunucusu (Aktif)" : `E-Posta Sunucusu (${cfg.smtpHost || "Aktif"})`
    };
  }
  if (cfg.resendApiKey) {
    return {
      configured: true,
      providerLabel: "Resend E-Posta API (Aktif)"
    };
  }
  return {
    configured: false,
    providerLabel: "Google Gmail Bağlantısı Hazır"
  };
}
function buildVerificationEmailHtml(params) {
  const titleMap = {
    verify: "E-Posta Adresinizi Doğrulayın",
    application: "Dosya Yükleme Başvurusu Doğrulaması",
    reset: "Şifre Sıfırlama Güvenlik Kodu",
    login: "TechCore Oturum Açma Onay Kodu"
  };
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #090D16; color: #F1F5F9; padding: 32px 16px;">
    <div style="max-width: 520px; margin: 0 auto; background-color: #0F1623; border: 1px solid #1E293B; border-radius: 14px; padding: 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-family: 'Courier New', monospace; font-size: 16px; font-weight: 800; color: #090D16; letter-spacing: 0.02em;">
            TC
          </td>
          <td style="padding-left: 12px; vertical-align: middle;">
            <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.08em; color: #FFFFFF; line-height: 1.1;">TECHCORE</div>
            <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.06em; color: #38BDF8; text-transform: uppercase; margin-top: 2px;">Güvenlik &amp; Doğrulama</div>
          </td>
        </tr>
      </table>
      <h1 style="font-size: 20px; font-weight: 600; color: #FFFFFF; margin: 0 0 12px 0;">${titleMap[params.purpose]}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 0 0 24px 0;">
        Merhaba <strong style="color: #E2E8F0;">${params.recipientEmail}</strong>,<br/>
        TechCore üzerinde başlattığınız işlem için 6 haneli tek kullanımlık onay kodunuz aşağıdadır:
      </p>
      <div style="background-color: #090D16; border: 1px solid #0284C7; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38BDF8;">${params.code}</span>
      </div>
      <p style="font-size: 13px; line-height: 1.5; color: #CBD5E1; background-color: #162032; padding: 12px 16px; border-radius: 8px; margin: 0 0 20px 0;">
        ${params.aiSecurityNote}
      </p>
      <p style="font-size: 12px; color: #64748B; margin: 0;">
        Bu kod 15 dakika boyunca geçerlidir. Kodu yalnızca TechCore doğrulama ekranına girin.
      </p>
    </div>
  </div>`;
}
async function sendViaSmtpWithFallback(cfg, mailOptions) {
  const host = cfg.smtpHost || "smtp.gmail.com";
  const portsToTry = cfg.isGmail ? [
    { port: 465, secure: true, requireTLS: false },
    { port: 587, secure: false, requireTLS: true }
  ] : [{ port: cfg.smtpPort, secure: cfg.smtpPort === 465, requireTLS: cfg.smtpPort === 587 }];
  let lastErr = null;
  for (const attempt of portsToTry) {
    const transporter = nodemailer.createTransport({
      host,
      port: attempt.port,
      secure: attempt.secure,
      requireTLS: attempt.requireTLS,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      connectionTimeout: 4500,
      greetingTimeout: 4500,
      socketTimeout: 6e3
    });
    try {
      const info = await transporter.sendMail(mailOptions);
      return { messageId: info.messageId };
    } catch (err) {
      lastErr = err;
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      const msg = err instanceof Error ? err.message : "";
      if (code === "EAUTH" || /535|Username and Password not accepted|Invalid login/i.test(msg)) {
        break;
      }
    }
  }
  throw lastErr;
}
async function dispatchVerificationEmail(params) {
  const cfg = resolveMailConfig();
  const html = buildVerificationEmailHtml(params);
  const subjectMap = {
    verify: `TechCore Doğrulama Kodunuz: ${params.code}`,
    application: `TechCore Başvuru Doğrulama Kodu: ${params.code}`,
    reset: `TechCore Şifre Sıfırlama Kodunuz: ${params.code}`,
    login: `TechCore Giriş Onay Kodunuz: ${params.code}`
  };
  const subject = subjectMap[params.purpose];
  const textBody = `TechCore doğrulama kodunuz: ${params.code}

${params.aiSecurityNote}

Bu kod 15 dakika geçerlidir.`;
  const oauthToken = (params.gmailAccessToken || "").trim();
  let smtpError = null;
  if (cfg.smtpUser && cfg.smtpPass) {
    try {
      const info = await sendViaSmtpWithFallback(cfg, {
        from: `"TechCore Güvenlik" <${cfg.smtpFrom || cfg.smtpUser}>`,
        to: params.recipientEmail,
        subject,
        text: textBody,
        html
      });
      return {
        transport: cfg.isGmail ? "gmail-smtp" : "smtp",
        messageId: info.messageId
      };
    } catch (err) {
      smtpError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[TechCore Mailer SMTP Error]", errMsg);
    }
  }
  if (oauthToken) {
    const raw = buildGmailApiRawMessage({
      fromEmail: params.gmailSenderEmail,
      toEmail: params.recipientEmail,
      subject,
      textBody,
      htmlBody: html
    });
    try {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(8500)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[TechCore Mailer Gmail API HTTP Error]", res.status, errText.slice(0, 300));
        if (res.status === 401) {
          throw new MailDeliveryError(
            `Google Gmail oturumunun süresi dolmuş. Lütfen tekrar "Gmail'e Bağlan" butonuna basın.`
          );
        }
        if (res.status === 403) {
          throw new MailDeliveryError(
            "Google hesabında Gmail gönderme izni onaylanmamış görünüyor. Lütfen izin ekranındaki tüm kutucukları işaretleyerek tekrar deneyin."
          );
        }
        throw new MailDeliveryError("Google Gmail servisi şu anda gönderimi onaylayamadı. Lütfen tekrar deneyin.");
      }
      const data = await res.json();
      return {
        transport: "gmail-oauth",
        messageId: data.id || `gmail-oauth-${Date.now()}`
      };
    } catch (err) {
      if (err instanceof MailDeliveryError) throw err;
      console.error("[TechCore Mailer Gmail API Fetch Error]", err instanceof Error ? err.message : String(err));
      throw new MailDeliveryError(
        "Google Gmail servisine şu anda bağlanılamadı. Lütfen birkaç saniye sonra tekrar deneyin veya şifre ile giriş yapın."
      );
    }
  }
  if (cfg.resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: cfg.resendFrom,
          to: [params.recipientEmail],
          subject,
          text: textBody,
          html
        }),
        signal: AbortSignal.timeout(7500)
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[TechCore Mailer Resend Error]", res.status, errBody.slice(0, 200));
        throw new MailDeliveryError("E-posta gönderim servisi isteği kabul etmedi. Lütfen tekrar deneyin.");
      }
      const data = await res.json();
      return {
        transport: "resend",
        messageId: data.id || `resend-${Date.now()}`
      };
    } catch (err) {
      if (err instanceof MailDeliveryError) throw err;
      throw new MailDeliveryError("E-posta gönderim servisine şu anda bağlanılamadı.");
    }
  }
  return {
    transport: "sandbox-instant",
    messageId: `sandbox-${Date.now()}`,
    sandboxCode: params.code
  };
}
async function dispatchApplicationDecisionEmail(params) {
  const cfg = resolveMailConfig();
  if (!cfg.smtpUser || !cfg.smtpPass) {
    return { sent: false, transport: "unconfigured" };
  }
  try {
    await sendViaSmtpWithFallback(cfg, {
      from: `"TechCore Yönetim" <${cfg.smtpFrom || cfg.smtpUser}>`,
      to: params.recipientEmail,
      subject: params.approved ? "TechCore Dosya Yükleme Yetkiniz Onaylandı" : "TechCore Dosya Yükleme Başvurunuz Hakkında",
      text: params.approved ? `Merhaba ${params.applicantName}, TechCore dosya yükleme başvurunuz yönetici tarafından onaylandı. Artık platforma dosya yükleyebilirsiniz.` : `Merhaba ${params.applicantName}, TechCore dosya yükleme başvurunuz şu aşamada onaylanmadı.`
    });
    return { sent: true, transport: cfg.isGmail ? "gmail-smtp" : "smtp" };
  } catch {
    return { sent: false, transport: "error" };
  }
}
export {
  MailDeliveryError,
  MailNotConfiguredError,
  buildVerificationEmailHtml,
  cleanEnvCredential,
  dispatchApplicationDecisionEmail,
  dispatchVerificationEmail,
  getSmtpStatus,
  resolveMailConfig
};
