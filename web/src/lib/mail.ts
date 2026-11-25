import { secret } from "./billing/secrets";
import { absoluteUrl, SITE_NAME } from "./site";

// Emails Remixt sends: confirming an address, resetting a password. Through
// Resend's HTTP API (RESEND_API_KEY + MAIL_FROM, from the server or Admin →
// Plans) — one request, no SMTP. Without a key nothing can be sent: the link
// is written to the server log instead (fine on a dev machine), and the
// caller is told, so nobody is locked out waiting for an email that never comes.

export type Sent = { sent: true } | { sent: false; reason: "not-configured" | "failed" };

export async function mailReady(): Promise<boolean> {
  return !!(await secret("RESEND_API_KEY"));
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A plain, readable email with one button — the same look for every message. */
export function layout(o: { heading: string; lines: string[]; button: { label: string; href: string }; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8f0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#15151d;border:1px solid #2a2a36;border-radius:16px;padding:28px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:12px">${escapeHtml(o.heading)}</td></tr>
${o.lines.map((l) => `<tr><td style="font-size:15px;line-height:1.55;color:#c8c8d4;padding-bottom:10px">${escapeHtml(l)}</td></tr>`).join("")}
<tr><td style="padding:16px 0"><a href="${escapeHtml(o.button.href)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escapeHtml(o.button.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#8a8a99;line-height:1.5">If the button doesn't work, open this link:<br><span style="word-break:break-all">${escapeHtml(o.button.href)}</span></td></tr>
<tr><td style="font-size:12px;color:#8a8a99;padding-top:18px">${escapeHtml(o.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.heading, "", ...o.lines, "", `${o.button.label}: ${o.button.href}`, "", o.footer].join("\n");
  return { html, text };
}

export async function sendMail(to: string, subject: string, body: { html: string; text: string }): Promise<Sent> {
  const [key, from] = await Promise.all([secret("RESEND_API_KEY"), secret("MAIL_FROM")]);
  if (!key) {
    console.info(`[mail] not configured — would send “${subject}” to ${to}:\n${body.text}`);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from || `${SITE_NAME} <noreply@${new URL(absoluteUrl("/")).hostname}>`, to: [to], subject, html: body.html, text: body.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[mail] Resend refused “${subject}”: HTTP ${res.status} ${await res.text().catch(() => "")}`);
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[mail] couldn't reach Resend", err);
    return { sent: false, reason: "failed" };
  }
}
