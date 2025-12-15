const OpenAI = require("openai");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-onsite-key");
}

function readJson(req) {
  // Vercel às vezes já entrega objeto; às vezes string
  if (typeof req.body === "object" && req.body) return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // (Opcional) chave simples do app (MVP)
  const appKey = process.env.ONSITE_APP_KEY;
  if (appKey) {
    const sent = req.headers["x-onsite-key"];
    if (!sent || sent !== appKey) return res.status(401).json({ error: "Unauthorized" });
  }

  const { text } = readJson(req);
  const input = String(text || "").trim();
  if (!input) return res.status(400).json({ error: "Texto vazio" });
  if (input.length > 220) return res.status(400).json({ error: "Texto longo demais" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
VOCÊ É UM TRADUTOR RIGOROSO DE LINGUAGEM DE OBRA PARA MATEMÁTICA.
Responda APENAS JSON válido no formato:

{
  "mode": "normal" | "inches",
  "a": string | null,
  "b": string | null,
  "op": "+" | "-" | "*" | "/" | null,
  "expression": string | null,
  "explanation": string
}

REGRAS:
- Proibido palavras nos números: converta tudo para dígitos.
- "meia"->"1/2", "quarto"->"1/4", "oitavo"->"/8", "dezesseis avos"->"/16"
- "pé/feet/fit" -> use "'"
- Erro comum: "103/8" deve virar "10 3/8"
- Se for normal: preencha expression com espaços entre operadores.
          `.trim(),
        },
        { role: "user", content: input },
      ],
      max_tokens: 180,
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao interpretar." });
  }
};
