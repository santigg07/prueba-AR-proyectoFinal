// ══════════════════════════════════
//  FIREBASE — configuración
// ══════════════════════════════════
import { initializeApp }
    from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getDatabase, ref, push, get, remove, onValue, query, orderByChild, limitToLast }
    from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';

const firebaseConfig = {
    apiKey:            'AIzaSyBsRTuRfoBYNWCy_EAVjfeuRrm48x-L0So',
    authDomain:        'of-spores-and-dreams.firebaseapp.com',
    databaseURL:       'https://of-spores-and-dreams-default-rtdb.europe-west1.firebasedatabase.app',
    projectId:         'of-spores-and-dreams',
    storageBucket:     'of-spores-and-dreams.firebasestorage.app',
    messagingSenderId: '215886371734',
    appId:             '1:215886371734:web:db092892c089c158f69bb7'
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);
const LB_REF      = ref(db, 'leaderboard');
const MAX_ENTRIES = 8;

// ══════════════════════════════════
//  CONFIG JUEGO
// ══════════════════════════════════
const BOSS_MAX_HP        = 20;
const PLAYER_MAX_HP      = 5;
const DAMAGE_PER_TAP     = 1;
const SCORE_BASE         = 50;
const ATTACK_INTERVAL_MS = 2200;
const ATTACK_SPEED_MS    = 1800;
const COMBO_RESET_MS     = 1500;

// ══════════════════════════════════
//  RECOMPENSAS
// ══════════════════════════════════
const REWARDS = [
    { id: 'first_blood', icon: '⚔️', name: 'Guerrero',  rarity: 'bronze',
      condition: (score, time, combo, dmgTaken) => true },
    { id: 'speedrun',    icon: '⚡', name: 'Veloz',     rarity: 'silver',
      condition: (score, time, combo, dmgTaken) => time <= 15 },
    { id: 'untouched',   icon: '🛡️', name: 'Intocable', rarity: 'gold',
      condition: (score, time, combo, dmgTaken) => dmgTaken === 0 },
    { id: 'combo10',     icon: '💎', name: 'x10 Combo', rarity: 'diamond',
      condition: (score, time, combo, dmgTaken) => combo >= 10 }
];

// ══════════════════════════════════
//  STATE
// ══════════════════════════════════
let bossHP            = BOSS_MAX_HP;
let playerHP          = PLAYER_MAX_HP;
let score             = 0;
let gameActive        = false;
let markerVisible     = false;
let tiempoInicio      = 0;
let comboCount        = 0;
let maxCombo          = 0;
let comboTimer        = null;
let damageTaken       = 0;
let attackInterval    = null;
let activeProjectiles = [];

// ══════════════════════════════════
//  DOM REFS
// ══════════════════════════════════
const hpBar             = document.getElementById('hp-bar');
const hpBar3D           = document.getElementById('hp-bar-3d');
const scoreDisplay      = document.getElementById('score-display');
const overlay           = document.getElementById('overlay');
const scanPrompt        = document.getElementById('scan-prompt');
const resultOverlay     = document.getElementById('result-overlay');
const playerHpBar       = document.getElementById('player-hp-bar');
const comboDisplay      = document.getElementById('combo-display');
const multiplierDisplay = document.getElementById('multiplier-display');

// ══════════════════════════════════
//  START / RESTART
// ══════════════════════════════════
function startGame() {
    overlay.classList.add('hidden');
    gameActive   = true;
    bossHP       = BOSS_MAX_HP;
    playerHP     = PLAYER_MAX_HP;
    score        = 0;
    comboCount   = 0;
    maxCombo     = 0;
    damageTaken  = 0;
    tiempoInicio = Date.now();

    updateHpUI();
    updatePlayerHpUI();
    updateScoreUI();
    updateComboUI();
    resultOverlay.classList.remove('visible');
    clearProjectiles();

    attackInterval = setInterval(bossAttack, ATTACK_INTERVAL_MS);
}

function restartGame() { startGame(); }

function stopGame() {
    gameActive = false;
    clearInterval(attackInterval);
    attackInterval = null;
    clearProjectiles();
    if (comboTimer) clearTimeout(comboTimer);
}

// ══════════════════════════════════
//  MARKER EVENTS (AR.js)
// ══════════════════════════════════
const marker = document.getElementById('boss-marker');

if (marker && marker.hasAttribute('preset')) {
    marker.addEventListener('markerFound', () => {
        markerVisible = true;
        scanPrompt.style.display = 'none';
        const tapHint = document.getElementById('tap-hint');
        if (tapHint) tapHint.setAttribute('visible', true);
    });
    marker.addEventListener('markerLost', () => {
        markerVisible = false;
        scanPrompt.style.display = 'flex';
    });
}

// ══════════════════════════════════
//  HIT DETECTION
// ══════════════════════════════════
function getBossScreenRect() {
    const sprite = document.getElementById('boss-sprite');
    if (!sprite || !sprite.object3D) return null;
    const scene  = document.querySelector('a-scene');
    const camera = scene && scene.camera;
    if (!camera) return null;

    const worldPos = new THREE.Vector3();
    sprite.object3D.getWorldPosition(worldPos);
    const projected = worldPos.clone().project(camera);
    if (projected.z > 1) return null;

    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const cx = ( projected.x * 0.5 + 0.5) * sw;
    const cy = (-projected.y * 0.5 + 0.5) * sh;

    const refPos = worldPos.clone();
    refPos.x += 0.6;
    const projectedRef = refPos.clone().project(camera);
    const refCx  = (projectedRef.x * 0.5 + 0.5) * sw;
    const halfW  = Math.abs(refCx - cx);
    const halfH  = halfW * (1.4 / 1.2);
    const margin = 20;

    return { x: cx - halfW - margin, y: cy - halfH - margin,
             w: (halfW + margin) * 2,  h: (halfH + margin) * 2, cx, cy };
}

function isTapOnBoss(tapX, tapY) {
    const rect = getBossScreenRect();
    if (!rect) return false;
    return tapX >= rect.x && tapX <= rect.x + rect.w &&
           tapY >= rect.y && tapY <= rect.y + rect.h;
}

// ══════════════════════════════════
//  INPUT
// ══════════════════════════════════
document.addEventListener('touchstart', handleTap, { passive: false });
document.addEventListener('mousedown',  handleTap);

function handleTap(e) {
    if (e.target.tagName === 'BUTTON') return;
    if (!gameActive)    return;
    if (!markerVisible) return;

    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;

    if (tryDeflectProjectile(x, y)) { e.preventDefault(); return; }
    if (!isTapOnBoss(x, y))         { spawnMissIndicator(x, y); return; }

    e.preventDefault();
    dealDamage(x, y);
}

function spawnMissIndicator(x, y) {
    const el = document.createElement('div');
    el.className    = 'damage-number';
    el.textContent  = 'FALLO';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.color  = 'rgba(255,255,255,0.4)';
    el.style.fontSize   = '16px';
    el.style.fontWeight = '600';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
}

// ══════════════════════════════════
//  COMBATE
// ══════════════════════════════════
function dealDamage(x, y) {
    if (bossHP <= 0) return;

    bossHP -= DAMAGE_PER_TAP;
    comboCount++;
    if (comboCount > maxCombo) maxCombo = comboCount;
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { comboCount = 0; updateComboUI(); }, COMBO_RESET_MS);

    const multiplier = getMultiplier();
    const pts = Math.round(SCORE_BASE * multiplier);
    score += pts;

    updateHpUI();
    updateScoreUI();
    updateComboUI();
    spawnRipple(x, y);
    spawnDamageNumber(x, y, pts);
    flashBoss();

    if (bossHP <= 0) { bossHP = 0; updateHpUI(); setTimeout(showVictory, 600); }
}

function getMultiplier() {
    if (comboCount >= 10) return 4;
    if (comboCount >= 7)  return 3;
    if (comboCount >= 4)  return 2;
    if (comboCount >= 2)  return 1.5;
    return 1;
}

// ══════════════════════════════════
//  ATAQUES DEL BOSS
// ══════════════════════════════════
function bossAttack() {
    if (!gameActive || !markerVisible) return;
    const startX = window.innerWidth  * (0.2 + Math.random() * 0.6);
    const startY = window.innerHeight * 0.25;
    spawnProjectile(startX, startY);
}

function spawnProjectile(x, y) {
    const el = document.createElement('div');
    el.className  = 'boss-projectile';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    document.body.appendChild(el);

    const targetY = window.innerHeight * 0.85;
    el.style.transition = `top ${ATTACK_SPEED_MS}ms linear, opacity ${ATTACK_SPEED_MS}ms ease`;
    el.getBoundingClientRect();
    el.style.top = targetY + 'px';

    const proj = { el, x, startY: y, targetY,
                   startTime: Date.now(), duration: ATTACK_SPEED_MS, deflected: false };
    activeProjectiles.push(proj);

    proj.timer = setTimeout(() => {
        if (!proj.deflected && gameActive) playerTakeDamage(x, targetY);
        removeProjectile(proj);
    }, ATTACK_SPEED_MS);
}

function tryDeflectProjectile(tapX, tapY) {
    const HIT_RADIUS = 55;
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const proj = activeProjectiles[i];
        if (proj.deflected) continue;
        const elapsed  = Date.now() - proj.startTime;
        const progress = Math.min(elapsed / proj.duration, 1);
        const currentY = proj.startY + (proj.targetY - proj.startY) * progress;
        const dx = tapX - proj.x;
        const dy = tapY - currentY;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
            proj.deflected = true;
            clearTimeout(proj.timer);
            proj.el.classList.add('deflected');
            setTimeout(() => removeProjectile(proj), 400);
            spawnRipple(tapX, tapY);
            spawnFloatingText(tapX, tapY, '¡BLOQUEADO!', '#00eeff');
            score += Math.round(SCORE_BASE * 0.5);
            updateScoreUI();
            return true;
        }
    }
    return false;
}

function playerTakeDamage(x, y) {
    playerHP = Math.max(0, playerHP - 1);
    damageTaken++;
    comboCount = 0;
    updateComboUI();
    updatePlayerHpUI();
    spawnFloatingText(x, y, '¡GOLPE!', '#ff3333');
    screenFlash();
    if (playerHP <= 0) setTimeout(showDefeat, 400);
}

function removeProjectile(proj) {
    if (proj.el && proj.el.parentNode) proj.el.parentNode.removeChild(proj.el);
    const idx = activeProjectiles.indexOf(proj);
    if (idx !== -1) activeProjectiles.splice(idx, 1);
}

function clearProjectiles() {
    activeProjectiles.forEach(p => {
        clearTimeout(p.timer);
        if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    });
    activeProjectiles = [];
}

// ══════════════════════════════════
//  UI
// ══════════════════════════════════
function updateHpUI() {
    const pct = Math.max(0, bossHP / BOSS_MAX_HP);
    hpBar.style.width = (pct * 100) + '%';
    if (pct > 0.6)      hpBar.style.background = 'linear-gradient(90deg, #ff2020, #ff6b00)';
    else if (pct > 0.3) hpBar.style.background = 'linear-gradient(90deg, #ff6b00, #ffcc00)';
    else                hpBar.style.background = 'linear-gradient(90deg, #ffcc00, #ffff00)';
    if (hpBar3D) {
        hpBar3D.setAttribute('width', (0.8 * pct).toFixed(3));
        hpBar3D.setAttribute('position', `${(-0.4 * (1 - pct)).toFixed(3)} 0 0.005`);
    }
}

function updatePlayerHpUI() {
    if (!playerHpBar) return;
    const pct = playerHP / PLAYER_MAX_HP;
    playerHpBar.style.width = (pct * 100) + '%';
    playerHpBar.style.background = pct > 0.5
        ? 'linear-gradient(90deg, #00cc66, #00ff88)'
        : pct > 0.25
            ? 'linear-gradient(90deg, #ffaa00, #ffdd00)'
            : 'linear-gradient(90deg, #ff2020, #ff6b00)';
}

function updateScoreUI() {
    scoreDisplay.textContent = score.toLocaleString();
}

function updateComboUI() {
    if (!comboDisplay) return;
    if (comboCount >= 2) {
        comboDisplay.textContent   = `x${comboCount}`;
        comboDisplay.style.opacity = '1';
        const m = getMultiplier();
        if (multiplierDisplay) {
            multiplierDisplay.textContent   = `×${m} PTS`;
            multiplierDisplay.style.opacity = m > 1 ? '1' : '0';
        }
    } else {
        comboDisplay.style.opacity = '0';
        if (multiplierDisplay) multiplierDisplay.style.opacity = '0';
    }
}

// ══════════════════════════════════
//  VFX
// ══════════════════════════════════
function spawnRipple(x, y) {
    const r = document.createElement('div');
    r.className  = 'tap-ripple';
    r.style.left = x + 'px';
    r.style.top  = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 500);
}

function spawnDamageNumber(x, y, pts) {
    const dmg = document.createElement('div');
    dmg.className   = 'damage-number';
    const m = getMultiplier();
    dmg.textContent = (m > 1 ? `x${m} ` : '') + '+' + pts;
    dmg.style.left  = (x - 20 + Math.random() * 40) + 'px';
    dmg.style.top   = (y - 20) + 'px';
    if (m >= 3) dmg.style.color = '#ff8800';
    if (m >= 4) dmg.style.color = '#ff4400';
    document.body.appendChild(dmg);
    setTimeout(() => dmg.remove(), 1000);
}

function spawnFloatingText(x, y, text, color) {
    const el = document.createElement('div');
    el.className   = 'damage-number';
    el.textContent = text;
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.color = color || '#fff';
    el.style.fontSize = '20px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function screenFlash() {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(255,0,0,0.25);pointer-events:none;animation:fadeFlash 0.4s ease forwards;';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
}

function flashBoss() {
    const sprite = document.getElementById('boss-sprite');
    if (!sprite) return;
    sprite.setAttribute('animation__shake',
        'property: position; from: -0.18 0.5 -0.6; to: 0.18 0.5 -0.6; dir: alternate; loop: 3; dur: 80; easing: linear');
    setTimeout(() => {
        sprite.removeAttribute('animation__shake');
        sprite.setAttribute('position', '0 0.5 -0.6');
    }, 300);
}

// ══════════════════════════════════
//  LEADERBOARD — Firebase
// ══════════════════════════════════
async function addScoreFirebase(nombre, puntos) {
    try {
        await push(LB_REF, {
            nombre,
            puntos,
            fecha: new Date().toLocaleDateString('es-ES')
        });
    } catch (err) {
        console.error('Firebase addScore error:', err);
    }
}

async function getLeaderboardFirebase() {
    try {
        const snapshot = await get(LB_REF);
        if (!snapshot.exists()) return [];

        const entries = [];
        snapshot.forEach(child => {
            entries.push({ key: child.key, ...child.val() });
        });

        // Ordenar en el cliente y coger el top MAX_ENTRIES
        entries.sort((a, b) => b.puntos - a.puntos);
        return entries.slice(0, MAX_ENTRIES);
    } catch (err) {
        console.error('Firebase getLeaderboard error:', err);
        return [];
    }
}

async function clearLeaderboard() {
    if (!confirm('¿Borrar todo el ranking?')) return;
    try {
        await remove(LB_REF);
        renderLeaderboard([], -1);
    } catch (err) {
        console.error('Firebase clearLeaderboard error:', err);
    }
}

// Actualización en tiempo real — si otro jugador termina mientras
// estás en la pantalla de resultado, el ranking se actualiza solo
function subscribeLeaderboard(currentNombre, currentPuntos) {
    onValue(LB_REF, snapshot => {
        if (!snapshot.exists()) { renderLeaderboard([], -1); return; }

        const entries = [];
        snapshot.forEach(child => {
            entries.push({ key: child.key, ...child.val() });
        });

        entries.sort((a, b) => b.puntos - a.puntos);
        const top = entries.slice(0, MAX_ENTRIES);

        const currentIndex = top.findIndex(
            e => e.nombre === currentNombre && e.puntos === currentPuntos
        );
        renderLeaderboard(top, currentIndex);
    });
}

// ══════════════════════════════════
//  RENDER TABLA
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
        const medal        = MEDALS[i] || '';
        const rankClass    = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
        const currentClass = i === currentIndex ? 'current-run' : '';
        const pts          = entry.puntos.toLocaleString('es-ES');
        return `<tr class="${rankClass} ${currentClass}">
            <td>${medal} ${i + 1}</td>
            <td>${entry.nombre}</td>
            <td>${pts}</td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════
//  RENDER RECOMPENSAS
// ══════════════════════════════════
function renderRewards(score, time, combo, dmgTaken) {
    const grid = document.getElementById('rewards-grid');
    if (!grid) return;
    grid.innerHTML = REWARDS.map(r => `
        <div class="reward-badge ${r.rarity}" id="badge-${r.id}">
            <span class="r-icon">${r.icon}</span>
            <span class="r-name">${r.name}</span>
        </div>`).join('');
    REWARDS.forEach((r, i) => {
        if (r.condition(score, time, combo, dmgTaken)) {
            setTimeout(() => {
                const el = document.getElementById(`badge-${r.id}`);
                if (el) el.classList.add('unlocked', 'pop');
            }, 600 + i * 200);
        }
    });
}

// ══════════════════════════════════
//  FIN DE PARTIDA
// ══════════════════════════════════
function showVictory() { stopGame(); showResult(true);  }
function showDefeat()  { stopGame(); showResult(false); }

async function showResult(won) {
    const tiempoSegundos = Math.floor((Date.now() - tiempoInicio) / 1000);
    const nombre = prompt('¿Cómo te llamas?') || 'Jugador';

    const titleEl = document.getElementById('result-title');
    titleEl.textContent = won ? '¡VICTORIA!' : '¡DERROTA!';
    titleEl.className   = `result-title ${won ? 'win' : 'lose'}`;

    const scoreEl = document.getElementById('result-score');
    scoreEl.textContent = score.toLocaleString('es-ES');
    scoreEl.classList.remove('new-best');

    const badge = document.getElementById('new-best-badge');
    if (badge) badge.classList.remove('visible');

    const statsEl = document.getElementById('result-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <span>⚡ Combo máx: <b>x${maxCombo}</b></span>
            <span>🛡️ Golpes recibidos: <b>${damageTaken}</b></span>
            <span>⏱️ Tiempo: <b>${tiempoSegundos}s</b></span>
        `;
    }

    renderRewards(score, tiempoSegundos, maxCombo, damageTaken);

    // Mostrar overlay con spinner en la tabla mientras carga Firebase
    resultOverlay.classList.add('visible');
    document.getElementById('cuerpotabla').innerHTML =
        `<tr><td colspan="3" class="lb-empty">Cargando ranking...</td></tr>`;

    if (won) {
        // Guardar puntuación
        await addScoreFirebase(nombre, score);

        // Comprobar si es récord (top 1)
        const lb = await getLeaderboardFirebase();
        if (lb.length > 0 && lb[0].nombre === nombre && lb[0].puntos === score) {
            scoreEl.classList.add('new-best');
            if (badge) badge.classList.add('visible');
        }

        // Suscribir tiempo real — la tabla se actualiza sola
        subscribeLeaderboard(nombre, score);

        // Partículas
        for (let i = 0; i < 12; i++) {
            setTimeout(() => spawnRipple(
                Math.random() * window.innerWidth,
                Math.random() * window.innerHeight
            ), i * 80);
        }
    } else {
        // Derrota — solo mostrar ranking actual sin guardar
        const lb = await getLeaderboardFirebase();
        renderLeaderboard(lb, -1);
    }
}

// ══════════════════════════════════
//  COMPARTIR
// ══════════════════════════════════
function shareScore() {
    const scoreEl = document.getElementById('result-score');
    const pts  = scoreEl ? scoreEl.textContent : score;
    const text = `¡He conseguido ${pts} puntos en Tap-Tap Boss! ⚔️ Combo máx: x${maxCombo} ¿Puedes superarme?`;
    if (navigator.share) {
        navigator.share({ title: 'Tap-Tap Boss', text });
    } else {
        navigator.clipboard.writeText(text)
            .then(() => alert('¡Copiado al portapapeles!'));
    }
}

// ══════════════════════════════════
//  EXPONER AL SCOPE GLOBAL
//  Los módulos ES son privados por defecto —
//  los onclick del HTML necesitan estas funciones
//  en window para poder llamarlas.
// ══════════════════════════════════
window.startGame        = startGame;
window.restartGame      = restartGame;
window.clearLeaderboard = clearLeaderboard;
window.shareScore       = shareScore;