const socket = io();

// Host UI
const hostCodeEl = document.getElementById('host-code');
const csvUrlEl = document.getElementById('csv-url');
const hostBtn = document.getElementById('host-btn');
const hostStatus = document.getElementById('host-status');
const hostControls = document.getElementById('host-controls');
const hostRoom = document.getElementById('host-room');
const startQuestionBtn = document.getElementById('start-question');
const nextPhaseBtn = document.getElementById('next-phase');

// Player UI
const joinCodeEl = document.getElementById('join-code');
const playerNameEl = document.getElementById('player-name');
const playerAvatarEl = document.getElementById('player-avatar');
const joinBtn = document.getElementById('join-btn');
const joinStatus = document.getElementById('join-status');

// Game UI
const questionArea = document.getElementById('question-area');
const questionText = document.getElementById('question-text');
const answerOptions = document.getElementById('answer-options');
const chestArea = document.getElementById('chest-area');
const chestButtons = Array.from(document.querySelectorAll('.chest'));
const chestResult = document.getElementById('chest-result');
const lbList = document.getElementById('lb-list');

let currentCode = null;
let you = null;

// Host: create game
hostBtn.addEventListener('click', async () => {
  const code = (hostCodeEl.value || '').trim().toUpperCase();
  const csvUrl = (csvUrlEl.value || '').trim();

  if (!code || !csvUrl) {
    hostStatus.textContent = 'Please enter a join code and CSV URL.';
    return;
  }

  hostStatus.textContent = 'Creating game...';

  try {
    const res = await fetch('/api/create-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, csvUrl })
    });

    const data = await res.json();

    if (res.ok) {
      currentCode = data.joinCode;
      hostStatus.textContent = `Game created with code ${currentCode}`;
      socket.emit('host:bind', { code: currentCode });
    } else {
      hostStatus.textContent = `Error: ${data.error || 'Failed to create game'}`;
    }
  } catch (e) {
    hostStatus.textContent = `Error: ${e.message}`;
  }
});

// Host bound
socket.on('host:ok', ({ code, players, totalQuestions }) => {
  hostControls.classList.remove('hidden');
  renderLeaderboard(players);
  hostRoom.textContent = `Room: ${code} • Questions: ${totalQuestions}`;
});

// Host controls
startQuestionBtn.addEventListener('click', () => {
  if (!currentCode) return;
  socket.emit('host:start-question', { code: currentCode });
});

nextPhaseBtn.addEventListener('click', () => {
  if (!currentCode) return;
  socket.emit('host:next', { code: currentCode });
});

// Player: join game
joinBtn.addEventListener('click', () => {
  const code = (joinCodeEl.value || '').trim().toUpperCase();
  const name = (playerNameEl.value || '').trim();
  const avatar = (playerAvatarEl.value || '').trim();

  if (!code) {
    joinStatus.textContent = 'Please enter a join code.';
    return;
  }

  currentCode = code;
  socket.emit('player:join', { code, name, avatar });
});

socket.on('player:ok', ({ code, you: self }) => {
  you = self;
  joinStatus.textContent = `Joined game ${code} as ${you.name}`;
});

socket.on('player:error', ({ error }) => {
  joinStatus.textContent = `Error: ${error}`;
});

socket.on('host:error', ({ error }) => {
  hostStatus.textContent = `Error: ${error}`;
});

// Room updates
socket.on('room:update', ({ players }) => {
  renderLeaderboard(players);
});

// Show question
socket.on('question:show', ({ index, q, options }) => {
  chestArea.classList.add('hidden');
  chestResult.textContent = '';
  questionArea.classList.remove('hidden');
  questionText.textContent = `Q${index + 1}: ${q}`;
  renderAnswerOptions(options);
});

// Player answers
function renderAnswerOptions(options) {
    answerOptions.innerHTML = '';
    let answered = false; // local flag

    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => {
            if (answered) return; // prevent spamming
            answered = true;
            socket.emit('player:answer', { code: currentCode, answerIndex: i });
            // optionally disable all buttons
            document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
        });
        answerOptions.appendChild(btn);
    });
}

socket.on('answer:result', ({ correct }) => {
  if (correct) {
    questionText.textContent += ' • Correct! 🎉';
  } else {
    questionText.textContent += ' • ❌ WRONG!';
    setTimeout(() => {
      socket.emit('host:start-question', { code: currentCode });
    }, 3000);
  }
});

// Chest phase
socket.on('chest:open', () => {
  questionArea.classList.add('hidden');
  chestArea.classList.remove('hidden');
  chestResult.textContent = 'Pick a chest!';
});

chestButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = Number(btn.dataset.index);
    socket.emit('player:choose-chest', { code: currentCode, choice });
  });
});

socket.on('chest:result', ({ playerId, outcome, players }) => {
  const who = players.find(p => p.socketId === playerId);
  const actor = who ? who.name : 'Someone';
  const text = describeOutcome(actor, outcome);

  // Show the general result for everyone
  chestResult.textContent = text;

  // If this result was for *you*, show a personal message too
  if (you && playerId === you.socketId) {
    const personalText = describeOutcome('You', outcome);
    // You can either append it or show in a separate element
    chestResult.textContent += `\n${personalText}`;
    // Or, if you want a dedicated element:
    // document.getElementById('your-chest-result').textContent = personalText;
  }

  renderLeaderboard(players);

  setTimeout(() => {
    socket.emit('host:start-question', { code: currentCode });
  }, 2000);
});

// Game finished
socket.on('game:finished', ({ players }) => {
  questionArea.classList.add('hidden');
  chestArea.classList.add('hidden');
  renderLeaderboard(players);
  alert('Game finished!');
});

function renderLeaderboard(players) {
  lbList.innerHTML = '';
  const sorted = [...players].sort((a, b) => b.mochi - a.mochi);
  sorted.forEach(p => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = p.avatar || '';
    img.alt = p.name;
    const name = document.createElement('span');
    name.textContent = `${p.name} • ${p.mochi} 🍡`;
    li.appendChild(img);
    li.appendChild(name);
    lbList.appendChild(li);
  });
}

function describeOutcome(actor, outcome) {
  switch (outcome.type) {
    case 'PLUS_RANDOM':
      return `${actor} gained a random amount of mochi!🍡`;
    case 'NOTHING':
      return `${actor} found nothing...`;
    case 'SWAP':
      return outcome.targetId ? `${actor} swapped mochis with another player🥝!` : `${actor} tried to swap but failed.`;
    case 'STEAL_25':
      return outcome.targetId ? `${actor} stole 25 mochi from another player!🍔` : `${actor} tried to steal but failed.`;
    case 'LOSE_ALL':
      return `${actor} lost all their mochi 😱`;
    case 'GIFT_100':
      return outcome.targetId ? `${actor} gifted 100 mochi to another player!🎁` : `${actor} tried to gift but failed.`;
    default:
      return `${actor} had an unknown outcome.`;
  }
}
