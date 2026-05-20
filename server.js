require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "18mb" }));

const PORT = process.env.PORT || 3000;

const providers = [
  { name: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY, type: "openai-compatible", url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", vision: false },
  { name: "openai", apiKey: process.env.OPENAI_API_KEY, type: "openai-compatible", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", vision: true },
  { name: "gemini", apiKey: process.env.GEMINI_API_KEY, type: "gemini", model: "gemini-1.5-flash", vision: true },
  { name: "groq", apiKey: process.env.GROQ_API_KEY, type: "openai-compatible", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.1-8b-instant", vision: false },
  { name: "mistral", apiKey: process.env.MISTRAL_API_KEY, type: "openai-compatible", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest", vision: false },
  { name: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, type: "anthropic", url: "https://api.anthropic.com/v1/messages", model: "claude-3-5-haiku-latest", vision: false }
];

function checkAppSecret(req) {
  const expected = process.env.ANATOLIA_APP_SECRET;
  if (!expected) return true;
  return req.headers["x-anatolia-secret"] === expected;
}

function cleanBase64(imageBase64) {
  if (!imageBase64) return null;
  return String(imageBase64).replace(/^data:image\/\w+;base64,/, "").trim();
}

function buildSystemPrompt(mode, systemPrompt) {
  if (systemPrompt) return String(systemPrompt).slice(0, 8000);
  if (mode === "vision") {
    return "Sen Anatolia AI gerçek görsel analiz motorusun. Fotoğrafta ne görünüyorsa onu söyle. İnsan yüzü/kişi varsa kimlik tahmini yapma; sadece 'insan/yüz/kişi' gibi genel tanımla. Bardak, kalem gibi gündelik nesnelere tarihi anlam uydurma. Türkiye/kültür bağlamını yalnızca görüntüde açık ipucu varsa kur. İstenen format JSON ise sadece geçerli JSON döndür.";
  }
  if (mode === "culture") return "Sen Anatolia AI kültür asistanısın. Türkiye, şehirler, tarih ve kültür hakkında kısa, doğru ve sade Türkçe cevap ver.";
  return "Sen Anatolia AI uygulaması içinde çalışan Türkçe asistansın. Cevapların kısa, doğru, güvenli ve kullanıcı dostu olsun.";
}

function normalizeMessages(prompt, mode, systemPrompt, imageBase64, provider) {
  const system = buildSystemPrompt(mode, systemPrompt);
  const text = String(prompt || "").slice(0, 120000);
  const img = cleanBase64(imageBase64);

  if (img && provider?.name === "openai") {
    return [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }
      ]}
    ];
  }

  return [
    { role: "system", content: system },
    { role: "user", content: text }
  ];
}

function shouldTryNext(errorText = "", status = 0) {
  const t = String(errorText).toLowerCase();
  return status === 429 || status === 402 || status >= 500 ||
    t.includes("rate limit") || t.includes("quota") || t.includes("billing") ||
    t.includes("insufficient") || t.includes("context_length") ||
    t.includes("maximum context") || t.includes("token") ||
    t.includes("model") || t.includes("not found");
}

async function callOpenAICompatible(provider, payload) {
  const { prompt, mode, temperature, systemPrompt, imageBase64 } = payload;
  const messages = normalizeMessages(prompt, mode, systemPrompt, imageBase64, provider);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: provider.model, messages, temperature, max_tokens: 900 })
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) { const err = new Error(data?.error?.message || text || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(provider, payload) {
  const { prompt, mode, temperature, systemPrompt, imageBase64 } = payload;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
  const parts = [{ text: String(prompt || "").slice(0, 120000) }];
  const img = cleanBase64(imageBase64);
  if (img) parts.push({ inline_data: { mime_type: "image/jpeg", data: img } });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(mode, systemPrompt) }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, maxOutputTokens: 900 }
    })
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) { const err = new Error(data?.error?.message || text || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
}

async function callAnthropic(provider, payload) {
  const { prompt, mode, temperature, systemPrompt } = payload;
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      system: buildSystemPrompt(mode, systemPrompt),
      messages: [{ role: "user", content: String(prompt || "").slice(0, 120000) }],
      temperature,
      max_tokens: 900
    })
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) { const err = new Error(data?.error?.message || text || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data?.content?.map(c => c.text || "").join("") || "";
}

async function callProvider(provider, payload) {
  if (provider.type === "openai-compatible") return await callOpenAICompatible(provider, payload);
  if (provider.type === "gemini") return await callGemini(provider, payload);
  if (provider.type === "anthropic") return await callAnthropic(provider, payload);
  throw new Error(`Bilinmeyen provider type: ${provider.type}`);
}

function orderProviders(activeProviders, { hasImage, preferredProvider }) {
  if (preferredProvider) {
    const first = activeProviders.find(p => p.name === preferredProvider);
    const rest = activeProviders.filter(p => p.name !== preferredProvider);
    return first ? [first, ...rest] : activeProviders;
  }
  if (hasImage) {
    // Görsel analizde önce Gemini, sonra OpenAI denensin. Metin modelleri en son fallback.
    const priority = ["gemini", "openai"];
    return [...activeProviders].sort((a, b) => {
      const ai = priority.includes(a.name) ? priority.indexOf(a.name) : 99;
      const bi = priority.includes(b.name) ? priority.indexOf(b.name) : 99;
      return ai - bi;
    });
  }
  return activeProviders;
}

async function handleAI(req, res, forceVision = false) {
  if (!checkAppSecret(req)) return res.status(401).json({ ok: false, error: "Yetkisiz istek." });

  const body = req.body || {};
  const prompt = body.prompt;
  const imageBase64 = body.imageBase64;
  const hasImage = !!cleanBase64(imageBase64);
  const mode = forceVision ? "vision" : (body.mode || "default");
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.25;

  if (!prompt || String(prompt).trim().length < 1) return res.status(400).json({ ok: false, error: "Prompt boş olamaz." });
  if (forceVision && !hasImage) return res.status(400).json({ ok: false, error: "Vision için imageBase64 zorunlu." });

  let activeProviders = providers.filter(p => !!p.apiKey);
  activeProviders = orderProviders(activeProviders, { hasImage: forceVision || hasImage, preferredProvider: body.preferredProvider });

  if (activeProviders.length === 0) return res.status(500).json({ ok: false, error: "Hiç API key tanımlanmamış." });

  const attempts = [];
  const payload = { prompt, mode, temperature, systemPrompt: body.systemPrompt, imageBase64 };

  for (const provider of activeProviders) {
    try {
      // Fotoğraf varsa vision desteklemeyen sağlayıcıları gerçek görsel analizde atla.
      if ((forceVision || hasImage) && !provider.vision) {
        attempts.push({ provider: provider.name, model: provider.model, skipped: "vision desteklemiyor" });
        continue;
      }
      const answer = await callProvider(provider, payload);
      if (!answer || !answer.trim()) throw new Error("Boş cevap döndü.");
      return res.json({ ok: true, provider: provider.name, model: provider.model, answer });
    } catch (err) {
      attempts.push({ provider: provider.name, model: provider.model, status: err.status || null, error: err.message });
      if (!shouldTryNext(err.message, err.status)) continue;
    }
  }

  return res.status(502).json({ ok: false, error: "Tüm AI sağlayıcıları başarısız oldu.", attempts });
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Anatolia AI Router",
    endpoints: ["/api/ai", "/api/vision"],
    providers: providers.filter(p => !!p.apiKey).map(p => ({ name: p.name, model: p.model, vision: p.vision }))
  });
});

app.post("/api/ai", (req, res) => handleAI(req, res, false));
app.post("/api/vision", (req, res) => handleAI(req, res, true));

app.listen(PORT, () => console.log(`Anatolia AI Router çalışıyor: http://localhost:${PORT}`));
