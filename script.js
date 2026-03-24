
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

const jugadores = [
  {nombre: "beatriz", puntos: 150},
  {nombre: "ana", puntos: 200},
  {nombre: "carlos", puntos: 180}
];

jugadores.sort((a, b) => b.puntos - a.puntos);

function generarTabla() {
  const cuerpo = document.getElementById("cuerpoTala");
  cuerpo.innerHTML = "";

  jugadores.forEach((jugador, index) => {
    const fila = `
            <tr>
                <td>${index + 1}</td>
                <td>${jugador.nombre}</td>
                <td>${jugador.puntos}</td>
            </tr>
          `;
          cuerpo.innerHTML += fila;
  });
}

generarTabla();