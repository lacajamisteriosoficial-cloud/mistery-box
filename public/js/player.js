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

document.addEventListener('DOMContentLoaded', () => {
    init();
    startPolling();

    // ── Registrarse como viewer en vivo ──────────────────────────────
    const viewerSource = new EventSource('/api/viewers/connect');
    viewerSource.onerror = () => {}; // silenciar errores de reconexión
    // ─────────────────────────────────────────────────────────────────
});

function init() {
    renderBoxes();
    updateDisplay();
}

function startPolling() {
    setInterval(async () => {
        await fetchGameState();
    }, 1000);
    fetchGameState();
}

async function fetchGameState() {
    try {
        const response = await fetch(`${API_URL}/state`);
        const data = await response.json();

        const prevStatus = gameState.status;

        gameState.status = data.status;
        gameState.players = data.players;
        gameState.boxes = data.boxes;
        gameState.extraBoxes = data.extraBoxes;
        gameState.jackpot = data.jackpot;
        gameState.config = {...gameState.config, ...data.config};

        if (!data.inSchedule) {
            document.getElementById('scheduleClosed').classList.remove('hidden');
        } else {
            document.getElementById('scheduleClosed').classList.add('hidden');
        }

        if (data.countdownEnd && gameState.status === 'COUNTDOWN') {
            updateTimer(data.countdownEnd);
        }

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
            const updatedPlayer = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (updatedPlayer && updatedPlayer.approved) {
                gameState.currentPlayer = updatedPlayer;
                showNotification('¡Pago aprobado! Confirmá tu caja 🎁', 'success');
                document.getElementById('confirmBtn').classList.remove('hidden');
            }
        }

        if (gameState.currentPlayer && gameState.currentPlayer.approved && gameState.currentPlayer.box) {
            const updatedPlayer = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (updatedPlayer && updatedPlayer.hasExtra && !gameState.currentPlayer.hasExtra) {
                gameState.currentPlayer = updatedPlayer;
                showNotification('¡Caja extra aprobada! Tocá una caja libre para elegirla ⭐', 'success');
                document.getElementById('extraBtn').classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

function renderBoxes() {
    const grid = document.getElementById('boxesGrid');
    grid.innerHTML = '';

    for (let i = 1; i <= gameState.config.totalBoxes; i++) {
        const box = document.createElement('div');
        box.className = 'box';
        box.dataset.number = i;
        box.innerHTML = `
            <div class="box-number">${i}</div>
            <div class="box-icon">🎁</div>
        `;

        if (gameState.boxes[i]) {
            box.classList.add('taken');
            const player = gameState.players.find(p => p.id === gameState.boxes[i]);
            if (player) box.innerHTML += `<div class="player-tag">${player.name}</div>`;
        } else if (gameState.extraBoxes[i]) {
            box.classList.add('taken');
            const player = gameState.players.find(p => p.id === gameState.extraBoxes[i]);
            if (player) box.innerHTML += `<div class="player-tag">${player.name} ⭐</div>`;
        }

        if (gameState.currentPlayer && gameState.currentPlayer.selectedBox === i && !gameState.currentPlayer.approved) {
            box.classList.add('pending');
            box.innerHTML += `<div class="player-tag">⏳ ${gameState.currentPlayer.name}</div>`;
        }

        if (gameState.currentPlayer && gameState.currentPlayer.box === i) {
            box.classList.add('selected');
        }

        if (gameState.currentPlayer && gameState.currentPlayer.extraBox === i) {
            box.classList.add('extra-selected');
        }

        if (gameState.winningBox === i) {
            box.classList.add(gameState.winner ? 'winner' : 'empty-winner');
        }

        const isFree = !gameState.boxes[i] && !gameState.extraBoxes[i] &&
            !(gameState.currentPlayer && gameState.currentPlayer.selectedBox === i) &&
            !(gameState.currentPlayer && gameState.currentPlayer.box === i);
        if (isFree) box.classList.add('floating');

        box.onclick = () => selectBox(i);
        grid.appendChild(box);
    }
}

function updateDisplay() {
    document.getElementById('jackpotAmount').textContent = gameState.jackpot.toLocaleString();
    document.getElementById('playerCount').textContent = gameState.players.length;
    document.getElementById('maxPlayersDisplay').textContent = gameState.config.maxPlayers;
    document.getElementById('entryPriceDisplay').textContent = gameState.config.entryPrice;
    document.getElementById('extraPrice').textContent = gameState.config.extraPrice;
    document.getElementById('countdownRule').textContent = gameState.config.countdownTime;

    const list = document.getElementById('playersList');
    if (gameState.players.length === 0) {
        list.innerHTML = '<p style="opacity: 0.6; width: 100%; text-align: center;">No hay jugadores todavía...</p>';
    } else {
        list.innerHTML = gameState.players.map(p => {
            let cls = '';
            if (p.box) cls = 'ready';
            if (gameState.currentPlayer && p.id === gameState.currentPlayer.id) cls += ' mine';
            return `<div class="player-chip ${cls}">
                ${p.name} ${p.box ? '✓' : ''} ${p.extraBox ? '⭐' : ''}
                ${!p.approved && p.selectedBox ? '⏳' : ''}
            </div>`;
        }).join('');
    }
}

function updateTimer(countdownEnd) {
    const now = Date.now();
    const remaining = Math.max(0, countdownEnd - now);
    const seconds = Math.ceil(remaining / 1000);
    document.getElementById('timerDisplay').textContent = `00:0${seconds}`;
}

function updateStatus(status) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    indicator.className = 'status-indicator status-' + status.toLowerCase();
    const texts = {
        'OPEN': 'ESPERANDO JUGADORES',
        'COUNTDOWN': 'CERRANDO EN...',
        'CLOSED': 'SALA CERRADA',
        'FINISHED': 'RONDA FINALIZADA'
    };
    text.textContent = texts[status] || status;
}

function selectBox(boxNumber) {
    if (gameState.status === 'FINISHED') {
        showNotification('La ronda terminó. Esperá la próxima...', 'warning');
        return;
    }
    if (gameState.status !== 'OPEN') {
        showNotification('La sala está cerrada', 'error');
        return;
    }
    if (gameState.boxes[boxNumber] || gameState.extraBoxes[boxNumber]) {
        showNotification('Esa caja ya fue elegida', 'error');
        return;
    }
    const pendingPlayer = gameState.players.find(p => p.selectedBox === boxNumber && !p.approved);
    if (pendingPlayer && (!gameState.currentPlayer || pendingPlayer.id !== gameState.currentPlayer.id)) {
        showNotification('Esa caja está pendiente de aprobación', 'warning');
        return;
    }
    if (!gameState.currentPlayer) {
        gameState.selectedBox = boxNumber;
        openPaymentModal();
        return;
    }
    if (!gameState.currentPlayer.approved) {
        showNotification('Esperando confirmación de pago...', 'warning');
        return;
    }
    if (!gameState.currentPlayer.box) {
        gameState.selectedBox = boxNumber;
        renderBoxes();
        document.getElementById('confirmBtn').classList.remove('hidden');
        return;
    }
    if (gameState.currentPlayer.hasExtra && !gameState.currentPlayer.extraBox) {
        submitExtraBoxSelection(boxNumber);
        return;
    }
}

function openPaymentModal() {
    document.getElementById('paymentModal').classList.add('active');
    document.getElementById('selectedBoxNumber').textContent = gameState.selectedBox;
    document.getElementById('modalEntryPrice').textContent = gameState.config.entryPrice;
    document.getElementById('modalAlias').textContent = gameState.config.alias;
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
}

function copyAlias() {
    navigator.clipboard.writeText(gameState.config.alias).then(() => {
        showNotification('Alias copiado ✓', 'success');
    });
}

async function submitTransfer() {
    const name = document.getElementById('playerName').value.trim();
    const operationId = document.getElementById('operationId').value.trim();
    if (!name) { showNotification('Ingresá tu nombre', 'error'); return; }
    if (!operationId || operationId.length < 4) { showNotification('Ingresá el número de operación', 'error'); return; }

    try {
        const response = await fetch(`${API_URL}/request-entry`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, operationId, boxNumber: gameState.selectedBox })
        });
        if (response.ok) {
            const data = await response.json();
            gameState.currentPlayer = data.player;
            closePaymentModal();
            showNotification('Solicitud enviada. Esperando aprobación...', 'info');
            renderBoxes();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function confirmSelection() {
    if (!gameState.selectedBox || !gameState.currentPlayer) return;
    try {
        const response = await fetch(`${API_URL}/confirm-box`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, boxNumber: gameState.selectedBox })
        });
        if (response.ok) {
            gameState.currentPlayer.box = gameState.selectedBox;
            document.getElementById('confirmBtn').classList.add('hidden');
            document.getElementById('extraBtn').classList.remove('hidden');
            showNotification('¡Caja confirmada! 🎁', 'success');
            await fetchGameState();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error al confirmar', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function submitExtraBoxSelection(boxNumber) {
    try {
        const response = await fetch(`${API_URL}/select-extra-box`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, boxNumber })
        });
        if (response.ok) {
            gameState.currentPlayer.extraBox = boxNumber;
            showNotification('¡Caja extra confirmada! ⭐', 'success');
            await fetchGameState();
        } else {
            const err = await response.json();
            showNotification(err.error || 'Error al seleccionar caja extra', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

function buyExtraBox() {
    if (!gameState.currentPlayer || gameState.currentPlayer.hasExtra) return;
    document.getElementById('extraModal').classList.add('active');
    document.getElementById('extraModalPrice').textContent = gameState.config.extraPrice;
    document.getElementById('extraModalAlias').textContent = gameState.config.alias;
}

function closeExtraModal() {
    document.getElementById('extraModal').classList.remove('active');
}

async function submitExtraBox() {
    const operationId = document.getElementById('extraOperationId').value.trim();
    if (!operationId) { showNotification('Ingresá el número de operación', 'error'); return; }
    try {
        const response = await fetch(`${API_URL}/request-extra`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ playerId: gameState.currentPlayer.id, operationId })
        });
        if (response.ok) {
            closeExtraModal();
            showNotification('Solicitud de caja extra enviada. Esperá aprobación...', 'info');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

function playAgain() {
    gameState.currentPlayer = null;
    gameState.selectedBox = null;
    gameState.resultShown = false;
    gameState.waitingForNewRound = false;
    document.getElementById('resultScreen').classList.remove('active');
    document.getElementById('playAgainBtn').classList.add('hidden');
    document.getElementById('extraBtn').classList.add('hidden');
    document.getElementById('confirmBtn').classList.add('hidden');
}

function showResult(winner, winningBox, prize, jackpotAfter) {
    const screen = document.getElementById('resultScreen');
    const title = document.getElementById('resultTitle');
    const content = document.getElementById('resultContent');
    const playAgainBtn = document.getElementById('playAgainBtn');

    screen.classList.add('active');
    playAgainBtn.classList.remove('hidden');

    const myPlayer = gameState.currentPlayer;
    const iWon = myPlayer && winner && winner.id === myPlayer.id;
    const newJackpot = jackpotAfter || 0;

    const winBoxInfo = winningBox
        ? `<div class="winning-box-reveal">🎰 La caja ganadora era la <span class="winning-box-number">#${winningBox}</span></div>`
        : '';

    if (winner) {
        if (iWon) {
            title.innerHTML = `<div class="result-title-win">🏆 ¡GANASTE!</div>`;
            content.innerHTML = `
                <div class="prize-amount">$${prize ? prize.toLocaleString() : 0}</div>
                <p style="opacity:0.9; margin-bottom:15px;">¡El pozo es tuyo! El operador te va a contactar.</p>
                ${winBoxInfo}
                <p class="result-subtitle" style="margin-top:15px;">La próxima ronda ya está abierta.</p>
            `;
            playAgainBtn.textContent = '🔥 ¡Estás en racha! — Siguiente ronda';
            playAgainBtn.className = 'btn btn-win-again';
            createConfetti();
        } else {
            title.innerHTML = `<div class="result-title-lose">😬 Esta vez no fue...</div>`;
            content.innerHTML = `
                <div class="result-winner-other">🏆 Ganó: <strong>${winner.name}</strong></div>
                ${winBoxInfo}
                <p style="opacity:0.8; margin:15px 0;">Tu próxima oportunidad comienza ahora.</p>
            `;
            playAgainBtn.textContent = newJackpot > 0
                ? `🎯 Siguiente ronda — Pozo: $${newJackpot.toLocaleString()}`
                : '🎯 Entrar a la siguiente ronda';
            playAgainBtn.className = 'btn btn-try-again';
        }
    } else {
        title.innerHTML = `<div class="result-title-lose">😮 ¡Nadie ganó esta vez!</div>`;
        content.innerHTML = `
            ${winBoxInfo}
            <div class="accumulated-message" style="margin-top:20px;">
                💰 Pozo acumulado: $${newJackpot.toLocaleString()}
            </div>
            <p style="opacity:0.9; margin-top:15px;">¡La próxima tiene pozo! No te lo pierdas.</p>
        `;
        playAgainBtn.textContent = newJackpot > 0
            ? `🔥 Jugar por $${newJackpot.toLocaleString()} — Entrar ahora`
            : '🎯 Entrar a la siguiente ronda';
        playAgainBtn.className = 'btn btn-try-again';
    }
}

function createConfetti() {
    const colors = ['#fbbf24','#f59e0b','#10b981','#6366f1','#ec4899','#ef4444','#fff'];
    for (let i = 0; i < 120; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + 'vw';
        c.style.top = '-10px';
        c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        c.style.width = (Math.random() * 10 + 5) + 'px';
        c.style.height = (Math.random() * 10 + 5) + 'px';
        c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        c.style.animationDelay = Math.random() * 2 + 's';
        c.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 4000);
    }
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 15px 30px; border-radius: 30px; color: white; font-weight: bold;
        z-index: 9999; animation: fadeInDown 0.3s ease; max-width: 90%; text-align: center;
        ${type === 'error' ? 'background: #ef4444;' :
          type === 'success' ? 'background: #10b981;' :
          type === 'warning' ? 'background: #f59e0b; color: #1f2937;' :
          'background: #6366f1;'}
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}