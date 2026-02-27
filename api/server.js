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
    config: {
        entryPrice: 500,
        extraPrice: 1000,
        minPlayers: 5,
        maxPlayers: 10,
        totalBoxes: 20,
        countdownTime: 3,
        alias: 'elnomad.mp'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    startPolling();
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
        
        gameState.status = data.status;
        gameState.players = data.players;
        gameState.boxes = data.boxes;
        gameState.extraBoxes = data.extraBoxes;
        gameState.jackpot = data.jackpot;
        gameState.config = {...gameState.config, ...data.config};
        
        // Verificar horario
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
        
        // Verificar si hay resultado — se muestra UNA sola vez por ronda
        if (gameState.status === 'FINISHED' && !gameState.resultShown) {
            gameState.resultShown = true;
            showResult(data.winner, data.winningBox, data.prize);
        }

        // Si el estado vuelve a OPEN (nueva ronda), resetear el flag
        if (gameState.status === 'OPEN') {
            gameState.resultShown = false;
        }
        
        // Si el jugador actual fue aprobado, actualizar UI
        if (gameState.currentPlayer) {
            const updatedPlayer = gameState.players.find(p => p.id === gameState.currentPlayer.id);
            if (updatedPlayer && updatedPlayer.approved && !gameState.currentPlayer.approved) {
                gameState.currentPlayer = updatedPlayer;
                showNotification('¡Pago aprobado! Confirmá tu caja', 'success');
                document.getElementById('confirmBtn').classList.remove('hidden');
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
        
        // Caja tomada por alguien
        if (gameState.boxes[i]) {
            box.classList.add('taken');
            const player = gameState.players.find(p => p.id === gameState.boxes[i]);
            if (player) {
                box.innerHTML += `<div class="player-tag">${player.name}</div>`;
            }
        } else if (gameState.extraBoxes[i]) {
            box.classList.add('taken');
            const player = gameState.players.find(p => p.id === gameState.extraBoxes[i]);
            if (player) {
                box.innerHTML += `<div class="player-tag">${player.name} (Extra)</div>`;
            }
        }
        
        // Caja seleccionada por mí (pendiente de aprobación)
        if (gameState.currentPlayer && gameState.currentPlayer.selectedBox === i && !gameState.currentPlayer.approved) {
            box.classList.add('pending');
            box.innerHTML += `<div class="player-tag">⏳ ${gameState.currentPlayer.name}</div>`;
        }
        
        // Caja confirmada por mí
        if (gameState.currentPlayer && gameState.currentPlayer.box === i) {
            box.classList.add('selected');
        }
        
        // Caja extra mía
        if (gameState.currentPlayer && gameState.currentPlayer.extraBox === i) {
            box.classList.add('extra-selected');
        }
        
        // Ganadora
        if (gameState.winningBox === i) {
            if (gameState.winner) {
                box.classList.add('winner');
            } else {
                box.classList.add('empty-winner');
            }
        }
        
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
            let status = '';
            if (p.box) status = 'ready';
            if (gameState.currentPlayer && p.id === gameState.currentPlayer.id) status += ' mine';
            return `
                <div class="player-chip ${status}">
                    ${p.name} ${p.box ? '✓' : ''} ${p.extraBox ? '⭐' : ''}
                    ${!p.approved && p.selectedBox ? '⏳' : ''}
                </div>
            `;
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

// FLUJO PRINCIPAL: Tocar caja → Modal de pago
function selectBox(boxNumber) {
    // Si el juego terminó, no hacer nada (esperar a que vuelvan a jugar)
    if (gameState.status === 'FINISHED') {
        showNotification('La ronda terminó. Esperá una nueva.', 'warning');
        return;
    }
    
    if (gameState.status !== 'OPEN') {
        showNotification('La sala está cerrada', 'error');
        return;
    }
    
    // Si la caja está tomada, no hacer nada
    if (gameState.boxes[boxNumber] || gameState.extraBoxes[boxNumber]) {
        showNotification('Esa caja ya fue elegida', 'error');
        return;
    }
    
    // Si hay un jugador pendiente en esa caja
    const pendingPlayer = gameState.players.find(p => p.selectedBox === boxNumber && !p.approved);
    if (pendingPlayer) {
        showNotification('Esa caja está pendiente de aprobación', 'warning');
        return;
    }
    
    // Si no hay jugador actual, abrir modal de pago
    if (!gameState.currentPlayer) {
        gameState.selectedBox = boxNumber;
        openPaymentModal();
        return;
    }
    
    // Si hay jugador pero no aprobado, mostrar espera
    if (!gameState.currentPlayer.approved) {
        showNotification('Esperando confirmación de pago...', 'warning');
        return;
    }
    
    // Si está aprobado pero no confirmó caja principal
    if (!gameState.currentPlayer.box) {
        gameState.selectedBox = boxNumber;
        renderBoxes();
        document.getElementById('confirmBtn').classList.remove('hidden');
        return;
    }
    
    // Si ya tiene caja principal, intentar caja extra
    if (gameState.currentPlayer.hasExtra && !gameState.currentPlayer.extraBox) {
        submitExtraBoxSelection(boxNumber);
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
    // No limpiar selectedBox para que pueda volver a intentar
}

function copyAlias() {
    navigator.clipboard.writeText(gameState.config.alias).then(() => {
        showNotification('Alias copiado: ' + gameState.config.alias, 'success');
    });
}

async function submitTransfer() {
    const name = document.getElementById('playerName').value.trim();
    const operationId = document.getElementById('operationId').value.trim();
    
    if (!name) {
        showNotification('Ingresá tu nombre', 'error');
        return;
    }
    if (!operationId || operationId.length < 4) {
        showNotification('Ingresá el número de operación', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/request-entry`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                operationId,
                boxNumber: gameState.selectedBox
            })
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
            body: JSON.stringify({
                playerId: gameState.currentPlayer.id,
                boxNumber: gameState.selectedBox
            })
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
            body: JSON.stringify({
                playerId: gameState.currentPlayer.id,
                boxNumber: boxNumber
            })
        });
        
        if (response.ok) {
            gameState.currentPlayer.extraBox = boxNumber;
            showNotification('¡Caja extra seleccionada! ⭐', 'success');
            await fetchGameState();
        } else {
            showNotification('Error al seleccionar caja extra', 'error');
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
    
    if (!operationId) {
        showNotification('Ingresá el número de operación', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/request-extra`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                playerId: gameState.currentPlayer.id,
                operationId
            })
        });
        
        if (response.ok) {
            closeExtraModal();
            showNotification('Solicitud de caja extra enviada', 'info');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

function playAgain() {
    // Limpiar todo y empezar de nuevo
    localStorage.removeItem('currentPlayer');
    gameState.currentPlayer = null;
    gameState.selectedBox = null;
    gameState.resultShown = false;
    
    document.getElementById('resultScreen').classList.remove('active');
    document.getElementById('playAgainBtn').classList.add('hidden');
    document.getElementById('extraBtn').classList.add('hidden');
    document.getElementById('confirmBtn').classList.add('hidden');
    
    // Recargar para limpiar estado
    location.reload();
}

function showResult(winner, winningBox, prize) {
    const screen = document.getElementById('resultScreen');
    const title = document.getElementById('resultTitle');
    const content = document.getElementById('resultContent');
    
    screen.classList.add('active');
    
    // Mostrar botón de volver a jugar
    document.getElementById('playAgainBtn').classList.remove('hidden');
    
    if (winner) {
        title.textContent = '🎉 ¡Tenemos un Ganador!';
        content.innerHTML = `
            <div class="winner-name">${winner.name}</div>
            <div class="prize-amount">$${prize.toLocaleString()}</div>
            <p>¡Se lleva el pozo acumulado!</p>
        `;
        createConfetti();
    } else {
        title.textContent = '😔 Sin Ganador';
        content.innerHTML = `
            <div class="no-winner">Nadie eligió la caja ganadora</div>
            <div class="accumulated-message">
                💰 El pozo se acumula para la próxima ronda
            </div>
        `;
    }
}

function createConfetti() {
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        confetti.style.animationDelay = Math.random() * 2 + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
    }
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 15px 30px;
        border-radius: 30px;
        color: white;
        font-weight: bold;
        z-index: 9999;
        animation: fadeInDown 0.3s ease;
        ${type === 'error' ? 'background: #ef4444;' : 
          type === 'success' ? 'background: #10b981;' : 
          type === 'warning' ? 'background: #f59e0b;' :
          'background: #6366f1;'}
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}