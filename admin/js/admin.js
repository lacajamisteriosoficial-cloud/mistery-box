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
        alias: 'caja.misteriosa.mp',
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
        checkAdminPlayersNeeded(data);
        updateMobileDisplay(data);

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
        // Actualizar vista mobile
        renderMobChatConvList();
        if (activeSessionId && typeof isMobile === 'function' && isMobile()) renderMobActiveConv();

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

    // Input y botones según estado
    const input = document.getElementById('chatAdminInput');
    input.disabled = !session.open;
    input.placeholder = session.open ? 'Escribí tu respuesta...' : 'Conversación bloqueada';
    const btnReopen = document.getElementById('chatBtnReopen');
    const btnClose  = document.getElementById('chatBtnClose');
    if (btnReopen) btnReopen.classList.toggle('hidden', session.open);
    if (btnClose)  btnClose.classList.toggle('hidden', !session.open);
}

async function adminSendReply() {
    const desktopInput = document.getElementById('chatAdminInput');
    const mobileInput  = document.getElementById('mChatInput');
    const input = (typeof isMobile === 'function' && isMobile()) ? mobileInput : desktopInput;
    const text = input ? input.value.trim() : '';
    if (!text || !activeSessionId) return;
    if (desktopInput) desktopInput.value = '';
    if (mobileInput)  mobileInput.value  = '';
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

async function reopenChatConv() {
    if (!activeSessionId) return;
    try {
        await fetch('/api/chat/reopen', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: activeSessionId })
        });
        showNotification('🔓 Conversación reabierta', 'success');
    } catch(e) { showNotification('Error', 'error'); }
}

async function deleteChatConv() {
    if (!activeSessionId) return;
    if (!confirm('¿Eliminar esta conversación? No se puede deshacer.')) return;
    try {
        await fetch('/api/chat/delete', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: activeSessionId })
        });
        activeSessionId = null;
        document.getElementById('chatActiveConv').style.display = 'none';
        document.getElementById('chatEmptyState').style.display = 'flex';
        showNotification('🗑️ Conversación eliminada', 'info');
    } catch(e) { showNotification('Error', 'error'); }
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


// ══════════════════════════════════════════════════════════════
// BANNER JUGADORES NECESARIOS — ADMIN
// ══════════════════════════════════════════════════════════════
function checkAdminPlayersNeeded(data) {
    const approved = (data.players || []).filter(p => p.approved && p.box).length;
    const min = data.config ? data.config.minPlayers : 2;
    const needed = Math.max(0, min - approved);
    let banner = document.getElementById('adminPlayersNeededBanner');

    if (data.status === 'OPEN' && needed > 0) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'adminPlayersNeededBanner';
            banner.style.cssText = `
                background: linear-gradient(135deg, rgba(99,102,241,0.9), rgba(124,58,237,0.9));
                border: 1.5px solid rgba(167,139,250,0.5);
                border-radius: 12px; padding: 12px 20px;
                margin-bottom: 15px; text-align: center;
                font-weight: 700; font-size: 0.95em;
                animation: fadeInDown 0.4s ease;
            `;
            // Insertar arriba del status-bar
            const statusBar = document.querySelector('.status-bar');
            if (statusBar) statusBar.parentNode.insertBefore(banner, statusBar);
        }
        const emoji = needed === 1 ? '🔥' : '👥';
        banner.innerHTML = needed === 1
            ? `${emoji} ¡Falta <strong>1 jugador confirmado</strong> para que arranque el sorteo!`
            : `${emoji} Faltan <strong>${needed} jugadores</strong> confirmados para arrancar (${approved}/${min})`;
        banner.style.display = 'block';
    } else if (banner) {
        banner.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════════════════
// VISTA MOBILE
// ══════════════════════════════════════════════════════════════
const isMobile = () => window.innerWidth <= 768;
let mobActiveTab = 'pagos';

function mobTab(tab) {
    mobActiveTab = tab;
    // Secciones
    ['pagos','sala','resultado','config','chat'].forEach(t => {
        const sec = document.getElementById('sec' + t.charAt(0).toUpperCase() + t.slice(1));
        if (sec) sec.classList.toggle('active', t === tab);
        const tabBtn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (tabBtn) tabBtn.classList.toggle('active', t === tab);
        const navBtn = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
        if (navBtn) navBtn.classList.toggle('active', t === tab);
    });
    // Chat mobile: si va al tab chat, abrir panel desktop en mobile de otra manera
    if (tab === 'chat') renderMobChatConvList();
}

function updateMobileDisplay(data) {
    if (!isMobile()) return;

    // Header
    setText('mJackpotAmount', (data.jackpot||0).toLocaleString());
    setText('mPlayerCount', (data.players||[]).length);
    setText('mMaxPlayers', data.config?.maxPlayers || 10);
    setText('mEntryPrice', data.config?.entryPrice || 500);
    const statuses = {OPEN:'ESPERANDO',COUNTDOWN:'SORTEANDO...',CLOSED:'CERRADA',FINISHED:'TERMINADA'};
    setText('mStatusText', statuses[data.status] || data.status);
    setText('mViewerCount', viewerConnections || 0);

    // Stats
    const fund = data.roundFund || 0;
    const comm = data.config ? fund * (data.config.commissionPercent/100) : 0;
    setText('mTotalCollected', '$' + fund.toLocaleString());
    setText('mCommission', '$' + Math.floor(comm).toLocaleString());
    const pending = (data.pendingTransfers||[]).filter(t=>!t.approved).length;
    const confirmed = (data.players||[]).filter(p=>p.approved).length;
    setText('mConfirmed', confirmed);
    setText('mPending', pending);

    // Badge pagos
    const pagosBadge = document.getElementById('mPagosBadge');
    if (pagosBadge) { pagosBadge.textContent = pending; pagosBadge.classList.toggle('show', pending > 0); }
    const navDotPagos = document.getElementById('mNavDotPagos');
    if (navDotPagos) navDotPagos.classList.toggle('show', pending > 0);

    // Transfers
    renderMobTransfers(data.pendingTransfers || []);

    // Jugadores
    renderMobPlayers(data.players || []);

    // Resultado
    renderMobResultado(data);

    // Historial
    renderMobWinnersHistory(data.winnersHistory || []);

    // Config
    syncMobConfig(data.config || {});
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderMobTransfers(transfers) {
    const list = document.getElementById('mTransfersList');
    if (!list) return;
    const pending = transfers.filter(t => !t.approved);
    if (!pending.length) {
        list.innerHTML = '<p style="opacity:0.5;text-align:center;font-size:0.9em;padding:8px 0;">No hay pagos pendientes ✅</p>';
        return;
    }
    list.innerHTML = pending.map(t => `
        <div class="mob-transfer-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div class="mob-transfer-name">${escapeAdminHtml(t.name)}</div>
                    <div class="mob-transfer-amount">$${t.amount?.toLocaleString()} — ${t.type==='entry'?'Entrada':'Extra'}</div>
                    <div class="mob-transfer-detail">📦 Caja ${t.boxNumber||'-'} · Op: ${t.operationId}</div>
                    ${t.mpAlias ? `<div class="mob-transfer-detail">📲 MP: ${escapeAdminHtml(t.mpAlias)}</div>` : ''}
                </div>
            </div>
            <div class="mob-transfer-btns">
                <button class="mob-approve-btn mob-approve" onclick="approveTransfer('${t.id}')">✅ Aprobar</button>
                <button class="mob-approve-btn mob-reject"  onclick="rejectTransfer('${t.id}')">❌ Rechazar</button>
            </div>
        </div>
    `).join('');
}

function renderMobPlayers(players) {
    const list = document.getElementById('mPlayersList');
    if (!list) return;
    if (!players.length) {
        list.innerHTML = '<p style="opacity:0.5;text-align:center;font-size:0.9em;padding:8px 0;">No hay jugadores todavía...</p>';
        return;
    }
    list.innerHTML = players.map(p => `
        <div class="mob-player-row">
            <div>
                <div class="mob-player-name">${escapeAdminHtml(p.name)}</div>
                <div class="mob-player-status">Caja ${p.box||'—'} ${p.extraBox?'· Extra '+p.extraBox:''}</div>
            </div>
            <span class="mob-player-badge ${p.approved?'mob-badge-ok':'mob-badge-wait'}">
                ${p.approved ? (p.box?'✓ Listo':'✓ Aprobado') : '⏳ Pendiente'}
            </span>
        </div>
    `).join('');
}

function renderMobResultado(data) {
    const el = document.getElementById('mResultadoContent');
    if (!el) return;
    const badge = document.getElementById('mResultBadge');

    if (data.status === 'FINISHED') {
        if (badge) { badge.textContent = '!'; badge.classList.add('show'); }
        if (data.winner) {
            el.innerHTML = `
                <div class="mob-winner-card">
                    <div style="font-size:2em;">🎉</div>
                    <div class="mob-winner-name">${escapeAdminHtml(data.winner.name)}</div>
                    <div class="mob-winner-prize">$${(data.prize||0).toLocaleString()}</div>
                    <div class="mob-winner-alias">📲 Transferir a: <strong style="color:#fbbf24">${escapeAdminHtml(data.winner.mpAlias||'—')}</strong></div>
                    <div style="font-size:0.8em;opacity:0.5;margin-top:6px;">Caja ganadora: #${data.winningBox}</div>
                    ${!data.winner.transferred ? `<button class="mob-btn mob-btn-green" style="margin-top:14px;width:100%;padding:12px;" onclick="markTransferred('${data.winner.id}')">💸 Marcar transferido</button>` : '<div style="color:#10b981;margin-top:10px;font-weight:700;">✅ Ya transferido</div>'}
                </div>`;
        } else {
            el.innerHTML = `
                <div class="mob-winner-card" style="border-color:rgba(245,158,11,0.4);">
                    <div style="font-size:2em;">😔</div>
                    <div style="font-size:1.2em;font-weight:800;margin:8px 0;">Sin ganador</div>
                    <div style="color:#fbbf24;font-size:1.3em;font-weight:900;">Pozo acumulado: $${(data.jackpot||0).toLocaleString()}</div>
                    <div style="font-size:0.8em;opacity:0.5;margin-top:6px;">Caja: #${data.winningBox||'?'}</div>
                </div>`;
        }
    } else {
        if (badge) badge.classList.remove('show');
        el.innerHTML = '<p style="opacity:0.5;text-align:center;font-size:0.9em;padding:20px;">La ronda no terminó todavía...</p>';
    }
}

function renderMobWinnersHistory(history) {
    const el = document.getElementById('mWinnersHistory');
    if (!el) return;
    if (!history.length) { el.innerHTML = '<p style="opacity:0.5;text-align:center;font-size:0.85em;">Sin ganadores aún...</p>'; return; }
    el.innerHTML = history.slice(0,5).map(w => {
        const time = new Date(w.timestamp).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
        return `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
            <div style="font-weight:800;">🏆 ${escapeAdminHtml(w.name)}</div>
            <div style="color:#fbbf24;font-weight:700;">$${w.prize.toLocaleString()}</div>
            <div style="font-size:0.75em;opacity:0.55;">📲 ${escapeAdminHtml(w.mpAlias)} · Caja #${w.winningBox} · ${time}
            ${w.transferred?'· <span style="color:#10b981">✅ Transferido</span>':''}</div>
            ${!w.transferred?`<button onclick="markTransferred('${w.roundId}')" style="margin-top:6px;background:#f59e0b;color:#1f2937;border:none;padding:5px 12px;border-radius:10px;font-weight:700;font-size:0.8em;cursor:pointer;">💸 Marcar transferido</button>`:''}
        </div>`;
    }).join('');
}

function syncMobConfig(config) {
    const fields = {
        mConfigEntryPrice: config.entryPrice,
        mConfigExtraPrice: config.extraPrice,
        mConfigMinPlayers: config.minPlayers,
        mConfigMaxPlayers: config.maxPlayers,
        mConfigAlias: config.alias,
        mConfigClosedMessage: config.closedMessage || '',
        mScheduleOpen: config.schedule?.openHour,
        mScheduleClose: config.schedule?.closeHour,
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    });
    const sch = document.getElementById('mScheduleEnabled');
    if (sch) sch.checked = config.schedule?.enabled || false;
}

async function mobSaveConfig() {
    const newConfig = {
        entryPrice:       parseInt(document.getElementById('mConfigEntryPrice').value),
        extraPrice:       parseInt(document.getElementById('mConfigExtraPrice').value),
        minPlayers:       parseInt(document.getElementById('mConfigMinPlayers').value),
        maxPlayers:       parseInt(document.getElementById('mConfigMaxPlayers').value),
        alias:            document.getElementById('mConfigAlias').value,
        closedMessage:    document.getElementById('mConfigClosedMessage').value,
        schedule: {
            enabled:   document.getElementById('mScheduleEnabled').checked,
            openHour:  parseInt(document.getElementById('mScheduleOpen').value),
            closeHour: parseInt(document.getElementById('mScheduleClose').value)
        }
    };
    try {
        const r = await fetch(`${API_URL}/config`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(newConfig)
        });
        if (r.ok) { showNotification('✅ Configuración guardada','success'); }
        else showNotification('Error al guardar','error');
    } catch(e) { showNotification('Error de conexión','error'); }
}

// Chat mobile
function renderMobChatConvList() {
    const list = document.getElementById('mChatConvList');
    if (!list) return;
    if (!chatSessions.length) {
        list.innerHTML = '<p style="opacity:0.5;text-align:center;font-size:0.85em;padding:10px 0;">Sin mensajes aún...</p>';
        return;
    }
    list.innerHTML = chatSessions.map(s => {
        const last = s.messages.length ? s.messages[s.messages.length-1] : null;
        const preview = last ? last.text.substring(0,40) : 'Sin mensajes';
        const time = last ? new Date(last.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
        return `<div class="mob-player-row" style="cursor:pointer;" onclick="mobSelectConv('${s.sessionId}')">
            <div>
                <div class="mob-player-name">${escapeAdminHtml(s.name)} ${!s.open?'🔒':''}</div>
                <div class="mob-player-status">${escapeAdminHtml(preview)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.7em;opacity:0.5;">${time}</div>
                ${s.waitingReply?'<div style="width:8px;height:8px;background:#25d366;border-radius:50%;margin:4px auto 0;"></div>':''}
            </div>
        </div>`;
    }).join('');

    // Badge chat en nav
    const hasNew = chatSessions.some(s => s.waitingReply);
    const navDot = document.getElementById('mNavDotChat');
    if (navDot) navDot.classList.toggle('show', hasNew);
    const chatBadge = document.getElementById('mChatBadge');
    if (chatBadge) {
        const count = chatSessions.filter(s=>s.waitingReply).length;
        chatBadge.textContent = count;
        chatBadge.classList.toggle('show', count > 0);
    }
}

function mobSelectConv(sessionId) {
    activeSessionId = sessionId;
    const convListCard = document.getElementById('mChatConvListCard');
    const activeArea = document.getElementById('mChatActive');
    if (convListCard) convListCard.style.display = 'none';
    if (activeArea) activeArea.style.display = 'flex';

    // Sincronizar input con el desktop
    const desktopInput = document.getElementById('chatAdminInput');
    const mobileInput  = document.getElementById('mChatInput');
    // Compartir la misma lógica de renderizado
    renderMobActiveConv();
    // También actualizar botones reopen/close
    const session = chatSessions.find(s=>s.sessionId===sessionId);
    if (session) {
        const btnR = document.getElementById('mChatBtnReopen');
        const btnC = document.getElementById('mChatBtnClose');
        if (btnR) btnR.classList.toggle('hidden', session.open);
        if (btnC) btnC.classList.toggle('hidden', !session.open);
    }
    document.getElementById('mChatActiveName').textContent = '👤 ' + (chatSessions.find(s=>s.sessionId===sessionId)?.name||'');
}

function renderMobActiveConv() {
    const session = chatSessions.find(s=>s.sessionId===activeSessionId);
    if (!session) return;
    const container = document.getElementById('mChatMessages');
    if (!container) return;
    container.innerHTML = '';
    session.messages.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${m.from==='admin'?'player':'admin'}`;
        const time = new Date(m.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
        bubble.innerHTML = `${escapeAdminHtml(m.text)}<div class="chat-bubble-time">${time}</div>`;
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
    const input = document.getElementById('mChatInput');
    if (input) { input.disabled = !session.open; }
}

function mobCloseChatActive() {
    document.getElementById('mChatConvListCard').style.display = 'block';
    document.getElementById('mChatActive').style.display = 'none';
    activeSessionId = null;
    renderMobChatConvList();
}

// Hook: actualizar mobile cuando llega data nueva
const _origFetchGameState = fetchGameState;
// Inyectar updateMobileDisplay en el ciclo de polling
const _origUpdateDisplay = window.updateDisplay;

// Parchar el initAdminChat para también actualizar mobile
const _origBroadcast = window.renderConvList;

// Override: después de renderizar la lista desktop, actualizar mobile también
function renderConvListWithMobile() {
    if (typeof renderConvList === 'function') renderConvList();
    renderMobChatConvList();
    if (activeSessionId && isMobile()) renderMobActiveConv();
}
