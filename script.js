/* script.js
   Lógica de escaneo QR en tiempo real usando jsQR.
   Versión mejorada con fetch real, feedback visual y beep.
*/

(() => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resultCard = document.getElementById('resultCard');
  const historyList = document.getElementById('historyList');
  const torchToggle = document.getElementById('torchToggle');

  let streamingStream = null;
  let scanning = false;
  let rafId = null;
  const ctx = canvas.getContext('2d');

  // Para evitar duplicados en toda la sesión
  const alreadyScanned = new Set();

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('getUserMedia no está soportado en este navegador.');
      return;
    }

    const constraints = {
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    };

    try {
      streamingStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = streamingStream;
      await video.play();
      scanning = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;

      resizeCanvasToVideo();
      tick();
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      alert('No se pudo acceder a la cámara. Revisa permisos o prueba otro navegador.');
    }
  }

  function stopCamera() {
    scanning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (streamingStream) {
      streamingStream.getTracks().forEach(t => t.stop());
      streamingStream = null;
    }
    video.pause();
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function resizeCanvasToVideo() {
    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    if (!vw || !vh) return;
    canvas.width = vw;
    canvas.height = vh;
  }

  function tick() {
    if (!scanning) return;
    resizeCanvasToVideo();
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (err) {}

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });

    if (code) {
      handleDecoded(code.data, code.location);
    }

    rafId = requestAnimationFrame(tick);
  }

  function drawBoundingBox(location, success = true) {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = success ? "rgba(16,185,129,0.9)" : "rgba(220,38,38,0.9)"; // verde o rojo
    ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
    ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
    ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
    ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
    ctx.closePath();
    ctx.stroke();
  }

  function beep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.start();
      setTimeout(() => osc.stop(), 150);
    } catch (e) {
      console.warn("Beep no soportado:", e);
    }
  }

  function handleDecoded(decodedText, location) {
    if (alreadyScanned.has(decodedText)) {
      console.log("Ignorado (ya registrado en la sesión):", decodedText);
      return;
    }
    alreadyScanned.add(decodedText);

    console.log("QR decodificado:", decodedText);

    // Llamada real al backend
    fetchAlumno(decodedText)
      .then(response => {
        const alumno = response.alumno || {};
        const valido = alumno.estado && alumno.estado.toLowerCase().includes("pres");
        drawBoundingBox(location, valido);
        showResult(decodedText, response, valido);
        addToHistory(decodedText, response);
        beep();
      })
      .catch(err => {
        console.error("Error en API:", err);
        drawBoundingBox(location, false);
        showResult(decodedText, { ok: false, alumno: { nombre: "Error", estado: "Sin registrar" } }, false);
      });
  }

  // 🚀 Aquí adaptas la URL a tu backend real
  async function fetchAlumno(qrText) {
    const response = await fetch("/api/asistencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: qrText })
    });
    return response.json();
  }

  function showResult(qrText, response, valido) {
    resultCard.classList.remove("empty");
    resultCard.innerHTML = "";

    const alumno = response.alumno || {};
    const title = document.createElement("div");
    title.className = "result-name";
    title.textContent = `${alumno.nombre || "—"} ${alumno.apellido || ""}`.trim();

    const idLine = document.createElement("div");
    idLine.style.fontSize = "0.9rem";
    idLine.style.color = "var(--muted)";
    idLine.textContent = `ID escaneado: ${qrText}`;

    const state = document.createElement("div");
    state.className = "result-state";
    state.textContent = alumno.estado || "No registrado";
    state.style.background = valido ? "var(--success)" : "crimson";
    state.style.color = "#fff";

    resultCard.appendChild(title);
    resultCard.appendChild(idLine);
    resultCard.appendChild(state);
  }

  function addToHistory(qrText, response) {
    const li = document.createElement("li");
    const time = new Date().toLocaleTimeString();
    const alumno = response.alumno || {};
    li.textContent = `${time} — ${qrText} — ${alumno.nombre || "Desconocido"} ${alumno.apellido || ""} — ${alumno.estado || ""}`;
    historyList.prepend(li);

    while (historyList.children.length > 30) {
      historyList.removeChild(historyList.lastChild);
    }
  }

  startBtn.addEventListener("click", startCamera);
  stopBtn.addEventListener("click", stopCamera);

  torchToggle.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    if (!streamingStream) {
      alert("Primero inicia la cámara para usar la linterna.");
      torchToggle.checked = false;
      return;
    }
    const videoTrack = streamingStream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();
    if (!capabilities.torch) {
      alert("Este dispositivo no soporta linterna/torch.");
      torchToggle.checked = false;
      return;
    }
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: enabled }] });
    } catch (err) {
      console.warn("No fue posible activar la linterna:", err);
      torchToggle.checked = false;
    }
  });

  window.addEventListener("pagehide", stopCamera);
  window.addEventListener("unload", stopCamera);
})();
