// server.js
// ======================================
// OnSite Voice Calculator – Backend
// Cérebro: IA Tradutora de "Obrês" para Matemática
// ======================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const math = require("mathjs");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
// Usa porta do ambiente ou 3001
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/* ======================================
   FUNÇÕES AUXILIARES (MATEMÁTICA PURA)
   ====================================== */

function parseInchString(str) {
  if (!str || typeof str !== "string") return 0;

  // Limpeza extra: troca vírgula por ponto (caso a IA mande 5,5) e remove : (horas)
  let s = str.replace(/,/g, ".").replace(/:/g, ".").trim();

  if (s.endsWith('"')) s = s.slice(0, -1).trim();

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  }

  let feet = 0;
  if (s.includes("'")) {
    const partsFeet = s.split("'");
    feet = parseInt(partsFeet[0].trim(), 10) || 0;
    s = (partsFeet[1] || "").trim();
  }

  let inchesInt = 0;
  let frac = 0;

  if (s.length > 0) {
    const tokens = s.split(/\s+/).filter(Boolean);
    
    // Tratamento de segurança para números grudados que escaparam da IA
    if (tokens.length === 1 && tokens[0].includes("/")) {
      // Ex: 103/8 -> tenta ver se é 10 3/8
      const matchGlue = tokens[0].match(/^(\d+)(\d+\/\d+)$/);
      if (matchGlue) {
          inchesInt = parseInt(matchGlue[1], 10);
          const [num, den] = matchGlue[2].split("/").map(Number);
          frac = num / den;
      } else {
          // Fração normal
          const [num, den] = tokens[0].split("/").map(Number);
          if (den && !isNaN(num)) frac = num / den;
      }
    } 
    else if (tokens.length === 1) {
       inchesInt = parseFloat(tokens[0]) || 0;
    }
    else if (tokens.length >= 2) {
      inchesInt = parseInt(tokens[0], 10) || 0;
      const fracToken = tokens[1];
      if (fracToken.includes("/")) {
        const [num, den] = fracToken.split("/").map(Number);
        if (den && !isNaN(num)) frac = num / den;
      }
    }
  }

  return sign * (feet * 12 + inchesInt + frac);
}

function formatInches(inches) {
  if (!isFinite(inches)) return "Erro";
  
  let sign = inches < 0 ? "-" : "";
  let x = Math.abs(inches);

  let feet = Math.floor(x / 12);
  x -= feet * 12;

  let wholeInches = Math.floor(x);
  let fraction = x - wholeInches;
  
  // Precisão: 1/16
  let num = Math.round(fraction * 16);
  let denom = 16;

  if (num === 16) {
    wholeInches++;
    num = 0;
  }
  if (wholeInches === 12) {
    feet++;
    wholeInches = 0;
  }

  if (num > 0) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const common = gcd(num, 16);
    num /= common;
    denom /= common;
  }

  const parts = [];
  if (feet > 0) parts.push(`${feet}'`);
  if (wholeInches > 0 || (feet === 0 && num === 0)) parts.push(`${wholeInches}`);
  if (num > 0) parts.push(`${num}/${denom}`);

  return sign + parts.join(" ") + '"';
}

/* ======================================
   ROTAS
   ====================================== */

app.post("/calculate", (req, res) => {
  const { expression } = req.body || {};
  if (!expression) return res.status(400).json({ error: "Vazio" });

  try {
    const result = math.evaluate(expression);
    return res.json({ result });
  } catch (err) {
    return res.status(400).json({ error: "Erro Math" });
  }
});

app.post("/inches", (req, res) => {
  const { a, b, op } = req.body || {};
  if (!a || !b || !op) return res.status(400).json({ error: "Incompleto" });

  const valA = parseInchString(a);
  const valB = parseInchString(b);
  let resNum = 0;

  if (op === "+") resNum = valA + valB;
  else if (op === "-") resNum = valA - valB;
  else if (op === "*") resNum = valA * valB;
  else if (op === "/") resNum = valB !== 0 ? valA / valB : 0;

  return res.json({ result: formatInches(resNum) });
});

/* ======================================
   CÉREBRO DA IA (O ARQUIVO PODEROSO)
   ====================================== */
app.post("/interpret", async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "Texto vazio" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
VOCÊ É UM TRADUTOR RIGOROSO DE LINGUAGEM DE OBRA PARA MATEMÁTICA.
Sua missão é limpar a sujeira do reconhecimento de voz e entregar dados numéricos limpos.

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
{
  "mode": "normal" | "inches",
  "a": string | null,
  "b": string | null,
  "op": "+" | "-" | "*" | "/" | null,
  "expression": string | null,
  "explanation": string
}

--- REGRAS BLINDADAS (LEIA COM ATENÇÃO) ---

1. PROIBIDO PALAVRAS NA SAÍDA NUMÉRICA:
   - Jamais retorne "dez", "cinco", "meia", "pé".
   - Converta TUDO para dígitos: "dez" -> "10", "um quarto" -> "1/4".
   - Input: "cinco e meio" -> Output: "5 1/2" (NÃO "5 e meio").

2. VOCABULÁRIO DE OBRA (TRADUÇÃO):
   - "Fit", "Fite", "Foot", "Feet", "Pé", "Pés" -> Símbolo: '
   - "Incha", "Inche", "Inch", "Inches", "Polegada", "Pol" -> Ignorar palavra, manter apenas o número.
   - "Meia", "Meio" -> "1/2"
   - "Quarto" -> "1/4"
   - "Oitavo", "Oitavos" -> "/8" (Ex: "três oitavos" -> "3/8")
   - "Dezesseis avos" -> "/16"
   - "Traço", "Linha" -> "/8" (Gíria comum: "duas linhas" -> "2/8" ou "1/4")

3. REGRA ANTI-COLA (103/8):
   - O reconhecimento de voz junta números inteiros com frações. VOCÊ DEVE SEPARAR.
   - Se ouvir: "cento e três oitavos" ou receber "103/8" -> Interprete como "10 3/8".
   - Se ouvir: "vinte um meio" ou receber "201/2" -> Interprete como "20 1/2".
   - Regra prática: Se o numerador for maior que o denominador e parecer estranho, separe o último dígito ou os dois últimos.

4. MATEMÁTICA BÁSICA (NORMAL):
   - Se não houver menção a medidas (pé/pol/fração), use "mode": "normal".
   - Retorne "expression" com ESPAÇOS entre operadores.
   - Ex: "dez mais dez" -> "10 + 10".
   - Ex: "cem dividido por dois" -> "100 / 2".

--- CENÁRIOS DE TREINAMENTO (FEW-SHOT EXAMPLES) ---

Input: "Dez e três oitavos mais cinco"
Output: { "mode": "inches", "a": "10 3/8", "op": "+", "b": "5", "expression": null }

Input: "Três pé e meio menos um e um quarto"
Output: { "mode": "inches", "a": "3' 1/2", "op": "-", "b": "1 1/4", "expression": null }

Input: "Cinco fit e duas linha mais dez incha"
Output: { "mode": "inches", "a": "5' 2/8", "op": "+", "b": "10", "expression": null }

Input: "103/8 mais 5" (Erro comum de voz)
Output: { "mode": "inches", "a": "10 3/8", "op": "+", "b": "5", "expression": null }

Input: "vinte mais trinta"
Output: { "mode": "normal", "expression": "20 + 30", "a": null, "b": null, "op": null }

Input: "duas polegadas e meia vezes quatro"
Output: { "mode": "inches", "a": "2 1/2", "op": "*", "b": "4", "expression": null }
          `.trim(),
        },
        { role: "user", content: text },
      ],
      temperature: 0, // Temperatura zero para ser o mais exato possível
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    console.log("IA Input:", text, "Output:", parsed);
    return res.json(parsed);

  } catch (err) {
    console.error("Erro IA:", err);
    return res.status(500).json({ error: "Falha ao interpretar." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});