const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// ── Persistencia de config en archivo JSON ────────────────────────────
const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATE_FILE  = path.join(__dirname, 'state.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch(e) { console.error('Error leyendo config:', e); }
    return null;
}
function saveConfig(config) {
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
    catch(e) { console.error('Error guardando config:', e); }
}

// Persiste jackpot y winnersHistory (lo más crítico entre reinicios)
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch(e) {}
    return null;
}
function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            jackpot:          gameState.jackpot,
            winnersHistory:   gameState.winnersHistory,
            players:          gameState.players,
            boxes:            gameState.boxes,
            extraBoxes:       gameState.extraBoxes,
            pendingTransfers: gameState.pendingTransfers,
            roundFund:        gameState.roundFund,
            status:           gameState.status
        }, null, 2));
    } catch(e) { console.error('Error guardando estado:', e); }
}

const savedConfig = loadConfig();
const savedState  = loadState();

app.use(express.static(path.join(__dirname, '../public')));

// Protección con contraseña para el panel admin
app.use('/admin', (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
        return res.status(401).send('Acceso denegado');
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
    const [user, pass] = credentials.split(':');
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (user !== adminUser || pass !== adminPass) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
        return res.status(401).send('Acceso denegado');
    }
    next();
});
app.use('/admin', express.static(path.join(__dirname, '../admin')));

const defaultConfig = {
    entryPrice: 500,
    extraPrice: 1000,
    minPlayers: 2,
    maxPlayers: 10,
    totalBoxes: 20,
    commissionPercent: 20,
    countdownTime: 3,
    alias: 'caja.misteriosa.mp',
    closedMessage: 'Volvé pronto, el juego está pausado.',
    schedule: {
        enabled: false,
        openHour: 0,
        closeHour: 23
    }
};

let gameState = {
    status:           savedState?.status === 'OPEN' ? 'OPEN' : 'OPEN',
    players:          savedState?.players          || [],
    boxes:            savedState?.boxes            || {},
    extraBoxes:       savedState?.extraBoxes       || {},
    jackpot:          savedState?.jackpot          || 0,
    roundFund:        savedState?.roundFund        || 0,
    countdownEnd:     null,
    winner:           null,
    winningBox:       null,
    lastPrize:        null,
    pendingTransfers: savedState?.pendingTransfers || [],
    winnersHistory:   savedState?.winnersHistory   || [],
    config: savedConfig ? { ...defaultConfig, ...savedConfig } : { ...defaultConfig }
};

let timers = {};

// ── Viewer Tracker (SSE) ─────────────────────────────────────────────
let viewerConnections = [];
let adminViewerStreams = [];

function broadcastViewerCount() {
    const count = viewerConnections.length;
    const payload = `data: ${JSON.stringify({ viewers: count })}\n\n`;
    adminViewerStreams.forEach(res => { try { res.write(payload); } catch(e) {} });
    viewerConnections.forEach(res => { try { res.write(payload); } catch(e) {} });
}

app.get('/api/viewers/connect', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    viewerConnections.push(res);
    broadcastViewerCount();
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch(e) {} }, 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        viewerConnections = viewerConnections.filter(c => c !== res);
        broadcastViewerCount();
    });
});

app.get('/api/viewers/admin-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ viewers: viewerConnections.length })}\n\n`);
    adminViewerStreams.push(res);
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch(e) {} }, 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        adminViewerStreams = adminViewerStreams.filter(c => c !== res);
    });
});

function isWithinSchedule() {
    if (!gameState.config.schedule.enabled) return true;
    const now = new Date();
    const hour = now.getHours();
    return hour >= gameState.config.schedule.openHour && hour < gameState.config.schedule.closeHour;
}

app.get('/api/state', (req, res) => {
    res.json({
        status: gameState.status,
        players: gameState.players,
        boxes: gameState.boxes,
        extraBoxes: gameState.extraBoxes,
        jackpot: gameState.jackpot,
        roundFund: gameState.roundFund,
        countdownEnd: gameState.countdownEnd,
        winner: gameState.winner,
        winningBox: gameState.winningBox,
        prize: gameState.lastPrize,
        config: gameState.config,
        pendingTransfers: gameState.pendingTransfers,
        inSchedule: isWithinSchedule(),
        winnersHistory: gameState.winnersHistory
    });
});

app.get('/api/winners-history', (req, res) => {
    res.json({ winnersHistory: gameState.winnersHistory });
});

app.post('/api/request-entry', (req, res) => {
    const { name, operationId, boxNumber, mpAlias } = req.body;
    if (!isWithinSchedule()) return res.status(400).json({error: 'Fuera de horario de juego'});
    if (gameState.status !== 'OPEN') return res.status(400).json({error: 'La sala está cerrada'});
    if (gameState.players.length >= gameState.config.maxPlayers) return res.status(400).json({error: 'Sala completa'});
    if (gameState.boxes[boxNumber] || gameState.extraBoxes[boxNumber]) return res.status(400).json({error: 'Caja ocupada'});

    const player = {
        id: Date.now().toString(),
        name, mpAlias: mpAlias || '',
        box: null, extraBox: null,
        hasExtra: false, approved: false,
        selectedBox: boxNumber
    };
    const transfer = {
        id: Date.now().toString(),
        playerId: player.id, name,
        mpAlias: mpAlias || '', operationId,
        amount: gameState.config.entryPrice,
        type: 'entry', boxNumber,
        timestamp: new Date().toISOString(),
        approved: false
    };
    gameState.players.push(player);
    gameState.pendingTransfers.push(transfer);
    saveState();
    res.json({player, transfer});
});

app.post('/api/request-extra', (req, res) => {
    const { playerId, operationId } = req.body;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || player.hasExtra) return res.status(400).json({error: 'No permitido'});
    const transfer = {
        id: Date.now().toString(),
        playerId, name: player.name,
        mpAlias: player.mpAlias || '', operationId,
        amount: gameState.config.extraPrice,
        type: 'extra',
        timestamp: new Date().toISOString(),
        approved: false
    };
    gameState.pendingTransfers.push(transfer);
    res.json({transfer});
});

app.post('/api/confirm-box', (req, res) => {
    const { playerId, boxNumber } = req.body;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.approved) return res.status(400).json({error: 'No autorizado'});
    if (gameState.boxes[boxNumber]) return res.status(400).json({error: 'Caja ocupada'});
    gameState.boxes[boxNumber] = playerId;
    player.box = boxNumber;
    saveState();
    checkAllSelected();
    res.json({success: true});
});

app.post('/api/select-extra-box', (req, res) => {
    const { playerId, boxNumber } = req.body;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.hasExtra || player.extraBox) return res.status(400).json({error: 'No permitido'});
    if (gameState.boxes[boxNumber] || gameState.extraBoxes[boxNumber]) return res.status(400).json({error: 'Caja ocupada'});
    gameState.extraBoxes[boxNumber] = playerId;
    player.extraBox = boxNumber;
    res.json({success: true});
});

app.post('/api/approve-transfer', (req, res) => {
    const { transferId } = req.body;
    const transfer = gameState.pendingTransfers.find(t => t.id === transferId);
    if (!transfer) return res.status(404).json({error: 'No encontrada'});
    transfer.approved = true;
    const player = gameState.players.find(p => p.id === transfer.playerId);
    if (transfer.type === 'entry') {
        player.approved = true;
        gameState.roundFund += gameState.config.entryPrice;
    } else {
        player.hasExtra = true;
        gameState.roundFund += gameState.config.extraPrice;
    }
    saveState();
    res.json({success: true, player});
});

app.post('/api/reject-transfer', (req, res) => {
    const { transferId } = req.body;
    const transfer = gameState.pendingTransfers.find(t => t.id === transferId);
    if (transfer) {
        const player = gameState.players.find(p => p.id === transfer.playerId);
        if (player && !player.approved) {
            gameState.players = gameState.players.filter(p => p.id !== player.id);
        }
    }
    gameState.pendingTransfers = gameState.pendingTransfers.filter(t => t.id !== transferId);
    saveState();
    res.json({success: true});
});

app.post('/api/config', (req, res) => {
    gameState.config = { ...gameState.config, ...req.body };
    saveConfig(gameState.config);
    saveState();
    res.json({config: gameState.config});
});

app.post('/api/force-start', (req, res) => {
    if (gameState.status === 'OPEN') {
        startCountdown();
        res.json({success: true});
    } else {
        res.status(400).json({error: 'No se puede forzar inicio'});
    }
});

app.post('/api/reset', (req, res) => {
    resetRound(true);
    res.json({success: true});
});

app.post('/api/mark-transferred', (req, res) => {
    const { roundId } = req.body;
    const entry = gameState.winnersHistory.find(w => w.roundId === roundId);
    if (!entry) return res.status(404).json({error: 'No encontrado'});
    entry.transferred = true;
    res.json({success: true});
});

function resetRound(clearJackpot = false) {
    const jackpotToKeep = clearJackpot ? 0 : gameState.jackpot;
    // Si estamos fuera de horario, dejar en CLOSED en lugar de OPEN
    gameState.status = isWithinSchedule() ? 'OPEN' : 'CLOSED';
    gameState.players = [];
    gameState.boxes = {};
    gameState.extraBoxes = {};
    gameState.roundFund = 0;
    gameState.countdownEnd = null;
    gameState.winner = null;
    gameState.winningBox = null;
    gameState.lastPrize = null;
    gameState.pendingTransfers = [];
    gameState.jackpot = jackpotToKeep;
    if (timers.countdown) clearInterval(timers.countdown);
    if (timers.autoReset) clearTimeout(timers.autoReset);
    saveState();
}

function checkAllSelected() {
    const approvedPlayers = gameState.players.filter(p => p.approved);
    const playersWithBox = approvedPlayers.filter(p => p.box);
    if (playersWithBox.length >= gameState.config.minPlayers && gameState.status === 'OPEN') {
        if (playersWithBox.length === approvedPlayers.length) startCountdown();
    }
}

function startCountdown() {
    gameState.status = 'COUNTDOWN';
    gameState.countdownEnd = Date.now() + (gameState.config.countdownTime * 1000);
    timers.countdown = setInterval(() => {
        if (gameState.countdownEnd - Date.now() <= 0) {
            clearInterval(timers.countdown);
            closeRound();
        }
    }, 100);
}

function closeRound() {
    gameState.status = 'CLOSED';
    setTimeout(() => drawWinner(), 500);
}

function drawWinner() {
    const winningBox = Math.floor(Math.random() * gameState.config.totalBoxes) + 1;
    gameState.winningBox = winningBox;
    const winnerId = gameState.boxes[winningBox] || gameState.extraBoxes[winningBox];

    if (winnerId) {
        const commission = gameState.roundFund * (gameState.config.commissionPercent / 100);
        const prize = (gameState.roundFund - commission) + gameState.jackpot;
        gameState.winner = gameState.players.find(p => p.id === winnerId);
        gameState.winner.prize = prize;
        gameState.lastPrize = prize;
        gameState.winnersHistory.unshift({
            roundId: Date.now().toString(),
            timestamp: new Date().toISOString(),
            name: gameState.winner.name,
            mpAlias: gameState.winner.mpAlias || '—',
            prize, winningBox,
            transferred: false
        });
        gameState.jackpot = 0;
    } else {
        const commission = gameState.roundFund * (gameState.config.commissionPercent / 100);
        gameState.jackpot += gameState.roundFund - commission;
        gameState.lastPrize = null;
        gameState.winner = null;
    }

    saveState(); // ← persistir jackpot y historial
    gameState.status = 'FINISHED';
    scheduleAutoReset();
}

function scheduleAutoReset() {
    timers.autoReset = setTimeout(() => resetRound(false), 12000);
}


// Reabrir conversación (desbloquear)
app.post('/api/chat/reopen', (req, res) => {
    const { sessionId } = req.body;
    const session = chatSessions[sessionId];
    if (!session) return res.status(404).json({error: 'No encontrada'});
    session.open = true;
    session.waitingReply = false;
    if (chatPlayerStreams[sessionId]) {
        try { chatPlayerStreams[sessionId].write(`data: ${JSON.stringify(session)}\n\n`); } catch(e) {}
    }
    broadcastChatUpdate();
    res.json({success: true});
});

// Eliminar conversación
app.post('/api/chat/delete', (req, res) => {
    const { sessionId } = req.body;
    if (!chatSessions[sessionId]) return res.status(404).json({error: 'No encontrada'});
    // Notificar al jugador que fue eliminada
    if (chatPlayerStreams[sessionId]) {
        try { chatPlayerStreams[sessionId].write(`data: ${JSON.stringify({deleted: true})}\n\n`); } catch(e) {}
    }
    delete chatSessions[sessionId];
    broadcastChatUpdate();
    res.json({success: true});
});


// Cuántos jugadores faltan para el mínimo
app.get('/api/players-needed', (req, res) => {
    const approved = gameState.players.filter(p => p.approved && p.box).length;
    const needed = Math.max(0, gameState.config.minPlayers - approved);
    res.json({ needed, current: approved, min: gameState.config.minPlayers });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ── Verificador de horario: cierra/abre el juego automáticamente ──────
setInterval(() => {
    const within = isWithinSchedule();
    if (!within && gameState.status === 'OPEN') {
        // Hora de cierre: cerrar el juego
        console.log('Horario: cerrando juego automáticamente');
        if (timers.countdown) clearInterval(timers.countdown);
        if (timers.autoReset) clearTimeout(timers.autoReset);
        gameState.status = 'CLOSED';
        saveState();
    } else if (within && gameState.status === 'CLOSED' && gameState.config.schedule.enabled) {
        // Hora de apertura: abrir el juego
        console.log('Horario: abriendo juego automáticamente');
        resetRound(false);
    }
}, 60 * 1000); // cada 60 segundos

// ══════════════════════════════════════════════════════════════
// SISTEMA DE CHAT
// ══════════════════════════════════════════════════════════════

const BANNED_WORDS = [
    'puto','puta','hijo de puta','hdp','concha','reconcha','pelotudo','boludo',
    'idiota','imbecil','estupido','mierda','cagaste','cagon','forro','forros',
    'joder','coño','gilipollas','cabron','polla','verga','pene','culo',
    'fuck','shit','ass','bitch','bastard','dick','cunt','asshole'
];

function containsBannedWord(text) {
    const lower = text.toLowerCase().replace(/[^a-záéíóúüña-z0-9\s]/gi, '');
    return BANNED_WORDS.some(w => lower.includes(w));
}

// Cada conversación: { sessionId, name, messages: [{from,text,ts}], open, waitingReply, lastMsg }
let chatSessions = {};
// SSE para admin
let chatAdminStreams = [];

function broadcastChatUpdate() {
    const payload = `data: ${JSON.stringify({ sessions: Object.values(chatSessions) })}\n\n`;
    chatAdminStreams.forEach(r => { try { r.write(payload); } catch(e) {} });
}

// Admin se suscribe a actualizaciones de chat
app.get('/api/chat/admin-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    // Enviar estado actual
    res.write(`data: ${JSON.stringify({ sessions: Object.values(chatSessions) })}\n\n`);
    chatAdminStreams.push(res);
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch(e) {} }, 25000);
    req.on('close', () => {
        clearInterval(hb);
        chatAdminStreams = chatAdminStreams.filter(r2 => r2 !== res);
    });
});

// Jugador se suscribe a su conversación
let chatPlayerStreams = {}; // sessionId -> res
app.get('/api/chat/player-stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    chatPlayerStreams[sessionId] = res;
    // Enviar historial actual
    if (chatSessions[sessionId]) {
        res.write(`data: ${JSON.stringify(chatSessions[sessionId])}\n\n`);
    }
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch(e) {} }, 25000);
    req.on('close', () => {
        clearInterval(hb);
        delete chatPlayerStreams[sessionId];
    });
});

// Jugador inicia o recupera sesión
app.post('/api/chat/init', (req, res) => {
    const { sessionId, name } = req.body;
    if (!sessionId || !name) return res.status(400).json({error: 'Faltan datos'});
    if (!chatSessions[sessionId]) {
        chatSessions[sessionId] = {
            sessionId, name,
            messages: [],
            open: true,
            waitingReply: false,
            lastMsg: null
        };
    }
    res.json(chatSessions[sessionId]);
});

// Jugador envía mensaje
app.post('/api/chat/send', (req, res) => {
    const { sessionId, text } = req.body;
    const session = chatSessions[sessionId];
    if (!session) return res.status(404).json({error: 'Sesión no encontrada'});
    if (!session.open) return res.status(400).json({error: 'Esta conversación fue cerrada por el admin'});
    if (session.waitingReply) return res.status(400).json({error: 'Esperá la respuesta del operador antes de enviar otro mensaje'});
    if (!text || text.trim().length === 0) return res.status(400).json({error: 'Mensaje vacío'});
    if (text.length > 300) return res.status(400).json({error: 'Mensaje demasiado largo (máx 300 caracteres)'});
    if (containsBannedWord(text)) return res.status(400).json({error: 'Tu mensaje contiene palabras no permitidas'});

    const msg = { from: 'player', text: text.trim(), ts: new Date().toISOString() };
    session.messages.push(msg);
    session.waitingReply = true;
    session.lastMsg = msg.ts;

    // Notificar al jugador
    if (chatPlayerStreams[sessionId]) {
        try { chatPlayerStreams[sessionId].write(`data: ${JSON.stringify(session)}\n\n`); } catch(e) {}
    }
    broadcastChatUpdate();
    res.json({success: true});
});

// Admin responde
app.post('/api/chat/reply', (req, res) => {
    const { sessionId, text } = req.body;
    const session = chatSessions[sessionId];
    if (!session) return res.status(404).json({error: 'Sesión no encontrada'});
    if (!text || text.trim().length === 0) return res.status(400).json({error: 'Respuesta vacía'});

    const msg = { from: 'admin', text: text.trim(), ts: new Date().toISOString() };
    session.messages.push(msg);
    session.waitingReply = false; // jugador puede volver a escribir

    // Notificar al jugador
    if (chatPlayerStreams[sessionId]) {
        try { chatPlayerStreams[sessionId].write(`data: ${JSON.stringify(session)}\n\n`); } catch(e) {}
    }
    broadcastChatUpdate();
    res.json({success: true});
});

// Admin cierra conversación
app.post('/api/chat/close', (req, res) => {
    const { sessionId } = req.body;
    const session = chatSessions[sessionId];
    if (!session) return res.status(404).json({error: 'No encontrada'});
    session.open = false;
    if (chatPlayerStreams[sessionId]) {
        try { chatPlayerStreams[sessionId].write(`data: ${JSON.stringify(session)}\n\n`); } catch(e) {}
    }
    broadcastChatUpdate();
    res.json({success: true});
});

// Obtener sesión (para restaurar tras refresh)
app.get('/api/chat/session/:sessionId', (req, res) => {
    const session = chatSessions[req.params.sessionId];
    if (!session) return res.status(404).json({error: 'No encontrada'});
    res.json(session);
});
