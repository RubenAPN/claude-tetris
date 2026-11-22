'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#a1887f', // Tuerca - brown
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (3x3 con hueco)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let combo = 0, runBestCombo = 0;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > runBestCombo) runBestCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

let gridColor = '#22222e';
const themeToggle = document.getElementById('theme-toggle');

function applyTheme(light) {
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  if (current) { draw(); drawNext(); }
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked);
  themeToggle.blur(); // evita que Space/flechas manipulen el switch durante la partida
});

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  if (!current) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  if (!next) return;
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() ya canceló el bucle; no volver a programarlo
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  combo = 0;
  runBestCombo = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return; // escribiendo el nombre
  if (!current) return; // partida no iniciada
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Records ----
const RECORDS_KEY = 'tetris.records';
const MAX_SCORES = 5;
const startScreen = document.getElementById('start-screen');
const startScoresEl = document.getElementById('start-scores');
const startComboEl = document.getElementById('start-best-combo');
const startLinesEl = document.getElementById('start-max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const gameoverRecords = document.getElementById('gameover-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const gameoverScoresEl = document.getElementById('gameover-scores');

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  const rec = emptyRecords();
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return rec;
    if (Array.isArray(data.scores)) {
      rec.scores = data.scores
        .filter(s => s && typeof s.name === 'string' && Number.isFinite(s.score) && s.score >= 0)
        .map(s => ({ name: s.name.slice(0, 10), score: Math.floor(s.score) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES);
    }
    if (Number.isFinite(data.bestCombo) && data.bestCombo > 0) rec.bestCombo = Math.floor(data.bestCombo);
    if (Number.isFinite(data.maxLines) && data.maxLines > 0) rec.maxLines = Math.floor(data.maxLines);
  } catch (err) { /* JSON corrupto o localStorage no disponible */ }
  return rec;
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
    return true;
  } catch (err) {
    return false;
  }
}

function renderScoreList(el, scores, highlight) {
  el.textContent = '';
  for (let i = 0; i < MAX_SCORES; i++) {
    const li = document.createElement('li');
    const s = scores[i];
    const name = document.createElement('span');
    const val = document.createElement('span');
    name.textContent = s ? s.name : '---';
    val.textContent = s ? s.score.toLocaleString() : '0';
    li.append(name, val);
    if (s && i === highlight) li.className = 'current';
    el.appendChild(li);
  }
}

function renderRecords() {
  const rec = loadRecords();
  renderScoreList(startScoresEl, rec.scores, -1);
  startComboEl.textContent = rec.bestCombo;
  startLinesEl.textContent = rec.maxLines;
}

function qualifiesForTop(rec, sc) {
  return sc > 0 && (rec.scores.length < MAX_SCORES || sc > rec.scores[rec.scores.length - 1].score);
}

let pendingSave = false;

function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, runBestCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  pendingSave = qualifiesForTop(rec, score);
  let preview = rec.scores.slice();
  let idx = -1;
  if (pendingSave) {
    idx = preview.findIndex(s => score > s.score);
    if (idx < 0) idx = preview.length;
    preview.splice(idx, 0, { name: '...', score });
    preview = preview.slice(0, MAX_SCORES);
  }
  renderScoreList(gameoverScoresEl, preview, idx);
  nameForm.classList.toggle('hidden', !pendingSave);
  nameInput.value = '';
  gameoverRecords.classList.remove('hidden');
  if (pendingSave) nameInput.focus();
}

function hideGameOverRecords() {
  pendingSave = false;
  gameoverRecords.classList.add('hidden');
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingSave) return;
  pendingSave = false;
  const name = nameInput.value.trim().slice(0, 10) || 'Anónimo';
  const rec = loadRecords();
  const entry = { name, score };
  let idx = rec.scores.findIndex(s => score > s.score);
  if (idx < 0) idx = rec.scores.length;
  rec.scores.splice(idx, 0, entry);
  rec.bestCombo = Math.max(rec.bestCombo, runBestCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  rec.scores = rec.scores.slice(0, MAX_SCORES);
  if (!saveRecords(rec)) alert('No se pudo guardar el record (almacenamiento no disponible).');
  renderScoreList(gameoverScoresEl, rec.scores, idx < MAX_SCORES ? idx : -1);
  nameForm.classList.add('hidden');
  nameInput.blur();
});

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  hideGameOverRecords();
  playBtn.blur();
  init();
});

restartBtn.addEventListener('click', () => { hideGameOverRecords(); restartBtn.blur(); });

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Resetear todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (err) { /* ignorar */ }
  renderRecords();
  resetRecordsBtn.blur();
});

applyTheme(false); // por defecto: oscuro (sin persistencia ni prefers-color-scheme)
renderRecords(); // el juego arranca al pulsar Jugar (init)
