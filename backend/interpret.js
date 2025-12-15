function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-onsite-key");
}

function readJson(req) {
  // Vercel pode entregar objeto ou string
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // (Opcional) chave simples do app
  const appKey = process.env.ONSITE_APP_KEY;
  if (appKey) {
    const sent = req.headers["x-onsite-key"];
    if (!sent || sent !== appKey) return res.status(401).json({ error: "Unauthorized" });
  }

  const { text } = readJson(req);
  const input = String(text || "").trim();

  if (!input) return res.status(400).json({ error: "Missing text" });
  if (input.length > 220) return res.status(400).json({ error: "Text too long" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
Você é um parser de calculadora.
Converta a frase do usuário em JSON ESTRITO (sem markdown).

Retorne UM destes formatos:

1) Normal:
{"mode":"normal","expression":"20 - 5"}

2) Inches:
{"mode":"inches","a":"3 1/4","op":"+","b":"5 3/8"}

Regras:
- Use operadores apenas: + - * /
- Corrija coisas como "10 3/8" (não "103/8")
- Se não tiver certeza, devolva: {"mode":"normal","expression":""}
`.trim();

    const payload = {
      model,
      temperature: 0,
      // força JSON limpo quando disponível
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
      max_tokens: 160,
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ error: "OpenAI error", detail: data?.error?.message || "" });
    }

    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Function crash:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
