
// ── Config ──
const BOSS_MAX_HP  = 20;
const DAMAGE_PER_TAP = 1;
const SCORE_PER_HIT  = 50;

// ── State ──
let bossHP    = BOSS_MAX_HP;
let score     = 0;
let gameActive = false;
let markerVisible = false;

// ── DOM refs ──
const hpBar       = document.getElementById('hp-bar');
const hpBar3D     = document.getElementById('hp-bar-3d');
const scoreDisplay= document.getElementById('score-display');
const overlay     = document.getElementById('overlay');
const scanPrompt  = document.getElementById('scan-prompt');
const resultOverlay = document.getElementById('result-overlay');
const resultTitle = document.getElementById('result-title');
const resultScore = document.getElementById('result-score');
const tapHint     = document.getElementById('tap-hint');

// ── Start / Restart ──
function startGame() {
    overlay.classList.add('hidden');
    gameActive = true;
    bossHP  = BOSS_MAX_HP;
    score   = 0;
    updateHpUI();
    updateScoreUI();
    resultOverlay.classList.remove('visible');
}

function restartGame() {
    startGame();
}

// ── Marker events ──
const marker = document.getElementById('boss-marker');
    marker.addEventListener('markerFound', () => {
    markerVisible = true;
    scanPrompt.style.display = 'none';
    if (tapHint) tapHint.setAttribute('visible', true);
});

marker.addEventListener('markerLost', () => {
    markerVisible = false;
    scanPrompt.style.display = 'flex';
});

// ── Touch / click ──
document.addEventListener('touchstart', handleTap, { passive: false });
document.addEventListener('mousedown',  handleTap);

function handleTap(e) {
    // Ignorar clicks en botones
    if (e.target.tagName === 'BUTTON') return;
    if (!gameActive) return;
    if (!markerVisible) return;

    e.preventDefault();

    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;

    dealDamage(x, y);
}

function dealDamage(x, y) {
    if (bossHP <= 0) return;

    bossHP  -= DAMAGE_PER_TAP;
    score   += SCORE_PER_HIT;

    updateHpUI();
    updateScoreUI();
    spawnRipple(x, y);
    spawnDamageNumber(x, y);
    flashBoss();

    if (bossHP <= 0) {
      bossHP = 0;
      updateHpUI();
      setTimeout(showVictory, 600);
    }
}

function updateHpUI() {
    const pct = Math.max(0, bossHP / BOSS_MAX_HP);
    hpBar.style.width = (pct * 100) + '%';

    // Color de la barra según HP
    if (pct > 0.6)      hpBar.style.background = 'linear-gradient(90deg, #ff2020, #ff6b00)';
    else if (pct > 0.3) hpBar.style.background = 'linear-gradient(90deg, #ff6b00, #ffcc00)';
    else                hpBar.style.background = 'linear-gradient(90deg, #ffcc00, #ffff00)';

    // Barra 3D en la escena AR
    if (hpBar3D) {
      hpBar3D.setAttribute('width', (0.8 * pct).toFixed(3));
      const offsetX = -0.4 * (1 - pct);
      hpBar3D.setAttribute('position', `${offsetX.toFixed(3)} 0 0.005`);
    }
}

function updateScoreUI() {
    scoreDisplay.textContent = score.toLocaleString();
}

// ── VFX ──
function spawnRipple(x, y) {
    const r = document.createElement('div');
    r.className = 'tap-ripple';
    r.style.left = x + 'px';
    r.style.top  = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 500);
}

function spawnDamageNumber(x, y) {
    const dmg = document.createElement('div');
    dmg.className = 'damage-number';
    dmg.textContent = '-' + (DAMAGE_PER_TAP * 100);
    dmg.style.left = (x - 20 + Math.random() * 40) + 'px';
    dmg.style.top  = (y - 20) + 'px';
    document.body.appendChild(dmg);
    setTimeout(() => dmg.remove(), 1000);
}

function flashBoss() {
    const body = document.getElementById('boss-body');
    const head = document.getElementById('boss-head');
    const aura = document.getElementById('boss-aura');

    // Flash rojo
    [body, head].forEach(el => {
      if (!el) return;
      const orig = el.getAttribute('color');
      el.setAttribute('color', '#ff4400');
      setTimeout(() => el.setAttribute('color', orig), 150);
    });

    // Shake via position animation temporal
    const root = document.getElementById('boss-root');
    if (root) {
      root.setAttribute('animation__shake', 
        'property: position; from: -0.08 0 0; to: 0.08 0 0; dir: alternate; loop: 3; dur: 80; easing: linear');
      setTimeout(() => {
        root.removeAttribute('animation__shake');
        root.setAttribute('position', '0 0 0');
      }, 300);
    }

    // Hit ring flash
    const ring = document.getElementById('hit-ring');
    if (ring) {
      ring.setAttribute('opacity', '0.8');
      ring.setAttribute('animation__ring', 'property: opacity; to: 0; dur: 300');
      setTimeout(() => ring.removeAttribute('animation__ring'), 350);
    }
}

function showVictory() {
    gameActive = false;
    resultTitle.textContent  = '¡VICTORIA!';
    resultTitle.className    = 'result-title win';
    resultScore.textContent  = `Puntuación: ${score.toLocaleString()}`;
    resultOverlay.classList.add('visible');

    // Explosión de partículas
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const rx = Math.random() * window.innerWidth;
        const ry = Math.random() * window.innerHeight;
        spawnRipple(rx, ry);
      }, i * 80);
    }
}

// ══════════════════════════════════
//  CONFIGURACIÓN DE RECOMPENSAS
// ══════════════════════════════════
const REWARDS = [
  {
    id: 'first_blood',
    icon: '⚔️',
    name: 'Primer golpe',
    desc: 'Completa tu primera partida',
    rarity: 'bronze',
    condition: (score, time) => true   // siempre al ganar
  },
  {
    id: 'speedrun',
    icon: '⚡',
    name: 'Speedrun',
    desc: 'Derrota al boss en menos de 15s',
    rarity: 'silver',
    condition: (score, time) => time <= 15
  },
  {
    id: 'combo_master',
    icon: '🔥',
    name: 'Combo',
    desc: 'Consigue más de 1500 puntos',
    rarity: 'gold',
    condition: (score, time) => score >= 1500
  },
  {
    id: 'perfectionist',
    icon: '💎',
    name: 'Perfecto',
    desc: 'Más de 2000 puntos en menos de 20s',
    rarity: 'diamond',
    condition: (score, time) => score >= 2000 && time <= 20
  }
];

// ══════════════════════════════════
//  LEADERBOARD (localStorage)
// ══════════════════════════════════
const LB_KEY = 'taptap_leaderboard';
const MAX_ENTRIES = 8;

function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LB_KEY)) || [];
  } catch { return []; }
}

function saveLeaderboard(lb) {
  localStorage.setItem(LB_KEY, JSON.stringify(lb));
}

function addScore(nombre, puntos) {
  const lb = getLeaderboard();
  lb.push({ nombre, puntos, fecha: new Date().toLocaleDateString('es-ES') });
  lb.sort((a, b) => b.puntos - a.puntos);
  const trimmed = lb.slice(0, MAX_ENTRIES);
  saveLeaderboard(trimmed);
  return trimmed;
}

function clearLeaderboard() {
  if (confirm('¿Borrar todo el ranking?')) {
    localStorage.removeItem(LB_KEY);
    renderLeaderboard([], -1);
  }
}

// ══════════════════════════════════
//  RENDER TABLA
// ══════════════════════════════════
const MEDALS = ['🥇', '🥈', '🥉'];

function renderLeaderboard(lb, currentIndex) {
  const tbody = document.getElementById('cuerpotabla');

  if (lb.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="lb-empty">Sé el primero en el ranking</td></tr>`;
    return;
  }

  tbody.innerHTML = lb.map((entry, i) => {
    const medal = MEDALS[i] || '';
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : '';
    const currentClass = i === currentIndex ? 'current-run' : '';
    const pts = entry.puntos.toLocaleString('es-ES');
    return `
      <tr class="${rankClass} ${currentClass}">
        <td><span class="rank-medal">${medal}</span>${i + 1}</td>
        <td>${entry.nombre}</td>
        <td>${pts}</td>
      </tr>`;
  }).join('');
}

// ══════════════════════════════════
//  RENDER RECOMPENSAS
// ══════════════════════════════════
function renderRewards(score, time) {
  const grid = document.getElementById('rewards-grid');

  grid.innerHTML = REWARDS.map(r => `
    <div class="reward-badge ${r.rarity}" id="badge-${r.id}">
      <span class="icon">${r.icon}</span>
      <span class="name">${r.name}</span>
      <span class="pts">${r.desc}</span>
    </div>
  `).join('');

  // Desbloquear con delay escalonado
  REWARDS.forEach((r, i) => {
    if (r.condition(score, time)) {
      setTimeout(() => {
        const el = document.getElementById(`badge-${r.id}`);
        el.classList.add('unlocked', 'pop');
      }, 700 + i * 200);
    }
  });
}

// ══════════════════════════════════
//  MOSTRAR RESULTADO
// ══════════════════════════════════
function showResult(nombre, score, timeSeconds, won) {
  // Título
  const titleEl = document.getElementById('result-title');
  titleEl.textContent = won ? '¡VICTORIA!' : '¡DERROTA!';
  titleEl.className = `result-title ${won ? 'win' : 'lose'} anim`;

  // Score
  document.getElementById('result-score').textContent = score.toLocaleString('es-ES');

  // Recompensas
  renderRewards(score, timeSeconds);

  // Leaderboard
  const prevBest = getLeaderboard()[0]?.puntos || 0;
  const lb = won ? addScore(nombre, score) : getLeaderboard();
  const currentIndex = lb.findIndex(e => e.nombre === nombre && e.puntos === score);
  renderLeaderboard(lb, currentIndex);

  // Nuevo récord
  if (won && score > prevBest) {
    document.getElementById('result-score').classList.add('new-best');
    document.getElementById('new-best-badge').classList.add('visible');
  }
}

// ══════════════════════════════════
//  COMPARTIR
// ══════════════════════════════════
function shareScore() {
  const score = document.getElementById('result-score').textContent;
  const text = `¡He conseguido ${score} puntos en Tap-Tap Boss! ⚔️ ¿Puedes superarme?`;
  if (navigator.share) {
    navigator.share({ title: 'Tap-Tap Boss', text });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => alert('¡Texto copiado al portapapeles!'));
  }
}

function restartGame() {
  alert('Reiniciando partida...');
  // En tu proyecto: llamar a tu función startGame()
}

// ══════════════════════════════════
//  DEMO — simula una partida
// ══════════════════════════════════
// Añade datos de prueba al localStorage para ver el ranking
const demoData = [
  { nombre: 'Beatriz', puntos: 1800, fecha: '20/3/2026' },
  { nombre: 'Carlos',  puntos: 1350, fecha: '21/3/2026' },
  { nombre: 'Ana',     puntos: 950,  fecha: '22/3/2026' },
];
if (!localStorage.getItem(LB_KEY)) {
  saveLeaderboard(demoData);
}

// Simula resultado: jugador "Tú", 2100 pts, 18 segundos, victoria
showResult('Tú', 2100, 18, true);