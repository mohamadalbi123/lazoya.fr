const OPENAI_API_URL = "https://api.openai.com/v1/responses";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function photoAnalysisUnavailable() {
  return {
    profileTitle: "Analyse photo indisponible",
    profileSummary: "La photo n’a pas pu être analysée par l’IA pour le moment. Relancez le diagnostic dans quelques instants ou demandez à l’équipe Lazoya de confirmer directement.",
    imageUse: "photo_analysis_unavailable",
    beautyScore: 0,
    recommendations: []
  };
}

function fallbackRecommendation(services, answers = {}, note = "", options = {}) {
  const categoryLabels = {
    skin: ["skin", "Peau"],
    hair: ["hair", "Cheveux"],
    nails: ["nails", "Ongles"],
    eyes: ["eyes", "Cils & sourcils"],
    relaxation: ["relaxation", "Détente"]
  };
  function inferCategoryFromText(text) {
    const value = String(text || "").toLowerCase();
    if (/\b(cheveux|cheveu|hair|brillance|frisottis|lissage)\b/.test(value)) return ["hair", "Cheveux"];
    if (/\b(ongle|ongles|nail|gel|mains|pieds|vernis)\b/.test(value)) return ["nails", "Ongles"];
    if (/\b(cils|sourcils|regard|lashes|brow)\b/.test(value)) return ["eyes", "Cils & sourcils"];
    if (/\b(massage|stress|détente|detente|tension|relax)\b/.test(value)) return ["relaxation", "Détente"];
    if (/\b(peau|visage|pores|rougeurs|acné|acne|teint|rides|hydratation|éclat|eclat)\b/.test(value)) return ["skin", "Peau"];
    return "";
  }
  const selectedCategory = categoryLabels[answers.area] || categoryLabels[answers.category] || inferCategoryFromText(note) || (answers.method === "photo" ? ["skin", "Peau"] : "");
  const selectedArea = selectedCategory?.[0] || "";
  const answerText = Object.values(answers)
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const concernText = `${answerText} ${String(note || "").toLowerCase()}`;
  const barrierConcern = /\b(rougeur|rougeurs|redness|irritation|irritated|sensible|sensitive|reactive|réactive|brulure|brûlure|burn|sunburn|soleil|peeling|p[eè]le|peel|cloque|blister|plaie|lesion|lésion|douleur|pain|inflammation)\b/.test(concernText);
  const activeSkinServiceIds = new Set(["peeling", "micro", "radio", "lifting", "anti-acne"]);
  const answerTokens = Object.values(answers)
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const noteTokens = String(note || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const preferredServices = selectedCategory
    ? services.filter((service) => selectedCategory.includes(service.category))
    : services;
  let pool = preferredServices.length ? preferredServices : services;

  if (options.hasImage && selectedArea === "skin") {
    const gentlePool = pool.filter((service) => !activeSkinServiceIds.has(service.id));
    if (gentlePool.length) pool = gentlePool;
  }

  const ranked = pool
    .map((service) => {
      const keywords = new Set(String(service.keywords || "").split(/\s+/));
      let score = selectedCategory && selectedCategory.includes(service.category) ? 24 : 0;
      score += answerTokens.reduce((total, token) => total + (keywords.has(token) ? 6 : 0), 0);
      score += noteTokens.reduce((total, token) => {
        const text = `${service.name || ""} ${service.why || ""}`.toLowerCase();
        return total + (text.includes(token) ? 2 : 0);
      }, 0);
      return { ...service, score };
    })
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, options.hasImage && selectedArea === "skin" && barrierConcern ? 2 : 3)
    .map((service) => {
      if (!(options.hasImage && selectedArea === "skin")) return service;
      if (barrierConcern) {
        return {
          ...service,
          why: "Lecture prudente: si la peau est rouge, irritée, échauffée ou en train de peler, il faut d’abord apaiser et confirmer avec Lazoya avant tout soin actif."
        };
      }
      return {
        ...service,
        why: "La photo n’a pas pu être analysée par l’IA sur ce test. Ce choix reste donc volontairement doux et doit être confirmé par l’équipe Lazoya."
      };
    });

  return {
    profileTitle: options.hasImage && selectedArea === "skin"
      ? "Lecture prudente de la peau"
      : "Services adaptés à vos réponses",
    profileSummary: options.hasImage
      ? "La photo n’a pas pu être analysée par l’IA sur ce test. Par prudence, cette lecture évite les soins actifs et doit être confirmée avec Lazoya."
      : "Voici une lecture indicative basée sur vos réponses, pour mieux orienter la suite selon votre besoin.",
    beautyScore: 86,
    recommendations: ranked
  };
}

function extractJson(text) {
  const cleaned = String(text || "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object in model response");
    return JSON.parse(match[0]);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const body = request.body || null;

  if (!body || !Array.isArray(body.services)) {
    sendJson(response, 400, { error: "Invalid request" });
    return;
  }

  const services = body.services.slice(0, 80);

  if (!apiKey) {
    console.warn("Beauty advisor fallback: OPENAI_API_KEY is missing");
    sendJson(response, 200, body.imageDataUrl
      ? photoAnalysisUnavailable()
      : fallbackRecommendation(services, body.answers, body.note, { hasImage: false }));
    return;
  }

  const serviceCatalog = services.map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    duration: service.duration,
    price: service.price,
    benefits: service.benefits,
    why: service.why,
    keywords: service.keywords
  }));
  const imageDataUrl = typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
    ? body.imageDataUrl
    : "";
  const userContent = [
    {
      type: "input_text",
      text: JSON.stringify({
        task: imageDataUrl
          ? "Assess whether the user's photo is relevant to the selected beauty zone, then use the photo only if it is relevant and useful. Propose the service or protocol types that fit the concern."
          : "Propose the service or protocol types that fit the user's beauty concern.",
        strictRules: [
          "Only propose services from serviceCatalog, by exact id and exact name.",
          "Write as an advisory beauty diagnostic, not as advertising and not as a booking push.",
          "Before using a photo, check whether it visibly shows the selected zone: skin on face/body/hands, hair/scalp, nails/cuticles/hands/feet, cils/sourcils, or body/relaxation context. If the image is irrelevant, unclear, filtered, too dark, not a body/beauty image, or shows a clearly different zone than answers.area, do not use it for visual conclusions.",
          "If the photo is not relevant or not readable, say this gently in profileSummary and base the diagnostic only on the questionnaire answers and note.",
          "If no photo is provided, do not mention image, photo, upload, relevance, or readability. Simply base the result on answers and note.",
          "If a photo is relevant, use visible cosmetic cues plus the questionnaire answers to orient the recommendation. Read the image carefully before choosing services.",
          "Do not diagnose medical conditions, prescribe medication, or claim certainty. If the image suggests a medical concern or a condition outside Lazoya beauty services, return no service recommendations and gently say Lazoya does not offer medical prescriptions; in this case it may be better to schedule an appointment with a doctor, dermatologist, or pharmacist depending on severity.",
          "Prioritize the user's selected category first. Do not recommend a different category unless the selected category is not-sure, missing, or no service fits.",
          "Use serviceCatalog as your Lazoya service knowledge base. It contains the service names, categories, benefits, durations, prices, and matching keywords available at Lazoya.",
          "Never recommend services outside the selected category when answers.area is skin, hair, nails, eyes, or relaxation. Only cross-category recommendations are allowed when answers.area is not-sure.",
          "Rank by actual fit with age range, selected zone, concerns, visible details, current routine, maintenance preference, recent treatment, objective, duration, precautions, user message, and photo if present. Do not optimize for selling.",
          "If answers.area is nails, focus only on nail, hand, foot, cuticle, polish, Gel-X, semi-permanent, manicure, and pedicure logic. Do not discuss hair color, skin glow, lashes, brows, or massage unless the user selected not-sure.",
          "If answers.area is hair, focus only on hair fiber, scalp comfort, shine, frizz, lissage, care, color/patine, and styling logic.",
          "If answers.area is skin, use relevant visible skin close-ups, including face, neck, hands, or body skin. Focus only on cosmetic texture, hydration, visible dryness, redness, acne-like imperfections, glow, firmness, and precautions.",
          "If the photo suggests sunburn, peeling skin, strong redness, heat, irritation, open lesions, blistering, or compromised skin barrier, do not recommend peeling, microneedling, radiofrequency, firming/lifting protocols, exfoliation, or other active treatments. If a gentle Lazoya service fits after the area has calmed, recommend it cautiously. If the signs look severe, painful, blistered, infected, spreading, or medical, return no service recommendations and advise doctor/pharmacist guidance.",
          "If answers.area is eyes, focus only on lashes, brows, eye-area beauty, density, line, structure, tint, browlift, and extensions.",
          "If answers.area is relaxation, focus only on tension, fatigue, comfort, body massage, and relaxation needs.",
          "Always write profileSummary and why texts in French.",
          "The diagnostic is designed for women only. Phrase the advice for a female client.",
          "Use cautious visual language for photos, such as 'appears', 'visible signs suggest', or 'semble', never certainty.",
          "Use age range only for context and tone. Do not stereotype.",
          "Never invent service names, durations, prices, benefits, or booking claims.",
          "Do not mention prices or push booking in the recommendation text.",
          "Do not give medical advice.",
          "If the user mentions or the image suggests irritation, active lesions, peeling, sunburn, pregnancy, medication, allergies, or uncertainty, include a gentle note to confirm with the Lazoya team before any treatment.",
          "Return JSON only, with no markdown."
        ],
        outputShape: {
          profileTitle: "short beauty profile title",
          profileSummary: "one or two sentences in French. Mention photo relevance only if an uploaded photo exists and was not relevant or not readable.",
          imageUse: "one of: relevant_photo_used, photo_ignored_irrelevant, photo_ignored_unclear, medical_referral, no_photo",
          beautyScore: "integer between 78 and 96, purely playful",
          recommendations: [
            {
              id: "must match serviceCatalog id",
              name: "must match serviceCatalog name",
              category: "must match serviceCatalog category",
              why: "short, non-commercial explanation in French, based on the user's answers and image if provided"
            }
          ],
          noServiceReason: "French sentence only when no Lazoya service should be recommended because the concern appears medical or outside beauty care.",
          recommendationCount: "return 3 recommendations when 3 fitting services exist; otherwise return 2"
        },
        answers: body.answers || {},
        note: body.note || "",
        serviceCatalog
      })
    }
  ];

  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high"
    });
  }

  const prompt = {
    role: "user",
    content: userContent
  };

  try {
    const upstream = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: "You are Lazoya Beauty Advisor. You are warm, concise, careful, and advisory. You propose fitting service or protocol types from the provided catalog by exact name. You do not write sales copy, do not push booking, and do not give medical diagnosis."
          },
          prompt
        ],
        text: {
          format: {
            type: "json_object"
          }
        }
      })
    });

    if (!upstream.ok) {
      console.warn("Beauty advisor fallback: OpenAI request failed", upstream.status, await upstream.text().catch(() => ""));
      sendJson(response, 200, imageDataUrl
        ? photoAnalysisUnavailable()
        : fallbackRecommendation(services, body.answers, body.note, { hasImage: false }));
      return;
    }

    const data = await upstream.json();
    const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    const parsed = extractJson(outputText);

    const selectedArea = body.answers?.area;
    const areaLocked = ["skin", "hair", "nails", "eyes", "relaxation"].includes(selectedArea);
    const allowedServices = areaLocked
      ? services.filter((service) => service.category === selectedArea)
      : services;
    const byId = new Map(allowedServices.map((service) => [service.id, service]));
    const safeRecommendations = (parsed.recommendations || [])
      .map((recommendation) => byId.get(recommendation.id))
      .filter(Boolean)
      .slice(0, 3)
      .map((service) => ({
        ...service,
        why: parsed.recommendations.find((item) => item.id === service.id)?.why || service.why
      }));

    const imageUse = parsed.imageUse || (imageDataUrl ? "relevant_photo_used" : "no_photo");
    const noServiceNeeded = imageUse === "medical_referral" || parsed.noServiceReason;
    const fallbackData = fallbackRecommendation(allowedServices, body.answers, body.note, {
      hasImage: Boolean(imageDataUrl)
    });
    const fallbackList = fallbackData.recommendations;
    const completedRecommendations = noServiceNeeded
      ? safeRecommendations
      : [
        ...safeRecommendations,
        ...fallbackList.filter((service) => !safeRecommendations.some((item) => item.id === service.id))
      ].slice(0, 3);

    sendJson(response, 200, {
      profileTitle: parsed.profileTitle || "Services adaptés à vos réponses",
      profileSummary: parsed.noServiceReason || parsed.profileSummary || fallbackData.profileSummary,
      imageUse,
      beautyScore: Number(parsed.beautyScore) || 86,
      recommendations: noServiceNeeded ? completedRecommendations : (completedRecommendations.length ? completedRecommendations : fallbackList)
    });
  } catch (error) {
    console.warn("Beauty advisor fallback: unexpected error", error?.message || error);
    sendJson(response, 200, imageDataUrl
      ? photoAnalysisUnavailable()
      : fallbackRecommendation(services, body.answers, body.note, { hasImage: false }));
  }
};
