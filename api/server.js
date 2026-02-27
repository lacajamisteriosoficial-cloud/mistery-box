const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

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

let gameState = {
    status: 'OPEN',
    players: [],
    boxes: {},
    extraBoxes: {},
    jackpot: 0,
    roundFund: 0,
    countdownEnd: null,
    winner: null,
    winningBox: null,
    lastPrize: null,
    pendingTransfers: [],
    config: {
        entryPrice: 500,
        extraPrice: 1000,
        minPlayers: 2,
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

let timers = {};

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
        inSchedule: isWithinSchedule()
    });
});

app.post('/api/request-entry', (req, res) => {
    const { name, operationId, boxNumber } = req.body;
    if (!isWithinSchedule()) return res.status(400).json({error: 'Fuera de horario de juego'});
    if (gameState.status !== 'OPEN') return res.status(400).json({error: 'La sala está cerrada'});
    if (gameState.players.length >= gameState.config.maxPlayers) return res.status(400).json({error: 'Sala completa'});
    if (gameState.boxes[boxNumber] || gameState.extraBoxes[boxNumber]) return res.status(400).json({error: 'Caja ocupada'});

    const player = {
        id: Date.now().toString(),
        name,
        box: null,
        extraBox: null,
        hasExtra: false,
        approved: false,
        selectedBox: boxNumber
    };
    const transfer = {
        id: Date.now().toString(),
        playerId: player.id,
        name,
        operationId,
        amount: gameState.config.entryPrice,
        type: 'entry',
        boxNumber: boxNumber,
        timestamp: new Date().toISOString(),
        approved: false
    };
    gameState.players.push(player);
    gameState.pendingTransfers.push(transfer);
    res.json({player, transfer});
});

app.post('/api/request-extra', (req, res) => {
    const { playerId, operationId } = req.body;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || player.hasExtra) return res.status(400).json({error: 'No permitido'});

    const transfer = {
        id: Date.now().toString(),
        playerId,
        name: player.name,
        operationId,
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
    res.json({success: true});
});

app.post('/api/config', (req, res) => {
    gameState.config = {...gameState.config, ...req.body};
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

function resetRound(clearJackpot = false) {
    const jackpotToKeep = clearJackpot ? 0 : gameState.jackpot;
    gameState.status = 'OPEN';
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
}

function checkAllSelected() {
    const approvedPlayers = gameState.players.filter(p => p.approved);
    const playersWithBox = approvedPlayers.filter(p => p.box);
    if (playersWithBox.length >= gameState.config.minPlayers && gameState.status === 'OPEN') {
        const allSelected = playersWithBox.length === approvedPlayers.length;
        if (allSelected) startCountdown();
    }
}

function startCountdown() {
    gameState.status = 'COUNTDOWN';
    gameState.countdownEnd = Date.now() + (gameState.config.countdownTime * 1000);
    timers.countdown = setInterval(() => {
        const remaining = gameState.countdownEnd - Date.now();
        if (remaining <= 0) {
            clearInterval(timers.countdown);
            closeRound();
        }
    }, 100);
}

function closeRound() {
    gameState.status = 'CLOSED';

    // SIEMPRE acumular el fondo de la ronda al jackpot (menos comisión) si no hay ganador
    // No importa cuántos jugadores haya — si el sorteo no cae en una caja elegida, acumula
    setTimeout(() => drawWinner(), 500);
}

function drawWinner() {
    const winningBox = Math.floor(Math.random() * gameState.config.totalBoxes) + 1;
    gameState.winningBox = winningBox;

    const winnerId = gameState.boxes[winningBox] || gameState.extraBoxes[winningBox];

    if (winnerId) {
        // ✅ Hay ganador — calcular premio ANTES de resetear jackpot
        const commission = gameState.roundFund * (gameState.config.commissionPercent / 100);
        const prize = (gameState.roundFund - commission) + gameState.jackpot;
        gameState.winner = gameState.players.find(p => p.id === winnerId);
        gameState.winner.prize = prize;
        gameState.lastPrize = prize;
        gameState.jackpot = 0; // se pagó, va a cero
    } else {
        // ❌ No hay ganador — ACUMULAR al pozo
        const commission = gameState.roundFund * (gameState.config.commissionPercent / 100);
        const accumulated = gameState.roundFund - commission;
        gameState.jackpot += accumulated; // SE SUMA al jackpot existente
        gameState.lastPrize = null;
        gameState.winner = null;
    }

    gameState.status = 'FINISHED';
    scheduleAutoReset();
}

function scheduleAutoReset() {
    // 12 segundos para que los jugadores vean el resultado
    timers.autoReset = setTimeout(() => {
        resetRound(false); // false = mantener jackpot acumulado
    }, 12000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});