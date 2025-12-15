import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const app = express();

app.use(express.json({ limit: "64kb" }));

// CORS MVP: libera geral. Depois você restringe por domínio.
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate limit (MVP)
const interpretLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,             // 20 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /interpret
 * body: { text: string }
 * return:
 *  - { mode:"normal", expression:"20 - 5" }
 *  - { mode:"inches", a:"3 1/4", op:"+", b:"5 3/8" }
 */
app.post("/interpret", interpretLimiter, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });
    if (text.length > 220) return res.status(400).json({ error: "Text too long" });

    const system = `
Você é um parser de calculadora.
Tarefa: converter a frase do usuário em um JSON ESTRITO para uma calculadora.

REGRAS:
- Responda APENAS com JSON válido (sem markdown, sem texto extra).
- Se for cálculo normal: {"mode":"normal","expression":"..."}
- Se for inches (frações/feet/inch): {"mode":"inches","a":"...","op":"+|-|*|/","b":"..."}
- Use operadores apenas: + - * /
- Se tiver feet/inches, preserve o formato humano (ex.: 5' 3 1/4).
- Se não tiver certeza, devolva: {"mode":"normal","expression":""}
`.trim();

    const user = `Entrada do usuário: ${text}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Força resposta curta
      max_tokens: 120,
    });

    const content = completion?.choices?.[0]?.message?.content || "";
    const json = safeJsonParse(content);

    if (!json || typeof json !== "object") {
      return res.status(200).json({ mode: "normal", expression: "" });
    }

    // validação mínima do retorno
    if (json.mode === "normal") {
      const expression = String(json.expression || "");
      return res.json({ mode: "normal", expression });
    }

    if (json.mode === "inches") {
      const a = String(json.a || "");
      const b = String(json.b || "");
      const op = String(json.op || "");
      if (!["+", "-", "*", "/"].includes(op)) {
        return res.json({ mode: "normal", expression: "" });
      }
      return res.json({ mode: "inches", a, b, op });
    }

    return res.json({ mode: "normal", expression: "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

function safeJsonParse(s) {
  try {
    // remove lixo comum se o modelo cuspir texto antes/depois
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first === -1 || last === -1) return null;
    const cut = s.slice(first, last + 1);
    return JSON.parse(cut);
  } catch {
    return null;
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
