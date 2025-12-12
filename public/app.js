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