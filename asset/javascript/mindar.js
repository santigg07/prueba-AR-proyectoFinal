// ══════════════════════════════════
//  MINDAR — ciclo de vida y eventos
//  Este archivo se carga DESPUÉS de script.js
// ══════════════════════════════════

(function () {

    const arScene   = document.getElementById('ar-scene');
    const arLoader  = document.getElementById('ar-loader');
    const loaderText  = document.getElementById('loader-text');
    const loaderError = document.getElementById('loader-error');
    const loaderRing  = document.querySelector('.loader-ring');

    // ── Textos progresivos mientras carga ──
    const loadingMessages = [
        { ms: 0,    text: 'Iniciando cámara...' },
        { ms: 2000, text: 'Cargando recursos...' },
        { ms: 5000, text: 'Preparando AR...' },
        { ms: 12000, text: 'Casi listo...' },
    ];

    loadingMessages.forEach(({ ms, text }) => {
        setTimeout(() => {
            if (loaderText && !arLoader.classList.contains('hidden')) {
                loaderText.textContent = text;
            }
        }, ms);
    });

    // ── MindAR listo — ocultar loader ──
    arScene.addEventListener('arReady', () => {
        arLoader.classList.add('hidden');
        console.log('[MindAR] arReady — cámara activa');
    });

    // ── Error de MindAR ──
    arScene.addEventListener('arError', (e) => {
        console.error('[MindAR] arError:', e);
        if (loaderText)  loaderText.style.display  = 'none';
        if (loaderRing)  loaderRing.style.display  = 'none';
        if (loaderError) loaderError.classList.add('visible');
    });

    // ── Target encontrado / perdido ──
    // Usamos DOMContentLoaded para asegurarnos de que
    // el elemento ya existe cuando añadimos los listeners
    function bindTargetEvents() {
        const mindTarget = document.getElementById('boss-marker');
        if (!mindTarget) {
            console.warn('[MindAR] boss-marker no encontrado todavía, reintentando...');
            setTimeout(bindTargetEvents, 500);
            return;
        }

        mindTarget.addEventListener('targetFound', () => {
            console.log('[MindAR] targetFound');
            // markerVisible está definido en script.js
            if (typeof markerVisible !== 'undefined') markerVisible = true;

            const sp = document.getElementById('scan-prompt');
            if (sp) sp.style.display = 'none';

            const tapHint = document.getElementById('tap-hint');
            if (tapHint) tapHint.setAttribute('visible', true);
        });

        mindTarget.addEventListener('targetLost', () => {
            console.log('[MindAR] targetLost');
            if (typeof markerVisible !== 'undefined') markerVisible = false;

            const sp = document.getElementById('scan-prompt');
            if (sp) sp.style.display = 'flex';
        });

        console.log('[MindAR] eventos targetFound/targetLost registrados');
    }

    // Esperar a que A-Frame registre el elemento antes de bindear
    arScene.addEventListener('loaded', bindTargetEvents);

})();
