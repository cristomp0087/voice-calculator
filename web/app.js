// ================================
// OnSite Calculator (Frontend)
// - "=" calcula 100% local (offline-first)
// - IA (voz/interpret) chama /api/interpret (Vercel serverless)
// ================================

// ================================
// ELEMENTOS DA INTERFACE
// ================================
const exprInput = document.getElementById("expression");
const calcBtn = document.getElementById("calcBtn");
const voiceBtn = document.getElementById("voiceBtn");
const currentResultEl = document.getElementById("current-result");
const clearMemoryBtn = document.getElementById("clearMemoryBtn");
const backspaceBtn = document.getElementById("backspaceBtn");

const keypadButtons = document.querySelectorAll(".keypad-btn");
const aiBtn = document.getElementById("aiBtn");
const calcMemoryVertical = document.getElementById("calcMemoryVertical");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let justCalculated = false;

// Se você quiser uma chave simples no header do app (MVP), defina no HTML:
// window.ONSITE_APP_KEY = "minha-chave"
// E no Vercel set ENV ONSITE_APP_KEY igual.
// Se não definir, roda sem header.
const APP_KEY = window.ONSITE_APP_KEY || "";

// IA endpoint no mesmo domínio do Vercel
const AI_ENDPOINT = "/api/interpret";

// ================================
// RESULTADO / MEMÓRIA
// ================================
function showResult(text) {
  currentResultEl.textContent = String(text);
}

function clearMemory() {
  exprInput.value = "";
  justCalculated = false;
  if (calcMemoryVertical) calcMemoryVertical.innerHTML = "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderColumnMemory(info) {
  if (!calcMemoryVertical) return;
  const { mode, expression, a, b, op, result, meta } = info;

  if (!result) {
    calcMemoryVertical.innerHTML = "";
    return;
  }

  if (mode === "inches" && a && b && op) {
    calcMemoryVertical.innerHTML = `
      <div class="mem-line mem-a">${escapeHtml(a)}</div>
      <div class="mem-line mem-b">${escapeHtml(op)} ${escapeHtml(b)}</div>
      <div class="mem-line mem-sep">────────</div>
      <div class="mem-line mem-meta">${escapeHtml(meta || "")}</div>
    `;
  } else if (mode === "normal" && expression) {
    calcMemoryVertical.innerHTML = `
      <div class="mem-line mem-expr">${escapeHtml(expression)}</div>
      <div class="mem-line mem-sep">────────</div>
      <div class="mem-line mem-meta">${escapeHtml(meta || "")}</div>
    `;
  } else {
    calcMemoryVertical.innerHTML = "";
  }
}

// ================================
// NORMALIZAÇÃO (mobile-safe)
// ================================
function normalizeText(s) {
  return (s ?? "")
    .toString()
    .replace(/\u00A0/g, " ")  // NBSP
    .replace(/⁄/g, "/")       // fraction slash
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInchText(s) {
  return normalizeText(s)
    .replace(/["“”″]/g, "")   // inch quotes
    .replace(/[’]/g, "'")     // normalize apostrophe
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .replace(/⅛/g, "1/8")
    .replace(/⅜/g, "3/8")
    .replace(/⅝/g, "5/8")
    .replace(/⅞/g, "7/8")
    .replace(/′/g, "'");      // feet symbol to '
}

// ================================
// PARSER: FRAÇÃO/NUMERO
// ================================
function parseFractionOrNumber(token) {
  token = normalizeInchText(token);
  if (!token) return NaN;

  if (token.includes("/")) {
    const [num, den] = token.split("/");
    const n = parseFloat(num);
    const d = parseFloat(den);
    if (!isFinite(n) || !isFinite(d) || d === 0) return NaN;
    return n / d;
  }

  const v = parseFloat(token);
  return isFinite(v) ? v : NaN;
}

// ================================
// INCHES: parse (feet opcional)
// Aceita:
//  - 3 1/4
//  - 1/2
//  - 3.75
//  - 5' 3 1/4   (feet + inches)
//  - 5' 3
// ================================
function parseInchValue(raw) {
  let s = normalizeInchText(raw);

  let feet = 0;
  const feetMatch = s.match(/^\s*(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (feetMatch) {
    feet = parseFloat(feetMatch[1]);
    s = (feetMatch[2] || "").trim();
  }

  let inches = 0;
  if (!s) {
    inches = 0;
  } else {
    const parts = s.split(" ");
    if (parts.length === 1) {
      inches = parseFractionOrNumber(parts[0]);
    } else if (parts.length === 2) {
      const whole = parseFloat(parts[0]);
      const frac = parseFractionOrNumber(parts[1]);
      if (!isFinite(whole) || isNaN(frac)) return NaN;
      inches = whole + frac;
    } else {
      return NaN;
    }
  }

  if (!isFinite(feet) || isNaN(inches)) return NaN;
  return feet * 12 + inches;
}

// Formata inches como 8 3/16"
function formatInches(value, denom = 16) {
  if (!isFinite(value)) return "—";

  const sign = value < 0 ? "-" : "";
  value = Math.abs(value);

  let whole = Math.floor(value);
  const frac = value - whole;

  let num = Math.round(frac * denom);
  if (num === denom) {
    whole += 1;
    num = 0;
  }

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  if (num === 0) return `${sign}${whole}"`;

  const g = gcd(num, denom);
  const n = num / g;
  const d = denom / g;

  if (whole === 0) return `${sign}${n}/${d}"`;
  return `${sign}${whole} ${n}/${d}"`;
}

// ================================
// Detectores de modo
// ================================
function isInchesExpression(expr) {
  const t = normalizeInchText(expr).toLowerCase();
  if (!t) return false;
  if (t.includes("'") || t.includes('"')) return true;
  if (/\d+\s*\/\s*\d+/.test(t)) return true;
  // unicode fractions already normalized
  return false;
}

// split A op B (com ou sem espaços)
function splitBinaryExpression(expr) {
  const s = normalizeText(expr);
  const m = s.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
  if (!m) return null;
  return { a: m[1].trim(), op: m[2], b: m[3].trim() };
}

// ================================
// Engine: matemática normal (safe)
// suporta: + - * / ( ) decimais
// ================================
function tokenizeMath(expr) {
  const s = normalizeText(expr);
  const tokens = [];
  let i = 0;

  const isDigit = (c) => /[0-9.]/.test(c);

  while (i < s.length) {
    const c = s[i];

    if (c === " ") { i++; continue; }

    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }

    if (isDigit(c)) {
      let j = i + 1;
      while (j < s.length && isDigit(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }

    throw new Error("Invalid character");
  }

  return tokens;
}

function toRPN(tokens) {
  const out = [];
  const stack = [];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const isOp = (t) => ["+", "-", "*", "/"].includes(t);

  // unary minus -> u-
  const fixed = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = fixed[fixed.length - 1];
    if (t === "-" && (i === 0 || prev === "(" || isOp(prev) || prev === "u-")) {
      fixed.push("u-");
    } else {
      fixed.push(t);
    }
  }

  for (const t of fixed) {
    if (t === "u-") {
      stack.push(t);
      continue;
    }

    if (!isNaN(Number(t))) {
      out.push(t);
      continue;
    }

    if (isOp(t)) {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top === "u-") { out.push(stack.pop()); continue; }
        if (isOp(top) && prec[top] >= prec[t]) out.push(stack.pop());
        else break;
      }
      stack.push(t);
      continue;
    }

    if (t === "(") { stack.push(t); continue; }

    if (t === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") out.push(stack.pop());
      if (stack.pop() !== "(") throw new Error("Mismatched parentheses");
      if (stack[stack.length - 1] === "u-") out.push(stack.pop());
      continue;
    }

    throw new Error("Bad token");
  }

  while (stack.length) {
    const t = stack.pop();
    if (t === "(" || t === ")") throw new Error("Mismatched parentheses");
    out.push(t);
  }

  return out;
}

function evalRPN(rpn) {
  const st = [];
  for (const t of rpn) {
    if (!isNaN(Number(t))) {
      st.push(Number(t));
      continue;
    }
    if (t === "u-") {
      if (st.length < 1) throw new Error("Bad unary");
      st.push(-st.pop());
      continue;
    }
    if (["+","-","*","/"].includes(t)) {
      if (st.length < 2) throw new Error("Bad expr");
      const b = st.pop();
      const a = st.pop();
      if (t === "+") st.push(a + b);
      if (t === "-") st.push(a - b);
      if (t === "*") st.push(a * b);
      if (t === "/") st.push(a / b);
      continue;
    }
    throw new Error("Bad op");
  }
  if (st.length !== 1 || !isFinite(st[0])) throw new Error("Bad result");
  return st[0];
}

function evalMathExpression(expr) {
  const tokens = tokenizeMath(expr);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

// ================================
// HANDLE (=) OFFLINE-FIRST
// ================================
function handleExpression(raw) {
  const expr = normalizeText(raw);
  if (!expr) {
    showResult("0");
    return;
  }

  try {
    // INCHES MODE: só A op B (MVP)
    if (isInchesExpression(expr)) {
      const parts = splitBinaryExpression(expr);
      if (!parts) {
        showResult("Format Error");
        return;
      }

      const aIn = parseInchValue(parts.a);
      const bIn = parseInchValue(parts.b);
      const bNum = parseFractionOrNumber(parts.b);

      if (!isFinite(aIn)) {
        showResult("Format Error");
        return;
      }

      let resultIn;

      if (parts.op === "+" || parts.op === "-") {
        if (!isFinite(bIn)) {
          showResult("Format Error");
          return;
        }
        resultIn = parts.op === "+" ? (aIn + bIn) : (aIn - bIn);
      } else if (parts.op === "*") {
        // multiplicar inches por número (ou inches se o usuário insistir)
        const mul = isFinite(bNum) ? bNum : (isFinite(bIn) ? bIn : NaN);
        if (!isFinite(mul)) { showResult("Format Error"); return; }
        resultIn = aIn * mul;
      } else if (parts.op === "/") {
        const div = isFinite(bNum) ? bNum : (isFinite(bIn) ? bIn : NaN);
        if (!isFinite(div) || div === 0) { showResult("Error"); return; }
        resultIn = aIn / div;
      } else {
        showResult("Error");
        return;
      }

      const pretty = formatInches(resultIn, 16);
      showResult(pretty);

      renderColumnMemory({
        mode: "inches",
        a: parts.a,
        b: parts.b,
        op: parts.op,
        result: pretty,
        meta: `≈ ${resultIn.toFixed(4)}"`,
      });

      justCalculated = true;
      return;
    }

    // NORMAL MODE (safe parser)
    const r = evalMathExpression(expr);
    if (!isFinite(r)) {
      showResult("Error");
      return;
    }

    const pretty =
      Number.isInteger(r) ? String(r) :
      (Math.abs(r) >= 1e12 ? r.toExponential(6) : r.toString());

    showResult(pretty);

    renderColumnMemory({
      mode: "normal",
      expression: expr,
      result: pretty,
      meta: "",
    });

    justCalculated = true;
  } catch (e) {
    console.error(e);
    showResult("Error");
  }
}

// ================================
// IA: interpreta texto/voz -> fórmula
// (não calcula; cálculo é local)
// ================================
async function interpretWithAI() {
  const text = normalizeText(exprInput.value);
  if (!text) {
    showResult("Type/Speak...");
    return;
  }

  showResult("Thinking...");

  try {
    const headers = { "Content-Type": "application/json" };
    if (APP_KEY) headers["x-onsite-key"] = APP_KEY;

    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showResult("AI Error");
      return;
    }

    // Espera: {mode:"normal", expression:"..."} ou {mode:"inches", a,b,op}
    if (data.mode === "normal" && data.expression) {
      exprInput.value = data.expression;
      handleExpression(data.expression);
      return;
    }

    if (data.mode === "inches" && data.a && data.b && data.op) {
      exprInput.value = `${data.a} ${data.op} ${data.b}`;
      handleExpression(exprInput.value);
      return;
    }

    showResult("AI Confused");
  } catch (err) {
    console.error(err);
    showResult("AI Error");
  }
}

// ================================
// VOZ (PUSH-TO-TALK)
// - Captura transcript
// - Quando solta: chama IA e depois calcula local
// ================================
function setupVoiceButton() {
  if (!voiceBtn) return;

  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.title = "SpeechRecognition não suportado neste navegador.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;

  let isPressed = false;
  let savedContent = "";

  const activateVisuals = () => {
    voiceBtn.classList.add("listening");
    showResult("🎙️ Listening...");
  };

  const deactivateVisuals = () => {
    voiceBtn.classList.remove("listening");
  };

  const startMic = () => {
    if (isPressed) return;
    isPressed = true;
    savedContent = "";
    exprInput.value = "";
    activateVisuals();
    try { recognition.start(); } catch (e) {}
  };

  const stopMic = () => {
    if (!isPressed) return;
    isPressed = false;
    deactivateVisuals();

    setTimeout(() => {
      try { recognition.stop(); } catch(e){}
      showResult("Processing...");
    }, 150);

    setTimeout(() => {
      const t = normalizeText(exprInput.value);
      if (t.length > 0) interpretWithAI();
      else showResult("No Audio");
    }, 600);
  };

  recognition.addEventListener("result", (event) => {
    let currentSession = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      currentSession += event.results[i][0].transcript;
    }
    const sep = savedContent.length > 0 ? " " : "";
    exprInput.value = (savedContent + sep + currentSession).trim();
  });

  recognition.addEventListener("end", () => {
    if (isPressed) {
      savedContent = normalizeText(exprInput.value);
      try { recognition.start(); } catch(e){}
    }
  });

  // Gatilhos
  const handlePress = (e) => { if (e.cancelable) e.preventDefault(); startMic(); };
  const handleRelease = (e) => { if (e.cancelable) e.preventDefault(); stopMic(); };

  voiceBtn.addEventListener("mousedown", handlePress);
  voiceBtn.addEventListener("mouseup", handleRelease);
  voiceBtn.addEventListener("mouseleave", handleRelease);

  voiceBtn.addEventListener("touchstart", handlePress, { passive: false });
  voiceBtn.addEventListener("touchend", handleRelease, { passive: false });
  voiceBtn.addEventListener("touchcancel", handleRelease, { passive: false });
}

setupVoiceButton();

// ================================
// EVENTOS UI
// ================================
if (clearMemoryBtn) {
  clearMemoryBtn.addEventListener("click", () => {
    clearMemory();
    showResult("0");
    exprInput.focus();
  });
}

if (backspaceBtn) {
  backspaceBtn.addEventListener("click", () => {
    const currentVal = exprInput.value || "";
    if (currentVal.length > 0) {
      exprInput.value = currentVal.slice(0, -1);
    }
    justCalculated = false;
    exprInput.focus();
  });
}

if (exprInput) {
  exprInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExpression(exprInput.value);
    }
  });
}

// "="
if (calcBtn) {
  calcBtn.addEventListener("click", () => {
    handleExpression(exprInput.value);
  });
}

// AI button
if (aiBtn) {
  aiBtn.addEventListener("click", () => interpretWithAI());
}

// ================================
// TECLADO (Botões Genéricos)
// ================================
keypadButtons.forEach((btn) => {
  // Se o seu "=" também tem classe keypad-btn e id calcBtn, ignore aqui
  if (btn.id === "calcBtn") return;

  btn.addEventListener("click", () => {
    const value = btn.textContent.trim();

    if (justCalculated) {
      clearMemory();
      showResult("0");
    }

    let toInsert = value;

    if (value === "+") toInsert = " + ";
    else if (value === "-") toInsert = " - ";
    else if (value === "×") toInsert = " * ";
    else if (value === "÷") toInsert = " / ";
    else if (value.includes("/")) toInsert = " " + value; // ex: 1/4"

    exprInput.value += toInsert;
    exprInput.focus();
    justCalculated = false;
  });
});
