const API_URL = window.location.origin + '/api';

let gameState = {
    status: 'OPEN', players: [], boxes: {}, extraBoxes: {},
    jackpot: 0, selectedBox: null, currentPlayer: null,
    resultShown: false, waitingForNewRound: false,
    config: { entryPrice:500, extraPrice:1000, minPlayers:2, maxPlayers:10,
              totalBoxes:20, countdownTime:3, alias:'elnomad.mp' }
};
let lastJackpot = 0;

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
function buildGiftBoxSVG(pal, state) {
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

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="100" height="110">
  <defs>
    <filter id="shadow-${state}" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="rgba(0,0,0,0.55)"/>
    </filter>
    <filter id="glow-${state}">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- Gradientes para dar volumen 3D -->
    <linearGradient id="bodyGrad-${state}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${lighten(bodyC,20)}"/>
      <stop offset="100%" stop-color="${bodyC}"/>
    </linearGradient>
    <linearGradient id="sideGrad-${state}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${sideC}"/>
      <stop offset="100%" stop-color="${darken(sideC,20)}"/>
    </linearGradient>
    <linearGradient id="topGrad-${state}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${lighten(topC,30)}"/>
      <stop offset="100%" stop-color="${topC}"/>
    </linearGradient>
    <linearGradient id="bowGrad-${state}" cx="30%" cy="30%" r="70%" fx="30%" fy="30%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${lighten(bowC,30)}"/>
      <stop offset="100%" stop-color="${bowC}"/>
    </linearGradient>
  </defs>
  <g opacity="${opacity}" filter="url(#shadow-${state})">

    <!-- CARA FRONTAL (izquierda) -->
    <polygon points="15,52 50,70 50,100 15,82" fill="url(#bodyGrad-${state})"/>
    <!-- Borde frontal -->
    <polygon points="15,52 50,70 50,100 15,82" fill="none" stroke="${lighten(bodyC,15)}" stroke-width="0.5" opacity="0.5"/>
    <!-- Ribete lazo frontal -->
    <polygon points="30,61 35,63.5 35,91 30,88.5" fill="${ribbonC}" opacity="0.85"/>

    <!-- CARA LATERAL (derecha) -->
    <polygon points="50,70 85,52 85,82 50,100" fill="url(#sideGrad-${state})"/>
    <polygon points="50,70 85,52 85,82 50,100" fill="none" stroke="${darken(sideC,10)}" stroke-width="0.5" opacity="0.4"/>
    <!-- Ribete lazo lateral -->
    <polygon points="65,61 70,58.5 70,88.5 65,91" fill="${ribbonC}" opacity="0.75"/>

    <!-- TAPA -->
    <polygon points="15,52 50,34 85,52 50,70" fill="url(#topGrad-${state})"/>
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
    <ellipse cx="43" cy="28" rx="8" ry="5.5" fill="url(#bowGrad-${state})"
             transform="rotate(-30 43 28)" opacity="0.95"/>
    <!-- Lazo derecho -->
    <ellipse cx="57" cy="28" rx="8" ry="5.5" fill="url(#bowGrad-${state})"
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

function init() { renderBoxes(); updateDisplay(); }

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

        document.getElementById('scheduleClosed').classList.toggle('hidden', data.inSchedule !== false);
        if (data.countdownEnd && gameState.status === 'COUNTDOWN') updateTimer(data.countdownEnd);

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

                // Notificar solo la primera vez que se aprueba
                if (!wasApproved && up.approved) {
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
        art.innerHTML = buildGiftBoxSVG(pal, state);

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
            closePaymentModal(); showNotification('Solicitud enviada. Esperando aprobación...','info'); renderBoxes();
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
        if (r.ok) { gameState.currentPlayer.extraBox=n; showNotification('¡Caja extra confirmada! ⭐','success'); await fetchGameState(); }
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
    document.getElementById('resultScreen').classList.remove('active');
    ['playAgainBtn','extraBtn','confirmBtn'].forEach(id=>document.getElementById(id).classList.add('hidden'));
}

function showResult(winner, winningBox, prize, jackpotAfter) {
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
        } else {
            title.innerHTML=`<div class="result-title-lose">😬 Esta vez no fue...</div>`;
            content.innerHTML=`<div class="result-winner-other">🏆 Ganó: <strong>${winner.name}</strong></div>${wBox}<p style="opacity:0.8;margin:15px 0;">Tu próxima oportunidad comienza ahora.</p>`;
            btn.textContent=newJ>0?`🎯 Siguiente — Pozo: $${newJ.toLocaleString()}`:'🎯 Siguiente ronda'; btn.className='btn btn-try-again';
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

function showNotification(msg,type='info'){
    const t=document.createElement('div');
    const bg={error:'#ef4444',success:'#10b981',warning:'#f59e0b',info:'#6366f1'}[type]||'#6366f1';
    t.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:30px;color:${type==='warning'?'#1a0a00':'white'};font-weight:700;z-index:9999;max-width:90%;text-align:center;font-family:'Exo 2',sans-serif;background:${bg};box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
    t.textContent=msg; document.body.appendChild(t);
    setTimeout(()=>t.remove(),3500);
}