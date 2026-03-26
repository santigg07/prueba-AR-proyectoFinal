
// ══════════════════════════════════
//  CONFIG
// ══════════════════════════════════
const BOSS_MAX_HP    = 20;
const DAMAGE_PER_TAP = 1;
const SCORE_PER_HIT  = 50;
const LB_KEY         = 'taptap_leaderboard';
const MAX_ENTRIES    = 8;

// ══════════════════════════════════
//  RECOMPENSAS
// ══════════════════════════════════
const REWARDS = [
    {
        id: 'first_blood',
        icon: '⚔️',
        name: 'Guerrero',
        rarity: 'bronze',
        condition: (score, time) => true
    },
    {
        id: 'speedrun',
        icon: '⚡',
        name: 'Veloz',
        rarity: 'silver',
        condition: (score, time) => time <= 15
    },
    {
        id: 'combo_master',
        icon: '🔥',
        name: 'Combo',
        rarity: 'gold',
        condition: (score, time) => score >= 800
    },
    {
        id: 'perfectionist',
        icon: '💎',
        name: 'Perfecto',
        rarity: 'diamond',
        condition: (score, time) => score >= 800 && time <= 20
    }
];

// ══════════════════════════════════
//  STATE
// ══════════════════════════════════
let bossHP       = BOSS_MAX_HP;
let score        = 0;
let gameActive   = false;
let markerVisible = false;
let tiempoInicio = 0;

// ══════════════════════════════════
//  DOM REFS
// ══════════════════════════════════
const hpBar        = document.getElementById('hp-bar');
const hpBar3D      = document.getElementById('hp-bar-3d');
const scoreDisplay = document.getElementById('score-display');
const overlay      = document.getElementById('overlay');
const scanPrompt   = document.getElementById('scan-prompt');
const resultOverlay = document.getElementById('result-overlay');

// ══════════════════════════════════
//  START / RESTART
// ══════════════════════════════════
function startGame() {
    overlay.classList.add('hidden');
    gameActive   = true;
    bossHP       = BOSS_MAX_HP;
    score        = 0;
    tiempoInicio = Date.now();
    updateHpUI();
    updateScoreUI();
    resultOverlay.classList.remove('visible');
}

function restartGame() {
    startGame();
}

// ══════════════════════════════════
//  MARKER EVENTS
// ══════════════════════════════════
const target = document.querySelector('[mindar-image-target]');
target.addEventListener('targetFound', () => {
    markerVisible = true;
    scanPrompt.style.display = 'none';
    const tapHint = document.getElementById('tap-hint');
    if (tapHint) tapHint.setAttribute('visible', true);
});
target.addEventListener('targetLost', () => {
    markerVisible = false;
    scanPrompt.style.display = 'flex';
});

// ══════════════════════════════════
//  INPUT
// ══════════════════════════════════
document.addEventListener('touchstart', handleTap, { passive: false });
document.addEventListener('mousedown',  handleTap);

function handleTap(e) {
    if (e.target.tagName === 'BUTTON') return;
    if (!gameActive)     return;
    if (!markerVisible)  return;

    e.preventDefault();

    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;

    dealDamage(x, y);
}

function dealDamage(x, y) {
    if (bossHP <= 0) return;

    bossHP -= DAMAGE_PER_TAP;
    score  += SCORE_PER_HIT;

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

// ══════════════════════════════════
//  UI UPDATES
// ══════════════════════════════════
function updateHpUI() {
    const pct = Math.max(0, bossHP / BOSS_MAX_HP);
    hpBar.style.width = (pct * 100) + '%';

    if (pct > 0.6)      hpBar.style.background = 'linear-gradient(90deg, #ff2020, #ff6b00)';
    else if (pct > 0.3) hpBar.style.background = 'linear-gradient(90deg, #ff6b00, #ffcc00)';
    else                hpBar.style.background = 'linear-gradient(90deg, #ffcc00, #ffff00)';

    if (hpBar3D) {
        hpBar3D.setAttribute('width', (0.8 * pct).toFixed(3));
        const offsetX = -0.4 * (1 - pct);
        hpBar3D.setAttribute('position', `${offsetX.toFixed(3)} 0 0.005`);
    }
}

function updateScoreUI() {
    scoreDisplay.textContent = score.toLocaleString();
}

// ══════════════════════════════════
//  VFX
// ══════════════════════════════════
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
    const root = document.getElementById('boss-root');
    if (root) {
        root.setAttribute('animation__shake',
            'property: position; from: -0.08 0 0; to: 0.08 0 0; dir: alternate; loop: 3; dur: 80; easing: linear');
        setTimeout(() => {
            root.removeAttribute('animation__shake');
            root.setAttribute('position', '0 0 0');
        }, 300);
    }
}

// ══════════════════════════════════
//  LEADERBOARD (localStorage)
// ══════════════════════════════════
function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch { return []; }
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
//  RENDER LEADERBOARD
// ══════════════════════════════════
const MEDALS = ['🥇', '🥈', '🥉'];

function renderLeaderboard(lb, currentIndex) {
    const tbody = document.getElementById('cuerpotabla');
    if (!tbody) return;

    if (lb.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="lb-empty">Sé el primero en el ranking</td></tr>`;
        return;
    }

    tbody.innerHTML = lb.map((entry, i) => {
        const medal       = MEDALS[i] || '';
        const rankClass   = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
        const currentClass = i === currentIndex ? 'current-run' : '';
        const pts         = entry.puntos.toLocaleString('es-ES');
        return `
        <tr class="${rankClass} ${currentClass}">
            <td>${medal} ${i + 1}</td>
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
    if (!grid) return;

    grid.innerHTML = REWARDS.map(r => `
        <div class="reward-badge ${r.rarity}" id="badge-${r.id}">
            <span class="r-icon">${r.icon}</span>
            <span class="r-name">${r.name}</span>
        </div>
    `).join('');

    REWARDS.forEach((r, i) => {
        if (r.condition(score, time)) {
            setTimeout(() => {
                const el = document.getElementById(`badge-${r.id}`);
                if (el) el.classList.add('unlocked', 'pop');
            }, 600 + i * 200);
        }
    });
}

// ══════════════════════════════════
//  VICTORIA
// ══════════════════════════════════
function showVictory() {
    gameActive = false;

    const tiempoSegundos = Math.floor((Date.now() - tiempoInicio) / 1000);
    
    const nombre = prompt('¿Cómo te llamas?') || 'Jugador';

    // Título
    const titleEl = document.getElementById('result-title');
    titleEl.textContent = '¡VICTORIA!';
    titleEl.className   = 'result-title win';

    // Score
    const scoreEl = document.getElementById('result-score');
    scoreEl.textContent = score.toLocaleString('es-ES');

    // Nuevo récord?
    const prevBest = getLeaderboard()[0]?.puntos || 0;
    if (score > prevBest) {
        scoreEl.classList.add('new-best');
        const badge = document.getElementById('new-best-badge');
        if (badge) badge.classList.add('visible');
    } else {
        scoreEl.classList.remove('new-best');
        const badge = document.getElementById('new-best-badge');
        if (badge) badge.classList.remove('visible');
    }

    // Recompensas
    renderRewards(score, tiempoSegundos);

    // Leaderboard
    const lb = addScore(nombre, score);
    const currentIndex = lb.findIndex(e => e.nombre === nombre && e.puntos === score);
    renderLeaderboard(lb, currentIndex);

    // Mostrar overlay
    resultOverlay.classList.add('visible');

    // Partículas
    for (let i = 0; i < 12; i++) {
        setTimeout(() => {
            spawnRipple(
                Math.random() * window.innerWidth,
                Math.random() * window.innerHeight
            );
        }, i * 80);
    }
}

// ══════════════════════════════════
//  COMPARTIR
// ══════════════════════════════════
function shareScore() {
    const scoreEl = document.getElementById('result-score');
    const pts = scoreEl ? scoreEl.textContent : score;
    const text = `¡He conseguido ${pts} puntos en Tap-Tap Boss! ⚔️ ¿Puedes superarme?`;
    if (navigator.share) {
        navigator.share({ title: 'Tap-Tap Boss', text });
    } else {
        navigator.clipboard.writeText(text)
            .then(() => alert('¡Copiado al portapapeles!'));
    }
}
