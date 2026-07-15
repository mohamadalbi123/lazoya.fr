const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const OPENAI_MODEL_FALLBACKS = ["gpt-4o-mini", "gpt-4.1-mini"];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function photoAnalysisUnavailable() {
  return {
    profileTitle: "Analyse photo indisponible",
    profileSummary: "L’analyse photo par IA est momentanément indisponible. Votre photo n’est pas forcément en cause: relancez le diagnostic dans quelques instants ou demandez une confirmation directe à l’équipe Lazoya.",
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
  if (selectedArea === "hair" && hasPregnancyPrecaution(answers, note)) {
    const pregnancySafePool = pool.filter((service) => !["couleur-patine", "lissage"].includes(service.id));
    if (pregnancySafePool.length) pool = pregnancySafePool;
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

function diagnosticText(answers = {}, note = "") {
  return `${Object.values(answers).flat().filter(Boolean).join(" ")} ${String(note || "")}`.toLowerCase();
}

function hasPregnancyPrecaution(answers = {}, note = "") {
  return /\b(grossesse|enceinte|pregnan|pregnancy|allaitement|breastfeeding)\b/.test(diagnosticText(answers, note));
}

function hasActiveSunburnBarrierConcern(text = "") {
  const value = String(text || "").toLowerCase();
  return (
    /\b(sunburn|coup de soleil|brulure solaire|brûlure solaire|soleil)\b/.test(value) &&
    /\b(peeling|p[eè]le|peler|desquamation|rouge|rougeur|redness|irritation|brulure|brûlure|cloque|blister)\b/.test(value)
  ) || /\b(peau rouge qui p[eè]le|red peeling skin)\b/.test(value);
}

function uniqueModels(preferredModel) {
  return [preferredModel || DEFAULT_OPENAI_MODEL, ...OPENAI_MODEL_FALLBACKS]
    .filter(Boolean)
    .filter((model, index, models) => models.indexOf(model) === index);
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isModelAccessError(status, data) {
  const message = String(data?.error?.message || "").toLowerCase();
  return (status === 400 || status === 404) && (
    data?.error?.code === "model_not_found" ||
    message.includes("must be verified") ||
    message.includes("does not exist") ||
    message.includes("model")
  );
}

async function callOpenAI(apiKey, preferredModel, payload) {
  const models = uniqueModels(preferredModel);
  let lastResult = null;

  for (const model of models) {
    const upstream = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...payload, model })
    });
    const raw = await upstream.text();
    const data = parseJsonSafely(raw);
    const result = {
      ok: upstream.ok,
      status: upstream.status,
      model,
      raw,
      data,
      errorMessage: data?.error?.message || ""
    };
    lastResult = result;
    if (upstream.ok) return result;
    if (!isModelAccessError(upstream.status, data)) return result;
  }

  return lastResult;
}

module.exports = async function handler(request, response) {
  if (request.method === "GET") {
    const url = new URL(request.url || "/", "https://www.lazoya.fr");
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    if (url.searchParams.get("probe") === "openai") {
      if (!apiKey) {
        sendJson(response, 200, {
          ok: true,
          openaiConfigured: false,
          model,
          probeOk: false,
          error: "OPENAI_API_KEY is missing"
        });
        return;
      }

      try {
        const result = await callOpenAI(apiKey, model, {
          input: "Return only JSON: {\"ok\":true}",
          text: {
            format: {
              type: "json_object"
            }
          }
        });
        sendJson(response, 200, {
          ok: true,
          openaiConfigured: true,
          model,
          activeModel: result?.model || model,
          fallbackUsed: Boolean(result?.model && result.model !== model),
          probeOk: Boolean(result?.ok),
          upstreamStatus: result?.status || 0,
          upstreamError: result?.data?.error?.message || "",
          upstreamErrorType: result?.data?.error?.type || "",
          upstreamErrorCode: result?.data?.error?.code || ""
        });
      } catch (error) {
        sendJson(response, 200, {
          ok: true,
          openaiConfigured: true,
          model,
          probeOk: false,
          upstreamStatus: 0,
          upstreamError: error?.message || "OpenAI probe failed"
        });
      }
      return;
    }

    sendJson(response, 200, {
      ok: true,
      openaiConfigured: Boolean(apiKey),
      model,
      visionDiagnostics: "POST this endpoint with imageDataUrl to test live photo analysis."
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
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
          ? "Read the user's photo and questionnaire together. Explain what the photo suggests at a cosmetic level, explain what the answers suggest, then propose Lazoya services that fit. If the photo appears medical or outside beauty care, say that clearly and still suggest Lazoya services only when they are appropriate based on the answers and only after medical clearance or team confirmation."
          : "Propose the service or protocol types that fit the user's beauty concern.",
        strictRules: [
          "Only propose services from serviceCatalog, by exact id and exact name.",
          "Write as an advisory beauty diagnostic, not as advertising and not as a booking push.",
          "Before using a photo, check whether it visibly shows the selected zone: skin on face/body/hands, hair/scalp, nails/cuticles/hands/feet, cils/sourcils, or body/relaxation context. If the image is irrelevant, unclear, filtered, too dark, not a body/beauty image, or shows a clearly different zone than answers.area, do not use it for visual conclusions.",
          "If the photo is not relevant or not readable, say this gently in profileSummary, summarize the answer-based need, and recommend based only on the questionnaire answers and note.",
          "If no photo is provided, do not mention image, photo, upload, relevance, or readability. Simply base the result on answers and note.",
          "If a photo is relevant, use visible cosmetic cues plus the questionnaire answers to orient the recommendation. Read the image carefully before choosing services.",
          "Do not diagnose medical conditions, prescribe medication, or claim certainty. If the image suggests a medical concern or a condition outside Lazoya beauty services, say Lazoya does not offer medical prescriptions and that it may be better to schedule an appointment with a doctor, dermatologist, or pharmacist depending on severity. You may still recommend Lazoya services from the answer-based concern if they are relevant and clearly framed as after medical clearance/team confirmation.",
          "Prioritize the user's selected category first. Do not recommend a different category unless the selected category is not-sure, missing, or no service fits.",
          "Use serviceCatalog as your Lazoya service knowledge base. It contains the service names, categories, benefits, durations, prices, and matching keywords available at Lazoya.",
          "Never recommend services outside the selected category when answers.area is skin, hair, nails, eyes, or relaxation. Only cross-category recommendations are allowed when answers.area is not-sure.",
          "Rank by actual fit with age range, selected zone, concerns, visible details, current routine, maintenance preference, recent treatment, objective, duration, precautions, user message, and photo if present. Do not optimize for selling.",
          "If answers.area is nails, focus only on nail, hand, foot, cuticle, polish, Gel-X, semi-permanent, manicure, and pedicure logic. Do not discuss hair color, skin glow, lashes, brows, or massage unless the user selected not-sure.",
          "If answers.area is hair, focus only on hair fiber, scalp comfort, shine, frizz, lissage, care, color/patine, and styling logic.",
          "If pregnancy or breastfeeding is mentioned, do not automatically recommend color/patine, lissage, or chemical/technical hair transformations. Prefer softer care-oriented recommendations when available, and clearly say Lazoya should confirm product suitability before any service.",
          "If answers.area is skin, use relevant visible skin close-ups, including face, neck, hands, or body skin. Focus only on cosmetic texture, hydration, visible dryness, redness, acne-like imperfections, glow, firmness, and precautions.",
          "If the photo suggests active sunburn, red peeling skin after sun, heat, blistering, open lesions, or a compromised skin barrier, return an empty recommendations array for the visible issue. Explain that Lazoya does not provide medical prescriptions or treatment for this situation, and that pharmacy/doctor/dermatologist advice is more appropriate if painful, blistered, spreading, severe, or uncertain. Only mention Lazoya skin services as something to reconsider later after the skin has fully calmed and the Lazoya team confirms suitability.",
          "If answers.area is eyes, focus only on lashes, brows, eye-area beauty, density, line, structure, tint, browlift, and extensions.",
          "If answers.area is relaxation, focus only on tension, fatigue, comfort, body massage, and relaxation needs.",
          "Always write profileSummary and why texts in French.",
          "The diagnostic is designed for women only. Phrase the advice for a female client.",
          "Use cautious visual language for photos, such as 'appears', 'visible signs suggest', or 'semble', never certainty.",
          "Use age range only for context and tone. Do not stereotype.",
          "Never invent service names, durations, prices, benefits, or booking claims.",
          "Do not mention prices or push booking in the recommendation text.",
          "Do not give medical advice.",
          "Mention doctor, dermatologist, pharmacist, medical confirmation, or medical clearance only when the image or answers suggest a medical concern, pain, infection, swelling, lesion, injury, active irritation, medication/allergy precaution, or another contraindication. For pregnancy or breastfeeding, say Lazoya should confirm product/service suitability; do not imply the beauty concern itself needs medical confirmation unless a medical-looking sign is present.",
          "If the user mentions or the image suggests irritation, active lesions, peeling, sunburn, pregnancy, medication, allergies, or uncertainty, include a gentle note to confirm with the Lazoya team before any treatment.",
          "Return JSON only, with no markdown."
        ],
        outputShape: {
          profileTitle: "short beauty profile title",
          profileSummary: "two or three short sentences in French: first summarize what the image appears to show or whether it is irrelevant/unreadable; then summarize what the questionnaire answers suggest; then mention medical confirmation only if a medical-looking concern or contraindication is present.",
          imageUse: "one of: relevant_photo_used, photo_ignored_irrelevant, photo_ignored_unclear, medical_referral, no_photo",
          imageSummary: "short French sentence about what the photo appears to show, or why it was not used",
          answerSummary: "short French sentence about what the user's answers and note suggest",
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
    const result = await callOpenAI(apiKey, model, {
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
    });

    if (!result?.ok) {
      console.warn("Beauty advisor fallback: OpenAI request failed", result?.status || 0, result?.errorMessage || result?.raw || "");
      sendJson(response, 200, imageDataUrl
        ? photoAnalysisUnavailable()
        : fallbackRecommendation(services, body.answers, body.note, { hasImage: false }));
      return;
    }

    const data = result.data;
    const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    const parsed = extractJson(outputText);

    const selectedArea = body.answers?.area;
    const imageUse = parsed.imageUse || (imageDataUrl ? "relevant_photo_used" : "no_photo");
    const parsedDiagnosticText = [
      parsed.profileSummary,
      parsed.imageSummary,
      parsed.answerSummary,
      parsed.noServiceReason,
      body.note,
      diagnosticText(body.answers)
    ].filter(Boolean).join(" ");
    const sunburnBarrierConcern = selectedArea === "skin" && imageUse === "relevant_photo_used" && hasActiveSunburnBarrierConcern(parsedDiagnosticText);
    if (sunburnBarrierConcern) {
      parsed.noServiceReason = "La photo semble montrer une peau rouge qui pèle après une exposition au soleil. Lazoya ne propose pas de prescription ou de traitement médical pour ce type de situation: demandez conseil à une pharmacie, un médecin ou un dermatologue si la zone est douloureuse, cloquée, étendue, très inflammatoire ou si vous avez un doute. Les soins esthétiques Lazoya seront à reconsidérer uniquement quand la peau sera calmée et après confirmation de l’équipe.";
      parsed.recommendations = [];
    }
    const areaLocked = ["skin", "hair", "nails", "eyes", "relaxation"].includes(selectedArea);
    let allowedServices = areaLocked
      ? services.filter((service) => service.category === selectedArea)
      : services;
    const pregnancyPrecaution = hasPregnancyPrecaution(body.answers, body.note);
    const pregnancyBlockedHairServices = new Set(["couleur-patine", "lissage"]);
    if (pregnancyPrecaution && selectedArea === "hair") {
      allowedServices = allowedServices.filter((service) => !pregnancyBlockedHairServices.has(service.id));
    }
    const byId = new Map(allowedServices.map((service) => [service.id, service]));
    const safeRecommendations = (parsed.recommendations || [])
      .map((recommendation) => byId.get(recommendation.id))
      .filter(Boolean)
      .slice(0, 3)
      .map((service) => ({
        ...service,
        why: pregnancyPrecaution && service.category === "hair"
          ? `${parsed.recommendations.find((item) => item.id === service.id)?.why || service.why} À confirmer avec Lazoya pour vérifier que les produits utilisés conviennent pendant la grossesse ou l’allaitement.`
          : parsed.recommendations.find((item) => item.id === service.id)?.why || service.why
      }));

    const noServiceNeeded = Boolean(parsed.noServiceReason) && safeRecommendations.length === 0;
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
      profileSummary: parsed.profileSummary || parsed.noServiceReason || fallbackData.profileSummary,
      imageUse,
      imageSummary: parsed.imageSummary || "",
      answerSummary: parsed.answerSummary || "",
      noServiceReason: parsed.noServiceReason || "",
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
