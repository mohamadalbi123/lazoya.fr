const RESEND_ENDPOINT = "https://api.resend.com/emails";

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const single = clean(value);
  return single ? [single] : [];
}

function row(label, value) {
  const content = Array.isArray(value) ? value.join(", ") : value;
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eadbd0;color:#665d5c;font-weight:700;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eadbd0;color:#1d1a1a;">${escapeHtml(content || "Non renseigné")}</td>
    </tr>
  `;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ message: "Méthode non autorisée." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.MODEL_REQUEST_TO || process.env.ADMIN_EMAIL;
  const from = process.env.RESEND_FROM || "Lazoya <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return response.status(500).json({
      message: "Le formulaire n'est pas encore configuré. Merci de contacter Lazoya par téléphone."
    });
  }

  const body = request.body || {};

  if (clean(body.website)) {
    return response.status(200).json({ ok: true });
  }

  const name = clean(body.name);
  const email = clean(body.email);
  const phone = clean(body.phone);
  const instagram = clean(body.instagram);
  const interests = asList(body.interest);
  const profile = clean(body.profile);
  const availability = clean(body.availability);
  const consent = clean(body.consent);

  if (!name || !email || !phone || !profile || !consent) {
    return response.status(400).json({
      message: "Merci de compléter les champs obligatoires avant d'envoyer votre demande."
    });
  }

  const subject = `Nouvelle inscription modèle Lazoya - ${name}`;
  const text = [
    "Nouvelle inscription modèle Lazoya",
    "",
    `Nom: ${name}`,
    `Email: ${email}`,
    `Téléphone: ${phone}`,
    `Instagram: ${instagram || "Non renseigné"}`,
    `Intérêts: ${interests.join(", ") || "Non renseigné"}`,
    "",
    "Profil / attentes:",
    profile,
    "",
    "Disponibilités:",
    availability || "Non renseigné"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#fbfaf7;padding:24px;color:#1d1a1a;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #eadbd0;border-radius:8px;overflow:hidden;">
        <div style="padding:20px 22px;background:#9c1231;color:#fff;">
          <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Lazoya</p>
          <h1 style="margin:0;font-size:22px;">Nouvelle inscription modèle</h1>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Nom", name)}
          ${row("Email", email)}
          ${row("Téléphone", phone)}
          ${row("Instagram", instagram)}
          ${row("Intérêts", interests)}
          ${row("Profil / attentes", profile)}
          ${row("Disponibilités", availability)}
        </table>
      </div>
    </div>
  `;

  const resendResponse = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: email,
      subject,
      text,
      html
    })
  });

  if (!resendResponse.ok) {
    return response.status(502).json({
      message: "Impossible d'envoyer la demande pour le moment. Merci de nous contacter par téléphone."
    });
  }

  return response.status(200).json({ ok: true });
};
