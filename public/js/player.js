const API_URL = window.location.origin + '/api';

let gameState = {
    status: 'OPEN', players: [], boxes: {}, extraBoxes: {},
    jackpot: 0, selectedBox: null, currentPlayer: null,
    resultShown: false, waitingForNewRound: false,
    config: { entryPrice:500, extraPrice:1000, minPlayers:2, maxPlayers:10,
              totalBoxes:20, countdownTime:3, alias:'caja.misteriosa.mp' }
};
let lastJackpot = 0;

// ── Persistencia de sesión en localStorage ────────────────────────────
const SESSION_KEY = 'mistery_box_session';

function saveSession() {
    if (gameState.currentPlayer || gameState.selectedBox) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            currentPlayer: gameState.currentPlayer,
            selectedBox:   gameState.selectedBox
        }));
    }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.currentPlayer) gameState.currentPlayer = s.currentPlayer;
        if (s.selectedBox)   gameState.selectedBox   = s.selectedBox;
    } catch(e) {}
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ── Paleta de colores para las cajas (como en la referencia) ──────────
const BOX_PALETTES = [
    { body:'#7c3aed', side:'#5b21b6', top:'#8b5cf6', ribbon:'#ffd700', bow:'#ff8c00' }, // violeta
    { body:'#dc2626', side:'#991b1b', top:'#ef4444', ribbon:'#ffd700', bow:'#ff8c00' }, // rojo
    { body:'#059669', side:'#065f46', top:'#10b981', ribbon:'#ffd700', bow:'#ff8c00' }, // verde
    { body:'#db2777', side:'#9d174d', top:'#ec4899', ribbon:'#ffd700', bow:'#ff8c00' }, // rosa
    { body:'#1d4ed8', side:'#1e3a8a', top:'#3b82f6', ribbon:'#ffd700', bow:'#ff8c00' }, // azul
    { body:'#1f2937', side:'#111827', top:'#374151', ribbon:'#ffd700', bow:'#ff8c00' }, // negro
    { body:'#b45309', side:'#78350f', top:'#d97706', ribbon:'#ffd700', bow:'#ff8c00' }, // naranja
    { body:'#0f766e', side:'#134e4a', top:'#14b8a6', ribbon:'#ffd700', bow:'#ff8c00' }, // teal
    { body:'#6d28d9', side:'#4c1d95', top:'#7c3aed', ribbon:'#ff6b35', bow:'#ff8c00' }, // púrpura
    { body:'#be185d', side:'#831843', top:'#db2777', ribbon:'#ffd700', bow:'#ff8c00' }, // magenta
];

// ── SVG isométrico de caja regalo ─────────────────────────────────────
// Genera una caja 3D isométrica como imagen SVG inline
function buildGiftBoxSVG(pal, state, boxNum) {
    // Dimensiones de la caja isométrica
    // Cara frontal, cara lateral, tapa
    const W = 100, H = 120;

    // Colores según estado
    let bodyC = pal.body, sideC = pal.side, topC = pal.top;
    let ribbonC = pal.ribbon, bowC = pal.bow;
    let opacity = 1;
    let lockIcon = '';

    if (state === 'taken') {
        bodyC = '#2d3748'; sideC = '#1a202c'; topC = '#4a5568';
        ribbonC = '#718096'; bowC = '#718096';
        opacity = 0.6;
        lockIcon = `<text x="50" y="75" text-anchor="middle" font-size="22" opacity="0.7">🔒</text>`;
    } else if (state === 'selected') {
        bodyC = '#065f46'; sideC = '#047857'; topC = '#10b981';
        ribbonC = '#a7f3d0'; bowC = '#34d399';
    } else if (state === 'pending') {
        bodyC = '#92400e'; sideC = '#78350f'; topC = '#d97706';
        ribbonC = '#fcd34d'; bowC = '#f59e0b';
    } else if (state === 'extra') {
        bodyC = '#831843'; sideC = '#9d174d'; topC = '#db2777';
        ribbonC = '#fce7f3'; bowC = '#f472b6';
    } else if (state === 'winner') {
        bodyC = '#92400e'; sideC = '#78350f'; topC = '#fbbf24';
        ribbonC = '#fff'; bowC = '#ffd700';
    }

    // Isometric box geometry
    // Cara frontal: paralelogramo izquierdo
    // Cara lateral: paralelogramo derecho
    // Tapa: rombo superior

    // uid evita que el browser reutilice gradientes de otras cajas
    const uid = `b${boxNum}-${state}`;
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="100" height="110">
  <defs>
    <filter id="shadow-${uid}" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="rgba(0,0,0,0.55)"/>
    </filter>
    <linearGradient id="bodyGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${lighten(bodyC,20)}"/>
      <stop offset="100%" stop-color="${bodyC}"/>
    </linearGradient>
    <linearGradient id="sideGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${sideC}"/>
      <stop offset="100%" stop-color="${darken(sideC,20)}"/>
    </linearGradient>
    <linearGradient id="topGrad-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${lighten(topC,30)}"/>
      <stop offset="100%" stop-color="${topC}"/>
    </linearGradient>
    <linearGradient id="bowGrad-${uid}" cx="30%" cy="30%" r="70%" fx="30%" fy="30%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${lighten(bowC,30)}"/>
      <stop offset="100%" stop-color="${bowC}"/>
    </linearGradient>
  </defs>
  <g opacity="${opacity}" filter="url(#shadow-${uid})">

    <!-- CARA FRONTAL (izquierda) -->
    <polygon points="15,52 50,70 50,100 15,82" fill="url(#bodyGrad-${uid})"/>
    <!-- Borde frontal -->
    <polygon points="15,52 50,70 50,100 15,82" fill="none" stroke="${lighten(bodyC,15)}" stroke-width="0.5" opacity="0.5"/>
    <!-- Ribete lazo frontal -->
    <polygon points="30,61 35,63.5 35,91 30,88.5" fill="${ribbonC}" opacity="0.85"/>

    <!-- CARA LATERAL (derecha) -->
    <polygon points="50,70 85,52 85,82 50,100" fill="url(#sideGrad-${uid})"/>
    <polygon points="50,70 85,52 85,82 50,100" fill="none" stroke="${darken(sideC,10)}" stroke-width="0.5" opacity="0.4"/>
    <!-- Ribete lazo lateral -->
    <polygon points="65,61 70,58.5 70,88.5 65,91" fill="${ribbonC}" opacity="0.75"/>

    <!-- TAPA -->
    <polygon points="15,52 50,34 85,52 50,70" fill="url(#topGrad-${uid})"/>
    <polygon points="15,52 50,34 85,52 50,70" fill="none" stroke="${lighten(topC,20)}" stroke-width="0.5" opacity="0.5"/>
    <!-- Lazo horizontal en tapa -->
    <polygon points="15,52 50,34 85,52 50,70" 
             fill="${ribbonC}" opacity="0.22" clip-path="none"/>
    <!-- Línea lazo en tapa (franja) -->
    <line x1="50" y1="34" x2="50" y2="70" stroke="${ribbonC}" stroke-width="3.5" opacity="0.8"/>
    <line x1="15" y1="52" x2="85" y2="52" stroke="${ribbonC}" stroke-width="3.5" opacity="0.8"/>

    <!-- Brillo tapa -->
    <polygon points="15,52 50,34 67,43 32,61" fill="rgba(255,255,255,0.08)"/>

    <!-- MOÑO -->
    <!-- Lazo izquierdo -->
    <ellipse cx="43" cy="28" rx="8" ry="5.5" fill="url(#bowGrad-${uid})"
             transform="rotate(-30 43 28)" opacity="0.95"/>
    <!-- Lazo derecho -->
    <ellipse cx="57" cy="28" rx="8" ry="5.5" fill="url(#bowGrad-${uid})"
             transform="rotate(30 57 28)" opacity="0.95"/>
    <!-- Nudo central -->
    <circle cx="50" cy="30" r="5" fill="${lighten(bowC,25)}"/>
    <circle cx="50" cy="30" r="2.5" fill="${lighten(bowC,40)}"/>

    <!-- Brillo frontal (reflejo de luz) -->
    <polygon points="17,54 30,47 30,60 17,67" fill="rgba(255,255,255,0.07)"/>

    ${lockIcon}
  </g>
</svg>`;
    return svg;
}

// Helpers de color
function lighten(hex, amount) {
    try {
        const n = parseInt(hex.replace('#',''), 16);
        let r = Math.min(255, ((n>>16)&0xff) + amount);
        let g = Math.min(255, ((n>>8)&0xff) + amount);
        let b = Math.min(255, (n&0xff) + amount);
        return `rgb(${r},${g},${b})`;
    } catch { return hex; }
}
function darken(hex, amount) {
    try {
        const n = parseInt(hex.replace('#',''), 16);
        let r = Math.max(0, ((n>>16)&0xff) - amount);
        let g = Math.max(0, ((n>>8)&0xff) - amount);
        let b = Math.max(0, (n&0xff) - amount);
        return `rgb(${r},${g},${b})`;
    } catch { return hex; }
}

// ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadSession(); // restaurar sesión tras refresh
    init();
    startPolling();
    const vs = new EventSource('/api/viewers/connect');
    vs.onmessage = (e) => {
        const { viewers } = JSON.parse(e.data);
        const el = document.getElementById('publicViewerCount');
        if (el) el.textContent = viewers;
    };
    vs.onerror = () => {};
});

function init() {
    renderBoxes();
    updateDisplay();
    restoreSessionUI();
}

function restoreSessionUI() {
    const cp = gameState.currentPlayer;
    if (!cp) return;

    // Tiene caja extra aprobada y seleccionada → ocultar extraBtn
    if (cp.hasExtra && cp.extraBox) {
        document.getElementById('extraBtn').classList.add('hidden');
    }
    // Tiene pago aprobado, tiene box confirmada → mostrar extraBtn si no tiene extra aún
    else if (cp.approved && cp.box && !cp.hasExtra) {
        document.getElementById('extraBtn').classList.remove('hidden');
    }
    // Tiene pago aprobado, aún NO tiene box confirmada → mostrar confirmBtn
    else if (cp.approved && !cp.box && gameState.selectedBox) {
        document.getElementById('confirmBtn').classList.remove('hidden');
    }
    // Tiene extra aprobado pero sin caja extra elegida → ocultar extraBtn, esperar que toque caja
    if (cp.hasExtra && !cp.extraBox) {
        document.getElementById('extraBtn').classList.add('hidden');
        showNotification('¡Caja extra aprobada! Tocá una caja libre para elegirla ⭐', 'info');
    }
}

function startPolling() {
    setInterval(fetchGameState, 1000);
    fetchGameState();
}

async function fetchGameState() {
    try {
        const data = await fetch(`${API_URL}/state`).then(r => r.json());
        const prevStatus = gameState.status;

        gameState.status     = data.status;
        gameState.players    = data.players;
        gameState.boxes      = data.boxes;
        gameState.extraBoxes = data.extraBoxes;
        gameState.jackpot    = data.jackpot;
        gameState.config     = { ...gameState.config, ...data.config };

        if (data.jackpot > lastJackpot && lastJackpot > 0) spawnCoinRain();
        lastJackpot = data.jackpot;

        // Actualizar últimos ganadores
        if (data.winnersHistory) renderUltimosGanadores(data.winnersHistory);

        // Cartel flotante cerrado
        const overlay = document.getElementById('closedOverlay');
        const msgEl   = document.getElementById('closedMsg');
        if (overlay) {
            if (data.inSchedule === false) {
                if (msgEl && data.config.closedMessage) msgEl.textContent = data.config.closedMessage;
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
        // Barra vieja (por compatibilidad)
        const oldBar = document.getElementById('scheduleClosed');
        if (oldBar) oldBar.classList.toggle('hidden', data.inSchedule !== false);
        if (data.countdownEnd && gameState.status === 'COUNTDOWN') updateTimer(data.countdownEnd);
        else hideDramaticCountdown();
        checkPlayersNeeded();

        updateDisplay();
        renderBoxes();
        updateStatus(gameState.status);

        if (gameState.status === 'FINISHED' && !gameState.resultShown) {
            gameState.resultShown = true;
            gameState.waitingForNewRound = true;
            showResult(data.winner, data.winningBox, data.prize, data.jackpot);
        }
        if (prevStatus === 'FINISHED' && gameState.status === 'OPEN') {
            gameState.resultShown = false; gameState.waitingForNewRound = false;
            gameState.currentPlayer = null; gameState.selectedBox = null;
            clearSession(); // nueva ronda, limpiar sesión guardada
            ['confirmBtn','extraBtn','playAgainBtn'].forEach(id => document.getElementById(id).classList.add('hidden'));
            document.getElementById('resultScreen').classList.remove('active');
        }
        if (gameState.currentPlayer) {
            const up = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (up) {
                const wasApproved = gameState.currentPlayer.approved;
                gameState.currentPlayer = up; // siempre sincronizar con server

                // Siempre restaurar selectedBox desde el server si el local se perdió
                if (!gameState.selectedBox && up.selectedBox) {
                    gameState.selectedBox = up.selectedBox;
                }
                saveSession();

                // Notificar solo la primera vez que se aprueba
                if (!wasApproved && up.approved) {
                    playSound('approved');
                    hideWaitingApprovalBanner();
                    showNotification('¡Pago aprobado! Tocá la caja para confirmarla ✓','success');
                }

                // Mostrar confirmBtn si: aprobado, sin box confirmada aún, y hay caja seleccionada
                const confirmBtn = document.getElementById('confirmBtn');
                if (up.approved && !up.box && gameState.selectedBox) {
                    confirmBtn.classList.remove('hidden');
                } else if (up.box) {
                    confirmBtn.classList.add('hidden');
                }
            }
        }
        if (gameState.currentPlayer?.approved && gameState.currentPlayer?.box) {
            const up = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (up?.hasExtra && !gameState.currentPlayer.hasExtra) {
                gameState.currentPlayer = up;
                showNotification('¡Caja extra aprobada! Tocá una caja libre ⭐','success');
                document.getElementById('extraBtn').classList.add('hidden');
            }
        }
    } catch (e) { console.error(e); }
}

// ── Coin Rain ─────────────────────────────────────────────────────────
function spawnCoinRain() {
    const container = document.getElementById('coinRainContainer');
    if (!container) return;
    for (let i = 0; i < 28; i++) {
        setTimeout(() => {
            const c = document.createElement('div');
            c.className = 'coin-drop';
            c.style.left = (20 + Math.random() * 60) + '%';
            c.style.top = '-30px';
            const dur = (1.3 + Math.random() * 1).toFixed(2);
            c.style.animationDuration = dur + 's';
            const sz = 18 + Math.round(Math.random() * 12);
            c.style.width = sz + 'px'; c.style.height = sz + 'px';
            c.style.fontSize = Math.round(sz * 0.42) + 'px';
            container.appendChild(c);
            setTimeout(() => c.remove(), parseFloat(dur)*1000 + 300);
        }, i * 55);
    }
}

// ── Render cajas ──────────────────────────────────────────────────────
function renderBoxes() {
    const grid = document.getElementById('boxesGrid');
    const total = gameState.config.totalBoxes;
    const existing = grid.children;

    // Crear cajas si no existen aún
    if (existing.length !== total) {
        grid.innerHTML = '';
        for (let i = 1; i <= total; i++) {
            const wrap = document.createElement('div');
            wrap.className = 'box-card';
            wrap.dataset.number = i;
            wrap.innerHTML = `
                <div class="box-art" id="box-art-${i}"></div>
                <div class="box-num-tag">${String(i).padStart(2,'0')}</div>
                <div class="box-player-tag hidden" id="box-ptag-${i}"></div>
            `;
            wrap.onclick = () => selectBox(i);
            grid.appendChild(wrap);
        }
    }

    // Centrar última fila si quedan cajas impares
    // Detectar columnas según ancho
    const cols = window.innerWidth <= 400 ? 3 : 4;
    const remainder = total % cols;
    if (remainder !== 0) {
        // Agregar spacers invisibles para centrar la última fila
        grid.querySelectorAll('.box-spacer').forEach(s => s.remove());
        const spacersNeeded = cols - remainder;
        for (let s = 0; s < spacersNeeded; s++) {
            const spacer = document.createElement('div');
            spacer.className = 'box-spacer';
            spacer.style.cssText = 'visibility:hidden;pointer-events:none;';
            grid.appendChild(spacer);
        }
    } else {
        grid.querySelectorAll('.box-spacer').forEach(s => s.remove());
    }

    // Actualizar estado de cada caja
    for (let i = 1; i <= total; i++) {
        const wrap = document.querySelector(`.box-card[data-number="${i}"]`);
        if (!wrap) continue;
        const art  = document.getElementById(`box-art-${i}`);
        const ptag = document.getElementById(`box-ptag-${i}`);
        const pal  = BOX_PALETTES[(i-1) % BOX_PALETTES.length];

        // Determinar estado
        let state = 'idle';
        let playerName = '';

        if (gameState.boxes[i]) {
            state = 'taken';
            const p = gameState.players.find(p => p.id === gameState.boxes[i]);
            playerName = p ? p.name : '';
        } else if (gameState.extraBoxes[i]) {
            state = 'taken';
            const p = gameState.players.find(p => p.id === gameState.extraBoxes[i]);
            playerName = p ? p.name + ' ⭐' : '';
        } else if (gameState.currentPlayer?.selectedBox === i && !gameState.currentPlayer?.approved) {
            state = 'pending';
            playerName = '⏳ ' + (gameState.currentPlayer?.name || '');
        } else if (gameState.currentPlayer?.box === i) {
            state = 'selected';
        } else if (gameState.currentPlayer?.extraBox === i) {
            state = 'extra';
        }

        if (gameState.winningBox === i) {
            state = gameState.winner ? 'winner' : 'taken';
        }

        // Clases del wrapper
        wrap.className = 'box-card';
        if (state === 'taken')    wrap.classList.add('state-taken');
        if (state === 'selected') wrap.classList.add('state-selected');
        if (state === 'pending')  wrap.classList.add('state-pending');
        if (state === 'extra')    wrap.classList.add('state-extra');
        if (state === 'winner')   wrap.classList.add('state-winner');
        if (state === 'idle')     wrap.classList.add('state-idle');

        // SVG
        art.innerHTML = buildGiftBoxSVG(pal, state, i);

        // Tag del jugador
        if (playerName) {
            ptag.textContent = playerName;
            ptag.classList.remove('hidden');
        } else {
            ptag.classList.add('hidden');
        }
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function updateDisplay() {
    setText('jackpotAmount',     gameState.jackpot.toLocaleString());
    setText('playerCount',       gameState.players.length);
    setText('maxPlayersDisplay', gameState.config.maxPlayers);
    setText('entryPriceDisplay', gameState.config.entryPrice);
    setText('extraPrice',        gameState.config.extraPrice);
    setText('countdownRule',     gameState.config.countdownTime);

    const list = document.getElementById('playersList');
    if (!gameState.players.length) {
        list.innerHTML = '<p style="opacity:0.5;width:100%;text-align:center;font-size:0.9em;">No hay jugadores todavía...</p>';
    } else {
        list.innerHTML = gameState.players.map(p => {
            let cls = p.box ? 'ready' : '';
            if (gameState.currentPlayer?.id === p.id) cls += ' mine';
            return `<div class="player-chip ${cls}">${p.name}${p.box?' ✓':''}${p.extraBox?' ⭐':''}${!p.approved&&p.selectedBox?' ⏳':''}</div>`;
        }).join('');
    }
}

function updateTimer(countdownEnd) {
    const s = Math.ceil(Math.max(0, countdownEnd - Date.now()) / 1000);
    // Mostrar overlay dramático
    showDramaticCountdown(s);
    document.getElementById('timerDisplay').textContent = `00:0${s}`;
}

function updateStatus(status) {
    const ind = document.getElementById('statusIndicator');
    const txt = document.getElementById('statusText');
    ind.className = 'status-indicator status-' + status.toLowerCase();
    txt.textContent = {OPEN:'ESPERANDO JUGADORES',COUNTDOWN:'CERRANDO EN...',CLOSED:'SALA CERRADA',FINISHED:'RONDA FINALIZADA'}[status]||status;
}

function selectBox(n) {
    if (gameState.status === 'FINISHED') { showNotification('La ronda terminó. Esperá la próxima...','warning'); return; }
    if (gameState.status !== 'OPEN')     { showNotification('La sala está cerrada','error'); return; }
    if (gameState.boxes[n]||gameState.extraBoxes[n]) { showNotification('Esa caja ya fue elegida','error'); return; }
    const pending = gameState.players.find(p => p.selectedBox===n && !p.approved);
    if (pending && pending.id !== gameState.currentPlayer?.id) { showNotification('Esa caja está pendiente','warning'); return; }
    if (!gameState.currentPlayer) { gameState.selectedBox=n; openPaymentModal(); return; }
    if (!gameState.currentPlayer.approved) { showNotification('Esperando confirmación de pago...','warning'); return; }
    if (!gameState.currentPlayer.box) {
        gameState.selectedBox = n;
        saveSession();
        renderBoxes();
        document.getElementById('confirmBtn').classList.remove('hidden');
        showNotification(`Caja ${String(n).padStart(2,'0')} seleccionada. Ahora confirmá tu elección ✓`, 'success');
        return;
    }
    if (gameState.currentPlayer.hasExtra && !gameState.currentPlayer.extraBox) { submitExtraBoxSelection(n); return; }
}

function openPaymentModal() {
    document.getElementById('paymentModal').classList.add('active');
    document.getElementById('selectedBoxNumber').textContent = gameState.selectedBox;
    document.getElementById('modalEntryPrice').textContent   = gameState.config.entryPrice;
    document.getElementById('modalAlias').textContent        = gameState.config.alias;
    // También actualizar el extra modal por si ya estaba abierto
    const ePrice = document.getElementById('extraModalPrice');
    const eAlias = document.getElementById('extraModalAlias');
    if (ePrice) ePrice.textContent = gameState.config.extraPrice;
    if (eAlias) eAlias.textContent = gameState.config.alias;
}
function closePaymentModal() { document.getElementById('paymentModal').classList.remove('active'); }
function copyAlias() { navigator.clipboard.writeText(gameState.config.alias).then(()=>showNotification('Alias copiado ✓','success')); }

async function submitTransfer() {
    const name = document.getElementById('playerName').value.trim();
    const opId = document.getElementById('operationId').value.trim();
    if (!name)           { showNotification('Ingresá tu nombre','error'); return; }
    if (opId.length < 4) { showNotification('Ingresá el número de operación','error'); return; }
    try {
        const r = await fetch(`${API_URL}/request-entry`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,operationId:opId,boxNumber:gameState.selectedBox})});
        if (r.ok) {
            const d = await r.json(); gameState.currentPlayer = d.player;
            saveSession();
            closePaymentModal();
            showNotification('Solicitud enviada. Esperando aprobación...','info');
            renderBoxes();
            showWaitingApprovalBanner();
        } else { const e=await r.json(); showNotification(e.error||'Error','error'); }
    } catch { showNotification('Error de conexión','error'); }
}

async function confirmSelection() {
    const boxToConfirm = gameState.selectedBox || gameState.currentPlayer?.selectedBox;
    if (!gameState.currentPlayer) { showNotification('Sesión perdida, recargá la página','error'); return; }
    if (!gameState.currentPlayer.approved) { showNotification('Tu pago aún no fue aprobado','warning'); return; }
    if (!boxToConfirm) { showNotification('Primero tocá una caja para seleccionarla','warning'); return; }
    gameState.selectedBox = boxToConfirm;
    try {
        const r = await fetch(`${API_URL}/confirm-box`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:gameState.currentPlayer.id,boxNumber:boxToConfirm})});
        if (r.ok) {
            gameState.currentPlayer.box = boxToConfirm;
            saveSession(); // guardar que ya tiene box confirmada
            document.getElementById('confirmBtn').classList.add('hidden');
            document.getElementById('extraBtn').classList.remove('hidden');
            showNotification('¡Caja confirmada! ✓','success');
            await fetchGameState();
        } else {
            const e = await r.json();
            showNotification(e.error || 'Error al confirmar','error');
        }
    } catch { showNotification('Error de conexión','error'); }
}

async function submitExtraBoxSelection(n) {
    try {
        const r = await fetch(`${API_URL}/select-extra-box`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:gameState.currentPlayer.id,boxNumber:n})});
        if (r.ok) { gameState.currentPlayer.extraBox=n; saveSession(); showNotification('¡Caja extra confirmada! ⭐','success'); await fetchGameState(); }
        else { const e=await r.json(); showNotification(e.error||'Error','error'); }
    } catch { showNotification('Error de conexión','error'); }
}

function buyExtraBox() {
    if (!gameState.currentPlayer||gameState.currentPlayer.hasExtra) return;
    document.getElementById('extraModal').classList.add('active');
    document.getElementById('extraModalPrice').textContent = gameState.config.extraPrice;
    document.getElementById('extraModalAlias').textContent = gameState.config.alias;
}
function closeExtraModal() { document.getElementById('extraModal').classList.remove('active'); }

async function submitExtraBox() {
    const opId = document.getElementById('extraOperationId').value.trim();
    if (!opId) { showNotification('Ingresá el número de operación','error'); return; }
    try {
        const r = await fetch(`${API_URL}/request-extra`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:gameState.currentPlayer.id,operationId:opId})});
        if (r.ok) { closeExtraModal(); showNotification('Solicitud de caja extra enviada...','info'); }
    } catch { showNotification('Error de conexión','error'); }
}

function playAgain() {
    gameState.currentPlayer=null; gameState.selectedBox=null;
    gameState.resultShown=false; gameState.waitingForNewRound=false;
    clearSession();
    document.getElementById('resultScreen').classList.remove('active');
    ['playAgainBtn','extraBtn','confirmBtn'].forEach(id=>document.getElementById(id).classList.add('hidden'));
}

function showResult(winner, winningBox, prize, jackpotAfter) {
    // Primero mostrar animación de apertura, luego el resultado
    if (winningBox) {
        showBoxOpeningAnimation(winningBox, () => _doShowResult(winner, winningBox, prize, jackpotAfter));
    } else {
        _doShowResult(winner, winningBox, prize, jackpotAfter);
    }
}

function _doShowResult(winner, winningBox, prize, jackpotAfter) {
    const screen=document.getElementById('resultScreen');
    const title=document.getElementById('resultTitle');
    const content=document.getElementById('resultContent');
    const btn=document.getElementById('playAgainBtn');
    screen.classList.add('active'); btn.classList.remove('hidden');
    const iWon=gameState.currentPlayer&&winner&&winner.id===gameState.currentPlayer.id;
    const newJ=jackpotAfter||0;
    const wBox=winningBox?`<div class="winning-box-reveal">La caja ganadora era la <span class="winning-box-number">#${winningBox}</span></div>`:'';
    if (winner) {
        if (iWon) {
            title.innerHTML=`<div class="result-title-win">🏆 ¡GANASTE!</div>`;
            content.innerHTML=`<div class="prize-amount">$${prize?prize.toLocaleString():0}</div><p style="opacity:0.9;margin-bottom:15px;">¡El pozo es tuyo! El operador te va a contactar.</p>${wBox}`;
            btn.textContent='🔥 ¡Estás en racha! — Siguiente ronda'; btn.className='btn btn-win-again';
            createConfetti();
            playSound('win');
        } else {
            title.innerHTML=`<div class="result-title-lose">😬 Esta vez no fue...</div>`;
            content.innerHTML=`<div class="result-winner-other">🏆 Ganó: <strong>${winner.name}</strong></div>${wBox}<p style="opacity:0.8;margin:15px 0;">Tu próxima oportunidad comienza ahora.</p>`;
            btn.textContent=newJ>0?`🎯 Siguiente — Pozo: $${newJ.toLocaleString()}`:'🎯 Siguiente ronda'; btn.className='btn btn-try-again';
            playSound('lose');
        }
    } else {
        title.innerHTML=`<div class="result-title-lose">😮 ¡Nadie ganó!</div>`;
        content.innerHTML=`${wBox}<div class="accumulated-message" style="margin-top:20px;">💰 Pozo: $${newJ.toLocaleString()}</div><p style="opacity:0.9;margin-top:15px;">¡La próxima tiene pozo!</p>`;
        btn.textContent=newJ>0?`🔥 Jugar por $${newJ.toLocaleString()}`:'🎯 Siguiente ronda'; btn.className='btn btn-try-again';
    }
}

function createConfetti() {
    const cols=['#ffd700','#f59e0b','#10b981','#6366f1','#ec4899','#ef4444','#fff'];
    for(let i=0;i<120;i++){
        const c=document.createElement('div'); c.className='confetti';
        c.style.cssText=`left:${Math.random()*100}vw;top:-10px;background:${cols[Math.floor(Math.random()*cols.length)]};width:${Math.random()*10+5}px;height:${Math.random()*10+5}px;border-radius:${Math.random()>.5?'50%':'2px'};animation-delay:${Math.random()*2}s;animation-duration:${Math.random()*2+2}s;`;
        document.body.appendChild(c); setTimeout(()=>c.remove(),4000);
    }
}

function renderUltimosGanadores(history) {
    const container = document.getElementById('ultimosGanadoresList');
    if (!container) return;
    const winners = history.filter(w => w.name).slice(0, 3);
    if (!winners.length) {
        container.innerHTML = '<div class="ug-empty">Aún no hay ganadores...<br>¡sé el primero!</div>';
        return;
    }
    const medals = ['🥇','🥈','🥉'];
    const html = winners.map((w, i) => `
        <div class="ug-card">
            <div class="ug-medal">${medals[i] || '🏆'}</div>
            <div class="ug-info">
                <div class="ug-name">${w.name}</div>
                <div class="ug-prize">$${w.prize.toLocaleString()}</div>
                <div class="ug-box-tag">Caja #${w.winningBox}</div>
            </div>
        </div>
    `).join('');
    container.innerHTML = html;
    // Sincronizar lista inline (mobile)
    const inlineList = document.getElementById('ultimosGanadoresListInline');
    if (inlineList) inlineList.innerHTML = html;
}

function toggleUGWidget() {
    const widget = document.getElementById('ugWidget');
    const icon   = document.getElementById('ugToggleIcon');
    widget.classList.toggle('minimized');
    icon.textContent = widget.classList.contains('minimized') ? '▶' : '▼';
}

function toggleUGWidgetInline() {
    const body = document.getElementById('ugInlineBody');
    const icon = document.getElementById('ugInlineToggle');
    if (!body) return;
    if (body.style.maxHeight && body.style.maxHeight !== '0px' && body.style.maxHeight !== '') {
        body.style.maxHeight = '0px';
        body.style.paddingTop = '0';
        body.style.paddingBottom = '0';
        if (icon) icon.style.transform = 'rotate(-90deg)';
    } else {
        body.style.maxHeight = '300px';
        body.style.paddingTop = '10px';
        body.style.paddingBottom = '12px';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

function showNotification(msg,type='info'){
    const t=document.createElement('div');
    const bg={error:'#ef4444',success:'#10b981',warning:'#f59e0b',info:'#6366f1'}[type]||'#6366f1';
    t.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:30px;color:${type==='warning'?'#1a0a00':'white'};font-weight:700;z-index:9999;max-width:90%;text-align:center;font-family:'Exo 2',sans-serif;background:${bg};box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
    t.textContent=msg; document.body.appendChild(t);
    setTimeout(()=>t.remove(),3500);
}
// ══════════════════════════════════════════════════════════════
// CHAT PÚBLICO
// ══════════════════════════════════════════════════════════════
const CHAT_SESSION_KEY = 'mb_chat_session';
let chatState = { sessionId: null, name: null, open: false, waitingReply: false };
let chatEventSource = null;
let chatWindowOpen = false;
let chatUnread = 0;

function getChatSession() {
    try { return JSON.parse(localStorage.getItem(CHAT_SESSION_KEY)); } catch(e) { return null; }
}
function saveChatSession(data) {
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(data));
}

document.addEventListener('DOMContentLoaded', () => {
    // Restaurar sesión de chat si existe
    const saved = getChatSession();
    if (saved && saved.sessionId && saved.name) {
        chatState.sessionId = saved.sessionId;
        chatState.name = saved.name;
        restoreChatSession();
    }
});

function toggleChat() {
    chatWindowOpen = !chatWindowOpen;
    const win = document.getElementById('chatWindow');
    win.classList.toggle('open', chatWindowOpen);
    if (chatWindowOpen) {
        chatUnread = 0;
        document.getElementById('chatUnreadBadge').classList.add('hidden');
    }
}

async function startChat() {
    const nameInput = document.getElementById('chatNameInput');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    // Generar sessionId único
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
    chatState.sessionId = sessionId;
    chatState.name = name;
    saveChatSession({ sessionId, name });

    try {
        const r = await fetch('/api/chat/init', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId, name })
        });
        const data = await r.json();
        showChatMessagesScreen(data);
        subscribeChatStream(sessionId);
    } catch(e) {
        alert('Error al conectar el chat. Intentá de nuevo.');
    }
}

async function restoreChatSession() {
    try {
        const r = await fetch(`/api/chat/session/${chatState.sessionId}`);
        if (!r.ok) { localStorage.removeItem(CHAT_SESSION_KEY); return; }
        const data = await r.json();
        // Mostrar pantalla de mensajes directamente
        document.getElementById('chatNameScreen').style.display = 'none';
        document.getElementById('chatMessagesScreen').style.display = 'flex';
        renderChatMessages(data);
        subscribeChatStream(chatState.sessionId);
    } catch(e) {}
}

function subscribeChatStream(sessionId) {
    if (chatEventSource) chatEventSource.close();
    chatEventSource = new EventSource(`/api/chat/player-stream/${sessionId}`);
    chatEventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        // Si la conv fue eliminada por el admin
        if (data.deleted) {
            localStorage.removeItem(CHAT_SESSION_KEY);
            chatState.sessionId = null;
            // Volver a pantalla de nombre
            document.getElementById('chatMessagesScreen').style.display = 'none';
            document.getElementById('chatNameScreen').style.display = 'flex';
            document.getElementById('chatNameInput').value = '';
            return;
        }
        chatState.waitingReply = data.waitingReply;
        chatState.open = data.open;
        renderChatMessages(data);
        // Badge si la ventana está cerrada y llegó mensaje del admin
        if (!chatWindowOpen && data.messages.length > 0) {
            const last = data.messages[data.messages.length - 1];
            if (last.from === 'admin') {
                chatUnread++;
                const badge = document.getElementById('chatUnreadBadge');
                badge.textContent = chatUnread;
                badge.classList.remove('hidden');
            }
        }
    };
    chatEventSource.onerror = () => {};
}

function showChatMessagesScreen(data) {
    document.getElementById('chatNameScreen').style.display = 'none';
    document.getElementById('chatMessagesScreen').style.display = 'flex';
    renderChatMessages(data);
}

function renderChatMessages(data) {
    const container = document.getElementById('chatMessages');
    const waitingMsg = document.getElementById('chatWaitingMsg');
    const closedMsg = document.getElementById('chatClosedMsg');
    const inputArea = document.getElementById('chatInputArea');
    const sendBtn = document.getElementById('chatSendBtn');

    // Mensajes
    container.innerHTML = '';
    if (data.messages.length === 0) {
        container.innerHTML = '<div class="chat-system-msg">Envianos tu consulta, te respondemos enseguida 👋</div>';
    }
    data.messages.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${m.from}`;
        const time = new Date(m.ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
        bubble.innerHTML = `${escapeHtml(m.text)}<div class="chat-bubble-time">${time}${m.from==='admin'?' ✓✓':' ✓'}</div>`;
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;

    // Estados
    if (!data.open) {
        closedMsg.classList.remove('hidden');
        inputArea.style.display = 'none';
        waitingMsg.classList.add('hidden');
    } else if (data.waitingReply) {
        waitingMsg.classList.remove('hidden');
        sendBtn.disabled = true;
        document.getElementById('chatInput').disabled = true;
    } else {
        waitingMsg.classList.add('hidden');
        sendBtn.disabled = false;
        document.getElementById('chatInput').disabled = false;
    }
}

async function sendChatMsg() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !chatState.sessionId) return;
    input.value = '';

    try {
        const r = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: chatState.sessionId, text })
        });
        const data = await r.json();
        if (!r.ok) {
            showNotification(data.error || 'Error al enviar', 'error');
            input.value = text; // restaurar texto
        }
    } catch(e) {
        showNotification('Error de conexión', 'error');
    }
}

function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ══════════════════════════════════════════════════════════════
// CUENTA REGRESIVA DRAMÁTICA
// ══════════════════════════════════════════════════════════════
let dramaticOverlay = null;
let lastDramaticSec = -1;

function showDramaticCountdown(seconds) {
    if (!dramaticOverlay) {
        dramaticOverlay = document.createElement('div');
        dramaticOverlay.id = 'dramaticCountdown';
        dramaticOverlay.style.cssText = `
            position: fixed; inset: 0; z-index: 2500;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: rgba(0,0,0,0.82);
            backdrop-filter: blur(6px);
            pointer-events: none;
        `;
        dramaticOverlay.innerHTML = `
            <div id="dcLabel" style="
                font-size: 1.1em; font-weight: 800; letter-spacing: 4px;
                color: #fbbf24; text-transform: uppercase; margin-bottom: 18px;
                text-shadow: 0 0 20px rgba(251,191,36,0.7);
                animation: dcPulseLabel 1s infinite;
            ">🎲 ¡Sorteando en...</div>
            <div id="dcNumber" style="
                font-size: 9em; font-weight: 900;
                color: white; line-height: 1;
                text-shadow: 0 0 60px rgba(251,191,36,0.9), 0 0 120px rgba(251,191,36,0.4);
                font-family: 'Courier New', monospace;
                transition: transform 0.15s ease;
            ">3</div>
            <div id="dcBoxes" style="
                font-size: 1.3em; margin-top: 22px; letter-spacing: 2px;
                color: rgba(255,255,255,0.6);
            ">🎁 Las cajas se están cerrando...</div>
        `;
        // Agregar keyframe si no existe
        if (!document.getElementById('dcStyle')) {
            const style = document.createElement('style');
            style.id = 'dcStyle';
            style.textContent = `
                @keyframes dcPulseLabel { 0%,100%{opacity:1} 50%{opacity:0.5} }
                @keyframes dcBounce {
                    0%{transform:scale(1.4);opacity:0}
                    60%{transform:scale(0.9)}
                    100%{transform:scale(1);opacity:1}
                }
                @keyframes dcShake {
                    0%,100%{transform:translateX(0)}
                    20%{transform:translateX(-8px)}
                    40%{transform:translateX(8px)}
                    60%{transform:translateX(-4px)}
                    80%{transform:translateX(4px)}
                }
            `;
            document.head.appendChild(style);
        }
        document.body.appendChild(dramaticOverlay);
    }

    const numEl = document.getElementById('dcNumber');
    if (seconds !== lastDramaticSec && numEl) {
        lastDramaticSec = seconds;
        numEl.textContent = seconds > 0 ? seconds : '🎲';
        numEl.style.animation = 'none';
        void numEl.offsetWidth; // reflow
        numEl.style.animation = seconds <= 1 ? 'dcShake 0.4s ease' : 'dcBounce 0.35s ease';
        // Sonido
        playSound(seconds <= 1 ? 'final_tick' : 'tick');
        // Color según urgencia
        if (seconds <= 1) {
            numEl.style.color = '#ef4444';
            numEl.style.textShadow = '0 0 60px rgba(239,68,68,0.9), 0 0 120px rgba(239,68,68,0.4)';
        } else if (seconds <= 2) {
            numEl.style.color = '#f59e0b';
            numEl.style.textShadow = '0 0 60px rgba(245,158,11,0.9), 0 0 120px rgba(245,158,11,0.4)';
        } else {
            numEl.style.color = 'white';
            numEl.style.textShadow = '0 0 60px rgba(251,191,36,0.9), 0 0 120px rgba(251,191,36,0.4)';
        }
        // Vibrar en último segundo
        if (seconds <= 1) {
            try { navigator.vibrate && navigator.vibrate([200,100,200]); } catch(e) {}
        }
    }
    dramaticOverlay.style.display = 'flex';
}

function hideDramaticCountdown() {
    if (dramaticOverlay) {
        dramaticOverlay.style.display = 'none';
        lastDramaticSec = -1;
    }
}

// ══════════════════════════════════════════════════════════════
// JUGADORES NECESARIOS
// ══════════════════════════════════════════════════════════════
let playersNeededBanner = null;

async function checkPlayersNeeded() {
    if (gameState.status !== 'OPEN') {
        hidePlayersNeededBanner();
        return;
    }
    try {
        const r = await fetch('/api/players-needed');
        const data = await r.json();
        if (data.needed > 0) {
            showPlayersNeededBanner(data.needed, data.current, data.min);
        } else {
            hidePlayersNeededBanner();
        }
    } catch(e) {}
}

function showPlayersNeededBanner(needed, current, min) {
    if (!playersNeededBanner) {
        playersNeededBanner = document.createElement('div');
        playersNeededBanner.id = 'playersNeededBanner';
        playersNeededBanner.style.cssText = `
            position: fixed; bottom: 90px; left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(99,102,241,0.95), rgba(124,58,237,0.95));
            backdrop-filter: blur(10px);
            border: 1.5px solid rgba(167,139,250,0.5);
            color: white; padding: 10px 22px;
            border-radius: 30px; font-weight: 700;
            font-size: 0.88em; z-index: 799;
            box-shadow: 0 4px 20px rgba(99,102,241,0.4);
            white-space: nowrap;
            animation: fadeInDown 0.4s ease;
            pointer-events: none;
        `;
        document.body.appendChild(playersNeededBanner);
    }
    const emoji = needed === 1 ? '🔥' : '👥';
    const txt = needed === 1
        ? `${emoji} ¡Falta <strong>1 jugador</strong> para arrancar!`
        : `${emoji} Faltan <strong>${needed} jugadores</strong> para arrancar (${current}/${min})`;
    playersNeededBanner.innerHTML = txt;
    playersNeededBanner.style.display = 'block';
}

function hidePlayersNeededBanner() {
    if (playersNeededBanner) playersNeededBanner.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// SONIDOS (Web Audio API — sin archivos externos)
// ══════════════════════════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new AudioCtx();
    return _audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const g = ctx.createGain();
        g.connect(ctx.destination);

        if (type === 'tick') {
            // Tick de cuenta regresiva
            const o = ctx.createOscillator();
            o.connect(g);
            o.frequency.value = 880;
            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            o.start(now); o.stop(now + 0.08);

        } else if (type === 'final_tick') {
            // Último segundo — más dramático
            const o = ctx.createOscillator();
            o.connect(g);
            o.frequency.setValueAtTime(440, now);
            o.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            g.gain.setValueAtTime(0.35, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            o.start(now); o.stop(now + 0.3);

        } else if (type === 'win') {
            // Fanfarria ganador
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                const o = ctx.createOscillator();
                const gn = ctx.createGain();
                o.connect(gn); gn.connect(ctx.destination);
                o.frequency.value = freq;
                o.type = 'triangle';
                const t = now + i * 0.12;
                gn.gain.setValueAtTime(0, t);
                gn.gain.linearRampToValueAtTime(0.28, t + 0.04);
                gn.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                o.start(t); o.stop(t + 0.35);
            });

        } else if (type === 'lose') {
            // Sonido derrota
            const o = ctx.createOscillator();
            o.connect(g);
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(300, now);
            o.frequency.exponentialRampToValueAtTime(100, now + 0.4);
            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            o.start(now); o.stop(now + 0.4);

        } else if (type === 'approved') {
            // Pago aprobado — ding!
            const freqs = [784, 988];
            freqs.forEach((freq, i) => {
                const o = ctx.createOscillator();
                const gn = ctx.createGain();
                o.connect(gn); gn.connect(ctx.destination);
                o.frequency.value = freq;
                o.type = 'sine';
                const t = now + i * 0.15;
                gn.gain.setValueAtTime(0.22, t);
                gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                o.start(t); o.stop(t + 0.3);
            });
        }
    } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
// BANNER ESPERANDO APROBACIÓN DE PAGO
// ══════════════════════════════════════════════════════════════
let waitingBanner = null;

function showWaitingApprovalBanner() {
    if (waitingBanner) return;
    waitingBanner = document.createElement('div');
    waitingBanner.id = 'waitingApprovalBanner';
    waitingBanner.style.cssText = `
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, rgba(99,102,241,0.97), rgba(124,58,237,0.97));
        backdrop-filter: blur(12px);
        border: 1.5px solid rgba(167,139,250,0.5);
        color: white;
        padding: 14px 24px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 0.92em;
        z-index: 800;
        box-shadow: 0 6px 28px rgba(99,102,241,0.5);
        white-space: nowrap;
        animation: fadeInUp 0.4s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: none;
        text-align: center;
    `;
    waitingBanner.innerHTML = `
        <span style="font-size:1.3em;animation:spin 2s linear infinite;display:inline-block">⏳</span>
        <div>
            <div style="font-size:0.95em;font-weight:800;">¡Pago enviado correctamente!</div>
            <div style="font-size:0.78em;opacity:0.8;margin-top:2px;">Esperando aprobación del operador...</div>
        </div>
    `;
    if (!document.getElementById('waitingBannerStyle')) {
        const s = document.createElement('style');
        s.id = 'waitingBannerStyle';
        s.textContent = `
            @keyframes fadeInUp { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
            @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `;
        document.head.appendChild(s);
    }
    document.body.appendChild(waitingBanner);
}

function hideWaitingApprovalBanner() {
    if (waitingBanner) {
        waitingBanner.remove();
        waitingBanner = null;
    }
}

// ══════════════════════════════════════════════════════════════
// ANIMACIÓN APERTURA DE CAJA
// ══════════════════════════════════════════════════════════════
function showBoxOpeningAnimation(winningBox, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'box-opening-overlay';
    overlay.innerHTML = `
        <div class="box-number-reveal">🎯 CAJA #${winningBox}</div>
        <div class="box-opening-stage">
            <div class="box-body">🎁</div>
            <div class="box-lid"></div>
        </div>
        <div class="box-winner-label" style="opacity:0;animation:fadeInDown 0.5s ease 0.9s forwards;">
            ✨ Abriendo...
        </div>
    `;
    document.body.appendChild(overlay);

    // Sonido de apertura
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // Suspenso
        [200, 250, 300, 380, 480].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = freq;
            o.type = 'sine';
            const t = now + i * 0.1;
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            o.start(t); o.stop(t + 0.15);
        });
    } catch(e) {}

    setTimeout(() => {
        overlay.remove();
        if (callback) callback();
    }, 1600);
}
