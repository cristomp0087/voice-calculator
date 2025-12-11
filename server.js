// server.js
// ======================================
// OnSite Voice Calculator – backend
// Normal + polegadas + IA /interpret
// ======================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const math = require("mathjs");
const OpenAI = require("openai");

// --- Cliente OpenAI (USADO NA ROTA /interpret) ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

function log(...args) {
  console.log(">>", ...args);
}

/* ======================================
   1) CALCULADORA NORMAL (/calculate)
   ====================================== */

app.post("/calculate", (req, res) => {
  const { expression } = req.body || {};

  if (!expression || typeof expression !== "string") {
    return res.status(400).json({ error: "Expression inválida" });
  }

  try {
    const result = math.evaluate(expression);
    return res.json({ result });
  } catch (err) {
    console.error("Erro em /calculate:", err.message);
    return res.status(400).json({ error: "Erro ao avaliar a expressão" });
  }
});

/* ======================================
   2) FUNÇÕES AUXILIARES – POLEGADAS
   ====================================== */

function parseInchString(str) {
  if (!str || typeof str !== "string") return 0;

  let s = str.trim();

  // tira aspas finais "
  if (s.endsWith('"')) {
    s = s.slice(0, -1).trim();
  }

  // sinal
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  }

  let feet = 0;
  // pés: 8' 3 1/2
  if (s.includes("'")) {
    const partsFeet = s.split("'");
    const feetPart = partsFeet[0].trim();
    feet = feetPart ? parseInt(feetPart, 10) || 0 : 0;
    s = (partsFeet[1] || "").trim();
  }

  let inchesInt = 0;
  let frac = 0;

  if (s.length > 0) {
    const tokens = s.split(/\s+/).filter(Boolean);

    if (tokens.length === 1) {
      // só "3" ou só "5/8"
      if (tokens[0].includes("/")) {
        const [num, den] = tokens[0].split("/").map(Number);
        if (den && !isNaN(num)) frac = num / den;
      } else {
        inchesInt = parseInt(tokens[0], 10) || 0;
      }
    } else if (tokens.length >= 2) {
      // "3 5/8"
      inchesInt = parseInt(tokens[0], 10) || 0;
      const fracToken = tokens[1];
      if (fracToken.includes("/")) {
        const [num, den] = fracToken.split("/").map(Number);
        if (den && !isNaN(num)) frac = num / den;
      }
    }
  }

  const totalInches = sign * (feet * 12 + inchesInt + frac);
  return totalInches;
}

// formata resultado em pés + polegadas + fração (até 1/16")
function formatInches(inches) {
  if (!isFinite(inches)) return "Erro";

  let sign = "";
  let x = inches;
  if (x < 0) {
    sign = "-";
    x = Math.abs(x);
  }

  let feet = Math.floor(x / 12);
  x -= feet * 12;

  let wholeInches = Math.floor(x);
  let fraction = x - wholeInches;

  const denomBase = 16;
  let num = Math.round(fraction * denomBase);

  if (num === denomBase) {
    wholeInches += 1;
    num = 0;
  }
  if (wholeInches === 12) {
    feet += 1;
    wholeInches = 0;
  }

  // simplificar fração
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let denom = denomBase;
  if (num > 0) {
    const g = gcd(num, denom);
    num = num / g;
    denom = denom / g;
  }

  const parts = [];
  if (feet > 0) parts.push(`${feet}'`);
  if (wholeInches > 0 || (feet === 0 && num === 0)) {
    parts.push(String(wholeInches));
  }
  if (num > 0) {
    parts.push(`${num}/${denom}`);
  }

  let result = parts.join(" ");
  if (!result) result = "0";

  return sign + result + '"';
}

/* ======================================
   3) CALCULADORA DE POLEGADAS (/inches)
   ====================================== */

app.post("/inches", (req, res) => {
  const { a, b, op } = req.body || {};
  log("POST /inches", { a, b, op });

  if (!a || !b || !op) {
    return res.status(400).json({ error: "Parâmetros inválidos para /inches" });
  }

  const left = parseInchString(a);
  const right = parseInchString(b);

  if (!["+", "-", "*", "/"].includes(op)) {
    return res.status(400).json({ error: "Operador inválido" });
  }

  let resultNumber;
  try {
    switch (op) {
      case "+":
        resultNumber = left + right;
        break;
      case "-":
        resultNumber = left - right;
        break;
      case "*":
        resultNumber = left * right;
        break;
      case "/":
        if (right === 0) {
          return res.status(400).json({ error: "Divisão por zero" });
        }
        resultNumber = left / right;
        break;
    }
  } catch (err) {
    console.error("Erro em /inches:", err.message);
    return res.status(400).json({ error: "Erro ao calcular polegadas" });
  }

  const formatted = formatInches(resultNumber);
  return res.json({ result: formatted, numeric: resultNumber });
});

// -----------------------------------------
// ROTA /interpret – usa IA pra entender texto/voz
// -----------------------------------------
app.post("/interpret", async (req, res) => {
  const { text } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Texto vazio para interpretar." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é um parser de comandos de calculadora para carpintaria e uso diário. " +
            "Recebe frases em português ou inglês e deve transformar em uma instrução de cálculo. " +
            "\n\nTIPOS DE SAÍDA:\n" +
            "1) mode = \"normal\"  -> problemas de números comuns (litros, dinheiro, itens, etc.). " +
            "   - Preencha SEMPRE o campo 'expression' com uma expressão usando apenas números, " +
            "     operadores +, -, *, / e parênteses quando necessário. " +
            "   - Exemplo: 'tenho 30 litros e gasto 15, quanto sobra?' -> expression: '30 - 15'. " +
            "   - Exemplo: '3 vezes 4 mais 2' -> expression: '3 * 4 + 2'. " +
            "   - Campos a, b, op devem ser null nesse modo.\n\n" +
            "2) mode = \"inches\" -> problemas claramente de medidas em pés/polegadas e frações, " +
            "   como 96 1/8, 3 3/8, 8' 2 1/2\" etc. " +
            "   - Preencha os campos 'a', 'b' e 'op' com UMA operação entre duas medidas " +
            "     (ou uma medida e um número como fator). " +
            "   - Exemplo: 'somar 96 e um oitavo com 3 e três oitavos' -> a: '96 1/8', b: '3 3/8', op: '+'. " +
            "   - Exemplo: 'dobrar 8 pés e um quarto' -> a: '8 1/4', b: '2', op: '*'. " +
            "   - No modo inches, 'expression' deve ser null.\n\n" +
            "IMPORTANTE:\n" +
            "- Sempre responda APENAS com um JSON válido, sem texto extra.\n" +
            "- 'mode' é sempre 'normal' ou 'inches'.\n" +
            "- Se o problema for uma historinha (caminhão, litros, dinheiro, etc.), mas não fala de pés/polegadas, " +
            "  use mode='normal' e monte uma expressão numérica equivalente.\n"
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const jsonText = response.choices[0].message.content;
    const parsed = JSON.parse(jsonText);

    console.log("IA (/interpret) ->", parsed);
    return res.json(parsed);
  } catch (err) {
    console.error("Erro em /interpret:", err?.message || err);
    return res
      .status(500)
      .json({ error: "Falha ao interpretar comando de voz." });
  }
});
/* ======================================
   5) START
   ====================================== */

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
