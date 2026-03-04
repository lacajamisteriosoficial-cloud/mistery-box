const API_URL = window.location.origin + '/api';

let gameState = {
    status: 'OPEN',
    players: [],
    boxes: {},
    extraBoxes: {},
    jackpot: 0,
    roundFund: 0,
    pendingTransfers: [],
    config: {
        entryPrice: 500,
        extraPrice: 1000,
        minPlayers: 5,
        maxPlayers: 10,
        totalBoxes: 20,
        commissionPercent: 20,
        countdownTime: 3,
        alias: 'elnomad.mp',
        schedule: {
            enabled: false,
            openHour: 0,
            closeHour: 23
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    startPolling();
    initViewerStream();
});

function init() {
    renderBoxes();
    updateDisplay();
    updateConfigDisplay();
}

// ── Viewer Stream ────────────────────────────────────────────────────
function initViewerStream() {
    const viewerStream = new EventSource('/api/viewers/admin-stream');

    viewerStream.onmessage = (event) => {
        const { viewers } = JSON.parse(event.data);

        // Actualizar número en el badge
        const countEl = document.getElementById('viewerCount');
        if (countEl) countEl.textContent = viewers;

        const badge = document.querySelector('.live-badge-admin');
        if (!badge) return;

        if (viewers === 0) {
            // Badge rojo intenso
            badge.style.background = 'rgba(239,68,68,0.35)';
            badge.style.borderColor = 'rgba(239,68,68,0.9)';

            // Mostrar alerta y banner solo la primera vez que llega a 0
            if (!badge.dataset.alertShown) {
                badge.dataset.alertShown = 'true';
                showNotification('⚠️ No hay espectadores — podés cerrar el pozo', 'warning');

                // Banner persistente abajo al centro
                if (!document.getElementById('noViewersBanner')) {
                    const banner = document.createElement('div');
                    banner.id = 'noViewersBanner';
                    banner.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: linear-gradient(135deg, #7f1d1d, #ef4444);
                        color: white;
                        padding: 14px 28px;
                        border-radius: 12px;
                        font-weight: bold;
                        font-size: 1em;
                        z-index: 9999;
                        border: 2px solid rgba(255,255,255,0.3);
                        box-shadow: 0 0 25px rgba(239,68,68,0.6);
                        animation: blink 1.5s infinite;
                        text-align: center;
                        white-space: nowrap;
                    `;
                    banner.innerHTML = '👁️ Sin espectadores en vivo — Pozo aún abierto';
                    document.body.appendChild(banner);
                }
            }
        } else {
            // Volvió alguien — resetear todo
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.borderColor = 'rgba(239,68,68,0.5)';
            badge.dataset.alertShown = '';

            const banner = document.getElementById('noViewersBanner');
            if (banner) banner.remove();
        }
    };

    viewerStream.onerror = () => {}; // reconecta automáticamente
}
// ─────────────────────────────────────────────────────────────────────

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
        
        gameState = {...gameState, ...data};
        
        if (data.countdownEnd && gameState.status === 'COUNTDOWN') {
            updateTimer(data.countdownEnd);
        }
        
        updateDisplay();
        renderBoxes();
        updateStatus(gameState.status);
        updateStats();
        updatePendingBadge();

        if (gameState.status === 'FINISHED') {
            showResultInfo(data.winner, data.winningBox, data.prize);
        } else {
            hideResultInfo();
        }
        if (data.winnersHistory) {
            renderWinnersHistory(data.winnersHistory);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

function showResultInfo(winner, winningBox, prize) {
    let infoDiv = document.getElementById('resultInfo');
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'resultInfo';
        infoDiv.style.cssText = `
            margin: 20px;
            padding: 20px;
            border-radius: 15px;
            text-align: center;
            font-size: 1.1em;
            border: 2px solid;
        `;
        document.body.insertBefore(infoDiv, document.body.firstChild);
    }

    if (winner) {
        infoDiv.style.background = 'rgba(16, 185, 129, 0.2)';
        infoDiv.style.borderColor = '#10b981';
        infoDiv.innerHTML = `
            🎉 <strong>GANADOR: ${winner.name}</strong> — Premio: $${prize ? prize.toLocaleString() : 0}
            <br>📲 Transferir a: <strong style="font-size:1.1em;color:#fbbf24">${winner.mpAlias || '—'}</strong>
            <br><small>Caja ganadora: ${winningBox}</small>
        `;
    } else {
        infoDiv.style.background = 'rgba(245, 158, 11, 0.2)';
        infoDiv.style.borderColor = '#f59e0b';
        infoDiv.innerHTML = `
            😔 <strong>SIN GANADOR</strong> — Caja ganadora: ${winningBox || '?'}
            <br><small>💰 Pozo acumulado: $${gameState.jackpot ? gameState.jackpot.toLocaleString() : 0}</small>
        `;
    }
}

function hideResultInfo() {
    const infoDiv = document.getElementById('resultInfo');
    if (infoDiv) infoDiv.remove();
}

function updateConfigDisplay() {
    document.getElementById('entryPriceDisplay').textContent = gameState.config.entryPrice;
    document.getElementById('maxPlayersDisplay').textContent = gameState.config.maxPlayers;
    document.getElementById('jackpotAmount').textContent = gameState.jackpot.toLocaleString();
    
    document.getElementById('configEntryPrice').value = gameState.config.entryPrice;
    document.getElementById('configExtraPrice').value = gameState.config.extraPrice;
    document.getElementById('configMinPlayers').value = gameState.config.minPlayers;
    document.getElementById('configMaxPlayers').value = gameState.config.maxPlayers;
    document.getElementById('configTotalBoxes').value = gameState.config.totalBoxes;
    document.getElementById('configCommission').value = gameState.config.commissionPercent;
    document.getElementById('configCloseTime').value = gameState.config.countdownTime;
    document.getElementById('configAlias').value = gameState.config.alias;
    const cmEl = document.getElementById('configClosedMessage');
    if (cmEl) cmEl.value = gameState.config.closedMessage || '';
    
    if (gameState.config.schedule) {
        document.getElementById('scheduleEnabled').checked = gameState.config.schedule.enabled;
        document.getElementById('scheduleOpen').value = gameState.config.schedule.openHour;
        document.getElementById('scheduleClose').value = gameState.config.schedule.closeHour;
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
        
        const pending = gameState.players.find(p => p.selectedBox === i && !p.approved);
        if (pending) {
            box.classList.add('pending');
            box.innerHTML += `<div class="player-tag">⏳ ${pending.name}</div>`;
        }
        
        if (gameState.winningBox === i) {
            if (gameState.winner) {
                box.classList.add('winner');
            } else {
                box.classList.add('empty-winner');
            }
        }
        
        grid.appendChild(box);
    }
}

function updateDisplay() {
    document.getElementById('jackpotAmount').textContent = gameState.jackpot.toLocaleString();
    document.getElementById('playerCount').textContent = gameState.players.length;
    
    const list = document.getElementById('playersList');
    if (gameState.players.length === 0) {
        list.innerHTML = '<p style="opacity: 0.6; width: 100%; text-align: center;">No hay jugadores todavía...</p>';
    } else {
        list.innerHTML = gameState.players.map(p => `
            <div class="player-chip ${p.box ? 'ready' : ''}">
                ${p.name} ${p.box ? '✓' : ''} ${p.extraBox ? '⭐' : ''}
                ${!p.approved && p.selectedBox ? '<span style="color: var(--accent);">⏳</span>' : ''}
            </div>
        `).join('');
    }
}

function updateStats() {
    const totalCollected = gameState.roundFund;
    const commission = totalCollected * (gameState.config.commissionPercent / 100);
    const pending = gameState.pendingTransfers ? gameState.pendingTransfers.filter(t => !t.approved).length : 0;
    const confirmed = gameState.players.filter(p => p.approved).length;
    
    document.getElementById('totalCollected').textContent = '$' + totalCollected.toLocaleString();
    document.getElementById('commission').textContent = '$' + Math.floor(commission).toLocaleString();
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('confirmedPlayers').textContent = confirmed;
}

function updatePendingBadge() {
    const pending = gameState.pendingTransfers ? gameState.pendingTransfers.filter(t => !t.approved).length : 0;
    document.getElementById('pendingBadge').textContent = pending;
}

function updateTimer(countdownEnd) {
    const now = Date.now();
    const remaining = Math.max(0, countdownEnd - now);
    const seconds = Math.ceil(remaining / 1000);
    document.getElementById('timerDisplay').textContent = `00:0${seconds}`;
}

async function saveConfig() {
    const newConfig = {
        entryPrice: parseInt(document.getElementById('configEntryPrice').value),
        extraPrice: parseInt(document.getElementById('configExtraPrice').value),
        minPlayers: parseInt(document.getElementById('configMinPlayers').value),
        maxPlayers: parseInt(document.getElementById('configMaxPlayers').value),
        totalBoxes: parseInt(document.getElementById('configTotalBoxes').value),
        commissionPercent: parseInt(document.getElementById('configCommission').value),
        countdownTime: parseInt(document.getElementById('configCloseTime').value),
        alias: document.getElementById('configAlias').value,
        closedMessage: document.getElementById('configClosedMessage').value,
        schedule: {
            enabled: document.getElementById('scheduleEnabled').checked,
            openHour: parseInt(document.getElementById('scheduleOpen').value),
            closeHour: parseInt(document.getElementById('scheduleClose').value)
        }
    };
    
    try {
        const response = await fetch(`${API_URL}/config`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newConfig)
        });
        
        if (response.ok) {
            gameState.config = {...gameState.config, ...newConfig};
            updateConfigDisplay();
            showNotification('Configuración guardada ✅', 'success');
        } else {
            showNotification('Error al guardar', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function forceStart() {
    try {
        const response = await fetch(`${API_URL}/force-start`, {method: 'POST'});
        if (response.ok) {
            showNotification('Inicio forzado', 'success');
        }
    } catch (error) {
        showNotification('Error', 'error');
    }
}

async function resetGame() {
    if (!confirm('¿Resetear todo? Se perderá el pozo acumulado.')) return;
    
    try {
        const response = await fetch(`${API_URL}/reset`, {method: 'POST'});
        if (response.ok) {
            showNotification('Juego reseteado', 'success');
            location.reload();
        }
    } catch (error) {
        showNotification('Error', 'error');
    }
}

function togglePendingTransfers() {
    document.getElementById('pendingTransfers').classList.toggle('active');
    renderPendingTransfers();
}

function renderPendingTransfers() {
    const list = document.getElementById('transfersList');
    const pending = gameState.pendingTransfers ? gameState.pendingTransfers.filter(t => !t.approved) : [];
    
    if (pending.length === 0) {
        list.innerHTML = '<p style="text-align: center; opacity: 0.6;">No hay pagos pendientes</p>';
        return;
    }
    
    list.innerHTML = pending.map(t => `
        <div class="transfer-card">
            <div class="amount">$${t.amount} - ${t.type === 'entry' ? 'Entrada' : 'Extra'}</div>
            <div style="font-size: 0.9em; margin: 5px 0;">
                <strong>${t.name}</strong><br>
                Caja: ${t.boxNumber || '-'}<br>
                Op: ${t.operationId}
            </div>
            <div class="transfer-actions">
                <button class="btn-small btn-approve" onclick="approveTransfer('${t.id}')">✅ Aprobar</button>
                <button class="btn-small btn-reject" onclick="rejectTransfer('${t.id}')">❌ Rechazar</button>
            </div>
        </div>
    `).join('');
}

async function approveTransfer(transferId) {
    try {
        const response = await fetch(`${API_URL}/approve-transfer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({transferId})
        });
        
        if (response.ok) {
            showNotification('Transferencia aprobada ✅', 'success');
            await fetchGameState();
            renderPendingTransfers();
        }
    } catch (error) {
        showNotification('Error', 'error');
    }
}

async function rejectTransfer(transferId) {
    try {
        const response = await fetch(`${API_URL}/reject-transfer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({transferId})
        });
        
        if (response.ok) {
            showNotification('Transferencia rechazada', 'info');
            await fetchGameState();
            renderPendingTransfers();
        }
    } catch (error) {
        showNotification('Error', 'error');
    }
}

function renderWinnersHistory(history) {
    const container = document.getElementById('winnersHistoryList');
    if (!container) return;
    if (!history || history.length === 0) {
        container.innerHTML = '<p style="opacity:0.5;text-align:center;">Aún no hay ganadores en esta sesión...</p>';
        return;
    }
    container.innerHTML = history.map(w => {
        const date = new Date(w.timestamp);
        const timeStr = date.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
        const transferred = w.transferred;
        return `
        <div style="background:rgba(255,255,255,0.07);border-radius:12px;padding:15px;margin-bottom:12px;border-left:4px solid ${transferred ? '#10b981' : '#f59e0b'};">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-size:1.1em;font-weight:bold;">🏆 ${w.name}</div>
                    <div style="margin:4px 0;">📲 Alias MP: <strong style="color:#fbbf24;font-size:1.05em;">${w.mpAlias}</strong></div>
                    <div style="font-size:1.3em;color:#10b981;font-weight:bold;">$${w.prize.toLocaleString()}</div>
                    <div style="font-size:0.8em;opacity:0.6;">Caja #${w.winningBox} — ${timeStr}</div>
                </div>
                <div style="text-align:right;">
                    ${transferred
                        ? '<span style="background:#10b981;padding:6px 14px;border-radius:20px;font-size:0.85em;font-weight:bold;">✅ Transferido</span>'
                        : `<button onclick="markTransferred('${w.roundId}')" style="background:#f59e0b;color:#1f2937;border:none;padding:8px 16px;border-radius:20px;cursor:pointer;font-weight:bold;font-size:0.9em;">💸 Marcar como transferido</button>`
                    }
                </div>
            </div>
        </div>`;
    }).join('');
}

async function markTransferred(roundId) {
    try {
        const r = await fetch('/api/mark-transferred', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({roundId})
        });
        if (r.ok) {
            showNotification('✅ Marcado como transferido', 'success');
            await fetchGameState();
        }
    } catch(e) {
        showNotification('Error', 'error');
    }
}

function nextRound() {
    hideResultInfo();
    fetchGameState();
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
          type === 'warning' ? 'background: #f59e0b; color: #1f2937;' :
          'background: #6366f1;'}
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
// ══════════════════════════════════════════════════════════════
// CHAT ADMIN
// ══════════════════════════════════════════════════════════════
let chatPanelOpen = false;
let chatSessions = [];
let activeSessionId = null;
let chatAdminStream = null;
let chatNewMsgCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    initAdminChat();
});

function initAdminChat() {
    if (chatAdminStream) chatAdminStream.close();
    chatAdminStream = new EventSource('/api/chat/admin-stream');
    chatAdminStream.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const prevCount = chatSessions.reduce((acc, s) => acc + (s.waitingReply ? 1 : 0), 0);
        chatSessions = data.sessions || [];
        const newCount = chatSessions.reduce((acc, s) => acc + (s.waitingReply ? 1 : 0), 0);

        renderConvList();
        if (activeSessionId) renderActiveConv();

        // Badge de notificación
        if (newCount > 0) {
            const badge = document.getElementById('chatNotifBadge');
            badge.textContent = newCount;
            badge.classList.add('show');
            if (newCount > prevCount && !chatPanelOpen) {
                showNotification(`💬 Nuevo mensaje de jugador`, 'info');
            }
        } else {
            document.getElementById('chatNotifBadge').classList.remove('show');
        }
    };
    chatAdminStream.onerror = () => {};
}

function toggleChatPanel() {
    chatPanelOpen = !chatPanelOpen;
    document.getElementById('chatSidePanel').classList.toggle('open', chatPanelOpen);
    if (chatPanelOpen) {
        document.getElementById('chatNotifBadge').classList.remove('show');
    }
}

function renderConvList() {
    const list = document.getElementById('chatConvList');
    if (!chatSessions.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#8696a0;font-size:0.85em;">No hay conversaciones aún...</div>';
        return;
    }
    list.innerHTML = chatSessions.map(s => {
        const lastMsg = s.messages.length ? s.messages[s.messages.length - 1] : null;
        const preview = lastMsg ? lastMsg.text.substring(0, 35) + (lastMsg.text.length > 35 ? '...' : '') : 'Sin mensajes';
        const time = lastMsg ? new Date(lastMsg.ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}) : '';
        const isActive = s.sessionId === activeSessionId;
        const hasPending = s.waitingReply && !s.closed;
        return `
        <div class="chat-conv-item ${isActive ? 'active' : ''} ${!s.open ? 'chat-conv-closed' : ''}"
             onclick="selectConv('${s.sessionId}')">
            <div class="chat-conv-avatar">
                👤
                ${hasPending ? '<div class="chat-conv-unread-dot"></div>' : ''}
            </div>
            <div class="chat-conv-info">
                <div class="chat-conv-name">${escapeAdminHtml(s.name)} ${!s.open ? '🔒' : ''}</div>
                <div class="chat-conv-preview">${escapeAdminHtml(preview)}</div>
            </div>
            <div class="chat-conv-time">${time}</div>
        </div>`;
    }).join('');
}

function selectConv(sessionId) {
    activeSessionId = sessionId;
    renderConvList();
    renderActiveConv();
    document.getElementById('chatEmptyState').style.display = 'none';
    document.getElementById('chatActiveConv').style.display = 'flex';
    setTimeout(() => {
        const msgs = document.getElementById('chatAdminMessages');
        msgs.scrollTop = msgs.scrollHeight;
        document.getElementById('chatAdminInput').focus();
    }, 50);
}

function renderActiveConv() {
    const session = chatSessions.find(s => s.sessionId === activeSessionId);
    if (!session) return;

    document.getElementById('chatActivePlayerName').textContent = '👤 ' + session.name;
    const container = document.getElementById('chatAdminMessages');
    container.innerHTML = '';

    if (!session.messages.length) {
        container.innerHTML = '<div style="text-align:center;color:#8696a0;font-size:0.8em;padding:20px;">Sin mensajes aún</div>';
    }

    session.messages.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${m.from === 'admin' ? 'player' : 'admin'}`;
        const time = new Date(m.ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
        const label = m.from === 'admin' ? '🛡️ Vos' : `👤 ${session.name}`;
        bubble.innerHTML = `<div style="font-size:0.7em;opacity:0.6;margin-bottom:3px;">${label}</div>${escapeAdminHtml(m.text)}<div class="chat-bubble-time">${time}</div>`;
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;

    // Input habilitado solo si la conv está abierta
    const input = document.getElementById('chatAdminInput');
    input.disabled = !session.open;
    input.placeholder = session.open ? 'Escribí tu respuesta...' : 'Conversación cerrada';
}

async function adminSendReply() {
    const input = document.getElementById('chatAdminInput');
    const text = input.value.trim();
    if (!text || !activeSessionId) return;
    input.value = '';
    try {
        const r = await fetch('/api/chat/reply', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: activeSessionId, text })
        });
        if (!r.ok) showNotification('Error al enviar respuesta', 'error');
    } catch(e) {
        showNotification('Error de conexión', 'error');
    }
}

async function closeChatConv() {
    if (!activeSessionId) return;
    if (!confirm('¿Cerrar esta conversación? El jugador no podrá seguir escribiendo.')) return;
    try {
        await fetch('/api/chat/close', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: activeSessionId })
        });
        showNotification('Conversación cerrada', 'info');
    } catch(e) {
        showNotification('Error', 'error');
    }
}

function escapeAdminHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}