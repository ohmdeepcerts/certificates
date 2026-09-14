// auto-cert-email — OHM Certificates background email sender
// Triggered by DB trigger when pdf_storage_path is set on a completed cert.
// Deploy: Supabase Dashboard → Edge Functions → New Function → paste this code
// Or CLI: supabase functions deploy auto-cert-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Auth — only accept requests with the service role key
    const auth = req.headers.get("Authorization") || "";
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!svcKey || !auth.includes(svcKey)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { cert_id, cert_type } = await req.json();
    if (!cert_id || !cert_type) {
      return new Response("Missing cert_id or cert_type", { status: 400 });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      svcKey
    );

    const table = cert_type === "gas_certs" ? "gas_certs" : "pat_reports";
    const isGas = table === "gas_certs";

    // Fetch cert
    const { data: cert, error: certErr } = await sb.from(table).select("*").eq("id", cert_id).single();
    if (certErr || !cert) return new Response("Cert not found", { status: 404 });
    if (cert.auto_emailed_at) return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), { status: 200 });

    const toEmail = isGas
      ? ((cert.recipient_email || cert.business_email || "").trim())
      : ((cert.email_address || "").trim());

    // Fetch fallback from settings if no email on cert
    const { data: settingsRows } = await sb.from("app_config").select("key,value");
    const cfg: Record<string, string> = {};
    (settingsRows || []).forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });
    const gs = (k: string, def = "") => cfg[k] || def;

    const email = toEmail || gs("email_fallback", "");
    if (!email) return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), { status: 200 });

    // Download PDF from storage
    let pdfBase64 = "";
    const pdfPath = cert.pdf_storage_path;
    if (pdfPath) {
      const { data: blob } = await sb.storage.from("cert-pdfs").download(pdfPath);
      if (blob) {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let b = "";
        for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
        pdfBase64 = btoa(b);
      }
    }

    // Build email
    const subject = isGas
      ? `Gas Safety Certificate (CP12) — ${cert.ref_number || cert.install_address || ""}`
      : `PAT Test Certificate — ${cert.ref_number || cert.property_address || ""}`;

    const coName = isGas
      ? gs("gas_co_name", "OHM Electrical Engineering Ltd")
      : gs("pat_co_name", "OHM Electrical Engineering Ltd");

    const htmlContent = isGas
      ? buildGasHtml(cert, coName, gs)
      : buildPATHtml(cert, coName, gs);

    // Send via Brevo
    const brevoKey = gs("brevo_api_key", "");
    if (!brevoKey) throw new Error("brevo_api_key not set in app_config");

    const fromEmail = gs("email_from", "Compliance@ohmelectricals.co.uk");
    const fromName  = gs("email_from_name", coName);
    const bcc       = gs("email_bcc", "");
    const pdfName   = isGas
      ? `CP12_${(cert.ref_number || cert_id).replace(/[^\w-]/g, "_")}.pdf`
      : `PAT_${(cert.ref_number || cert_id).replace(/[^\w-]/g, "_")}.pdf`;

    const payload: Record<string, unknown> = {
      sender: { name: fromName, email: fromEmail },
      to: [{ email }],
      subject,
      htmlContent,
    };
    if (bcc && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bcc)) payload.bcc = [{ email: bcc }];
    if (pdfBase64) payload.attachment = [{ content: pdfBase64, name: pdfName }];

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify(payload),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      throw new Error(`Brevo: ${errText}`);
    }

    const brevoData = await brevoRes.json();

    // Mark sent + log
    await sb.from(table).update({ auto_emailed_at: new Date().toISOString() }).eq("id", cert_id);
    await sb.from("email_sends").insert({
      cert_id,
      cert_type: isGas ? "gas" : "pat",
      cert_ref: cert.ref_number || null,
      to_email: email,
      subject,
      brevo_message_id: brevoData?.messageId || null,
      status: "sent",
      method: "auto_background",
      sent_at: new Date().toISOString(),
    }).then(() => {});

    return new Response(JSON.stringify({ ok: true, to: email }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ---- Email HTML builders ----

function esc(s: unknown): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildGasHtml(r: Record<string, unknown>, coName: string, gs: (k: string, def?: string) => string): string {
  const addr      = esc(r.install_address);
  const landlord  = esc(r.landlord_address);
  const certRef   = esc(r.ref_number || r.id);
  const certDate  = esc(r.cert_date);
  const nextDate  = esc(r.next_check_date);
  const coPhone   = esc(gs("gas_co_phone"));
  const coEmail   = esc(gs("gas_co_email"));
  const coAddr    = esc(gs("gas_co_address"));
  const contactLine = [coPhone ? `&#9990; ${coPhone}` : "", coEmail ? `&#9993; ${coEmail}` : ""].filter(Boolean).join("&nbsp;&nbsp;&nbsp;");
  const landlordRow = landlord
    ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:140px">Landlord</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right">${landlord.replace(/\n/g, "<br>")}</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:28px 12px 40px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:#1e3a5f;padding:28px 32px;border-radius:12px 12px 0 0">
  <div style="font-size:22px;font-weight:700;color:#fff">${esc(coName)}</div>
  <div style="font-size:13px;color:#93c5fd;margin-top:4px">Gas Safety Certificate — CP12</div>
</td></tr>
<tr><td style="background:#fff;padding:20px 32px;border-bottom:2px solid #e2e8f0">
  <span style="background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;border:1px solid #86efac">&#10003; Certificate Issued</span>
</td></tr>
<tr><td style="background:#fff;padding:0 0 4px">
<table width="100%" cellpadding="0" cellspacing="0">
  ${landlordRow}
  <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:140px">Property</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right">${addr.replace(/\n/g, "<br>")}</td></tr>
  <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Cert Ref</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:700;text-align:right">${certRef}</td></tr>
  <tr><td style="padding:10px 18px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Certificate Date</td><td style="padding:10px 18px;font-size:14px;color:#1e293b;text-align:right">${certDate}</td></tr>
</table>
</td></tr>
${nextDate ? `<tr><td style="background:#fffbeb;border-top:1px solid #fcd34d;border-bottom:1px solid #fcd34d;padding:16px 32px"><div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">&#9888; Next Annual Gas Safety Check Due</div><div style="font-size:20px;font-weight:800;color:#b45309">${nextDate}</div></td></tr>` : ""}
<tr><td style="background:#fef2f2;border-top:1px solid #fecaca;border-bottom:1px solid #fecaca;padding:16px 32px">
  <div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:6px">Legal Obligations</div>
  <div style="font-size:12px;color:#7f1d1d;line-height:1.7">Under the Gas Safety (Installation and Use) Regulations 1998, landlords must arrange an annual gas safety check by a Gas Safe registered engineer. A copy of this certificate must be provided to existing tenants within 28 days and to new tenants before they move in.</div>
</td></tr>
<tr><td style="background:#fff;padding:14px 32px;border-top:1px solid #e2e8f0">
  <div style="font-size:12px;color:#64748b">&#128206; Your Gas Safety Certificate (CP12) is attached as a PDF to this email.</div>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0">
  <div style="font-size:13px;font-weight:700;color:#1e293b">${esc(coName)}</div>
  ${coAddr ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${coAddr}</div>` : ""}
  ${contactLine ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${contactLine}</div>` : ""}
  <div style="font-size:10px;color:#94a3b8;margin-top:10px">This certificate was sent automatically by the OHM Certificates system.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildPATHtml(r: Record<string, unknown>, coName: string, gs: (k: string, def?: string) => string): string {
  const addr     = esc(r.property_address);
  const certRef  = esc(r.ref_number || r.id);
  const testDate = esc(r.test_date);
  const navy     = gs("pat_hdr_color", "#1e3a5f");
  const apps     = Array.isArray(r.appliances) ? r.appliances as Array<Record<string, string>> : [];
  const total    = apps.length;
  const pass     = apps.filter(a => (a.result || "").toLowerCase() === "pass").length;
  const fail     = total - pass;
  const nxtDates = apps.map(a => a.nextTest || a.next_test || "").filter(Boolean).sort();
  const due      = esc(nxtDates[0] || String(r.next_test_date || ""));
  const coPhone  = esc(gs("pat_co_phone"));
  const coEmail  = esc(gs("pat_co_email"));
  const coAddr   = esc(gs("pat_co_address"));
  const contactLine = [coPhone ? `&#9990; ${coPhone}` : "", coEmail ? `&#9993; ${coEmail}` : ""].filter(Boolean).join("&nbsp;&nbsp;&nbsp;");
  const landlordRow = r.landlord_name
    ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:140px">Landlord</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right">${esc(r.landlord_name)}</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:28px 12px 40px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:${navy};padding:28px 32px;border-radius:12px 12px 0 0">
  <div style="font-size:22px;font-weight:700;color:#fff">${esc(coName)}</div>
  <div style="font-size:13px;color:#93c5fd;margin-top:4px">PAT Test Certificate</div>
</td></tr>
<tr><td style="background:#fff;padding:20px 32px;border-bottom:2px solid #e2e8f0">
  <span style="background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;border:1px solid #86efac">&#10003; Certificate Issued</span>
</td></tr>
<tr><td style="background:#fff;padding:0 0 4px">
<table width="100%" cellpadding="0" cellspacing="0">
  ${landlordRow}
  <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:140px">Property</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right">${addr.replace(/\n/g, "<br>")}</td></tr>
  <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Cert Ref</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:700;text-align:right">${certRef}</td></tr>
  <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Test Date</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right">${testDate}</td></tr>
  <tr><td style="padding:10px 18px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Result</td><td style="padding:10px 18px;font-size:14px;text-align:right"><span style="color:#16a34a;font-weight:700">${pass} PASS</span>${fail > 0 ? ` &nbsp;<span style="color:#dc2626;font-weight:700">${fail} FAIL</span>` : ""}<span style="color:#64748b;font-size:12px"> of ${total}</span></td></tr>
</table>
</td></tr>
${due ? `<tr><td style="background:#fffbeb;border-top:1px solid #fcd34d;border-bottom:1px solid #fcd34d;padding:16px 32px"><div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">&#9888; Next PAT Test Due</div><div style="font-size:20px;font-weight:800;color:#b45309">${due}</div></td></tr>` : ""}
<tr><td style="background:#fff;padding:14px 32px;border-top:1px solid #e2e8f0">
  <div style="font-size:12px;color:#64748b">&#128206; Your PAT Test Certificate is attached as a PDF to this email.</div>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0">
  <div style="font-size:13px;font-weight:700;color:#1e293b">${esc(coName)}</div>
  ${coAddr ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${coAddr}</div>` : ""}
  ${contactLine ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${contactLine}</div>` : ""}
  <div style="font-size:10px;color:#94a3b8;margin-top:10px">This certificate was sent automatically by the OHM Certificates system.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}
