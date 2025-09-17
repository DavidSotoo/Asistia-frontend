/* script.js
   Lógica de escaneo QR en tiempo real usando jsQR.
   Comentarios en español describiendo cada parte importante.
*/

(() => {
  // Elementos del DOM
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resultCard = document.getElementById('resultCard');
  const historyList = document.getElementById('historyList');
  const torchToggle = document.getElementById('torchToggle');

  let streamingStream = null;     // MediaStream actual
  let scanning = false;           // Flag principal de escaneo
  let rafId = null;               // requestAnimationFrame id
  const ctx = canvas.getContext('2d');

  // Previene re-escaneos rápidos: guardamos { id: timestamp }
  const recentlyScanned = new Map();
  const DUPLICATE_TIMEOUT_MS = 5000; // 5 segundos para permitir re-escaneo del mismo QR

  // Simula un "backend" con una tabla local (puedes ampliar)
  const fakeDatabase = {
    "ALU123": { nombre: "María", apellido: "García", estado: "Presente" },
    "ALU456": { nombre: "Carlos", apellido: "Pérez", estado: "Tarde" },
    "ALU789": { nombre: "Lucía", apellido: "Rodríguez", estado: "Presente" }
  };

  // Inicia la cámara y stream
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('getUserMedia no está soportado en este navegador.');
      return;
    }

    // Pedimos preferentemente la cámara trasera en móvil
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' } // 'user' para cámara frontal
      }
    };

    try {
      streamingStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = streamingStream;
      await video.play();
      scanning = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;

      // Ajusta canvas al tamaño del video real
      resizeCanvasToVideo();
      // Empieza el loop de escaneo
      tick();
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      alert('No se pudo acceder a la cámara. Revisa permisos o prueba otro navegador.');
    }
  }

  // Detiene el stream y el loop de escaneo
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
    // limpia canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Ajusta canvas al tamaño del video para una lectura realista
  function resizeCanvasToVideo() {
    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    // Si no hay dimensiones aún, espera
    if (!vw || !vh) return;
    canvas.width = vw;
    canvas.height = vh;
  }

  // Bucle de escaneo: dibuja frame en canvas y ejecuta jsQR sobre ImageData
  function tick() {
    if (!scanning) return;
    resizeCanvasToVideo();
    // Dibuja el frame actual en el canvas
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      // en algunos navegadores, drawImage puede lanzar hasta que el video tenga frames
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // jsQR espera Uint8ClampedArray con ancho y alto
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth" // intenta invertir colores si QR oscuro/claros
    });

    if (code) {
      handleDecoded(code.data);
      // Opcional: dibujar la caja del QR detectado (útil para debug)
      drawBoundingBox(code.location);
    }

    rafId = requestAnimationFrame(tick);
  }

  // Dibuja un rectángulo sobre el QR detectado para feedback visual (debug / UX)
  function drawBoundingBox(location) {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(14,165,164,0.9)";
    ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
    ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
    ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
    ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
    ctx.closePath();
    ctx.stroke();
  }

  // Lógica al decodificar un QR
  function handleDecoded(decodedText) {
    const now = Date.now();
    // Si fue escaneado recientemente, lo ignoramos
    const last = recentlyScanned.get(decodedText);
    if (last && (now - last < DUPLICATE_TIMEOUT_MS)) {
      console.log('Ignorado (duplicado rápido):', decodedText);
      return;
    }
    // Guardamos timestamp
    recentlyScanned.set(decodedText, now);
    // Limpieza de map para no crecer indefinidamente
    cleanupRecentlyScanned();

    // Log en consola (requisito)
    console.log('QR decodificado:', decodedText);

    // Simulamos llamada al backend con fetch (aquí se reemplaza con fakeFetch)
    simulateApiCall(decodedText)
      .then(response => {
        // Mostrar en UI
        showResult(decodedText, response);
        // Añadir al historial
        addToHistory(decodedText, response);
      })
      .catch(err => {
        console.error('Error en simulación API:', err);
        showResult(decodedText, { ok: false, mensaje: 'Error de red (simulado)' });
      });
  }

  // Limpia entradas antiguas de recentlyScanned cada cierto tiempo
  function cleanupRecentlyScanned() {
    const now = Date.now();
    for (const [key, ts] of recentlyScanned.entries()) {
      if (now - ts > DUPLICATE_TIMEOUT_MS * 6) { // p.ej. 30s
        recentlyScanned.delete(key);
      }
    }
  }

  // Simulación de llamada a API (usa fetch en una app real).
  // Aquí devolvemos un objeto parecido a una respuesta JSON real.
  function simulateApiCall(qrText) {
    return new Promise((resolve) => {
      // Simulamos latencia de red
      setTimeout(() => {
        // Buscamos en base de datos simulada
        const alumno = fakeDatabase[qrText];
        if (alumno) {
          resolve({ ok: true, alumno });
        } else {
          // Si no está, devolvemos una respuesta "no encontrado" con datos simulados
          resolve({
            ok: true,
            alumno: { nombre: "Desconocido", apellido: "", estado: "No registrado" },
            mensaje: 'ID no encontrado en la base local (simulado).'
          });
        }
      }, 700); // 700 ms latencia simulada
    });
  }

  // Muestra resultado en la tarjeta principal
  function showResult(qrText, response) {
    resultCard.classList.remove('empty');
    resultCard.innerHTML = ''; // limpiamos

    const title = document.createElement('div');
    title.className = 'result-name';
    const alumno = response.alumno || {};
    title.textContent = `${alumno.nombre || '—'} ${alumno.apellido || ''}`.trim();

    const idLine = document.createElement('div');
    idLine.style.fontSize = '0.9rem';
    idLine.style.color = 'var(--muted)';
    idLine.textContent = `ID escaneado: ${qrText}`;

    const state = document.createElement('div');
    state.className = 'result-state';
    state.textContent = alumno.estado || (response.mensaje || 'Sin estado');
    // tiny styling según estado
    if ((alumno.estado || '').toLowerCase().includes('pres')) {
      state.style.background = 'var(--success)';
      state.style.color = '#042017';
    } else {
      state.style.background = 'rgba(255,255,255,0.06)';
      state.style.color = 'var(--muted)';
    }

    // Mensaje adicional del backend (si existe)
    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.color = 'var(--muted)';
    note.style.fontSize = '0.85rem';
    if (response.mensaje) note.textContent = response.mensaje;

    resultCard.appendChild(title);
    resultCard.appendChild(idLine);
    resultCard.appendChild(state);
    if (response.mensaje) resultCard.appendChild(note);
  }

  // Añade el evento al historial visible
  function addToHistory(qrText, response) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    const alumno = response.alumno || {};
    li.textContent = `${time} — ${qrText} — ${alumno.nombre || 'Desconocido'} ${alumno.apellido || ''} — ${alumno.estado || ''}`;
    historyList.prepend(li);

    // Limita el historial a 30 entradas
    while (historyList.children.length > 30) {
      historyList.removeChild(historyList.lastChild);
    }
  }

  // Botones
  startBtn.addEventListener('click', startCamera);
  stopBtn.addEventListener('click', stopCamera);

  // Intento de usar linterna/torch si el dispositivo lo soporta
  torchToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    if (!streamingStream) {
      alert('Primero inicia la cámara para usar la linterna.');
      torchToggle.checked = false;
      return;
    }
    const videoTrack = streamingStream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();
    if (!capabilities.torch) {
      alert('Este dispositivo no soporta linterna/torch a través de la API.');
      torchToggle.checked = false;
      return;
    }
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: enabled }] });
    } catch (err) {
      console.warn('No fue posible cambiar la linterna:', err);
      alert('No se pudo activar la linterna en este dispositivo.');
      torchToggle.checked = false;
    }
  });

  // Si cerramos la pestaña o recargamos, detenemos la cámara
  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('unload', stopCamera);

  // Inicia automaticamente en dispositivos compatibles (opcional)
  // startCamera();

  // FIN del IIFE
})();
