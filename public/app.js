// ================================
// ELEMENTOS DA INTERFACE
// ================================
const exprInput = document.getElementById("expression");
const calcBtn = document.getElementById("calcBtn");
const voiceBtn = document.getElementById("voiceBtn");
const currentResultEl = document.getElementById("current-result");
const clearMemoryBtn = document.getElementById("clearMemoryBtn");

const keypadPanel = document.querySelector(".keypad-panel");
const toggleKeypadBtn = document.getElementById("toggleKeypadBtn");
const keypadButtons = document.querySelectorAll(".keypad-btn");
const aiBtn = document.getElementById("aiBtn");

let justCalculated = false; // true se o último passo foi um cálculo

// ================================
// RESULTADO / MEMÓRIA
// ================================
function showResult(text) {
  currentResultEl.textContent = text;
}

function clearMemory() {
  exprInput.value = "";
  justCalculated = false;
}

if (clearMemoryBtn) {
  clearMemoryBtn.addEventListener("click", () => {
    clearMemory();
    showResult("0");
  });
}

// limpa memória quando o usuário começa uma nova digitação após cálculo
exprInput.addEventListener("keydown", (e) => {
  if (justCalculated) {
    clearMemory();
  }

  if (e.key === "Enter") {
    e.preventDefault();
    handleExpression(exprInput.value);
  }
});

// ================================
// DETECÇÃO DE EXPRESSÃO EM POLEGADAS
// ================================
function isInchesExpression(expr) {
  const t = (expr || "").toLowerCase();

  // Tem símbolo de pés? Então é inches.
  if (t.includes("′") || t.includes("'")) return true;

  // Tem fração do tipo 1/8, 3/4 etc? (isso é seguro tanto pra inches quanto pra normal)
  const hasFraction = /\d+\s*\/\s*\d+/.test(t);
  if (hasFraction) return true;

  // Se NÃO tem feet nem fração, não vamos tratar como inches.
  return false;
}

// A expressão em polegadas precisa estar no formato: A op B
// Ex.: 96 1/8 + 3 3/8   ou   5′ 2 1/2 - 1 3/8   ou   8 1/8 * 3
// Nesta fase: aceitamos +, -, * e /
function splitInchExpression(expr) {
  // pega o PRIMEIRO +, -, * ou /
  const match = expr.match(/^(.+?)[ ]*([+\-*\/])[ ]*(.+)$/);
  if (!match) {
    console.warn("splitInchExpression: não consegui dividir", expr);
    return null;
  }

  const a = match[1].trim();
  const op = match[2];
  const b = match[3].trim();

  console.log("splitInchExpression ->", { a, op, b });
  return { a, op, b };
}

// ================================
// CHAMADAS DE API (NORMAL + INCHES)
// ================================
async function handleExpression(raw) {
  const expr = (raw || "").trim();

  if (!expr) {
    showResult("—");
    return;
  }

  let mode;
  let endpoint;
  let body;
  let inchParts = null;

  if (isInchesExpression(expr)) {
    mode = "inches";
    inchParts = splitInchExpression(expr);

    if (!inchParts) {
      showResult("Formato inválido de polegadas");
      return;
    }

    endpoint = "http://localhost:3001/inches";
    body = JSON.stringify({
      a: inchParts.a,
      b: inchParts.b,
      op: inchParts.op,
    });
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
      console.warn("Resposta de erro da API:", data);
      showResult("Erro");
      return;
    }

    let displayResult;

    if (mode === "inches") {
      // backend já devolve string pronta (sem decimal)
      displayResult = data.result;
    } else {
      displayResult = data.result;
    }

    showResult(displayResult);
    justCalculated = true;
  } catch (err) {
    console.error(err);
    showResult("Erro de conexão");
  }
}

// botão Calcular grande
calcBtn.addEventListener("click", () => {
  handleExpression(exprInput.value);
});

// ================================
// IA: interpretar texto da memória
// ================================
async function interpretWithAI() {
  const text = (exprInput.value || "").trim();
  if (!text) {
    showResult("Digite algo para a IA interpretar");
    return;
  }

  try {
    const response = await fetch("http://localhost:3001/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn("Erro da rota /interpret:", data);
      showResult("Erro IA");
      return;
    }

    console.log("IA interpretou:", data);

    if (data.mode === "normal" && data.expression) {
      exprInput.value = data.expression;
      handleExpression(data.expression);
    } else if (data.mode === "inches" && data.a && data.b && data.op) {
      exprInput.value = `${data.a} ${data.op} ${data.b}`;
      handleExpression(exprInput.value);
    } else {
      showResult("Resposta IA incompleta");
    }
  } catch (err) {
    console.error(err);
    showResult("Erro de conexão IA");
  }
}

if (aiBtn) {
  aiBtn.addEventListener("click", interpretWithAI);
}

// ================================
// TECLADO RÁPIDO
// ================================
if (toggleKeypadBtn && keypadPanel) {
  toggleKeypadBtn.addEventListener("click", () => {
    keypadPanel.classList.toggle("open");
  });
}

keypadButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = btn.textContent.trim();

    // limpar campo
    if (btn.classList.contains("keypad-clear")) {
      clearMemory();
      exprInput.focus();
      return;
    }

    // botão "=" → calcula
    if (btn.classList.contains("keypad-equal")) {
      handleExpression(exprInput.value);
      return;
    }

    // se acabou de calcular e o usuário começa nova entrada → limpa
    if (justCalculated) {
      clearMemory();
    }

    let toInsert = value;

    // operadores: adicionar espaços ao redor
    if (value === "+") {
      toInsert = " + ";
    } else if (value === "-") {
      toInsert = " - ";
    } else if (value === "×") {
      // por enquanto, trata × como multiplicação normal (modo NORMAL, não inches)
      toInsert = " * ";
    } else if (value === "÷") {
      // por enquanto, trata ÷ como divisão normal (modo NORMAL, não inches)
      toInsert = " / ";
    }
    // frações típicas de polegada (botões de baixo)
    else if (
      value === '1/8"' ||
      value === '1/4"' ||
      value === '3/8"' ||
      value === '1/2"' ||
      value === '5/8"' ||
      value === '3/4"' ||
      value === '7/8"'
    ) {
      // espaço antes da fração; aspas são ignoradas no backend
      toInsert = " " + value;
    }
    // símbolo de pés: gruda no número anterior
    else if (value === "′" || value === "'") {
      toInsert = value;
    }

    exprInput.value += toInsert;
    exprInput.focus();
  });
});

// ===========================================
//     VOZ + IA  (usa /interpret no backend)
// ===========================================
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

function setupVoiceButton() {
  if (!voiceBtn) return; // se o botão não existir, não faz nada

  if (!SpeechRecognition) {
    // Navegador não suporta voz
    voiceBtn.disabled = true;
    voiceBtn.title = "Reconhecimento de voz não é suportado neste navegador.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR"; // pode trocar pra en-US se quiser
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", async (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("Transcrito:", transcript);

    // mostra o que foi entendido no campo de memória
    exprInput.value = transcript;

    try {
      showResult("Processando comando de voz...");

      // 1) manda texto pra IA interpretar
      const aiResp = await fetch("http://localhost:3001/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript }),
      });

      const data = await aiResp.json();
      console.log("Resposta /interpret:", data);

      if (!aiResp.ok) {
        throw new Error(data.error || "Erro ao interpretar comando.");
      }

      // 2) se for cálculo normal
      if (data.mode === "normal") {
        if (!data.expression) {
          throw new Error("IA não retornou expressão normal.");
        }

        const resp = await fetch("http://localhost:3001/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expression: data.expression }),
        });

        const calc = await resp.json();
        if (!resp.ok) {
          throw new Error(calc.error || "Erro na conta normal.");
        }

        const expr = data.expression;
        exprInput.value = expr;
        showResult(calc.result);
        justCalculated = true;
      }

      // 3) se for cálculo de polegadas
      else if (data.mode === "inches") {
        if (!data.a || !data.b || !data.op) {
          throw new Error("IA não retornou dados completos de polegadas.");
        }

        const resp = await fetch("http://localhost:3001/inches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            a: data.a,
            b: data.b,
            op: data.op,
          }),
        });

        const calc = await resp.json();
        if (!resp.ok) {
          throw new Error(calc.error || "Erro na conta de polegadas.");
        }

        const expr = `${data.a} ${data.op} ${data.b}`;
        exprInput.value = expr;
        showResult(calc.result);
        justCalculated = true;
      }

      // 4) fallback se vier algo estranho
      else {
        throw new Error("Modo desconhecido retornado pela IA.");
      }
    } catch (err) {
      console.error(err);
      showResult("Erro");
    }
  });

  recognition.addEventListener("error", (e) => {
    console.error("Erro no reconhecimento de voz:", e);
    showResult("Erro no reconhecimento de voz.");
  });

  voiceBtn.addEventListener("click", () => {
    try {
      showResult("Ouvindo...");
      recognition.start();
    } catch (e) {
      console.error(e);
    }
  });
}

// inicializa voz
setupVoiceButton();
