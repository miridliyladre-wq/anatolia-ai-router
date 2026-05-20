require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

// Sağlayıcı sırası: ucuzdan kaliteye doğru.
// Key yoksa otomatik atlanır.
const providers = [
  {
    name: "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY,
    type: "openai-compatible",
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat"
  },
  {
    name: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    type: "openai-compatible",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini"
  },
  {
    name: "groq",
    apiKey: process.env.GROQ_API_KEY,
    type: "openai-compatible",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant"
  },
  {
    name: "mistral",
    apiKey: process.env.MISTRAL_API_KEY,
    type: "openai-compatible",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest"
  },
  {
    name: "gemini",
    apiKey: process.env.GEMINI_API_KEY,
    type: "gemini",
    model: "gemini-1.5-flash"
  },
  {
    name: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    type: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-haiku-latest"
  }
];

function checkAppSecret(req) {
  const expected = process.env.ANATOLIA_APP_SECRET;
  if (!expected) return true;
  return req.headers["x-anatolia-secret"] === expected;
}

function buildSystemPrompt(mode) {
  if (mode === "vision") {
    return "Sen Anatolia AI içinde çalışan yardımcı modelsin. Görsel/kamera analizinde kısa, net ve Türkçe cevap ver.";
  }

  if (mode === "culture") {
    return "Sen Anatolia AI kültür asistanısın. Türkiye, şehirler, tarih, kültür ve nesne açıklamalarında doğru, sade ve öğretici Türkçe cevap ver.";
  }

  return "Sen Anatolia AI uygulaması içinde çalışan Türkçe asistansın. Cevapların kısa, doğru, güvenli ve kullanıcı dostu olsun.";
}

function normalizeMessages(prompt, mode) {
  return [
    { role: "system", content: buildSystemPrompt(mode) },
    { role: "user", content: String(prompt || "").slice(0, 120000) }
  ];
}

function shouldTryNext(errorText = "", status = 0) {
  const t = String(errorText).toLowerCase();
  return (
    status === 429 ||
    status === 402 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    t.includes("rate limit") ||
    t.includes("quota") ||
    t.includes("billing") ||
    t.includes("insufficient") ||
    t.includes("context_length") ||
    t.includes("maximum context") ||
    t.includes("token")
  );
}

async function callOpenAICompatible(provider, messages, temperature = 0.4) {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature,
      max_tokens: 900
    })
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(provider, prompt, mode, temperature = 0.4) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(mode) }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: String(prompt || "").slice(0, 120000) }]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: 900
      }
    })
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
}

async function callAnthropic(provider, messages, temperature = 0.4) {
  const system = messages.find(m => m.role === "system")?.content || "";
  const user = messages.filter(m => m.role !== "system");

  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      system,
      messages: user,
      temperature,
      max_tokens: 900
    })
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data?.content?.map(c => c.text).join("") || "";
}

async function callProvider(provider, prompt, mode, temperature) {
  const messages = normalizeMessages(prompt, mode);

  if (provider.type === "openai-compatible") {
    return await callOpenAICompatible(provider, messages, temperature);
  }

  if (provider.type === "gemini") {
    return await callGemini(provider, prompt, mode, temperature);
  }

  if (provider.type === "anthropic") {
    return await callAnthropic(provider, messages, temperature);
  }

  throw new Error(`Bilinmeyen provider type: ${provider.type}`);
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Anatolia AI Router",
    providers: providers
      .filter(p => !!p.apiKey)
      .map(p => ({ name: p.name, model: p.model }))
  });
});

app.post("/api/ai", async (req, res) => {
  if (!checkAppSecret(req)) {
    return res.status(401).json({ ok: false, error: "Yetkisiz istek." });
  }

  const { prompt, mode = "default", temperature = 0.4, preferredProvider } = req.body || {};

  if (!prompt || String(prompt).trim().length < 1) {
    return res.status(400).json({ ok: false, error: "Prompt boş olamaz." });
  }

  let activeProviders = providers.filter(p => !!p.apiKey);

  if (preferredProvider) {
    const first = activeProviders.find(p => p.name === preferredProvider);
    const rest = activeProviders.filter(p => p.name !== preferredProvider);
    activeProviders = first ? [first, ...rest] : activeProviders;
  }

  if (activeProviders.length === 0) {
    return res.status(500).json({
      ok: false,
      error: "Hiç API key tanımlanmamış. .env dosyasını doldur."
    });
  }

  const attempts = [];

  for (const provider of activeProviders) {
    try {
      const answer = await callProvider(provider, prompt, mode, temperature);

      if (!answer || !answer.trim()) {
        throw new Error("Boş cevap döndü.");
      }

      return res.json({
        ok: true,
        provider: provider.name,
        model: provider.model,
        answer
      });

    } catch (err) {
      attempts.push({
        provider: provider.name,
        model: provider.model,
        status: err.status || null,
        error: err.message
      });

      if (!shouldTryNext(err.message, err.status)) {
        // Yine de kullanıcıya kesinti yaşatmamak için sonraki modele geçiyoruz.
        continue;
      }
    }
  }

  return res.status(502).json({
    ok: false,
    error: "Tüm AI sağlayıcıları başarısız oldu.",
    attempts
  });
});

app.listen(PORT, () => {
  console.log(`Anatolia AI Router çalışıyor: http://localhost:${PORT}`);
});
