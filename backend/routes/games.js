// Patched version: 3‑minute auto-ending games + infinite random-loop questions

const express = require('express');
const { createGame, getGame, listPlayers } = require('../models/gameStore');
const { fetchQuestionsFromCsv } = require('../utils/sheets');

module.exports = function gamesRouter(io) {
  const router = express.Router();

  // Teacher creates a game
  router.post('/create-game', async (req, res) => {
    try {
      const { code, csvUrl } = req.body;
      if (!code || !csvUrl) return res.status(400).json({ error: 'code and csvUrl required' });

      const questions = await fetchQuestionsFromCsv(csvUrl);

      const game = createGame(code.toUpperCase(), null, questions);

      // Start 3‑minute auto-end timer
      game.endAt = Date.now() + 3 * 60 * 1000;
      game.timer = setTimeout(() => {
        game.phase = 'finished';
        io.to(game.code).emit('game:finished', { players: listPlayers(game) });
      }, 3 * 60 * 1000);

      res.json({ joinCode: game.code, questionCount: questions.length });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  // Socket.IO
  io.on('connection', (socket) => {
    // Host binds
    socket.on('host:bind', ({ code }) => {
      const game = getGame(code?.toUpperCase());
      if (!game) return socket.emit('host:error', { error: 'Game not found' });
      game.hostSocketId = socket.id;
      socket.join(code);
      socket.emit('host:ok', {
        code,
        players: listPlayers(game),
        totalQuestions: game.questions.length,
        endsAt: game.endAt
      });
    });

    // Player joins
    socket.on('player:join', ({ code, name, avatar }) => {
      const game = getGame(code?.toUpperCase());
      if (!game) return socket.emit('player:error', { error: 'Game not found' });

      const safeName = String(name || '').substring(0, 20) || 'Player';
      const safeAvatar = String(avatar || '').substring(0, 200);

      game.players.set(socket.id, { name: safeName, avatar: safeAvatar, mochi: 0 });
      socket.join(code);

      io.to(code).emit('room:update', { players: listPlayers(game) });

      socket.emit('player:ok', {
        code,
        you: { socketId: socket.id, name: safeName, avatar: safeAvatar, mochi: 0 },
        endsAt: game.endAt
      });
    });

    // --- MAIN CHANGE: RANDOM LOOPING QUESTIONS ---
      function serveRandomQuestionToPlayer(game, socket) {
      const index = Math.floor(Math.random() * game.questions.length);
      if (!game.playerCurrentQuestion) game.playerCurrentQuestion = new Map();
      if (!game.playerChestOpened) game.playerChestOpened = new Map();
      game.playerCurrentQuestion.set(socket.id, index);

      const q = game.questions[index];
      socket.emit('question:show', {
        index,
        q: q.q,
        options: q.options,
        phase: 'question'
      });
    }


    // Host starts the loop manually (start round)
    socket.on('host:start-question', ({ code }) => {
      const game = getGame(code?.toUpperCase());
      if (!game || game.hostSocketId !== socket.id) return;
      if (game.phase === 'finished') return;
      serveRandomQuestionToPlayer(game, socket);
    });

    // Player answers
// --- Serve a random question to a single player ---
function serveRandomQuestionToPlayer(game, socket) {
  const index = Math.floor(Math.random() * game.questions.length);
  if (!game.playerCurrentQuestion) game.playerCurrentQuestion = new Map();
  if (!game.playerChestOpened) game.playerChestOpened = new Map();

  game.playerCurrentQuestion.set(socket.id, index);

  const q = game.questions[index];
  socket.emit('question:show', {
    index,
    q: q.q,
    options: q.options,
    phase: 'question'
  });
}

// --- Player answers ---
socket.on('player:answer', ({ code, answerIndex }) => {
  const game = getGame(code?.toUpperCase());
  if (!game) return;

  const player = game.players.get(socket.id);
  if (!player) return;

  const index = game.playerCurrentQuestion?.get(socket.id);
  if (index === undefined) return;

  const q = game.questions[index];
  const correct = Number(answerIndex) === q.answerIndex;

  // Send result only to this player
  socket.emit('answer:result', { correct });

  if (correct) {
    // Open chest only for this player
    socket.emit('chest:open', { choices: [0, 1, 2] });
  } else {
    // Wrong answer → new question only for this player after 2s
    setTimeout(() => serveRandomQuestionToPlayer(game, socket), 2000);
  }
});

// --- Player chooses chest ---
socket.on('player:choose-chest', ({ code }) => {
  const game = getGame(code?.toUpperCase());
  if (!game) return;

  const player = game.players.get(socket.id);
  if (!player) return;

  if (!game.playerChestOpened) game.playerChestOpened = new Map();
  if (game.playerChestOpened.get(socket.id)) return; // already opened

  game.playerChestOpened.set(socket.id, true);

  const outcome = resolveChestOutcome(game, socket.id);
  applyOutcome(game, socket.id, outcome);

  // Broadcast chest result for display only
  io.to(code).emit('chest:result', {
    playerId: socket.id,
    outcome,
    players: listPlayers(game)
  });

  // Serve next question ONLY for the acting player
  if (game.phase !== 'finished') {
    setTimeout(() => {
      game.playerChestOpened.set(socket.id, false);
      serveRandomQuestionToPlayer(game, socket); // only for the player who opened chest
    }, 2000);
  }
});

// --- Host override: send next question to all players manually ---
socket.on('host:next', ({ code }) => {
  const game = getGame(code?.toUpperCase());
  if (!game || game.hostSocketId !== socket.id) return;
  if (game.phase === 'finished') return;

  game.phase = 'question';

  // Host intentionally triggers new question for all players
  for (const [playerId] of game.players) {
    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) serveRandomQuestionToPlayer(game, playerSocket);
  }
});




    // Disconnect
    socket.on('disconnect', () => {
      for (const game of ioFetchGames()) {
        if (game.hostSocketId === socket.id) {
          io.to(game.code).emit('game:ended', { reason: 'Host disconnected' });
        }
        if (game.players.has(socket.id)) {
          game.players.delete(socket.id);
          io.to(game.code).emit('room:update', { players: listPlayers(game) });
        }
      }
    });
  });

  return router;
};

// (Rest of helper functions unchanged below)
function ioFetchGames() { return []; }

function resolveChestOutcome(game, socketId) {
  const specials = [
    { type: 'NOTHING' },
    { type: 'SWAP' },
    { type: 'STEAL_25' },
    { type: 'LOSE_ALL' },
    { type: 'GIFT_100' }
  ];
  const rewardChest = { type: 'PLUS_RANDOM', amount: 100 + Math.floor(Math.random() * 701) };
  const shuffled = shuffle([rewardChest, specials[randomInt(specials.length)], specials[randomInt(specials.length)]]);
  return shuffled[randomInt(3)];
}

function applyOutcome(game, playerId, outcome) {
  const player = game.players.get(playerId);
  if (!player) return;
  const others = Array.from(game.players.keys()).filter(id => id !== playerId);
  const pickOther = () => (others.length ? others[randomInt(others.length)] : null);

  switch (outcome.type) {
    case 'PLUS_RANDOM': player.mochi += outcome.amount; break;
    case 'NOTHING': break;
    case 'SWAP': {
      const otherId = pickOther();
      if (!otherId) break;
      const other = game.players.get(otherId);
      const tmp = player.mochi;
      player.mochi = other.mochi;
      other.mochi = tmp;
      outcome.targetId = otherId;
      break;
    }
    case 'STEAL_25': {
      const otherId = pickOther();
      if (!otherId) break;
      const other = game.players.get(otherId);
      const steal = Math.floor(other.mochi * 0.25);
      other.mochi -= steal;
      player.mochi += steal;
      outcome.targetId = otherId;
      outcome.amount = steal;
      break;
    }
    case 'LOSE_ALL': player.mochi = 0; break;
    case 'GIFT_100': {
      const otherId = pickOther();
      if (!otherId) break;
      const other = game.players.get(otherId);
      other.mochi += 100;
      outcome.targetId = otherId;
      outcome.amount = 100;
      break;
    }
  }
}

function randomInt(n) { return Math.floor(Math.random() * n); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
