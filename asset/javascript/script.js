// ══════════════════════════════════
//  AUDIO
// ══════════════════════════════════
import { audio } from './audio-manager.js';

// ══════════════════════════════════
//  FIREBASE — imports y configuración
// ══════════════════════════════════
import { initializeApp }
    from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getDatabase, ref, push, get, remove, onValue }
    from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut }
    from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

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
const auth        = getAuth(firebaseApp);
const LB_REF      = ref(db, 'leaderboard');
const MAX_ENTRIES = 8;

// Login anónimo automático al cargar — necesario para poder escribir
signInAnonymously(auth).catch(err => console.warn('Auth anónima fallida:', err));

// Arrancar música del menú (el AudioManager esperará al primer gesto del usuario)
audio.playMusic('menu');

// ══════════════════════════════════
//  CONFIG JUEGO
// ══════════════════════════════════
const BOSS_MAX_HP        = 50;
const PLAYER_MAX_HP      = 5;
const DAMAGE_PER_TAP     = 1;
const SCORE_BASE         = 50;
const ATTACK_INTERVAL_MS    = 3800;   // intervalo base entre ataques (más calmado)
const ATTACK_INTERVAL_VAR   = 400;    // variación aleatoria ±X ms (ritmo no robótico)
const WINDUP_MS          = 900;    // fase de aviso (preparación del golpe)
const STRIKE_MS          = 200;    // duración visual del golpe
const PARRY_WINDOW_MS    = 450;    // ventana real para bloquear (empieza antes del strike)
const PARRY_PRE_MS       = 180;    // cuánto antes del strike se puede empezar a bloquear
const RECOVER_MS         = 400;    // recuperación tras el golpe
const COMBO_RESET_MS     = 1500;
const BOSS_BLOCK_CHANCE  = 0.35;   // probabilidad de que el boss bloquee un tap
const BOSS_BLOCK_ANIM_MS = 300;    // duración de la animación de bloqueo

// ── STAMINA del jugador ──
const STAMINA_MAX        = 3;      // golpes seguidos posibles
const STAMINA_REGEN_MS   = 800;    // 1 punto cada X ms
const STAMINA_COST       = 1;      // coste por golpe

// ══════════════════════════════════
//  ANIMACIÓN DEL BOSS — sprites por fase
// ══════════════════════════════════
const BOSS_FRAMES = {
    idle:    ['#boss-idle1', '#boss-idle2', '#boss-idle3'],    // respiración en bucle
    windup:  ['#boss-attack1', '#boss-attack2'],               // levanta el brazo
    strike:  ['#boss-attack3'],                                // momento del puñetazo
    recover: ['#boss-attack2', '#boss-idle2'],                 // transición de vuelta a idle
    block:   ['#boss-block'],                                  // el boss bloquea
    hurt:    ['#boss-hurt'],                                   // el boss recibe daño
    defeat:  ['#boss-defeat1', '#boss-defeat2', '#boss-defeat3'] // animación de derrota
};
const IDLE_FRAME_MS = 400;  // velocidad de la animación idle
const HURT_ANIM_MS  = 200;  // duración del frame hurt
const DEFEAT_ANIM_MS = 1200; // duración total de la animación de derrota

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
let currentAttack     = null;   // { phase: 'windup'|'strike'|'recover', timeouts: [...], parried, parryOpenAt }
let bossAnimTimer     = null;
let bossBusyUntil     = 0;      // timestamp hasta el que el boss está en animación de reacción (block/hurt)
let bossDefeated      = false;  // flag para la animación de derrota
let stamina           = STAMINA_MAX;
let staminaRegenTimer = null;
let attackTimeout     = null;   // timeout del próximo ataque del boss (intervalo variable)

// ══════════════════════════════════
//  DOM REFS
// ══════════════════════════════════
const hpBar             = document.getElementById('hp-bar');
const scoreDisplay      = document.getElementById('score-display');
const overlay           = document.getElementById('overlay');
const scanPrompt        = document.getElementById('scan-prompt');
const resultOverlay     = document.getElementById('result-overlay');
const playerHpBar       = document.getElementById('player-hp-bar');
const comboDisplay      = document.getElementById('combo-display');
const multiplierDisplay = document.getElementById('multiplier-display');
const bossHpCount       = document.getElementById('boss-hp-count');
const playerHpCount     = document.getElementById('player-hp-count');
const staminaBar        = document.getElementById('stamina-bar');
const staminaCount      = document.getElementById('stamina-count');

// ══════════════════════════════════
//  ANIMACIÓN DEL BOSS — helpers
// ══════════════════════════════════
function setBossFrame(src) {
    const sprite = document.getElementById('boss-sprite');
    if (sprite) sprite.setAttribute('material', 'src', src);
}

function playBossAnim(frames, duration) {
    clearInterval(bossAnimTimer);
    bossAnimTimer = null;
    if (!frames || frames.length === 0) return;
    if (frames.length === 1) { setBossFrame(frames[0]); return; }
    let i = 0;
    const step = Math.max(30, duration / frames.length);
    setBossFrame(frames[0]);
    bossAnimTimer = setInterval(() => {
        i = (i + 1) % frames.length;
        setBossFrame(frames[i]);
    }, step);
}

function stopBossAnim() {
    clearInterval(bossAnimTimer);
    bossAnimTimer = null;
    // Volver al loop de respiración idle (en vez de un frame fijo)
    playIdleLoop();
}

// Loop continuo de respiración cuando el boss no está atacando
function playIdleLoop() {
    clearInterval(bossAnimTimer);
    const frames = BOSS_FRAMES.idle;
    if (!frames || frames.length === 0) return;
    let i = 0;
    setBossFrame(frames[0]);
    if (frames.length === 1) return;
    bossAnimTimer = setInterval(() => {
        i = (i + 1) % frames.length;
        setBossFrame(frames[i]);
    }, IDLE_FRAME_MS);
}

// ══════════════════════════════════
//  START / RESTART
// ══════════════════════════════════
function startGame() {
    cancelLeaderboardListener();
    overlay.classList.add('hidden');
    audio.playMusic('combat');
    gameActive   = true;
    bossHP       = BOSS_MAX_HP;
    playerHP     = PLAYER_MAX_HP;
    score        = 0;
    comboCount   = 0;
    maxCombo     = 0;
    damageTaken  = 0;
    bossDefeated = false;
    bossBusyUntil = 0;
    stamina      = STAMINA_MAX;
    tiempoInicio = Date.now();

    updateHpUI();
    updatePlayerHpUI();
    updateScoreUI();
    updateComboUI();
    updateStaminaUI();
    resultOverlay.classList.remove('visible');
    cancelCurrentAttack();
    playIdleLoop();
    startStaminaRegen();
    scheduleNextBossAttack();
}

function restartGame() { startGame(); }

function stopGame() {
    gameActive = false;
    clearTimeout(attackTimeout);
    attackTimeout = null;
    clearInterval(attackInterval); // por compatibilidad si quedó algún resto
    attackInterval = null;
    stopStaminaRegen();
    cancelCurrentAttack();
    // Solo paramos la animación si NO estamos en la secuencia de derrota
    if (!bossDefeated) {
        stopBossAnim();
    }
    if (comboTimer) clearTimeout(comboTimer);
}

function cancelLeaderboardListener() {
    if (_lbUnsubscribe) {
        _lbUnsubscribe();
        _lbUnsubscribe = null;
    }
}

// ══════════════════════════════════
//  MARKER EVENTS (MindAR)
// ══════════════════════════════════
const marker = document.getElementById('boss-marker');
if (marker) {
    marker.addEventListener('targetFound', () => {
        markerVisible = true;
        scanPrompt.style.display = 'none';
    });
    marker.addEventListener('targetLost', () => {
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

    // Obtener la caja 3D del sprite en coordenadas mundo
    const box = new THREE.Box3().setFromObject(sprite.object3D);
    if (box.isEmpty()) return null;

    // Proyectar las 8 esquinas de la caja a pantalla y tomar min/max
    const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];

    const sw = window.innerWidth;
    const sh = window.innerHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let anyInFront = false;

    for (const c of corners) {
        const p = c.clone().project(camera);
        if (p.z <= 1) anyInFront = true;
        const sx = ( p.x * 0.5 + 0.5) * sw;
        const sy = (-p.y * 0.5 + 0.5) * sh;
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
    }

    if (!anyInFront) return null;

    // Margen generoso para que sea fácil acertar
    const margin = 30;
    return {
        x: minX - margin,
        y: minY - margin,
        w: (maxX - minX) + margin * 2,
        h: (maxY - minY) + margin * 2
    };
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

// Guard anti-duplicado — si llega touchstart no procesamos el mousedown emulado
let _lastTapTime = 0;
const _TAP_DEDUP_MS = 400;

function handleTap(e) {
    if (e.target.tagName === 'BUTTON') return;

    // Deduplicar: si acabamos de procesar un touch, ignorar mousedown emulado
    const now = Date.now();
    if (e.type === 'mousedown' && now - _lastTapTime < _TAP_DEDUP_MS) return;
    if (e.type === 'touchstart') _lastTapTime = now;

    if (!gameActive)    return;
    if (!markerVisible) return;

    // Obtener coordenadas del tap, protegido contra NaN
    let x, y;
    if (e.touches && e.touches.length > 0) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
    } else if (typeof e.clientX === 'number' && !isNaN(e.clientX)) {
        x = e.clientX;
        y = e.clientY;
    } else {
        return; // sin coordenadas válidas, ignorar
    }

    // Intentar parry primero — si estamos en fase strike y el tap cae sobre el boss
    if (tryParry(x, y))     { e.preventDefault(); return; }
    if (!isTapOnBoss(x, y)) { spawnMissIndicator(x, y); return; }
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
    if (bossDefeated) return;

    // ── INVULNERABILIDAD DEL BOSS durante preparación/golpe ──
    // El jugador no puede atacar mientras el boss carga el ataque.
    // Sí puede hacer parry (eso se gestiona antes en handleTap).
    if (currentAttack && (currentAttack.phase === 'windup' || currentAttack.phase === 'strike')) {
        spawnFloatingText(x, y, '¡CUBIERTO!', '#ffaa00');
        return; // no consume stamina, no rompe combo
    }

    // ── CHECK STAMINA ──
    if (stamina < STAMINA_COST) {
        spawnFloatingText(x, y, 'AGOTADO', 'rgba(255,80,80,0.85)');
        flashStaminaBar();
        return; // no consume nada porque ya está vacía
    }
    stamina -= STAMINA_COST;
    updateStaminaUI();

    // ── BLOQUEO DEL BOSS ──
    // No puede bloquear si está en mitad de un ataque (sería raro visualmente)
    // Tampoco si acaba de bloquear/recibir daño (cooldown visual)
    const now = Date.now();
    const canBlock = !currentAttack && now >= bossBusyUntil;
    if (canBlock && Math.random() < BOSS_BLOCK_CHANCE) {
        bossBlocksTap(x, y);
        return;
    }

    bossHP -= DAMAGE_PER_TAP;
    audio.playSfx('hit');
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

    // Animación hurt (salvo que estemos en ataque activo — priorizar animación de ataque)
    if (!currentAttack) playHurtAnim();

    if (bossHP <= 0) { bossHP = 0; updateHpUI(); setTimeout(showVictory, 600); }
}

// Boss bloquea el tap del jugador → no hay daño, no rompe combo, feedback visual
function bossBlocksTap(x, y) {
    audio.playSfx('block');
    // Mostrar animación de bloqueo (interrumpe idle loop temporalmente)
    clearInterval(bossAnimTimer);
    bossAnimTimer = null;
    setBossFrame(BOSS_FRAMES.block[0]);
    bossBusyUntil = Date.now() + BOSS_BLOCK_ANIM_MS;

    // Volver a idle cuando termine (si no ha empezado un ataque entretanto)
    setTimeout(() => {
        if (!currentAttack && !bossDefeated && Date.now() >= bossBusyUntil) {
            playIdleLoop();
        }
    }, BOSS_BLOCK_ANIM_MS);

    // Feedback visual al jugador
    spawnFloatingText(x, y, 'BLOQUEADO', '#aaaaaa');
    spawnRipple(x, y);
}

// Animación rápida de daño (frame hurt → vuelta a idle)
function playHurtAnim() {
    clearInterval(bossAnimTimer);
    bossAnimTimer = null;
    setBossFrame(BOSS_FRAMES.hurt[0]);
    bossBusyUntil = Date.now() + HURT_ANIM_MS;
    setTimeout(() => {
        if (!currentAttack && !bossDefeated && Date.now() >= bossBusyUntil) {
            playIdleLoop();
        }
    }, HURT_ANIM_MS);
}

// Animación de derrota (se reproduce una vez, sin loop)
function playDefeatAnim() {
    bossDefeated = true;
    clearInterval(bossAnimTimer);
    bossAnimTimer = null;
    const frames = BOSS_FRAMES.defeat;
    if (!frames || frames.length === 0) return;
    const step = DEFEAT_ANIM_MS / frames.length;
    let i = 0;
    setBossFrame(frames[0]);
    bossAnimTimer = setInterval(() => {
        i++;
        if (i >= frames.length) {
            clearInterval(bossAnimTimer);
            bossAnimTimer = null;
            // Se queda congelado en el último frame
            setBossFrame(frames[frames.length - 1]);
            return;
        }
        setBossFrame(frames[i]);
    }, step);
}

function getMultiplier() {
    if (comboCount >= 10) return 4;
    if (comboCount >= 7)  return 3;
    if (comboCount >= 4)  return 2;
    if (comboCount >= 2)  return 1.5;
    return 1;
}

// ══════════════════════════════════
//  STAMINA — gestión y regeneración
// ══════════════════════════════════
function startStaminaRegen() {
    stopStaminaRegen();
    staminaRegenTimer = setInterval(() => {
        if (!gameActive) return;
        if (stamina < STAMINA_MAX) {
            stamina = Math.min(STAMINA_MAX, stamina + 1);
            updateStaminaUI();
        }
    }, STAMINA_REGEN_MS);
}

function stopStaminaRegen() {
    if (staminaRegenTimer) {
        clearInterval(staminaRegenTimer);
        staminaRegenTimer = null;
    }
}

function updateStaminaUI() {
    if (staminaBar) {
        const pct = (stamina / STAMINA_MAX) * 100;
        staminaBar.style.width = pct + '%';
        // color según nivel
        if (stamina >= 3)        staminaBar.style.background = 'rgba(0,200,255,0.65)';
        else if (stamina >= 2)   staminaBar.style.background = 'rgba(0,160,220,0.6)';
        else if (stamina >= 1)   staminaBar.style.background = 'rgba(255,170,0,0.7)';
        else                     staminaBar.style.background = 'rgba(255,80,80,0.7)';
    }
    if (staminaCount) {
        staminaCount.textContent = `${stamina}/${STAMINA_MAX}`;
    }
}

function flashStaminaBar() {
    if (!staminaBar) return;
    const parent = staminaBar.parentElement;
    if (!parent) return;
    parent.classList.remove('stamina-flash');
    void parent.offsetWidth; // forzar reflow para reiniciar animación
    parent.classList.add('stamina-flash');
}

// ══════════════════════════════════
//  PROGRAMAR ATAQUES DEL BOSS — intervalo variable
// ══════════════════════════════════
function scheduleNextBossAttack() {
    clearTimeout(attackTimeout);
    if (!gameActive || bossDefeated) return;
    // Intervalo aleatorio: ATTACK_INTERVAL_MS ± ATTACK_INTERVAL_VAR
    const variation = (Math.random() * 2 - 1) * ATTACK_INTERVAL_VAR;
    const next = ATTACK_INTERVAL_MS + variation;
    attackTimeout = setTimeout(() => {
        bossAttack();
        scheduleNextBossAttack();
    }, next);
}

// ══════════════════════════════════
//  ATAQUES DEL BOSS — cuerpo a cuerpo con parry
// ══════════════════════════════════
function bossAttack() {
    if (!gameActive || !markerVisible) return;
    if (currentAttack) return; // ya hay uno en curso
    if (bossDefeated)  return;

    currentAttack = { phase: 'windup', timeouts: [], parried: false, parryOpenAt: 0 };

    // Sonido de ataque al empezar el wind-up
    audio.playSfx('attack');

    // Telegraph visual (aro rojo que se cierra alrededor del boss)
    spawnWindupIndicator();

    // FASE 1 — WIND-UP (preparación)
    playBossAnim(BOSS_FRAMES.windup, WINDUP_MS);

    // La ventana de parry se abre un poco ANTES del strike (más permisivo)
    currentAttack.parryOpenAt = Date.now() + WINDUP_MS - PARRY_PRE_MS;

    // FASE 2 — STRIKE (el golpe visual)
    currentAttack.timeouts.push(setTimeout(() => {
        if (!currentAttack) return;
        currentAttack.phase = 'strike';
        playBossAnim(BOSS_FRAMES.strike, STRIKE_MS);
        spawnStrikeImpact();

        // El daño al jugador se evalúa cuando termina la ventana de parry completa
        const parryEndsIn = Math.max(0, (currentAttack.parryOpenAt + PARRY_WINDOW_MS) - Date.now());
        currentAttack.timeouts.push(setTimeout(() => {
            if (currentAttack && !currentAttack.parried && gameActive) {
                playerTakeDamage(window.innerWidth / 2, window.innerHeight / 2);
            }
            // FASE 3 — RECOVER
            if (currentAttack) {
                currentAttack.phase = 'recover';
                playBossAnim(BOSS_FRAMES.recover, RECOVER_MS);
                currentAttack.timeouts.push(setTimeout(() => {
                    currentAttack = null;
                    if (!bossDefeated) playIdleLoop();
                }, RECOVER_MS));
            }
        }, parryEndsIn));
    }, WINDUP_MS));
}

// Devuelve true si el tap fue un parry válido (dentro de la ventana y sobre el boss)
function tryParry(tapX, tapY) {
    if (!currentAttack) return false;
    if (currentAttack.parried) return false;
    // Ventana ampliada: desde parryOpenAt hasta parryOpenAt + PARRY_WINDOW_MS
    const now = Date.now();
    if (now < currentAttack.parryOpenAt) return false;
    if (now > currentAttack.parryOpenAt + PARRY_WINDOW_MS) return false;
    if (!isTapOnBoss(tapX, tapY)) return false;

    currentAttack.parried = true;
    audio.playSfx('parry');
    spawnRipple(tapX, tapY);
    spawnFloatingText(tapX, tapY, '¡PARRY!', '#00eeff');

    // Bonus de puntos + contraataque (daño extra al boss)
    const bonus = Math.round(SCORE_BASE * 1.5);
    score += bonus;
    bossHP -= DAMAGE_PER_TAP;
    if (bossHP < 0) bossHP = 0;
    updateHpUI();
    updateScoreUI();
    flashBoss();
    if (bossHP <= 0) setTimeout(showVictory, 600);
    return true;
}

function cancelCurrentAttack() {
    if (!currentAttack) return;
    currentAttack.timeouts.forEach(t => clearTimeout(t));
    currentAttack = null;
}

function playerTakeDamage(x, y) {
    playerHP = Math.max(0, playerHP - 1);
    audio.playSfx('damage');
    damageTaken++;
    comboCount = 0;
    updateComboUI();
    updatePlayerHpUI();
    spawnFloatingText(x, y, '¡GOLPE!', '#ff3333');
    screenFlash();
    if (playerHP <= 0) setTimeout(showDefeat, 400);
}

// ══════════════════════════════════
//  UI
// ══════════════════════════════════
function updateHpUI() {
    const pct = Math.max(0, bossHP / BOSS_MAX_HP);
    hpBar.style.width = (pct * 100) + '%';
    if (pct > 0.5)       hpBar.style.background = 'linear-gradient(90deg, rgba(255,120,0,0.6), rgba(255,60,60,0.7))';
    else if (pct > 0.25) hpBar.style.background = 'linear-gradient(90deg, rgba(255,180,0,0.6), rgba(255,120,0,0.7))';
    else                 hpBar.style.background = 'linear-gradient(90deg, rgba(255,220,0,0.7), rgba(255,180,0,0.6))';
    if (bossHpCount) {
        bossHpCount.textContent = `${bossHP}/${BOSS_MAX_HP}`;
    } else {
        console.warn('[HUD] bossHpCount no encontrado');
    }
}

function updatePlayerHpUI() {
    if (!playerHpBar) return;
    const pct = playerHP / PLAYER_MAX_HP;
    playerHpBar.style.width = (pct * 100) + '%';
    playerHpBar.style.background = pct > 0.5
        ? 'rgba(0,255,136,0.6)'
        : pct > 0.25
            ? 'rgba(255,170,0,0.6)'
            : 'rgba(255,60,60,0.65)';
    if (playerHpCount) {
        playerHpCount.textContent = `${playerHP}/${PLAYER_MAX_HP}`;
    } else {
        console.warn('[HUD] playerHpCount no encontrado');
    }
}

function updateScoreUI() {
    scoreDisplay.textContent = score.toLocaleString('es-ES');
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

// Aro rojo que se cierra alrededor del boss durante el wind-up
function spawnWindupIndicator() {
    const rect = getBossScreenRect();
    if (!rect) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const el = document.createElement('div');
    el.className = 'windup-indicator';
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.style.animationDuration = WINDUP_MS + 'ms';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), WINDUP_MS + 100);
}

// Flash de impacto en el momento del golpe
function spawnStrikeImpact() {
    const rect = getBossScreenRect();
    if (!rect) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h * 0.7;
    const el = document.createElement('div');
    el.className = 'strike-impact';
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 400);
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
    // Coordenadas actuales del boss en MindAR
    const basePos = sprite.getAttribute('position');
    const baseX   = basePos.x;
    const baseY   = basePos.y;
    const baseZ   = basePos.z;
    const shake   = 0.04;

    sprite.setAttribute('animation__shake',
        `property: position; from: ${baseX - shake} ${baseY} ${baseZ}; to: ${baseX + shake} ${baseY} ${baseZ}; dir: alternate; loop: 3; dur: 80; easing: linear`);

    setTimeout(() => {
        sprite.removeAttribute('animation__shake');
        sprite.setAttribute('position', `${baseX} ${baseY} ${baseZ}`);
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

const FB_REST_URL = 'https://of-spores-and-dreams-default-rtdb.europe-west1.firebasedatabase.app/leaderboard.json';

async function getLeaderboardFirebase() {
    try {
        // Usar REST API — el SDK onValue/get devuelve datos parciales (bug caché)
        const resp = await fetch(FB_REST_URL);
        const data = await resp.json();
        if (!data) return [];
        const entries = Object.entries(data).map(([key, val]) => ({ key, ...val }));
        entries.sort((a, b) => b.puntos - a.puntos);
        console.log('[LB REST] entradas totales:', entries.length);
        return entries.slice(0, MAX_ENTRIES);
    } catch (err) {
        console.error('Firebase getLeaderboard REST error:', err);
        // Fallback al SDK si REST falla
        try {
            const snapshot = await get(LB_REF);
            if (!snapshot.exists()) return [];
            const entries = [];
            snapshot.forEach(child => entries.push({ key: child.key, ...child.val() }));
            entries.sort((a, b) => b.puntos - a.puntos);
            return entries.slice(0, MAX_ENTRIES);
        } catch (e2) {
            console.error('Firebase getLeaderboard SDK fallback error:', e2);
            return [];
        }
    }
}

// Guardar la función de cancelación para evitar listeners duplicados
let _lbUnsubscribe = null;

function subscribeLeaderboard(currentNombre, currentPuntos) {
    // Cancelar listener/polling anterior si existe
    if (_lbUnsubscribe) {
        _lbUnsubscribe();
        _lbUnsubscribe = null;
    }

    // Usar REST polling en vez de onValue (el SDK devuelve datos parciales por caché)
    let active = true;

    async function pollLeaderboard() {
        if (!active) return;
        try {
            const resp = await fetch(FB_REST_URL);
            const data = await resp.json();
            if (!data) { renderLeaderboard([], -1); return; }
            const entries = Object.entries(data).map(([key, val]) => ({ key, ...val }));
            entries.sort((a, b) => b.puntos - a.puntos);
            const top = entries.slice(0, MAX_ENTRIES);

            let currentIndex = -1;
            for (let i = top.length - 1; i >= 0; i--) {
                if (top[i].nombre === currentNombre && top[i].puntos === currentPuntos) {
                    currentIndex = i;
                    break;
                }
            }

            console.log('[LB POLL] entradas recibidas:', entries.length, '| top:', top.length, '| currentIndex:', currentIndex);
            renderLeaderboard(top, currentIndex);
            updateBorrarBtn();
        } catch (err) {
            console.error('[LB POLL] error:', err);
        }
    }

    // Primera carga inmediata
    pollLeaderboard();

    // Polling cada 5s para captar cambios de otros jugadores
    const intervalId = setInterval(pollLeaderboard, 5000);

    _lbUnsubscribe = () => {
        active = false;
        clearInterval(intervalId);
    };
}

// ══════════════════════════════════
//  ADMIN — panel oculto
// ══════════════════════════════════
let adminUnsubscribe = null;

function showAdminPanel() {
    const existing = document.getElementById('admin-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'admin-panel';
    panel.style.cssText = `
        position:fixed; inset:0; z-index:3000;
        background:rgba(0,0,0,0.92);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        gap:16px; padding:32px;
        font-family:'Segoe UI',sans-serif;
    `;

    const currentUser = auth.currentUser;
    const isAdmin = currentUser && !currentUser.isAnonymous;

    if (!isAdmin) {
        panel.innerHTML = `
            <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">ADMIN</div>
            <input id="admin-email" type="email" placeholder="Email admin"
                style="padding:12px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);
                background:rgba(255,255,255,0.08);color:#fff;font-size:14px;width:100%;max-width:300px;">
            <input id="admin-pass" type="password" placeholder="Contraseña"
                style="padding:12px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);
                background:rgba(255,255,255,0.08);color:#fff;font-size:14px;width:100%;max-width:300px;">
            <div id="admin-error" style="color:#ff4444;font-size:13px;display:none;"></div>
            <button onclick="adminLogin()"
                style="padding:12px 32px;background:linear-gradient(135deg,#00ff88,#00cc66);
                color:#000;font-weight:800;font-size:14px;letter-spacing:2px;
                border:none;border-radius:50px;cursor:pointer;width:100%;max-width:300px;">
                ENTRAR
            </button>
            <button onclick="document.getElementById('admin-panel').remove()"
                style="padding:10px 24px;background:rgba(255,255,255,0.07);
                color:rgba(255,255,255,0.5);font-size:13px;letter-spacing:1px;
                border:1px solid rgba(255,255,255,0.1);border-radius:50px;cursor:pointer;">
                CANCELAR
            </button>
        `;
    } else {
        panel.innerHTML = `
            <div style="color:#00ff88;font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">PANEL ADMIN</div>
            <div style="color:rgba(255,255,255,0.5);font-size:12px;margin-bottom:16px;">${currentUser.email}</div>
            <div id="admin-lb-preview" style="width:100%;max-width:360px;max-height:300px;overflow-y:auto;
                background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;">
                <div style="color:rgba(255,255,255,0.3);text-align:center;font-size:13px;">Cargando...</div>
            </div>
            <button onclick="adminClearAll()"
                style="padding:12px 32px;background:linear-gradient(135deg,#ff2020,#cc0000);
                color:#fff;font-weight:800;font-size:14px;letter-spacing:2px;
                border:none;border-radius:50px;cursor:pointer;width:100%;max-width:300px;">
                🗑️ BORRAR TODO EL RANKING
            </button>
            <button onclick="adminLogout()"
                style="padding:10px 24px;background:rgba(255,255,255,0.07);
                color:rgba(255,255,255,0.5);font-size:13px;letter-spacing:1px;
                border:1px solid rgba(255,255,255,0.1);border-radius:50px;cursor:pointer;">
                CERRAR SESIÓN ADMIN
            </button>
            <button onclick="document.getElementById('admin-panel').remove()"
                style="padding:10px 24px;background:transparent;
                color:rgba(255,255,255,0.3);font-size:12px;
                border:none;cursor:pointer;">
                CERRAR
            </button>
        `;
        loadAdminPreview();
    }

    document.body.appendChild(panel);
}

async function loadAdminPreview() {
    const preview = document.getElementById('admin-lb-preview');
    if (!preview) return;
    const lb = await getLeaderboardFirebase();
    if (lb.length === 0) {
        preview.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;font-size:13px;">Ranking vacío</div>';
        return;
    }
    const MEDALS = ['🥇','🥈','🥉'];
    preview.innerHTML = lb.map((e, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.06);
            color:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'rgba(255,255,255,0.6)'};
            font-family:'Segoe UI',sans-serif;font-size:13px;">
            <span>${MEDALS[i]||''} ${i+1}. ${e.nombre}</span>
            <span style="font-weight:700;">${e.puntos.toLocaleString('es-ES')}</span>
        </div>
    `).join('');
}

async function adminLogin() {
    const email = document.getElementById('admin-email')?.value;
    const pass  = document.getElementById('admin-pass')?.value;
    const errEl = document.getElementById('admin-error');
    if (!email || !pass) return;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById('admin-panel')?.remove();
        showAdminPanel(); // reabrir ya autenticado
    } catch (err) {
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = 'Email o contraseña incorrectos';
        }
    }
}

async function adminClearAll() {
    if (!confirm('¿Seguro que quieres borrar TODO el ranking? Esta acción no se puede deshacer.')) return;
    try {
        await remove(LB_REF);
        alert('Ranking borrado correctamente.');
        document.getElementById('admin-panel')?.remove();
    } catch (err) {
        alert('Error al borrar: ' + err.message);
    }
}

async function adminLogout() {
    // Volver a sesión anónima
    await signOut(auth);
    await signInAnonymously(auth);
    document.getElementById('admin-panel')?.remove();
    alert('Sesión admin cerrada.');
}

// Botón admin oculto — toca 5 veces el título del overlay de inicio
let adminTapCount = 0;
let adminTapTimer = null;
const overlayTitle = document.querySelector('.overlay-title');
if (overlayTitle) {
    overlayTitle.addEventListener('click', () => {
        adminTapCount++;
        clearTimeout(adminTapTimer);
        if (adminTapCount >= 5) {
            adminTapCount = 0;
            showAdminPanel();
        } else {
            adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000);
        }
    });
}

// Gesto secreto en pantalla de resultado — toca 5 veces el score
// Se registra cada vez que se muestra el resultado (el elemento existe siempre)
let scoreTapCount = 0;
let scoreTapTimer = null;
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'result-score') {
        scoreTapCount++;
        clearTimeout(scoreTapTimer);
        if (scoreTapCount >= 5) {
            scoreTapCount = 0;
            showAdminPanel();
        } else {
            scoreTapTimer = setTimeout(() => { scoreTapCount = 0; }, 2000);
        }
    }
});

// ══════════════════════════════════
//  BOTÓN BORRAR — visible solo para admin
// ══════════════════════════════════
function updateBorrarBtn() {
    const lbClear = document.querySelector('.lb-clear');
    if (!lbClear) return;
    const currentUser = auth.currentUser;
    const isAdmin = currentUser && !currentUser.isAnonymous;
    lbClear.style.display = isAdmin ? 'block' : 'none';
}

// Escuchar cambios de sesión para actualizar el botón en tiempo real
auth.onAuthStateChanged(() => updateBorrarBtn());

// ══════════════════════════════════
//  BORRAR RANKING (solo admin)
// ══════════════════════════════════
async function clearLeaderboard() {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
        showAdminPanel();
        return;
    }
    if (!confirm('¿Borrar todo el ranking?')) return;
    try {
        await remove(LB_REF);
        renderLeaderboard([], -1);
    } catch (err) {
        alert('Sin permisos para borrar. Inicia sesión como admin.');
    }
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
function showVictory() {
    // Parar el bucle de ataques y cancelar cualquier ataque en curso
    clearTimeout(attackTimeout);
    attackTimeout = null;
    clearInterval(attackInterval);
    attackInterval = null;
    cancelCurrentAttack();
    gameActive = false;
    // Audio: golpe final + música de victoria (fade del combate a la victoria)
    audio.playSfx('defeat');
    audio.playMusic('victory');
    // Reproducir animación de derrota del boss antes del overlay
    playDefeatAnim();
    setTimeout(() => { stopGame(); showResult(true); }, DEFEAT_ANIM_MS + 200);
}
function showDefeat()  {
    // Al perder, volvemos a la música del menú para el overlay de resultado
    audio.playMusic('menu');
    stopGame();
    showResult(false);
}

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
    resultOverlay.classList.add('visible');
    document.getElementById('cuerpotabla').innerHTML =
        `<tr><td colspan="3" class="lb-empty">Cargando ranking...</td></tr>`;

    if (won) {
        await addScoreFirebase(nombre, score);
        // subscribeLeaderboard hace polling REST y detecta
        // si la entrada actual es la mejor para mostrar el nuevo record
        subscribeLeaderboard(nombre, score);
        // Comprobar nuevo record tras un pequeño delay para que Firebase
        // haya procesado el push
        setTimeout(async () => {
            const lb = await getLeaderboardFirebase();
            if (lb.length > 0 && lb[0].nombre === nombre && lb[0].puntos === score) {
                scoreEl.classList.add('new-best');
                if (badge) badge.classList.add('visible');
            }
        }, 800);
        for (let i = 0; i < 12; i++) {
            setTimeout(() => spawnRipple(
                Math.random() * window.innerWidth,
                Math.random() * window.innerHeight
            ), i * 80);
        }
    } else {
        const lb = await getLeaderboardFirebase();
        renderLeaderboard(lb, -1);
        updateBorrarBtn();
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
// ══════════════════════════════════
window.startGame        = startGame;
window.restartGame      = restartGame;
window.clearLeaderboard = clearLeaderboard;
window.shareScore       = shareScore;
window.adminLogin       = adminLogin;
window.adminClearAll    = adminClearAll;
window.adminLogout      = adminLogout;
window.showAdminPanel   = showAdminPanel;