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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let justCalculated = false; 

// ================================
// RESULTADO / MEMÓRIA
// ================================
function showResult(text) {
  currentResultEl.textContent = text;
}

function clearMemory() {
  exprInput.value = "";
  justCalculated = false;
  if (calcMemoryVertical) calcMemoryVertical.innerHTML = "";
}

if (clearMemoryBtn) {
  clearMemoryBtn.addEventListener("click", () => {
    clearMemory();
    showResult("0");
    exprInput.focus();
  });
}

if (backspaceBtn) {
  backspaceBtn.addEventListener("click", () => {
    const currentVal = exprInput.value;
    if (currentVal.length > 0) {
      exprInput.value = currentVal.slice(0, -1);
    }
    justCalculated = false;
    exprInput.focus();
  });
}
// ================================
// CONFIG
// ================================
const API_BASE = (window.ONSITE_API_BASE || "").replace(/\/+$/, ""); // "" ou "https://seu-backend..."
const AI_ENDPOINT = API_BASE ? `${API_BASE}/interpret` : "/api/interpret"; // se full-stack no mesmo domínio

// ================================
// ELEMENTOS
// ================================
const exprInput = document.getElementById("expression");
const calcBtn = document.getElementById("calcBtn");
const calcBtnClone = document.getElementById("calcBtnClone");
const voiceBtn = document.getElementById("voiceBtn");
const aiBtn = document.getElementById("aiBtn");
const currentResultEl = document.getElementById("current-result");
const clearMemoryBtn = document.getElementById("clearMemoryBtn");
const backspaceBtn = document.getElementById("backspaceBtn");
const keypadButtons = document.querySelectorAll(".keypad-btn");
const calcMemoryVertical = document.getElementById("calcMemoryVertical");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let justCalculated = false;

// ================================
// UI helpers
// ================================
function showResult(text) {
  currentResultEl.textContent = String(text);
}
function clearMemory() {
  exprInput.value = "";
  justCalculated = false;
  if (calcMemoryVertical) calcMemoryVertical.innerHTML = "";
}
function renderColumnMemory(info) {
  if (!calcMemoryVertical) return;
  const { mode, expression, a, b, op, result, meta } = info;

  if (result == null || result === "") {
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
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    .replace(/["“”″]/g, "")   // inches quotes
    .replace(/[’]/g, "'")     // normalize apostrophe
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .replace(/⅛/g, "1/8")
    .replace(/⅜/g, "3/8")
    .replace(/⅝/g, "5/8")
    .replace(/⅞/g, "7/8");
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
// INCHES: parse (inclui feet opcional)
// Aceita:
//  - 3 1/4
//  - 1/2
//  - 3.75
//  - 5' 3 1/4   (feet + inches)
//  - 5' 3       (feet + inches)
// ================================
function parseInchValue(raw) {
  let s = normalizeInchText(raw);

  // suportar símbolos feet diferentes
  s = s.replace(/′/g, "'");

  // separar feet se existir
  let feet = 0;
  const feetMatch = s.match(/^\s*(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (feetMatch) {
    feet = parseFloat(feetMatch[1]);
    s = (feetMatch[2] || "").trim();
  }

  // remover aspas de inch caso venham (já removeu acima, mas mantendo)
  s = s.replace(/"/g, "").trim();

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

// formata inches como: 8 3/16" (1/16 por padrão)
function formatInches(value, denom = 16) {
  if (!isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  value = Math.abs(value);

  const whole = Math.floor(value);
  const frac = value - whole;

  let num = Math.round(frac * denom);
  let w = whole;
  if (num === denom) { w += 1; num = 0; }

  function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

  if (num === 0) return `${sign}${w}"`;

  const g = gcd(num, denom);
  const n = num / g;
  const d = denom / g;

  if (w === 0) return `${sign}${n}/${d}"`;
  return `${sign}${w} ${n}/${d}"`;
}

// ================================
// Detectores de modo
// ================================
function isInchesExpression(expr) {
  const t = normalizeInchText(expr).toLowerCase();
  if (!t) return false;

  // se tem feet ou inch marks
  if (t.includes("'") || t.includes('"')) return true;

  // se tem fração
  if (/\d+\s*\/\s*\d+/.test(t)) return true;

  return false;
}

// split simples: A op B (com ou sem espaços)
function splitBinaryExpression(expr) {
  const s = normalizeText(expr);
  const m = s.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
  if (!m) return null;
  return { a: m[1].trim(), op: m[2], b: m[3].trim() };
}

// ================================
// Engine: matemática normal (safe eval) com Shunting-yard
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

    // operadores e parênteses
    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }

    // número (inclui negativo como unary, tratado depois)
    if (isDigit(c)) {
      let j = i + 1;
      while (j < s.length && isDigit(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }

    // qualquer outra coisa: rejeita (pra não virar eval perigoso)
    throw new Error("Invalid character");
  }

  return tokens;
}

function toRPN(tokens) {
  const out = [];
  const stack = [];

  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const isOp = (t) => ["+", "-", "*", "/"].includes(t);

  // tratar unary minus: se '-' vem no começo ou após '(' ou operador, vira 'u-'
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
      // unary após fechar parênteses
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
// HANDLE (=) offline-first
// ================================
function handleExpression(raw) {
  const expr = normalizeText(raw);
  if (!expr) { showResult("0"); return; }

  try {
    // inches: só suporta A op B (MVP)
    if (isInchesExpression(expr)) {
      const parts = splitBinaryExpression(expr);
      if (!parts) { showResult("Format Error"); return; }

      const aIn = parseInchValue(parts.a);
      const bIn = parseInchValue(parts.b);

      // b pode ser número puro (ex: 3 1/2 * 4)
      const bNumFallback = parseFractionOrNumber(parts.b);

      if (!isFinite(aIn)) { showResult("Format Error"); return; }

      let resultIn;
      if (parts.op === "+") {
        if (!isFinite(bIn)) { showResult("Format Error"); return; }
        resultIn = aIn + bIn;
      } else if (parts.op === "-") {
        if (!isFinite(bIn)) { showResult("Format Error"); return; }
        resultIn = aIn - bIn;
      } else if (parts.op === "*") {
        // se b tem inches parseáveis, usa; senão usa número puro
        const mul = isFinite(bIn) ? bIn : (isFinite(bNumFallback) ? bNumFallback : NaN);
        if (!isFinite(mul)) { showResult("Format Error"); return; }
        resultIn = aIn * mul;
      } else if (parts.op === "/") {
        const div = isFinite(bIn) ? bIn : (isFinite(bNumFallback) ? bNumFallback : NaN);
        if (!isFinite(div) || div === 0) { showResult("Error"); return; }
        resultIn = aIn / div;
      } else {
        showResult("Error"); return;
      }

      const frac = formatInches(resultIn, 16);
      const dec = `${resultIn.toFixed(4)}"`;
      showResult(frac);

      renderColumnMemory({
        mode: "inches",
        a: parts.a,
        b: parts.b,
        op: parts.op,
        result: frac,
        meta: `≈ ${dec}`,
      });

      justCalculated = true;
      return;
    }

    // normal math (com parênteses)
    const r = evalMathExpression(expr);
    const out = Number.isFinite(r) ? r : NaN;
    if (!isFinite(out)) { showResult("Error"); return; }

    // estética: corta zeros feios
    const pretty =
      Math.abs(out) >= 1e12 ? out.toExponential(6) :
      Number.isInteger(out) ? String(out) :
      out.toString();

    showResult(pretty);

    renderColumnMemory({
      mode: "normal",
      expression: expr,
      result: pretty,
      meta: "",
    });

    justCalculated = true;
  } catch (e) {
    showResult("Error");
  }
}

// ================================
// AI interpret (opcional)
// ================================
async function interpretWithAI() {
  const text = normalizeText(exprInput.value);
  if (!text) { showResult("Type/Speak..."); return; }

  showResult("Thinking...");
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "AI Error");

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
    showResult("AI Error");
  }
}

// ================================
// VOZ (push-to-talk)
// ================================
function setupVoiceButton() {
  if (!voiceBtn) return;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.title = "SpeechRecognition not supported on this device/browser.";
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
  const deactivateVisuals = () => voiceBtn.classList.remove("listening");

  const startMic = () => {
    if (isPressed) return;
    isPressed = true;
    savedContent = "";
    exprInput.value = "";
    activateVisuals();
    try { recognition.start(); } catch {}
  };

  const stopMic = () => {
    if (!isPressed) return;
    isPressed = false;
    deactivateVisuals();

    setTimeout(() => { try { recognition.stop(); } catch {} }, 120);

    // Depois de parar: você escolhe se chama IA automaticamente ou não.
    // MVP: não chama automático (evita custo). Usuário clica "AI Interpret".
    setTimeout(() => {
      const t = normalizeText(exprInput.value);
      if (!t) showResult("No Audio");
      else showResult("Ready");
    }, 400);
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
      try { recognition.start(); } catch {}
    }
  });

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
// EVENTOS
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
    const v = exprInput.value || "";
    exprInput.value = v.slice(0, -1);
    justCalculated = false;
    exprInput.focus();
  });
}

exprInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleExpression(exprInput.value);
  }
});

calcBtn.addEventListener("click", () => handleExpression(exprInput.value));
if (calcBtnClone) calcBtnClone.addEventListener("click", () => handleExpression(exprInput.value));
aiBtn.addEventListener("click", () => interpretWithAI());

// teclado: insere texto
keypadButtons.forEach((btn) => {
  if (btn.id === "calcBtn" || btn.id === "calcBtnClone") return;

  btn.addEventListener("click", () => {
    const value = btn.textContent.trim();
    if (justCalculated) { clearMemory(); showResult("0"); }

    let toInsert = value;

    if (value === "+") toInsert = " + ";
    else if (value === "-") toInsert = " - ";
    else if (value === "×") toInsert = " * ";
    else if (value === "÷") toInsert = " / ";
    else if (value.includes("/")) toInsert = " " + value; // frações entram como token separado

    exprInput.value += toInsert;
    exprInput.focus();
    justCalculated = false;
  });
});

exprInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleExpression(exprInput.value);
  }
});

function renderColumnMemory(info) {
  if (!calcMemoryVertical) return;
  const { mode, expression, a, b, op, result } = info;

  if (!result) {
    calcMemoryVertical.innerHTML = "";
    return;
  }

  if (mode === "inches" && a && b && op) {
    calcMemoryVertical.innerHTML = `
      <div class="mem-line mem-a">${a}</div>
      <div class="mem-line mem-b">${op} ${b}</div>
      <div class="mem-line mem-sep">────────</div>
    `;
  } else if (mode === "normal" && expression) {
    calcMemoryVertical.innerHTML = `
      <div class="mem-line mem-expr">${expression}</div>
    `;
  } else {
    calcMemoryVertical.innerHTML = "";
  }
}

// ================================
// LÓGICA DE CÁLCULO
// ================================
function isInchesExpression(expr) {
  const t = (expr || "").toLowerCase();
  if (t.includes("′") || t.includes("'")) return true;
  if (t.includes('"')) return true;
  const isFraction = /\d\/\d/.test(t);
  if (isFraction) return true;
  return false;
}

function splitInchExpression(expr) {
  const match = expr.match(/^(.+?)\s+([+\-*\/])\s+(.+)$/);
  if (!match) return null;
  return { a: match[1].trim(), op: match[2], b: match[3].trim() };
}

async function handleExpression(raw) {
  const expr = (raw || "").trim();
  if (!expr) {
    showResult("—");
    return;
  }

  const originalBtnText = calcBtn.textContent;
  calcBtn.textContent = "...";
  calcBtn.disabled = true;

  let mode;
  let endpoint;
  let body;
  let inchParts = null;

  if (isInchesExpression(expr)) {
    mode = "inches";
    inchParts = splitInchExpression(expr);

    if (!inchParts) {
      showResult("Format Error");
      calcBtn.textContent = originalBtnText;
      calcBtn.disabled = false;
      return;
    }
    endpoint = "http://localhost:3001/inches"; 
    body = JSON.stringify({ a: inchParts.a, b: inchParts.b, op: inchParts.op });
  } else {
    mode = "normal";
    endpoint = "http://localhost:3001/calculate"; 
    body = JSON.stringify({ expression: expr });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await response.json();

    if (!response.ok) {
      showResult("Error");
      return;
    }
    showResult(data.result);
    renderColumnMemory({
      mode,
      expression: mode === "normal" ? expr : null,
      a: mode === "inches" && inchParts ? inchParts.a : null,
      b: mode === "inches" && inchParts ? inchParts.b : null,
      op: mode === "inches" && inchParts ? inchParts.op : null,
      result: data.result,
    });
    justCalculated = true;
  } catch (err) {
    console.error(err);
    showResult("Net Error");
  } finally {
    calcBtn.textContent = originalBtnText;
    calcBtn.disabled = false;
  }
}

// Listener APENAS para o botão Igual
calcBtn.addEventListener("click", () => {
  handleExpression(exprInput.value);
});

async function interpretWithAI() {
  const text = (exprInput.value || "").trim();
  if (!text) { showResult("Type/Speak..."); return; }
  showResult("Thinking...");

  try {
    const response = await fetch("http://localhost:3001/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("AI Error");

    if (data.mode === "normal" && data.expression) {
      exprInput.value = data.expression;
      handleExpression(data.expression);
    } else if (data.mode === "inches" && data.a && data.b && data.op) {
      exprInput.value = `${data.a} ${data.op} ${data.b}`;
      handleExpression(exprInput.value);
    } else {
      showResult("AI Confused");
    }
  } catch (err) {
    console.error(err);
    showResult("AI Error");
  }
}

// ================================
// VOZ (PUSH-TO-TALK)
// ================================
function setupVoiceButton() {
  if (!voiceBtn) return;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
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
    setTimeout(() => { try { recognition.stop(); } catch(e){} showResult("Processing..."); }, 200);
    setTimeout(() => {
      if (exprInput.value.trim().length > 0) interpretWithAI();
      else showResult("No Audio");
    }, 700);
  };

  recognition.addEventListener("result", (event) => {
    let currentSession = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      currentSession += event.results[i][0].transcript;
    }
    const sep = savedContent.length > 0 ? " " : "";
    exprInput.value = savedContent + sep + currentSession;
  });

  recognition.addEventListener("end", () => {
    if (isPressed) {
      savedContent = exprInput.value.trim();
      try { recognition.start(); } catch(e){}
    }
  });

  // Gatilhos
  const handlePress = (e) => { if (e.cancelable) e.preventDefault(); startMic(); };
  const handleRelease = (e) => { if (e.cancelable) e.preventDefault(); stopMic(); };

  voiceBtn.addEventListener("mousedown", handlePress);
  voiceBtn.addEventListener("mouseup", handleRelease);
  voiceBtn.addEventListener("mouseleave", handleRelease);
  voiceBtn.addEventListener("touchstart", handlePress);
  voiceBtn.addEventListener("touchend", handleRelease);
  voiceBtn.addEventListener("touchcancel", handleRelease);
}
setupVoiceButton();

// ================================
// TECLADO (Botões Genéricos)
// ================================
keypadButtons.forEach((btn) => {
  // Ignora o botão de igual (calcBtn) para não escrever "=" no input
  if (btn.id === "calcBtn") return;

  btn.addEventListener("click", () => {
    const value = btn.textContent.trim();
    if (justCalculated) { clearMemory(); }

    let toInsert = value;
    if (value === "+") toInsert = " + ";
    else if (value === "-") toInsert = " - ";
    else if (value === "×") toInsert = " * ";
    else if (value === "÷") toInsert = " / ";
    else if (value.includes("/")) toInsert = " " + value;
    
    exprInput.value += toInsert;
  });
});