const API_URL = window.location.origin + '/api';

let gameState = {
    status: 'OPEN',
    players: [],
    boxes: {},
    extraBoxes: {},
    jackpot: 0,
    selectedBox: null,
    currentPlayer: null,
    resultShown: false,
    waitingForNewRound: false,
    config: {
        entryPrice: 500,
        extraPrice: 1000,
        minPlayers: 2,
        maxPlayers: 10,
        totalBoxes: 20,
        countdownTime: 3,
        alias: 'elnomad.mp'
    }
};

let lastJackpot = 0;

// ── Three.js box instances registry ──────────────────────────────────
// boxInstances[boxNumber] = { renderer, scene, camera, group, lid, ... }
const boxInstances = {};

document.addEventListener('DOMContentLoaded', () => {
    init();
    startPolling();

    const viewerSource = new EventSource('/api/viewers/connect');
    viewerSource.onmessage = (e) => {
        const { viewers } = JSON.parse(e.data);
        const el = document.getElementById('publicViewerCount');
        if (el) el.textContent = viewers;
    };
    viewerSource.onerror = () => {};
});

function init() {
    renderBoxes();
    updateDisplay();
}

function startPolling() {
    setInterval(fetchGameState, 1000);
    fetchGameState();
}

async function fetchGameState() {
    try {
        const response = await fetch(`${API_URL}/state`);
        const data = await response.json();

        const prevStatus = gameState.status;
        const prevJackpot = lastJackpot;

        gameState.status     = data.status;
        gameState.players    = data.players;
        gameState.boxes      = data.boxes;
        gameState.extraBoxes = data.extraBoxes;
        gameState.jackpot    = data.jackpot;
        gameState.config     = { ...gameState.config, ...data.config };

        // Monedas solo cuando el pozo SUBE (alguien no ganó)
        if (data.jackpot > prevJackpot && prevJackpot > 0) {
            spawnCoinRain();
        }
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
            gameState.resultShown = false;
            gameState.waitingForNewRound = false;
            gameState.currentPlayer = null;
            gameState.selectedBox = null;
            document.getElementById('confirmBtn').classList.add('hidden');
            document.getElementById('extraBtn').classList.add('hidden');
            document.getElementById('playAgainBtn').classList.add('hidden');
            document.getElementById('resultScreen').classList.remove('active');
        }

        if (gameState.currentPlayer && !gameState.currentPlayer.approved) {
            const updated = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (updated && updated.approved) {
                gameState.currentPlayer = updated;
                showNotification('¡Pago aprobado! Confirmá tu caja ✓', 'success');
                document.getElementById('confirmBtn').classList.remove('hidden');
            }
        }

        if (gameState.currentPlayer?.approved && gameState.currentPlayer?.box) {
            const updated = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (updated?.hasExtra && !gameState.currentPlayer.hasExtra) {
                gameState.currentPlayer = updated;
                showNotification('¡Caja extra aprobada! Tocá una caja libre ⭐', 'success');
                document.getElementById('extraBtn').classList.add('hidden');
            }
        }

    } catch (e) { console.error(e); }
}

// ── Coin Rain ─────────────────────────────────────────────────────────
function spawnCoinRain() {
    const container = document.getElementById('coinRainContainer');
    if (!container) return;
    for (let i = 0; i < 24; i++) {
        setTimeout(() => {
            const c = document.createElement('div');
            c.className = 'coin-drop';
            c.style.left = (25 + Math.random() * 50) + '%';
            c.style.top = '-30px';
            const dur = (1.3 + Math.random() * 0.9).toFixed(2);
            c.style.animationDuration = dur + 's';
            const sz = 20 + Math.round(Math.random() * 10);
            c.style.width = sz + 'px';
            c.style.height = sz + 'px';
            c.style.fontSize = Math.round(sz * 0.42) + 'px';
            container.appendChild(c);
            setTimeout(() => c.remove(), parseFloat(dur) * 1000 + 300);
        }, i * 60);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  THREE.JS BOX FACTORY
//  Crea una escena WebGL completa por caja y la anima en loop
// ══════════════════════════════════════════════════════════════════════
const BOX_PALETTE = [
    { body: 0x4c1d95, lid: 0x5b21b6 },
    { body: 0x831843, lid: 0x9d174d },
    { body: 0x065f46, lid: 0x047857 },
    { body: 0x1e3a5f, lid: 0x1d4ed8 },
    { body: 0x7c2d12, lid: 0x92400e },
    { body: 0x1a1a2e, lid: 0x312e81 },
    { body: 0x4a044e, lid: 0x6b21a8 },
    { body: 0x134e4a, lid: 0x0f766e },
    { body: 0x3b0764, lid: 0x4c1d95 },
    { body: 0x0c1a3a, lid: 0x1e3a8a },
];

function createThreeBox(container, boxIndex) {
    const W = container.clientWidth  || 100;
    const H = container.clientHeight || 100;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 1.0, 4.2);
    camera.lookAt(0, 0.1, 0);

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const key = new THREE.DirectionalLight(0xffd700, 1.3);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.45);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const rim = new THREE.PointLight(0xffd700, 0.7, 12);
    rim.position.set(0, 4, -3);
    scene.add(rim);

    const pal = BOX_PALETTE[boxIndex % BOX_PALETTE.length];

    // Materiales
    const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.4, metalness: 0.2 });
    const lidMat  = new THREE.MeshStandardMaterial({ color: pal.lid,  roughness: 0.35, metalness: 0.25 });
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.18, metalness: 0.75 });
    const bowMat    = new THREE.MeshStandardMaterial({ color: 0xff5722, roughness: 0.3,  metalness: 0.3 });
    const bowCtrMat = new THREE.MeshStandardMaterial({ color: 0xffcc80, roughness: 0.2,  metalness: 0.5 });

    const group = new THREE.Group();
    scene.add(group);

    // ── Cuerpo ──
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), bodyMat);
    bodyMesh.position.y = -0.15;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Lazo vertical cuerpo
    const rvBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.52, 1.82), ribbonMat);
    rvBody.position.y = -0.15;
    group.add(rvBody);

    // Lazo horizontal cuerpo
    const rhBody = new THREE.Mesh(new THREE.BoxGeometry(1.82, 1.52, 0.2), ribbonMat);
    rhBody.position.y = -0.15;
    group.add(rhBody);

    // ── Tapa (grupo propio para rotación) ──
    const lidGroup = new THREE.Group();
    lidGroup.position.y = 0.78;
    group.add(lidGroup);

    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.32, 1.92), lidMat);
    lidGroup.add(lidMesh);

    // Lazo vertical tapa
    const rvLid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 1.94), ribbonMat);
    lidGroup.add(rvLid);

    // Lazo horizontal tapa
    const rhLid = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.34, 0.2), ribbonMat);
    lidGroup.add(rhLid);

    // ── Moño (hijo del lidGroup) ──
    const bowGroup = new THREE.Group();
    bowGroup.position.y = 0.28;
    lidGroup.add(bowGroup);

    const bowL = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bowMat);
    bowL.scale.set(1.3, 0.72, 0.72);
    bowL.position.set(-0.32, 0, 0);
    bowGroup.add(bowL);

    const bowR = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bowMat);
    bowR.scale.set(1.3, 0.72, 0.72);
    bowR.position.set(0.32, 0, 0);
    bowGroup.add(bowR);

    const bowCtr = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), bowCtrMat);
    bowGroup.add(bowCtr);

    // Estado de animación
    let floatT     = boxIndex * 0.9;
    let hoverPct   = 0; // 0 = cerrado, 1 = tapa abierta
    let isHovered  = false;
    let state      = 'idle'; // idle | selected | taken | pending | winner

    // Resize observer
    const ro = new ResizeObserver(() => {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw > 0 && ch > 0) {
            renderer.setSize(cw, ch);
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
        }
    });
    ro.observe(container);

    // Hover events
    container.addEventListener('mouseenter', () => { isHovered = true;  });
    container.addEventListener('mouseleave', () => { isHovered = false; });
    container.addEventListener('touchstart',  () => { isHovered = !isHovered; }, { passive: true });

    function animate() {
        requestAnimationFrame(animate);
        floatT += 0.016;

        // Float
        group.position.y = Math.sin(floatT * 1.1) * 0.13;

        // Rotación base suave
        if (state === 'idle' || state === 'pending') {
            group.rotation.y += ((-0.35) - group.rotation.y) * 0.04;
        }

        // Hover → abre tapa
        const targetHover = (isHovered && state !== 'taken') ? 1 : 0;
        hoverPct += (targetHover - hoverPct) * 0.07;

        // Tapa: rota alrededor de su borde trasero (pivot en -z)
        // Movemos el pivot: trasladamos y rotamos
        const lidAngle = hoverPct * (-Math.PI * 0.55);
        lidGroup.rotation.x = lidAngle;
        // Para que la tapa se levante desde el borde trasero:
        // desplazamos el lidGroup hacia adelante y arriba según el ángulo
        lidGroup.position.z = Math.sin(-lidAngle) * 0.96 * 0.5;
        lidGroup.position.y = 0.78 + Math.sin(-lidAngle * 0.5) * 0.3;

        // Estado "selected" → color verde
        if (state === 'selected') {
            bodyMat.color.lerp(new THREE.Color(0x065f46), 0.08);
            lidMat.color.lerp(new THREE.Color(0x059669), 0.08);
            group.rotation.y += (0 - group.rotation.y) * 0.04;
        } else if (state === 'winner') {
            bodyMat.color.lerp(new THREE.Color(0xd97706), 0.1);
            lidMat.color.lerp(new THREE.Color(0xfbbf24), 0.1);
            group.rotation.y += 0.025;
        } else if (state === 'taken') {
            bodyMat.color.lerp(new THREE.Color(0x1f2937), 0.05);
            lidMat.color.lerp(new THREE.Color(0x374151), 0.05);
        }

        renderer.render(scene, camera);
    }
    animate();

    return {
        renderer,
        setHover: (v) => { isHovered = v; },
        setState: (s) => { state = s; }
    };
}

// ══════════════════════════════════════════════════════════════════════
//  RENDER BOXES
// ══════════════════════════════════════════════════════════════════════
function renderBoxes() {
    const grid = document.getElementById('boxesGrid');
    const total = gameState.config.totalBoxes;

    // Si el grid ya tiene el número correcto de cajas, solo actualizamos estados
    const existing = grid.querySelectorAll('.box');
    if (existing.length === total) {
        updateBoxStates();
        return;
    }

    // Primera vez: crear todas las cajas
    grid.innerHTML = '';
    // Destruir renderers previos para liberar memoria
    Object.values(boxInstances).forEach(inst => {
        if (inst.renderer) inst.renderer.dispose();
    });
    for (const k in boxInstances) delete boxInstances[k];

    for (let i = 1; i <= total; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'box floating';
        wrapper.dataset.number = i;

        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'box-canvas-wrap';

        const overlay = document.createElement('div');
        overlay.className = 'box-state-overlay';

        const numEl = document.createElement('div');
        numEl.className = 'box-number';
        numEl.textContent = String(i).padStart(2, '0');

        wrapper.appendChild(canvasWrap);
        wrapper.appendChild(overlay);
        wrapper.appendChild(numEl);
        grid.appendChild(wrapper);

        wrapper.onclick = () => selectBox(i);

        // Three.js se inicializa un tick después para que el layout esté listo
        const boxIdx = i - 1;
        setTimeout(() => {
            const inst = createThreeBox(canvasWrap, boxIdx);
            boxInstances[i] = inst;
        }, boxIdx * 18 + 30);
    }

    // Actualizar estados después de que los canvases existan
    setTimeout(updateBoxStates, total * 18 + 200);
}

function updateBoxStates() {
    const grid = document.getElementById('boxesGrid');
    const boxes = grid.querySelectorAll('.box');

    boxes.forEach(box => {
        const i = parseInt(box.dataset.number);
        const overlay = box.querySelector('.box-state-overlay');

        // Reset clases de estado
        box.classList.remove('taken','selected','pending','extra-selected','winner','empty-winner','floating');

        // Limpiar player-tag previo
        const oldTag = box.querySelector('.player-tag');
        if (oldTag) oldTag.remove();

        let stateStr = 'idle';

        if (gameState.boxes[i]) {
            box.classList.add('taken');
            stateStr = 'taken';
            const p = gameState.players.find(p => p.id === gameState.boxes[i]);
            if (p) addPlayerTag(box, p.name);
        } else if (gameState.extraBoxes[i]) {
            box.classList.add('taken');
            stateStr = 'taken';
            const p = gameState.players.find(p => p.id === gameState.extraBoxes[i]);
            if (p) addPlayerTag(box, p.name + ' ⭐');
        } else if (gameState.currentPlayer?.selectedBox === i && !gameState.currentPlayer?.approved) {
            box.classList.add('pending');
            stateStr = 'pending';
            addPlayerTag(box, '⏳ ' + gameState.currentPlayer.name);
        } else if (gameState.currentPlayer?.box === i) {
            box.classList.add('selected');
            stateStr = 'selected';
        } else if (gameState.currentPlayer?.extraBox === i) {
            box.classList.add('extra-selected');
            stateStr = 'selected';
        } else {
            box.classList.add('floating');
        }

        if (gameState.winningBox === i) {
            box.classList.add(gameState.winner ? 'winner' : 'empty-winner');
            stateStr = gameState.winner ? 'winner' : 'idle';
        }

        // Aplicar estado al renderer Three.js
        if (boxInstances[i]) {
            boxInstances[i].setState(stateStr);
        }
    });
}

function addPlayerTag(box, text) {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    tag.textContent = text;
    box.appendChild(tag);
}

// ══════════════════════════════════════════════════════════════════════
//  LÓGICA DE JUEGO (idéntica al original)
// ══════════════════════════════════════════════════════════════════════
function updateDisplay() {
    document.getElementById('jackpotAmount').textContent     = gameState.jackpot.toLocaleString();
    document.getElementById('playerCount').textContent       = gameState.players.length;
    document.getElementById('maxPlayersDisplay').textContent = gameState.config.maxPlayers;
    document.getElementById('entryPriceDisplay').textContent = gameState.config.entryPrice;
    document.getElementById('extraPrice').textContent        = gameState.config.extraPrice;
    document.getElementById('countdownRule').textContent     = gameState.config.countdownTime;

    const list = document.getElementById('playersList');
    if (!gameState.players.length) {
        list.innerHTML = '<p style="opacity:0.6;width:100%;text-align:center;">No hay jugadores todavía...</p>';
    } else {
        list.innerHTML = gameState.players.map(p => {
            let cls = p.box ? 'ready' : '';
            if (gameState.currentPlayer?.id === p.id) cls += ' mine';
            return `<div class="player-chip ${cls}">
                ${p.name} ${p.box ? '✓' : ''} ${p.extraBox ? '⭐' : ''}
                ${!p.approved && p.selectedBox ? '⏳' : ''}
            </div>`;
        }).join('');
    }
}

function updateTimer(countdownEnd) {
    const s = Math.ceil(Math.max(0, countdownEnd - Date.now()) / 1000);
    document.getElementById('timerDisplay').textContent = `00:0${s}`;
}

function updateStatus(status) {
    const ind  = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    ind.className = 'status-indicator status-' + status.toLowerCase();
    text.textContent = { OPEN:'ESPERANDO JUGADORES', COUNTDOWN:'CERRANDO EN...', CLOSED:'SALA CERRADA', FINISHED:'RONDA FINALIZADA' }[status] || status;
}

function selectBox(n) {
    if (gameState.status === 'FINISHED') { showNotification('La ronda terminó. Esperá la próxima...','warning'); return; }
    if (gameState.status !== 'OPEN')     { showNotification('La sala está cerrada','error'); return; }
    if (gameState.boxes[n] || gameState.extraBoxes[n]) { showNotification('Esa caja ya fue elegida','error'); return; }

    const pending = gameState.players.find(p => p.selectedBox === n && !p.approved);
    if (pending && pending.id !== gameState.currentPlayer?.id) { showNotification('Esa caja está pendiente','warning'); return; }

    if (!gameState.currentPlayer) { gameState.selectedBox = n; openPaymentModal(); return; }
    if (!gameState.currentPlayer.approved) { showNotification('Esperando confirmación de pago...','warning'); return; }
    if (!gameState.currentPlayer.box) {
        gameState.selectedBox = n;
        updateBoxStates();
        document.getElementById('confirmBtn').classList.remove('hidden');
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
function copyAlias() { navigator.clipboard.writeText(gameState.config.alias).then(() => showNotification('Alias copiado ✓','success')); }

async function submitTransfer() {
    const name = document.getElementById('playerName').value.trim();
    const opId = document.getElementById('operationId').value.trim();
    if (!name)             { showNotification('Ingresá tu nombre','error'); return; }
    if (opId.length < 4)   { showNotification('Ingresá el número de operación','error'); return; }
    try {
        const r = await fetch(`${API_URL}/request-entry`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ name, operationId: opId, boxNumber: gameState.selectedBox })
        });
        if (r.ok) {
            const d = await r.json();
            gameState.currentPlayer = d.player;
            closePaymentModal();
            showNotification('Solicitud enviada. Esperando aprobación...','info');
            updateBoxStates();
        } else { const e = await r.json(); showNotification(e.error||'Error','error'); }
    } catch { showNotification('Error de conexión','error'); }
}

async function confirmSelection() {
    if (!gameState.selectedBox || !gameState.currentPlayer) return;
    try {
        const r = await fetch(`${API_URL}/confirm-box`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, boxNumber: gameState.selectedBox })
        });
        if (r.ok) {
            gameState.currentPlayer.box = gameState.selectedBox;
            document.getElementById('confirmBtn').classList.add('hidden');
            document.getElementById('extraBtn').classList.remove('hidden');
            showNotification('¡Caja confirmada! ✓','success');
            await fetchGameState();
        } else { const e = await r.json(); showNotification(e.error||'Error','error'); }
    } catch { showNotification('Error de conexión','error'); }
}

async function submitExtraBoxSelection(n) {
    try {
        const r = await fetch(`${API_URL}/select-extra-box`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, boxNumber: n })
        });
        if (r.ok) {
            gameState.currentPlayer.extraBox = n;
            showNotification('¡Caja extra confirmada! ⭐','success');
            await fetchGameState();
        } else { const e = await r.json(); showNotification(e.error||'Error','error'); }
    } catch { showNotification('Error de conexión','error'); }
}

function buyExtraBox() {
    if (!gameState.currentPlayer || gameState.currentPlayer.hasExtra) return;
    document.getElementById('extraModal').classList.add('active');
    document.getElementById('extraModalPrice').textContent = gameState.config.extraPrice;
    document.getElementById('extraModalAlias').textContent = gameState.config.alias;
}
function closeExtraModal() { document.getElementById('extraModal').classList.remove('active'); }

async function submitExtraBox() {
    const opId = document.getElementById('extraOperationId').value.trim();
    if (!opId) { showNotification('Ingresá el número de operación','error'); return; }
    try {
        const r = await fetch(`${API_URL}/request-extra`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, operationId: opId })
        });
        if (r.ok) { closeExtraModal(); showNotification('Solicitud de caja extra enviada...','info'); }
    } catch { showNotification('Error de conexión','error'); }
}

function playAgain() {
    gameState.currentPlayer = null;
    gameState.selectedBox   = null;
    gameState.resultShown   = false;
    gameState.waitingForNewRound = false;
    document.getElementById('resultScreen').classList.remove('active');
    document.getElementById('playAgainBtn').classList.add('hidden');
    document.getElementById('extraBtn').classList.add('hidden');
    document.getElementById('confirmBtn').classList.add('hidden');
}

function showResult(winner, winningBox, prize, jackpotAfter) {
    const screen = document.getElementById('resultScreen');
    const title  = document.getElementById('resultTitle');
    const content= document.getElementById('resultContent');
    const btn    = document.getElementById('playAgainBtn');

    screen.classList.add('active');
    btn.classList.remove('hidden');

    const iWon      = gameState.currentPlayer && winner && winner.id === gameState.currentPlayer.id;
    const newJackpot= jackpotAfter || 0;

    const winBoxInfo = winningBox
        ? `<div class="winning-box-reveal">La caja ganadora era la <span class="winning-box-number">#${winningBox}</span></div>`
        : '';

    if (winner) {
        if (iWon) {
            title.innerHTML = `<div class="result-title-win">🏆 ¡GANASTE!</div>`;
            content.innerHTML = `
                <div class="prize-amount">$${prize ? prize.toLocaleString() : 0}</div>
                <p style="opacity:0.9;margin-bottom:15px;">¡El pozo es tuyo! El operador te va a contactar.</p>
                ${winBoxInfo}
                <p class="result-subtitle" style="margin-top:15px;">La próxima ronda ya está abierta.</p>`;
            btn.textContent = '🔥 ¡Estás en racha! — Siguiente ronda';
            btn.className = 'btn btn-win-again';
            createConfetti();
        } else {
            title.innerHTML = `<div class="result-title-lose">😬 Esta vez no fue...</div>`;
            content.innerHTML = `
                <div class="result-winner-other">🏆 Ganó: <strong>${winner.name}</strong></div>
                ${winBoxInfo}
                <p style="opacity:0.8;margin:15px 0;">Tu próxima oportunidad comienza ahora.</p>`;
            btn.textContent = newJackpot > 0 ? `🎯 Siguiente ronda — Pozo: $${newJackpot.toLocaleString()}` : '🎯 Entrar a la siguiente ronda';
            btn.className = 'btn btn-try-again';
        }
    } else {
        title.innerHTML = `<div class="result-title-lose">😮 ¡Nadie ganó esta vez!</div>`;
        content.innerHTML = `
            ${winBoxInfo}
            <div class="accumulated-message" style="margin-top:20px;">💰 Pozo acumulado: $${newJackpot.toLocaleString()}</div>
            <p style="opacity:0.9;margin-top:15px;">¡La próxima tiene pozo! No te lo pierdas.</p>`;
        btn.textContent = newJackpot > 0 ? `🔥 Jugar por $${newJackpot.toLocaleString()} — Entrar ahora` : '🎯 Entrar a la siguiente ronda';
        btn.className = 'btn btn-try-again';
    }
}

function createConfetti() {
    const colors = ['#ffd700','#f59e0b','#10b981','#6366f1','#ec4899','#ef4444','#fff'];
    for (let i = 0; i < 120; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.cssText = `left:${Math.random()*100}vw;top:-10px;
            background:${colors[Math.floor(Math.random()*colors.length)]};
            width:${Math.random()*10+5}px;height:${Math.random()*10+5}px;
            border-radius:${Math.random()>.5?'50%':'2px'};
            animation-delay:${Math.random()*2}s;
            animation-duration:${Math.random()*2+2}s;`;
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 4000);
    }
}

function showNotification(msg, type='info') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
        padding:15px 30px;border-radius:30px;color:white;font-weight:bold;
        z-index:9999;animation:fadeIn 0.3s ease;max-width:90%;text-align:center;
        font-family:'Exo 2',sans-serif;
        background:${{error:'#ef4444',success:'#10b981',warning:'#f59e0b',info:'#6366f1'}[type]||'#6366f1'};
        ${type==='warning'?'color:#1f2937;':''}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}