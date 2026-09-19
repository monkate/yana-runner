'use strict';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

// ============================================================
//  КОНФИГУРАЦИЯ УРОВНЕЙ
//  Города проходятся строго по порядку: 1 -> 2 -> 3 -> 4.
// ============================================================
const LEVELS = [
  {
    name: 'Derbent',
    targetDistance: 400,
    skyTop: '#87CEEB',
    skyBottom: '#E8D5A3',
    ground: '#8B6914',
    groundLine: '#6B4F0A',
    accent: '#C0392B',
    obstacleType: 'cow',
    second: { type: 'eagle', w: 48, h: 28, fly: true },
    bgElements: 'derbent',
    speed: 6,
    maxSpeed: 8.2,
    secondWeight: 14,
    doubleChance: 0.06,
    tip: 'Коровы не уступают дорогу — прыгай!',
  },
  {
    name: 'Moscow',
    targetDistance: 500,
    skyTop: '#7E98BE',
    skyBottom: '#F2DFC2',
    ground: '#6E6561',
    groundLine: '#4B4340',
    accent: '#CC0000',
    obstacleType: 'rocket',
    second: { type: 'satellite', w: 48, h: 28, fly: true },
    bgElements: 'moscow',
    speed: 7,
    maxSpeed: 9.4,
    secondWeight: 21,
    doubleChance: 0.12,
    tip: 'Спутники идут низко — приседай под ними!',
  },
  {
    name: 'Tel Aviv',
    targetDistance: 500,
    skyTop: '#4FC3F7',
    skyBottom: '#FFF9C4',
    ground: '#F4A460',
    groundLine: '#CD853F',
    accent: '#FFA726',
    obstacleType: 'leetcode',
    second: { type: 'seagull', w: 48, h: 28, fly: true },
    bgElements: 'telaviv',
    speed: 7.5,
    maxSpeed: 10,
    secondWeight: 25,
    doubleChance: 0.16,
    tip: 'Чайки воруют хумус. И орешки тоже.',
  },
  {
    name: 'Amsterdam',
    targetDistance: 600,
    skyTop: '#90CAF9',
    skyBottom: '#E3F2FD',
    ground: '#795548',
    groundLine: '#5D4037',
    accent: '#000000',
    obstacleType: 'uber',
    second: { type: 'cyclist', w: 58, h: 54, fly: false, speedMul: 1.25, effect: 'push' },
    bgElements: 'amsterdam',
    speed: 8,
    maxSpeed: 11,
    secondWeight: 29,
    doubleChance: 0.22,
    tip: 'Велосипедисты не тормозят — они оттолкнут Яну!',
  },
];

const LIVES_START = 3;
const PLAYER_W = 44;
const PLAYER_H = 72;
const DUCK_H = 42;
const SHIELD_TIME = 8 * 60;
const HIT_INVULN = 100;
const FLYER_ALT = 80;
const PLAYER_BASE_X = 80;

const OBSTACLE_SIZE = {
  cow: { w: 60, h: 50 },
  rocket: { w: 30, h: 70 },
  leetcode: { w: 44, h: 44 },
  uber: { w: 50, h: 50 },
};

// ============================================================
//  СОСТОЯНИЕ ИГРЫ
// ============================================================
const state = {
  screen: 'menu-screen',
  levelIndex: 0,
  running: false,
  paused: false,
  gameOver: false,
  distance: 0,
  speed: 0,
  frameCount: 0,
  lives: LIVES_START,
  cookies: 0,
  score: 0,
  streak: 0,
  totalCookies: 0,
  totalScore: 0,
  introTimer: 0,
};

// Множитель за орешки, собранные подряд без урона
function multiplier() {
  return Math.min(4, 1 + Math.floor(state.streak / 6));
}

// ============================================================
//  CANVAS
// ============================================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  // Экран игры может быть ещё скрыт (display:none) — тогда его размер 0.
  let rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    rect = (document.getElementById('app') || canvas.parentElement).getBoundingClientRect();
  }
  canvas.width = Math.round(rect.width) || 900;
  canvas.height = Math.round(rect.height) || 600;
}

window.addEventListener('resize', () => {
  resizeCanvas();
  if (state.screen === 'game-screen' && player.onGround) {
    player.y = groundY() - player.height;
  }
});

const GROUND_Y_RATIO = 0.78;
function groundY() { return canvas.height * GROUND_Y_RATIO; }

// ============================================================
//  ИГРОК — ЯНА
// ============================================================
const player = {
  x: PLAYER_BASE_X,
  y: 0,
  pushVx: 0,
  width: PLAYER_W,
  height: PLAYER_H,
  vy: 0,
  onGround: true,
  jumpsLeft: 2,
  jumping: false,
  ducking: false,
  animFrame: 0,
  animTimer: 0,
  invuln: 0,
  shield: 0,
};

const PHYSICS = {
  gravity: 0.65,
  jumpForce: -13.5,
  doubleJumpForce: -11.8,
  fastFall: 1.15,
  maxFall: 22,
};

const input = { duck: false };

function resetPlayer() {
  player.x = PLAYER_BASE_X;
  player.pushVx = 0;
  player.height = PLAYER_H;
  player.ducking = false;
  player.y = groundY() - player.height;
  player.vy = 0;
  player.onGround = true;
  player.jumpsLeft = 2;
  player.jumping = false;
  player.animFrame = 0;
  player.animTimer = 0;
  player.invuln = 0;
  player.shield = 0;
}

// Меняем высоту, удерживая ноги на месте
function setDucking(v) {
  if (player.ducking === v) return;
  const newH = v ? DUCK_H : PLAYER_H;
  player.y += player.height - newH;
  player.height = newH;
  player.ducking = v;
}

function jump() {
  if (!state.running || state.gameOver || player.jumpsLeft <= 0) return;
  setDucking(false);
  player.vy = player.jumpsLeft === 2 ? PHYSICS.jumpForce : PHYSICS.doubleJumpForce;
  player.jumpsLeft--;
  player.onGround = false;
  player.jumping = true;
  if (player.jumpsLeft === 0) {
    // Облачко от второго прыжка — сразу видно, что он сработал
    addParticles(player.x + player.width / 2, player.y + player.height, '#FFFFFF', 10, 2.2);
  }
}

function updatePlayer() {
  // Отдача от толчка велосипедиста и возвращение на исходную позицию
  if (player.pushVx !== 0) {
    player.x += player.pushVx;
    player.pushVx *= 0.85;
    if (Math.abs(player.pushVx) < 0.2) player.pushVx = 0;
  } else if (player.x < PLAYER_BASE_X) {
    player.x = Math.min(PLAYER_BASE_X, player.x + 1.3);
  }
  if (player.x < 14) {
    player.x = 14;
    player.pushVx = 0;
  }

  // Присесть можно только на земле; в воздухе стрелка вниз ускоряет падение
  if (input.duck && !player.onGround) player.vy += PHYSICS.fastFall;
  setDucking(input.duck && player.onGround);

  player.vy = Math.min(PHYSICS.maxFall, player.vy + PHYSICS.gravity);
  player.y += player.vy;

  const floorY = groundY() - player.height;
  if (player.y >= floorY) {
    if (!player.onGround) {
      addParticles(player.x + player.width / 2, floorY + player.height, '#FFFFFF', 6, 1.6);
    }
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
    player.jumpsLeft = 2;
    player.jumping = false;
  } else {
    player.onGround = false;
  }

  if (player.onGround) {
    player.animTimer++;
    if (player.animTimer >= (player.ducking ? 9 : 6)) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % 4;
    }
  }

  if (player.invuln > 0) player.invuln--;
  if (player.shield > 0) player.shield--;
}

function playerBox() {
  return {
    x: player.x + 9,
    y: player.y + (player.ducking ? 5 : 8),
    w: player.width - 18,
    h: player.height - (player.ducking ? 8 : 12),
  };
}

// Пингвин на футболке Яны
function drawPenguin(cx, cy, s) {
  const w = s * 0.62;
  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = '#12161C';
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, s / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Крылья
  ctx.beginPath();
  ctx.ellipse(-w * 0.46, s * 0.04, w * 0.17, s * 0.27, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.46, s * 0.04, w * 0.17, s * 0.27, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Живот и мордочка
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.13, w * 0.33, s * 0.31, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.23, w * 0.31, s * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  // Глаза
  ctx.fillStyle = '#12161C';
  ctx.beginPath();
  ctx.arc(-w * 0.16, -s * 0.27, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.16, -s * 0.27, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Клюв и лапки
  ctx.fillStyle = '#FF9F1C';
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.15);
  ctx.lineTo(s * 0.1, -s * 0.15);
  ctx.lineTo(0, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-w * 0.23, s * 0.49, w * 0.17, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.23, s * 0.49, w * 0.17, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Рисуем Яну в стиле пиксель-арт по фото
function drawYana(x, y, w, h, frame, jumping) {
  ctx.save();
  ctx.translate(x, y);

  // Приседание — то же тело, сплющенное по вертикали
  const squash = h / PLAYER_H;
  if (squash !== 1) {
    ctx.translate(w / 2, h);
    ctx.scale(1 + (1 - squash) * 0.28, squash);
    ctx.translate(-w / 2, -PLAYER_H);
    h = PLAYER_H;
  }

  const scale = w / 44;

  // Тень
  if (player.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h + 2, w * 0.4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ноги (анимация бега)
  const legOffset = jumping ? 0 : Math.sin(frame * Math.PI / 2) * 6;
  ctx.fillStyle = '#2C2C2C';
  ctx.fillRect(8 * scale, h - 18 * scale, 10 * scale, 18 * scale + legOffset * scale);
  ctx.fillRect(24 * scale, h - 18 * scale, 10 * scale, 18 * scale - legOffset * scale);

  // Тело — тёмно-серый топ
  ctx.fillStyle = '#3D3D3D';
  ctx.beginPath();
  ctx.roundRect(6 * scale, 28 * scale, 32 * scale, 30 * scale, 4 * scale);
  ctx.fill();

  // Руки
  const armSwing = jumping ? -8 : Math.sin(frame * Math.PI / 2) * 10;
  ctx.fillStyle = '#3D3D3D';
  ctx.save();
  ctx.translate(10 * scale, 32 * scale);
  ctx.rotate((armSwing * Math.PI) / 180);
  ctx.fillRect(-4 * scale, 0, 8 * scale, 22 * scale);
  ctx.restore();
  // Правая рука с леденцом
  ctx.save();
  ctx.translate(34 * scale, 30 * scale);
  ctx.rotate((-armSwing * Math.PI) / 180);
  ctx.fillRect(-4 * scale, 0, 8 * scale, 20 * scale);
  ctx.fillStyle = '#FF1744';
  ctx.beginPath();
  ctx.arc(0, -6 * scale, 7 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-1.5 * scale, -2 * scale, 3 * scale, 10 * scale);
  ctx.restore();

  // Голова
  ctx.fillStyle = '#FDDBB5';
  ctx.beginPath();
  ctx.ellipse(22 * scale, 18 * scale, 14 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Волосы — длинные тёмно-каштановые
  ctx.fillStyle = '#3B2314';
  ctx.beginPath();
  ctx.ellipse(22 * scale, 12 * scale, 16 * scale, 14 * scale, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(4 * scale, 10 * scale, 8 * scale, 30 * scale);
  ctx.fillRect(32 * scale, 10 * scale, 8 * scale, 28 * scale);
  ctx.beginPath();
  ctx.ellipse(22 * scale, 8 * scale, 14 * scale, 8 * scale, 0, 0, Math.PI);
  ctx.fill();

  // Глаза
  ctx.fillStyle = '#2C1810';
  ctx.beginPath();
  ctx.ellipse(17 * scale, 17 * scale, 3 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(27 * scale, 17 * scale, 3 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Улыбка
  ctx.strokeStyle = '#C0392B';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.arc(22 * scale, 22 * scale, 5 * scale, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Красные ногти (деталь с фото)
  ctx.fillStyle = '#FF1744';
  ctx.fillRect(8 * scale, h - 18 * scale + (18 * scale + legOffset * scale) - 3 * scale, 10 * scale, 3 * scale);
  ctx.fillRect(24 * scale, h - 18 * scale + (18 * scale - legOffset * scale) - 3 * scale, 10 * scale, 3 * scale);

  // Золотая цепочка сумки
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(10 * scale, 30 * scale);
  ctx.quadraticCurveTo(22 * scale, 42 * scale, 34 * scale, 30 * scale);
  ctx.stroke();

  // Принт на футболке — поверх цепочки
  drawPenguin(22 * scale, 47 * scale, 16 * scale);

  ctx.restore();
}

function drawPlayer() {
  const blink = player.invuln > 0 && Math.floor(state.frameCount / 4) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  drawYana(player.x, player.y, player.width, player.height, player.animFrame, player.jumping);
  ctx.globalAlpha = 1;

  if (player.shield > 0) {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const r = Math.max(player.width, player.height) * 0.72;
    const fade = player.shield < 90 && Math.floor(state.frameCount / 5) % 2 === 0 ? 0.25 : 0.7;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.66, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.18;
    ctx.fillStyle = '#4FC3F7';
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================
//  ПРЕПЯТСТВИЯ И БОНУСЫ
// ============================================================
let obstacles = [];
let pickups = [];
let spawnTimer = 0;

function addObstacle(type, x, y, w, h, flying) {
  const o = { type, x, y, w, h, flying, baseY: y, phase: Math.random() * 100, hit: false, speedMul: 1, effect: 'hit' };
  obstacles.push(o);
  return o;
}

function spawnCookieArc() {
  const n = 3 + Math.floor(Math.random() * 3);
  const startX = canvas.width + 40;
  const low = groundY() - 46;
  const high = groundY() - 132;
  const arc = Math.random() < 0.6;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const y = arc ? low - Math.sin(t * Math.PI) * (low - high) : low;
    pickups.push({ kind: 'cookie', x: startX + i * 46, y: y, r: 11, spin: Math.random() * Math.PI * 2 });
  }
}

function spawnPower() {
  const kind = state.lives < LIVES_START && Math.random() < 0.5 ? 'heart' : 'shield';
  pickups.push({
    kind: kind,
    x: canvas.width + 40,
    y: groundY() - (70 + Math.random() * 55),
    r: 15,
    spin: 0,
  });
}

function pickEvent(level, progress) {
  const table = [
    ['ground', 42],
    ['second', progress > 0.12 ? level.secondWeight : 0],
    ['cookies', 34],
    ['power', state.lives < LIVES_START ? 9 : 5],
  ];
  let total = 0;
  for (const row of table) total += row[1];
  let r = Math.random() * total;
  for (const row of table) {
    r -= row[1];
    if (r <= 0) return row[0];
  }
  return 'ground';
}

// Режиссёр: решает, что появится следующим, и держит честную дистанцию между событиями
function runDirector() {
  spawnTimer--;
  if (spawnTimer > 0) return;

  const level = LEVELS[state.levelIndex];
  const progress = state.distance / level.targetDistance;
  const kind = pickEvent(level, progress);
  let gap = 300 + Math.random() * 230;

  if (kind === 'ground') {
    const t = OBSTACLE_SIZE[level.obstacleType];
    addObstacle(level.obstacleType, canvas.width + 40, groundY() - t.h, t.w, t.h, false);
    if (progress > 0.3 && Math.random() < level.doubleChance) {
      addObstacle(level.obstacleType, canvas.width + 40 + t.w + 48, groundY() - t.h, t.w, t.h, false);
      gap += 110;
    }
  } else if (kind === 'second') {
    const t = level.second;
    const o = addObstacle(
      t.type,
      canvas.width + 40,
      t.fly ? groundY() - FLYER_ALT : groundY() - t.h,
      t.w, t.h, t.fly
    );
    o.speedMul = t.speedMul || 1;
    o.effect = t.effect || 'hit';
    gap += t.fly ? 80 : 190;
  } else if (kind === 'cookies') {
    spawnCookieArc();
    gap = 230 + Math.random() * 170;
  } else {
    spawnPower();
    gap = 270 + Math.random() * 170;
  }

  spawnTimer = Math.max(14, gap / state.speed);
}

function updateObstacles() {
  runDirector();

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= state.speed * o.speedMul;
    if (o.flying) o.y = o.baseY + Math.sin((state.frameCount + o.phase) * 0.08) * 5;
    if (o.x + o.w < -20) obstacles.splice(i, 1);
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x -= state.speed;
    p.spin += p.kind === 'cookie' ? 0.08 : 0.05;
    if (p.x + p.r < -20) pickups.splice(i, 1);
  }
}

function drawCow(x, y, w, h) {
  const white = '#FAFAFA';
  const shade = '#D9D5D0';
  const dark = '#23201E';
  const hoof = '#17130F';

  ctx.save();
  ctx.translate(x, y);

  // Тень под коровой
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(w * 0.52, h * 0.99, w * 0.36, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Хвост с кисточкой
  ctx.strokeStyle = white;
  ctx.lineWidth = w * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.85, h * 0.36);
  ctx.quadraticCurveTo(w * 1.0, h * 0.5, w * 0.95, h * 0.72);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(w * 0.95, h * 0.77, w * 0.035, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Дальняя пара ног — в тени
  ctx.fillStyle = shade;
  ctx.fillRect(w * 0.33, h * 0.6, w * 0.08, h * 0.4);
  ctx.fillRect(w * 0.68, h * 0.6, w * 0.08, h * 0.4);
  ctx.fillStyle = '#3A322C';
  ctx.fillRect(w * 0.33, h * 0.92, w * 0.08, h * 0.08);
  ctx.fillRect(w * 0.68, h * 0.92, w * 0.08, h * 0.08);

  // Шея
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.28);
  ctx.lineTo(w * 0.13, h * 0.36);
  ctx.lineTo(w * 0.15, h * 0.62);
  ctx.lineTo(w * 0.32, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Туловище
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.roundRect(w * 0.18, h * 0.26, w * 0.7, h * 0.44, h * 0.2);
  ctx.fill();

  // Пятна голштинки — обрезаны по силуэту тела
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(w * 0.18, h * 0.26, w * 0.7, h * 0.44, h * 0.2);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(w * 0.4, h * 0.36, w * 0.12, h * 0.13, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.66, h * 0.56, w * 0.15, h * 0.14, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.85, h * 0.33, w * 0.09, h * 0.1, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, h * 0.58, w, h * 0.12);
  ctx.restore();

  // Вымя
  ctx.fillStyle = '#F2AFAF';
  ctx.beginPath();
  ctx.ellipse(w * 0.55, h * 0.735, w * 0.075, h * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ближняя пара ног
  ctx.fillStyle = white;
  ctx.fillRect(w * 0.25, h * 0.62, w * 0.09, h * 0.38);
  ctx.fillRect(w * 0.6, h * 0.62, w * 0.09, h * 0.38);
  ctx.fillStyle = hoof;
  ctx.fillRect(w * 0.25, h * 0.91, w * 0.09, h * 0.09);
  ctx.fillRect(w * 0.6, h * 0.91, w * 0.09, h * 0.09);

  // Голова
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.ellipse(w * 0.15, h * 0.46, w * 0.14, h * 0.2, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Тёмная отметина на лбу
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(w * 0.19, h * 0.315, w * 0.07, h * 0.045, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Ухо
  ctx.fillStyle = '#CFC8C0';
  ctx.beginPath();
  ctx.ellipse(w * 0.28, h * 0.4, w * 0.065, h * 0.04, -0.7, 0, Math.PI * 2);
  ctx.fill();

  // Рога — рисуем поверх головы, иначе их не видно
  ctx.fillStyle = '#E4D3A8';
  ctx.strokeStyle = '#C4AF7C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(w * 0.225, h * 0.325, w * 0.045, h * 0.028, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w * 0.085, h * 0.325, w * 0.04, h * 0.026, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Морда и ноздри
  ctx.fillStyle = '#F0B4B4';
  ctx.beginPath();
  ctx.ellipse(w * 0.075, h * 0.6, w * 0.085, h * 0.09, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#B26D6D';
  ctx.beginPath();
  ctx.ellipse(w * 0.04, h * 0.585, w * 0.017, h * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.1, h * 0.625, w * 0.017, h * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();

  // Глаз с бликом
  ctx.fillStyle = '#17130F';
  ctx.beginPath();
  ctx.ellipse(w * 0.16, h * 0.45, w * 0.027, h * 0.033, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(w * 0.152, h * 0.437, w * 0.009, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRocket(x, y, w, h) {
  const flick = 0.8 + Math.abs(Math.sin(state.frameCount * 0.55)) * 0.4;
  ctx.save();
  ctx.translate(x, y);

  // Пламя из сопла
  const fl = h * 0.13 * flick;
  ctx.fillStyle = 'rgba(255,109,0,0.9)';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.86);
  ctx.quadraticCurveTo(w * 0.5, h * 0.86 + fl * 1.7, w * 0.7, h * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFD54F';
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.86);
  ctx.quadraticCurveTo(w * 0.5, h * 0.86 + fl * 1.05, w * 0.62, h * 0.86);
  ctx.closePath();
  ctx.fill();

  // Стабилизаторы
  ctx.fillStyle = '#C62828';
  ctx.beginPath();
  ctx.moveTo(w * 0.24, h * 0.6);
  ctx.quadraticCurveTo(w * 0.02, h * 0.78, w * 0.03, h * 0.85);
  ctx.lineTo(w * 0.24, h * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.76, h * 0.6);
  ctx.quadraticCurveTo(w * 0.98, h * 0.78, w * 0.97, h * 0.85);
  ctx.lineTo(w * 0.76, h * 0.85);
  ctx.closePath();
  ctx.fill();

  // Сопло
  ctx.fillStyle = '#546E7A';
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h * 0.78);
  ctx.lineTo(w * 0.3, h * 0.87);
  ctx.lineTo(w * 0.7, h * 0.87);
  ctx.lineTo(w * 0.64, h * 0.78);
  ctx.closePath();
  ctx.fill();

  // Корпус с цилиндрической подсветкой
  const g = ctx.createLinearGradient(w * 0.24, 0, w * 0.76, 0);
  g.addColorStop(0, '#9FA8B0');
  g.addColorStop(0.32, '#FFFFFF');
  g.addColorStop(0.72, '#E4E9ED');
  g.addColorStop(1, '#98A2AA');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(w * 0.24, h * 0.19, w * 0.52, h * 0.62, w * 0.06);
  ctx.fill();

  // Носовой обтекатель
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.quadraticCurveTo(w * 0.76, h * 0.11, w * 0.76, h * 0.22);
  ctx.lineTo(w * 0.24, h * 0.22);
  ctx.quadraticCurveTo(w * 0.24, h * 0.11, w * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.02);
  ctx.quadraticCurveTo(w * 0.36, h * 0.12, w * 0.36, h * 0.22);
  ctx.lineTo(w * 0.44, h * 0.22);
  ctx.quadraticCurveTo(w * 0.44, h * 0.12, w * 0.52, h * 0.03);
  ctx.closePath();
  ctx.fill();

  // Иллюминатор
  ctx.fillStyle = '#16324F';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.34, w * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#B0BEC5';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(w * 0.455, h * 0.315, w * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Полосы и линии обшивки
  ctx.fillStyle = '#D32F2F';
  ctx.fillRect(w * 0.24, h * 0.5, w * 0.52, h * 0.035);
  ctx.fillRect(w * 0.24, h * 0.555, w * 0.52, h * 0.018);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.24, h * 0.68);
  ctx.lineTo(w * 0.76, h * 0.68);
  ctx.moveTo(w * 0.24, h * 0.75);
  ctx.lineTo(w * 0.76, h * 0.75);
  ctx.stroke();

  ctx.restore();
}

function drawLeetCode(x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);

  // Плитка-иконка под логотип
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.roundRect(1.5, 2.5, w, h, w * 0.22);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Оригинальный знак LeetCode: оранжевая «C», чёрный шеврон, серая перекладина
  const S = Math.min(w, h) * 0.84;
  ctx.translate((w - S) / 2, (h - S) / 2 + S * 0.02);

  const cx = S * 0.43;
  const cy = S * 0.5;
  const r = S * 0.31;
  const D = Math.PI / 180;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#FFA116';
  ctx.lineWidth = S * 0.145;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -80 * D, -28 * D);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 28 * D, 80 * D);
  ctx.stroke();

  ctx.strokeStyle = '#B3B3B3';
  ctx.lineWidth = S * 0.095;
  ctx.beginPath();
  ctx.moveTo(S * 0.45, cy);
  ctx.lineTo(S * 0.86, cy);
  ctx.stroke();

  // Белый зазор вокруг шеврона — как в оригинале
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = S * 0.2;
  ctx.beginPath();
  ctx.moveTo(S * 0.586, S * 0.062);
  ctx.lineTo(S * 0.189, S * 0.498);
  ctx.lineTo(S * 0.42, S * 0.752);
  ctx.stroke();
  ctx.strokeStyle = '#0E0E0E';
  ctx.lineWidth = S * 0.145;
  ctx.beginPath();
  ctx.moveTo(S * 0.586, S * 0.062);
  ctx.lineTo(S * 0.189, S * 0.498);
  ctx.lineTo(S * 0.42, S * 0.752);
  ctx.stroke();

  ctx.restore();
}

function drawUber(x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, w * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold ' + (w * 0.28) + 'px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Uber', w * 0.5, h * 0.52);
  ctx.restore();
}

// ---- Летящие препятствия: их надо пропускать приседанием ----
function drawBird(x, y, w, h, body, wing, beak) {
  const flap = Math.sin(state.frameCount * 0.26) * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(w * 0.52, h * 0.55, w * 0.34, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.2, h * 0.44, w * 0.15, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Хвост
  ctx.beginPath();
  ctx.moveTo(w * 0.8, h * 0.42);
  ctx.lineTo(w * 1.04, h * 0.26);
  ctx.lineTo(w * 1.0, h * 0.74);
  ctx.closePath();
  ctx.fill();
  // Клюв
  ctx.fillStyle = beak;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.38);
  ctx.lineTo(w * -0.1, h * 0.5);
  ctx.lineTo(w * 0.08, h * 0.58);
  ctx.closePath();
  ctx.fill();
  // Глаз
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.38, 2, 0, Math.PI * 2);
  ctx.fill();
  // Крылья
  ctx.fillStyle = wing;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.45);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.3, w * 0.3, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.5, h * 0.62);
  ctx.rotate(-flap * 0.7);
  ctx.beginPath();
  ctx.ellipse(0, h * 0.24, w * 0.27, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawSatellite(x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  // Солнечные панели
  ctx.fillStyle = '#1A237E';
  ctx.fillRect(0, h * 0.3, w * 0.3, h * 0.4);
  ctx.fillRect(w * 0.7, h * 0.3, w * 0.3, h * 0.4);
  ctx.strokeStyle = '#5C6BC0';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.1 * i, h * 0.3);
    ctx.lineTo(w * 0.1 * i, h * 0.7);
    ctx.moveTo(w * 0.7 + w * 0.1 * i, h * 0.3);
    ctx.lineTo(w * 0.7 + w * 0.1 * i, h * 0.7);
    ctx.stroke();
  }
  // Корпус
  ctx.fillStyle = '#B0BEC5';
  ctx.beginPath();
  ctx.roundRect(w * 0.32, h * 0.2, w * 0.36, h * 0.6, 3);
  ctx.fill();
  // Тарелка
  ctx.fillStyle = '#ECEFF1';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.12, w * 0.16, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Мигающий огонёк
  ctx.fillStyle = Math.floor(state.frameCount / 12) % 2 ? '#FF5252' : '#601010';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.72, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Амстердамский велосипедист: не тормозит и отталкивает Яну назад
function drawCyclist(x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 58, h / 54);

  const spin = -state.frameCount * 0.3;
  const pedal = state.frameCount * 0.3;

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(29, 53, 24, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Колёса со спицами
  const hubs = [13, 45];
  for (let k = 0; k < hubs.length; k++) {
    const hx = hubs[k];
    ctx.strokeStyle = '#1B1B1B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, 43, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * 2, 43 + Math.sin(a) * 2);
      ctx.lineTo(hx + Math.cos(a) * 8.5, 43 + Math.sin(a) * 8.5);
      ctx.stroke();
    }
  }

  // Рама
  ctx.strokeStyle = '#E8531F';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(45, 43);
  ctx.lineTo(31, 43);
  ctx.lineTo(36, 24);
  ctx.lineTo(45, 43);
  ctx.moveTo(31, 43);
  ctx.lineTo(20, 27);
  ctx.moveTo(36, 25);
  ctx.lineTo(20, 27);
  ctx.moveTo(20, 27);
  ctx.lineTo(13, 43);
  ctx.moveTo(20, 27);
  ctx.lineTo(18, 20);
  ctx.stroke();

  // Руль и седло
  ctx.strokeStyle = '#2B2B2B';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(11, 20);
  ctx.lineTo(23, 20);
  ctx.stroke();
  ctx.fillStyle = '#2B2B2B';
  ctx.beginPath();
  ctx.ellipse(36, 22, 5, 2, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Корзинка
  ctx.fillStyle = '#C89B5A';
  ctx.beginPath();
  ctx.roundRect(5, 21, 11, 8, 2);
  ctx.fill();
  ctx.strokeStyle = '#9A7440';
  ctx.lineWidth = 1;
  ctx.stroke();

  const px1 = 31 + Math.cos(pedal) * 6.5;
  const py1 = 43 + Math.sin(pedal) * 6.5;
  const px2 = 31 - Math.cos(pedal) * 6.5;
  const py2 = 43 - Math.sin(pedal) * 6.5;

  // Дальняя нога, корпус, ближняя нога
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2F3E5B';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(35, 20);
  ctx.quadraticCurveTo(29, 31, px2, py2);
  ctx.stroke();

  ctx.strokeStyle = '#1F6FB2';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(35, 20);
  ctx.lineTo(25, 10);
  ctx.stroke();

  ctx.strokeStyle = '#3B4E73';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(35, 20);
  ctx.quadraticCurveTo(28, 32, px1, py1);
  ctx.stroke();

  ctx.strokeStyle = '#1F6FB2';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(25, 10);
  ctx.lineTo(18, 19);
  ctx.stroke();

  // Голова в оранжевой кепке
  ctx.fillStyle = '#F2C9A0';
  ctx.beginPath();
  ctx.arc(22, 6, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F2A03D';
  ctx.beginPath();
  ctx.arc(22, 5, 5.6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(15.5, 4, 7, 1.8);
  ctx.fillStyle = '#12161C';
  ctx.beginPath();
  ctx.arc(19.5, 7, 1, 0, Math.PI * 2);
  ctx.fill();

  // Звонок
  ctx.fillStyle = '#D9D9D9';
  ctx.beginPath();
  ctx.arc(21, 18, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawObstacle(o) {
  switch (o.type) {
    case 'cow': drawCow(o.x, o.y, o.w, o.h); break;
    case 'rocket': drawRocket(o.x, o.y, o.w, o.h); break;
    case 'leetcode': drawLeetCode(o.x, o.y, o.w, o.h); break;
    case 'uber': drawUber(o.x, o.y, o.w, o.h); break;
    case 'eagle': drawBird(o.x, o.y, o.w, o.h, '#5D4037', '#795548', '#FFB300'); break;
    case 'seagull': drawBird(o.x, o.y, o.w, o.h, '#FAFAFA', '#CFD8DC', '#FF7043'); break;
    case 'satellite': drawSatellite(o.x, o.y, o.w, o.h); break;
    case 'cyclist': drawCyclist(o.x, o.y, o.w, o.h); break;
  }
}

function drawPickup(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'cookie') {
    // Печенье «орешек»: две половинки скорлупки и шов из сгущёнки
    const r = p.r;
    ctx.translate(0, Math.sin(p.spin) * 2);
    ctx.rotate(Math.sin(p.spin * 0.6) * 0.25);

    const shell = ctx.createLinearGradient(-r, -r, r * 0.6, r);
    shell.addColorStop(0, '#F0C088');
    shell.addColorStop(0.5, '#D28B48');
    shell.addColorStop(1, '#A2602A');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.84, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Рёбрышки от формочки
    ctx.strokeStyle = 'rgba(120,66,22,0.45)';
    ctx.lineWidth = 1.1;
    for (let k = -1; k <= 1; k++) {
      const off = k * r * 0.42;
      ctx.beginPath();
      ctx.moveTo(off * 0.55, -r * 0.95);
      ctx.quadraticCurveTo(off, 0, off * 0.55, r * 0.95);
      ctx.stroke();
    }

    // Сгущёнка в шве
    ctx.fillStyle = '#FFF2D2';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(226,178,110,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.06, r * 0.82, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Контур и блик
    ctx.strokeStyle = '#8A4E1E';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.84, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.55, r * 0.16, r * 0.10, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'heart') {
    const r = p.r;
    ctx.translate(0, Math.sin(p.spin * 2) * 2);
    ctx.fillStyle = '#FF4D6D';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.8);
    ctx.bezierCurveTo(-r * 1.35, -r * 0.15, -r * 0.55, -r * 1.15, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.55, -r * 1.15, r * 1.35, -r * 0.15, 0, r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.42, r * 0.16, r * 0.24, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const r = p.r;
    ctx.translate(0, Math.sin(p.spin * 2) * 2);
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, -r * 0.55);
    ctx.lineTo(r * 0.85, r * 0.25);
    ctx.quadraticCurveTo(r * 0.85, r, 0, r * 1.15);
    ctx.quadraticCurveTo(-r * 0.85, r, -r * 0.85, r * 0.25);
    ctx.lineTo(-r * 0.85, -r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================
//  СТОЛКНОВЕНИЯ, УРОН И БОНУСЫ
// ============================================================
function overlaps(a, o, padX, padY) {
  const ox = o.x + padX;
  const oy = o.y + padY;
  const ow = o.w - padX * 2;
  const oh = o.h - padY * 2;
  return a.x < ox + ow && a.x + a.w > ox && a.y < oy + oh && a.y + a.h > oy;
}

function hitPlayer() {
  if (player.invuln > 0) return;
  state.streak = 0;
  shake = 11;
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;

  if (player.shield > 0) {
    player.shield = 0;
    player.invuln = 60;
    addParticles(cx, cy, '#4FC3F7', 20, 3.4);
    addFloater(cx, cy - 30, 'ЩИТ СПАС!', '#4FC3F7');
    return;
  }

  state.lives--;
  player.invuln = HIT_INVULN;
  addParticles(cx, cy, '#E94560', 18, 3.2);
  if (state.lives > 0) addFloater(cx, cy - 30, '-1 ♥', '#FF4D6D');
  else endGame(false);
}

// Велосипедист не отнимает жизнь, но сбивает Яну назад и съедает пройденные метры
function pushPlayer() {
  player.pushVx = -7.5;
  state.streak = 0;
  state.distance = Math.max(0, state.distance - 6);
  shake = 10;
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  addParticles(cx, cy, '#FFD166', 14, 2.8);
  addFloater(cx, cy - 28, 'ТОЛЧОК!', '#FFD166');
}

function checkCollisions() {
  const box = playerBox();

  for (const o of obstacles) {
    if (o.hit) continue;
    if (overlaps(box, o, o.flying ? 5 : 6, 4)) {
      o.hit = true;
      if (o.effect === 'push') pushPlayer();
      else hitPlayer();
      if (state.gameOver) return;
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const px = p.x - p.r;
    const py = p.y - p.r;
    const d = p.r * 2;
    if (box.x < px + d && box.x + box.w > px && box.y < py + d && box.y + box.h > py) {
      collect(p);
      pickups.splice(i, 1);
    }
  }
}

function collect(p) {
  if (p.kind === 'cookie') {
    state.streak++;
    const m = multiplier();
    state.cookies++;
    state.score += 10 * m;
    addParticles(p.x, p.y, '#D28B48', 8, 2.6);
    if (m > 1 && state.streak % 6 === 0) addFloater(p.x, p.y - 18, 'x' + m + '!', '#F0C088');
  } else if (p.kind === 'heart') {
    state.lives = Math.min(LIVES_START, state.lives + 1);
    addParticles(p.x, p.y, '#FF4D6D', 14, 3);
    addFloater(p.x, p.y - 18, '+1 ♥', '#FF4D6D');
  } else {
    player.shield = SHIELD_TIME;
    addParticles(p.x, p.y, '#4FC3F7', 14, 3);
    addFloater(p.x, p.y - 18, 'ЩИТ 8с', '#4FC3F7');
  }
}

// ============================================================
//  ЧАСТИЦЫ И ВСПЛЫВАЮЩИЙ ТЕКСТ
// ============================================================
const particles = [];
const floaters = [];
let shake = 0;

function addParticles(x, y, color, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * spread;
    particles.push({
      x: x, y: y, color: color,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.2,
      life: 22 + Math.random() * 16,
      r: 1.5 + Math.random() * 2.5,
    });
  }
}

function addFloater(x, y, text, color) {
  floaters.push({ x: x, y: y, text: text, color: color, life: 48 });
}

function updateEffects() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx - state.speed * 0.3;
    p.y += p.vy;
    p.vy += 0.13;
    p.vx *= 0.98;
    if (--p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 0.9;
    f.x -= state.speed * 0.3;
    if (--f.life <= 0) floaters.splice(i, 1);
  }
}

function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 22));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.lineWidth = 3;
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 30));
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  ФОН
// ============================================================
let bgScroll = 0;
const bgElements = [];

function initBgElements(type) {
  bgElements.length = 0;
  bgScroll = 0;
  const count = 8;
  const span = canvas.width + 200;
  for (let i = 0; i < count; i++) {
    bgElements.push({
      x: (span / count) * i,
      type: type,
      variant: Math.floor(Math.random() * 3),
      scale: 0.6 + Math.random() * 0.6,
    });
  }
}

// ---- Красная площадь: собор, Спасская башня, кремлёвская стена ----
function bgStar(cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// Луковичный купол со спиральными полосами и крестом
function bgOnionDome(cx, baseY, r, color, stripe) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r, baseY);
  ctx.bezierCurveTo(cx - r * 1.3, baseY - r * 1.1, cx - r * 0.55, baseY - r * 1.85, cx, baseY - r * 2.2);
  ctx.bezierCurveTo(cx + r * 0.55, baseY - r * 1.85, cx + r * 1.3, baseY - r * 1.1, cx + r, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = stripe;
  ctx.lineWidth = r * 0.24;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * r * 0.6, baseY - r * 0.15);
    ctx.quadraticCurveTo(cx + i * r * 0.9, baseY - r * 1.2, cx + i * r * 0.12, baseY - r * 2.0);
    ctx.stroke();
  }

  ctx.strokeStyle = '#E8C15A';
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(cx, baseY - r * 2.2);
  ctx.lineTo(cx, baseY - r * 3.0);
  ctx.moveTo(cx - r * 0.38, baseY - r * 2.68);
  ctx.lineTo(cx + r * 0.38, baseY - r * 2.68);
  ctx.stroke();
}

function drawMoscowLandmark(variant) {
  const brick = '#8E3B33';
  const brickHi = '#A54A40';
  const stone = '#EADFC8';

  if (variant === 0) {
    // Собор Василия Блаженного
    ctx.fillStyle = stone;
    ctx.fillRect(0, -46, 76, 46);
    ctx.fillStyle = '#9E3B2E';
    ctx.fillRect(0, -50, 76, 4);
    ctx.fillStyle = '#D5C4A5';
    ctx.fillRect(0, -12, 76, 12);
    ctx.fillStyle = '#B7A182';
    for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 17, -36, 8, 17);

    // Боковые барабаны с куполами
    ctx.fillStyle = stone;
    ctx.fillRect(5, -66, 17, 20);
    ctx.fillRect(48, -62, 16, 16);
    ctx.fillRect(64, -56, 12, 10);
    ctx.fillStyle = '#9E3B2E';
    ctx.fillRect(5, -69, 17, 3);
    ctx.fillRect(48, -65, 16, 3);
    ctx.fillRect(64, -59, 12, 3);
    bgOnionDome(13.5, -69, 10, '#2E7D5B', '#F3ECDC');
    bgOnionDome(56, -65, 9, '#2E5D9E', '#F3ECDC');
    bgOnionDome(70, -59, 7, '#C99A2E', '#F3ECDC');

    // Центральный шатёр
    ctx.fillStyle = stone;
    ctx.fillRect(26, -80, 20, 34);
    ctx.fillStyle = '#9E3B2E';
    ctx.beginPath();
    ctx.moveTo(21, -80);
    ctx.lineTo(36, -116);
    ctx.lineTo(51, -80);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E8C15A';
    ctx.beginPath();
    ctx.arc(36, -119, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E8C15A';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(36, -122);
    ctx.lineTo(36, -130);
    ctx.moveTo(32.5, -127);
    ctx.lineTo(39.5, -127);
    ctx.stroke();
    return;
  }

  if (variant === 1) {
    // Спасская башня с курантами и рубиновой звездой
    ctx.fillStyle = brick;
    ctx.fillRect(2, -80, 30, 80);
    ctx.fillStyle = brickHi;
    ctx.fillRect(-1, -58, 36, 7);

    ctx.fillStyle = '#4A2A24';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(11, -16);
    ctx.arc(17, -16, 6, Math.PI, 0);
    ctx.lineTo(23, 0);
    ctx.closePath();
    ctx.fill();

    // Куранты
    ctx.fillStyle = '#EADFC8';
    ctx.beginPath();
    ctx.arc(17, -70, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C9A24A';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = '#3A2A18';
    ctx.beginPath();
    ctx.moveTo(17, -70);
    ctx.lineTo(17, -76);
    ctx.moveTo(17, -70);
    ctx.lineTo(21.5, -68);
    ctx.stroke();

    ctx.fillStyle = brick;
    ctx.fillRect(6, -94, 22, 14);
    ctx.fillStyle = brickHi;
    ctx.fillRect(4, -97, 26, 4);

    // Зелёный шатёр
    ctx.fillStyle = '#2E6B4F';
    ctx.beginPath();
    ctx.moveTo(3, -97);
    ctx.lineTo(17, -126);
    ctx.lineTo(31, -97);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#C9A24A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(17, -126);
    ctx.lineTo(17, -133);
    ctx.stroke();
    bgStar(17, -139, 7, '#D42B1E');
    return;
  }

  // Кремлёвская стена с зубцами и красным флагом
  ctx.fillStyle = brick;
  ctx.fillRect(0, -40, 84, 40);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let r = 1; r < 5; r++) {
    ctx.beginPath();
    ctx.moveTo(0, -40 + r * 8);
    ctx.lineTo(84, -40 + r * 8);
    ctx.stroke();
  }
  ctx.fillStyle = brickHi;
  for (let i = 0; i < 6; i++) {
    const bx = 2 + i * 14;
    ctx.beginPath();
    ctx.moveTo(bx, -40);
    ctx.lineTo(bx, -53);
    ctx.lineTo(bx + 5, -48);
    ctx.lineTo(bx + 10, -53);
    ctx.lineTo(bx + 10, -40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#9E9E9E';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(74, -53);
  ctx.lineTo(74, -94);
  ctx.stroke();
  ctx.fillStyle = '#D42B1E';
  ctx.beginPath();
  ctx.moveTo(74, -94);
  ctx.quadraticCurveTo(87, -90, 98, -92);
  ctx.lineTo(98, -77);
  ctx.quadraticCurveTo(86, -75, 74, -79);
  ctx.closePath();
  ctx.fill();
  bgStar(84, -85, 4, '#F0C93A');
}

function drawBgElement(el) {
  const gy = groundY();
  ctx.save();
  ctx.translate(el.x, gy - 10);
  ctx.scale(el.scale, el.scale);

  switch (el.type) {
    case 'derbent': {
      if (el.variant === 0) {
        ctx.fillStyle = '#7D6B5D';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(20, -60);
        ctx.lineTo(40, -30);
        ctx.lineTo(60, -80);
        ctx.lineTo(80, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#A0926B';
        ctx.fillRect(15, -90, 20, 90);
        ctx.beginPath();
        ctx.moveTo(10, -90);
        ctx.lineTo(25, -110);
        ctx.lineTo(40, -90);
        ctx.fill();
      }
      break;
    }
    case 'moscow': {
      drawMoscowLandmark(el.variant);
      break;
    }
    case 'telaviv': {
      ctx.fillStyle = '#795548';
      ctx.fillRect(18, -50, 8, 50);
      ctx.fillStyle = '#4CAF50';
      for (let a = 0; a < 5; a++) {
        ctx.save();
        ctx.translate(22, -50);
        ctx.rotate((a * Math.PI * 2) / 5 - Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -20, 8, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'amsterdam': {
      ctx.fillStyle = el.variant === 0 ? '#E53935' : el.variant === 1 ? '#1E88E5' : '#43A047';
      const bh = 60 + el.variant * 15;
      ctx.fillRect(0, -bh, 45, bh);
      ctx.beginPath();
      ctx.moveTo(0, -bh);
      ctx.lineTo(22, -bh - 20);
      ctx.lineTo(45, -bh);
      ctx.fill();
      ctx.fillStyle = '#FFF9C4';
      ctx.fillRect(8, -bh + 15, 12, 12);
      ctx.fillRect(26, -bh + 15, 12, 12);
      ctx.fillRect(8, -bh + 35, 12, 12);
      ctx.fillRect(26, -bh + 35, 12, 12);
      break;
    }
  }
  ctx.restore();
}

function drawBackground() {
  const level = LEVELS[state.levelIndex];
  const gy = groundY();

  // Небо
  const grad = ctx.createLinearGradient(0, 0, 0, gy);
  grad.addColorStop(0, level.skyTop);
  grad.addColorStop(1, level.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, gy);

  // Название города на фоне
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#000';
  ctx.font = 'bold ' + (canvas.width * 0.12) + 'px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(level.name.toUpperCase(), canvas.width / 2, gy * 0.5);
  ctx.globalAlpha = 1;

  // Фоновые элементы
  bgScroll += state.speed * 0.3;
  const span = canvas.width + 200;
  for (const el of bgElements) {
    const drawX = ((((el.x - bgScroll) % span) + span) % span) - 100;
    ctx.save();
    ctx.translate(drawX - el.x, 0);
    drawBgElement(el);
    ctx.restore();
  }

  // Земля
  ctx.fillStyle = level.ground;
  ctx.fillRect(0, gy, canvas.width, canvas.height - gy);

  ctx.strokeStyle = level.groundLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(canvas.width, gy);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  const dashOffset = (state.frameCount * state.speed * 0.5) % 40;
  for (let dx = -dashOffset; dx < canvas.width; dx += 40) {
    ctx.beginPath();
    ctx.moveTo(dx, gy + 15);
    ctx.lineTo(dx + 20, gy + 15);
    ctx.stroke();
  }
}

// Табличка с названием города и подсказкой в начале уровня
function drawIntro() {
  if (state.introTimer <= 0) return;
  const level = LEVELS[state.levelIndex];
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.introTimer / 30);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.34;
  const bw = Math.min(400, canvas.width - 40);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - 46, bw, 92, 14);
  ctx.fill();

  ctx.fillStyle = '#FFE066';
  ctx.font = 'bold 26px Inter, system-ui, sans-serif';
  ctx.fillText('Уровень ' + (state.levelIndex + 1) + ' · ' + level.name, cx, cy - 14);
  ctx.fillStyle = '#A8DADC';
  ctx.font = '15px Inter, system-ui, sans-serif';
  ctx.fillText(level.tip, cx, cy + 18);
  ctx.restore();
}

// ============================================================
//  ОСНОВНОЙ ЦИКЛ (фиксированный шаг 60 Гц)
// ============================================================
function update() {
  if (state.paused) return;
  if (state.introTimer > 0) state.introTimer--;
  if (!state.running || state.gameOver) return;

  state.frameCount++;

  const level = LEVELS[state.levelIndex];
  const progress = Math.min(1, state.distance / level.targetDistance);
  state.speed = level.speed + (level.maxSpeed - level.speed) * progress;
  state.distance += state.speed * 0.05;

  updatePlayer();
  updateObstacles();
  checkCollisions();
  updateEffects();
  if (state.gameOver) return;

  if (state.distance >= level.targetDistance) {
    endGame(true);
    return;
  }

  updateHUD();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawBackground();
  for (const p of pickups) drawPickup(p);
  for (const o of obstacles) drawObstacle(o);
  drawPlayer();
  drawEffects();
  ctx.restore();

  drawIntro();
}

const STEP = 1000 / 60;
let lastTime = 0;
let accumulator = 0;

function gameLoop(now) {
  if (!lastTime) lastTime = now;
  let dt = now - lastTime;
  lastTime = now;
  if (dt > 250) dt = 250;
  accumulator += dt;

  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    update();
    accumulator -= STEP;
    steps++;
  }
  if (accumulator > STEP * 5) accumulator = 0;

  shake *= 0.87;
  if (shake < 0.3) shake = 0;

  render();
  requestAnimationFrame(gameLoop);
}

// ============================================================
//  HUD
// ============================================================
const hud = {
  levelLabel: document.getElementById('level-label'),
  lives: document.getElementById('lives'),
  shield: document.getElementById('shield'),
  cookies: document.getElementById('cookies'),
  score: document.getElementById('score'),
  progress: document.getElementById('progress-fill'),
};
const hudCache = {};

function setText(node, key, value) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  node.textContent = value;
}

function updateHUD() {
  const level = LEVELS[state.levelIndex];
  const m = multiplier();

  setText(hud.levelLabel, 'label',
    (state.levelIndex + 1) + '/' + LEVELS.length + ' ' + level.name);
  setText(hud.cookies, 'cookies', '🍪 ' + state.cookies + (m > 1 ? ' x' + m : ''));
  setText(hud.score, 'score', Math.floor(state.distance) + ' м');

  if (hudCache.lives !== state.lives) {
    hudCache.lives = state.lives;
    const full = Math.max(0, state.lives);
    hud.lives.innerHTML =
      '<span class="on">' + '♥'.repeat(full) + '</span>' +
      '<span class="off">' + '♥'.repeat(Math.max(0, LIVES_START - full)) + '</span>';
  }

  const shieldSec = player.shield > 0 ? Math.ceil(player.shield / 60) : 0;
  if (hudCache.shield !== shieldSec) {
    hudCache.shield = shieldSec;
    hud.shield.hidden = shieldSec === 0;
    if (shieldSec > 0) hud.shield.textContent = '🛡 ' + shieldSec;
  }

  hud.progress.style.width = Math.min(100, (state.distance / level.targetDistance) * 100) + '%';
}

// ============================================================
//  УПРАВЛЕНИЕ ЭКРАНАМИ
// ============================================================
// ============================================================
//  ПАУЗА
// ============================================================
const pauseOverlay = document.getElementById('pause-overlay');
const pauseStats = document.getElementById('pause-stats');

// force = true — снять паузу безусловно (старт уровня, конец забега)
function setPaused(value, force) {
  // Ставить на паузу есть смысл только во время живого забега
  if (value && !force && (state.screen !== 'game-screen' || !state.running || state.gameOver)) return;
  if (state.paused === value) return;
  state.paused = value;
  pauseOverlay.hidden = !value;
  if (value) {
    // Клавиша или палец могли остаться зажатыми — иначе Яна продолжит приседать после снятия
    input.duck = false;
    duckPointer = -1;
    const level = LEVELS[state.levelIndex];
    pauseStats.textContent =
      level.name + ' · ' + Math.floor(state.distance) + ' / ' + level.targetDistance +
      ' м · 🍪 ' + state.cookies + ' · ♥ ' + state.lives;
  }
  updateMusic();
}

function togglePause() {
  setPaused(!state.paused);
}

// ============================================================
//  УПРАВЛЕНИЕ ЭКРАНАМИ
// ============================================================
function showScreen(id) {
  if (id !== 'win-screen') hideGuest();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  state.screen = id;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (id === 'final-screen') startFinal(); else stopFinal();
  updateMusic();
}

// Путешествие всегда начинается с первого города — выбирать уровень нельзя
function startRun() {
  state.totalCookies = 0;
  state.totalScore = 0;
  startLevel(0);
}

function startLevel(index) {
  state.levelIndex = index;
  state.running = true;
  state.gameOver = false;
  setPaused(false, true);
  state.distance = 0;
  state.frameCount = 0;
  state.speed = LEVELS[index].speed;
  state.lives = LIVES_START;
  state.cookies = 0;
  state.score = 0;
  state.streak = 0;
  state.introTimer = 130;

  obstacles = [];
  pickups = [];
  particles.length = 0;
  floaters.length = 0;
  shake = 0;
  spawnTimer = 90;
  input.duck = false;
  for (const k in hudCache) delete hudCache[k];

  // Сначала показываем экран: иначе canvas ещё скрыт и его размер равен нулю.
  showScreen('game-screen');
  resizeCanvas();
  resetPlayer();
  initBgElements(LEVELS[index].bgElements);
  updateHUD();
  preloadGuest(index);
}

function goNextLevel() {
  const next = state.levelIndex + 1;
  if (next >= LEVELS.length) showFinal();
  else startLevel(next);
}

function showFinal() {
  showScreen('final-screen');
}

function endGame(won) {
  state.gameOver = true;
  state.running = false;
  setPaused(false, true);
  input.duck = false;

  const level = LEVELS[state.levelIndex];

  if (!won) {
    document.getElementById('lose-message').textContent =
      'У Яны закончились жизни в городе ' + level.name;
    document.getElementById('lose-score').textContent =
      'Дистанция: ' + Math.floor(state.distance) + ' / ' + level.targetDistance + ' м · 🍪 ' + state.cookies;
    showScreen('lose-screen');
    return;
  }

  const bonus = state.lives * 50;
  state.score += bonus;
  state.totalCookies += state.cookies;
  state.totalScore += state.score;

  // Последний город тоже показывает экран победы — там Катя, а кнопка ведёт в финал
  const last = state.levelIndex >= LEVELS.length - 1;
  const next = last ? null : LEVELS[state.levelIndex + 1];
  // Итог всего забега показываем на последнем экране победы:
  // финал занят гифкой, там для цифр места нет
  document.getElementById('win-message').textContent =
    level.name + ' — ' + Math.floor(state.distance) + ' м · 🍪 ' +
    state.cookies + ' · ' + state.score + ' очков (+' + bonus + ' за ♥)' +
    (last ? ' · за всё путешествие: 🍪 ' + state.totalCookies + ' · ' + state.totalScore + ' очков' : '');
  document.getElementById('next-level-btn').textContent =
    last ? 'Финал →' : 'Дальше: ' + next.name + ' →';
  showScreen('win-screen');
  // После каждого города гостья выскакивает поздравить
  showGuest(state.levelIndex);
}

// ============================================================
//  СОБЫТИЯ
// ============================================================
document.getElementById('start-btn').addEventListener('click', startRun);
document.getElementById('next-level-btn').addEventListener('click', goNextLevel);
document.getElementById('retry-btn').addEventListener('click', () => startLevel(state.levelIndex));
document.getElementById('back-btn').addEventListener('click', () => {
  setPaused(false, true);
  state.running = false;
  showScreen('menu-screen');
});
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', () => setPaused(false));
document.getElementById('pause-restart-btn').addEventListener('click', () => startLevel(state.levelIndex));
document.getElementById('pause-menu-btn').addEventListener('click', () => {
  setPaused(false, true);
  state.running = false;
  showScreen('menu-screen');
});
document.getElementById('win-menu-btn').addEventListener('click', () => showScreen('menu-screen'));
document.getElementById('lose-menu-btn').addEventListener('click', () => showScreen('menu-screen'));
document.getElementById('final-menu-btn').addEventListener('click', () => showScreen('menu-screen'));

const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const DUCK_KEYS = ['ArrowDown', 'KeyS'];

window.addEventListener('keydown', (e) => {
  const jumpKey = JUMP_KEYS.indexOf(e.code) >= 0;
  const duckKey = DUCK_KEYS.indexOf(e.code) >= 0;
  if (jumpKey || duckKey || e.code === 'Enter') e.preventDefault();
  if (e.repeat) return;

  if (e.code === 'KeyM') { toggleSound(); return; }

  if (state.screen === 'game-screen') {
    // P и Escape работают в обе стороны; остальные клавиши на паузе глушатся
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (state.paused) return;
    if (jumpKey) jump();
    else if (duckKey) input.duck = true;
    return;
  }

  if (e.code !== 'Space' && e.code !== 'Enter') return;
  if (state.screen === 'menu-screen') startRun();
  else if (state.screen === 'win-screen') goNextLevel();
  else if (state.screen === 'lose-screen') startLevel(state.levelIndex);
  else if (state.screen === 'final-screen') showScreen('menu-screen');
});

window.addEventListener('keyup', (e) => {
  if (DUCK_KEYS.indexOf(e.code) >= 0) input.duck = false;
});

// Тап/клик: верхняя часть экрана — прыжок, нижняя — присесть
let duckPointer = -1;
canvas.addEventListener('pointerdown', (e) => {
  if (state.screen !== 'game-screen' || state.paused) return;
  const rect = canvas.getBoundingClientRect();
  const ty = (e.clientY - rect.top) / rect.height;
  if (ty > 0.62) {
    input.duck = true;
    duckPointer = e.pointerId;
  } else {
    jump();
  }
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerId === duckPointer) {
    input.duck = false;
    duckPointer = -1;
  }
});
window.addEventListener('pointercancel', () => { input.duck = false; duckPointer = -1; });
window.addEventListener('blur', () => { input.duck = false; });
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

// ============================================================
//  ЗВУК
//  Браузер не даёт стартовать музыку до первого действия пользователя,
//  поэтому запускаем её по первому клику/нажатию клавиши.
// ============================================================
const bgm = document.getElementById('bgm');
const soundBtn = document.getElementById('sound-btn');
let muted = false;
let musicDuck = 1;   // 1 — обычная громкость; меньше — музыка уходит на задний план
try { muted = localStorage.getItem('yana-muted') === '1'; } catch (err) { muted = false; }

function syncSoundUI() {
  soundBtn.textContent = muted ? '🔇' : '🔊';
  soundBtn.classList.toggle('muted', muted);
  soundBtn.title = muted ? 'Включить звук (M)' : 'Выключить звук (M)';
}

// Играет только во время забега: в меню, после проигрыша и в свёрнутой вкладке — тишина
function updateMusic() {
  if (!bgm) return;
  const shouldPlay =
    !muted &&
    !document.hidden &&
    !state.paused &&
    (state.screen === 'game-screen' || state.screen === 'win-screen' ||
     state.screen === 'final-screen');
  if (shouldPlay) {
    bgm.volume = 0.4 * musicDuck;
    const p = bgm.play();
    if (p && p.catch) p.catch(() => {});
  } else {
    bgm.pause();
  }
}

function toggleSound() {
  muted = !muted;
  try { localStorage.setItem('yana-muted', muted ? '1' : '0'); } catch (err) { /* приватный режим */ }
  updateMusic();
  syncSoundUI();
  syncGuestVoice();
}

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSound();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
  updateMusic();
});
window.addEventListener('blur', () => setPaused(true));
syncSoundUI();

// ============================================================
//  ГОСТЬИ
//  После каждого города снизу выпрыгивает говорящая голова с голосовым.
//  Ролик — анимированный WebP: в отличие от WebM с альфа-каналом его
//  прозрачность понимает и Safari. Звук отдельным <audio>, он может быть
//  длиннее ролика, поэтому WebP крутится в цикле, а голову прячем по
//  концу звука.
// ============================================================
const GUESTS = {
  0: 'karina',    // после Дербента
  1: 'natasha',   // после Москвы
  2: 'nastya',    // после Тель-Авива
  3: 'kate',      // после Амстердама
};

const guestPop = document.getElementById('guest-pop');
let guestVoice = null;
let guestHideTimer = 0;

// Ролик весит около мегабайта, поэтому подтягиваем его заранее — пока идёт
// уровень, а не в тот момент, когда гостья должна выпрыгнуть
function preloadGuest(levelIndex) {
  const id = GUESTS[levelIndex];
  if (!id) return;
  const clip = document.getElementById('guest-clip-' + id);
  if (clip && !clip.getAttribute('src')) clip.src = clip.dataset.src;
}

function showGuest(levelIndex) {
  const id = GUESTS[levelIndex];
  if (!guestPop || !id) return;

  const clip = document.getElementById('guest-clip-' + id);
  const voice = document.getElementById('guest-voice-' + id);
  if (!clip || !voice) return;

  clearTimeout(guestHideTimer);
  guestVoice = voice;
  preloadGuest(levelIndex);

  // В контейнере лежат ролики всех гостей — оставляем видимым только нужный
  guestPop.querySelectorAll('img').forEach(el => {
    el.hidden = el !== clip;
  });

  guestPop.hidden = false;
  // Сброс анимации: без reflow повторный показ не перезапустит keyframes
  guestPop.classList.remove('in', 'out');
  void guestPop.offsetWidth;
  guestPop.classList.add('in');

  voice.currentTime = 0;
  musicDuck = 0.22;
  updateMusic();
  syncGuestVoice();
}

function hideGuest() {
  if (!guestPop || guestPop.hidden) return;
  clearTimeout(guestHideTimer);
  guestPop.classList.remove('in');
  guestPop.classList.add('out');
  guestHideTimer = setTimeout(() => {
    guestPop.hidden = true;
    guestPop.classList.remove('out');
  }, 360);

  if (guestVoice) {
    guestVoice.pause();
    guestVoice.currentTime = 0;
  }
  musicDuck = 1;
  updateMusic();
}

// Голос подчиняется общей кнопке звука: мьют глушит, возврат — продолжает
function syncGuestVoice() {
  if (!guestVoice || !guestPop || guestPop.hidden) return;
  if (muted) {
    guestVoice.pause();
  } else {
    const p = guestVoice.play();
    if (p && p.catch) p.catch(() => {});
  }
}

document.querySelectorAll('audio.guest-voice').forEach(a => {
  a.addEventListener('ended', hideGuest);
});

// ============================================================
//  ФИНАЛ
//  Поздравительная гифка во весь экран, вокруг — цветной фон (в CSS)
//  и фейерверки на отдельном канвасе. Залпы уходят по краям, чтобы
//  не лезть на гифку в центре.
// ============================================================
const fwCanvas = document.getElementById('fireworks');
const fwCtx = fwCanvas ? fwCanvas.getContext('2d') : null;
const finalVideo = document.getElementById('final-video');
const FW_COLORS = ['#FF3FA4', '#FFC01E', '#22D3EE', '#7B2FF7', '#FF4D6D', '#8CFF4D', '#FFFFFF'];
let fwParticles = [];
let fwTimer = 0;
let fwRunning = false;

function fwResize() {
  if (!fwCtx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fwCanvas.width = Math.round((fwCanvas.clientWidth || 900) * dpr);
  fwCanvas.height = Math.round((fwCanvas.clientHeight || 600) * dpr);
  fwCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fwBurst(x, y) {
  const color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
  const count = 34 + Math.floor(Math.random() * 20);
  const power = 2.2 + Math.random() * 2.2;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
    const speed = power * (0.55 + Math.random() * 0.75);
    fwParticles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: 52 + Math.random() * 28,
      color: color,
    });
  }
}

function fwFrame() {
  if (!fwRunning) return;
  requestAnimationFrame(fwFrame);

  const w = fwCanvas.clientWidth;
  const h = fwCanvas.clientHeight;
  fwCtx.clearRect(0, 0, w, h);
  // Искры складываются по свету — пересечения вспыхивают ярче
  fwCtx.globalCompositeOperation = 'lighter';

  if (--fwTimer <= 0) {
    fwTimer = 10 + Math.floor(Math.random() * 14);
    // Гифка квадратная и занимает всю высоту, так что свободны только
    // полосы по бокам — туда и целимся
    const strip = Math.max(60, (w - h) / 2);
    const x = Math.random() < 0.5 ? Math.random() * strip : w - Math.random() * strip;
    fwBurst(x, h * (0.08 + Math.random() * 0.68));
  }

  for (let i = fwParticles.length - 1; i >= 0; i--) {
    const p = fwParticles[i];
    p.age++;
    if (p.age >= p.life) {
      fwParticles.splice(i, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.045;        // притяжение тянет искры вниз
    p.vx *= 0.985;
    p.vy *= 0.985;
    fwCtx.globalAlpha = 1 - p.age / p.life;
    fwCtx.fillStyle = p.color;
    fwCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  fwCtx.globalAlpha = 1;
  fwCtx.globalCompositeOperation = 'source-over';
}

function startFinal() {
  if (finalVideo) {
    finalVideo.currentTime = 0;
    const p = finalVideo.play();
    if (p && p.catch) p.catch(() => {});
  }
  if (!fwCtx || fwRunning) return;
  fwResize();
  fwParticles = [];
  fwTimer = 0;
  fwRunning = true;
  requestAnimationFrame(fwFrame);
}

function stopFinal() {
  if (finalVideo) finalVideo.pause();
  if (!fwCtx) return;
  fwRunning = false;
  fwParticles = [];
  fwCtx.clearRect(0, 0, fwCanvas.clientWidth, fwCanvas.clientHeight);
}

window.addEventListener('resize', () => {
  if (fwRunning) fwResize();
});

// Старт
resizeCanvas();
resetPlayer();
initBgElements(LEVELS[0].bgElements);
showScreen('menu-screen');
requestAnimationFrame(gameLoop);
