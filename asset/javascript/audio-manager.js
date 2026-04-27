// ══════════════════════════════════════════════════════════════
//  AUDIO MANAGER
//  - Música con crossfade (menu / combat / victory)
//  - Efectos con pool (permite solapar el mismo sfx)
//  - Volúmenes independientes + mute global
//  - Persistencia en localStorage
//  - Auto-desbloqueo en el primer gesto del usuario
// ══════════════════════════════════════════════════════════════

const AUDIO_BASE = "asset/audio/";

// Mapa de archivos 
const MUSIC_TRACKS = {
    menu:    AUDIO_BASE + "music-menu.mp3",
    combat:  AUDIO_BASE + "music-combat.mp3",
    victory: AUDIO_BASE + "music-victory.mp3"
};

const SFX_FILES = {
    attack: AUDIO_BASE + "SFX-zarpazo-pumpumf.mp3",
    hit:    AUDIO_BASE + "sfx-hit.mp3",
    parry:  AUDIO_BASE + "",
    block:  AUDIO_BASE + "sfx-block.mp3",
    damage: AUDIO_BASE + "sfx-damage.mp3",
    defeat: AUDIO_BASE + "sfx-defeat.mp3"
};

const FADE_MS = 800; // duración del crossfade entre pistas
const FADE_STEPS = 20; // resolución del fade
const SFX_POOL_SIZE = 10; // instacias por efecto (solapamiento)
const LS_KEY = "spores-audio-settings";

class AudioManager {
    constructor() {
        this.musicVolume = 0.6;
        this.sfsVolume = 0.8;
        this.muted = false;
        this.currentMusic = null; // key, el, fadeInterval
        this.sfxPools = {};
        this.unlocked = false;
        this.pendingMusic = null; // pista que se quería repoducir antes del unlock

        this._loadSettings();
        this._buildSfxPools();
        this._bindUnlock();
    }

    // Persistencia
    _loadSettings(){
        try{
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (typeof s.musicVolume === 'number') this.musicVolume = s.musicVolume;
            if (typeof s.sfxVolume   === 'number') this.sfxVolume   = s.sfxVolume;
            if (typeof s.muted       === 'boolean') this.muted      = s.muted;
        } catch (e) {/* ignorar */}
    }

    _saveSettings() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                musicVolume: this.musicVolume,
                sfsVolume: this.sfxVolume,
                muted: this.muted
            }));
        }catch (e) { /* ignorar */ }
    }

    // Pool de efectos
    _buildSfxPools() {
        for (const [key, src] of Object.entries(SFX_FILES)) {
            const pool = [];
            for (let i = 0; i < SFX_POOL_SIZE; i++) {
                const a = new Audio(src);
                a.preload = "auto";
                pool.push(a);
            }
            this.sfxPools[key] = {pool, index: 0};
        }
    }

    //  Desbloqueo por gesto del usuario
    _bindUnlock() {
        const unlock = () => {
            if (this.unlocked) return;
            this.unlocked = true;
 
            // Forzar carga: reproducir y pausar todos los Audio
            Object.values(this.sfxPools).forEach(({ pool }) => {
                pool.forEach(a => {
                    a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
                });
            });
 
            // Si había una pista pendiente, arrancarla
            if (this.pendingMusic) {
                this.playMusic(this.pendingMusic);
                this.pendingMusic = null;
            }
        };
        document.addEventListener('touchstart', unlock, { once: true, passive: true });
        document.addEventListener('mousedown',  unlock, { once: true });
        document.addEventListener('click',      unlock, { once: true });
    }

    // Música 
    playMusic(key) {
        if (!MUSIC_TRACKS[key]) return;
 
        // Si aún no tenemos gesto del usuario, guardar para después
        if (!this.unlocked) {
            this.pendingMusic = key;
            return;
        }
 
        // Si ya está sonando la misma, no hacer nada
        if (this.currentMusic && this.currentMusic.key === key) return;
 
        const newEl = new Audio(MUSIC_TRACKS[key]);
        newEl.loop   = (key !== 'victory'); // victory se escucha una vez
        newEl.volume = 0;
 
        // Fade out de la actual + fade in de la nueva en paralelo
        const prev = this.currentMusic;
        this.currentMusic = { key, el: newEl, fadeInterval: null };
 
        const targetVol = this.muted ? 0 : this.musicVolume;
        newEl.play().catch(err => console.warn('[audio] play music falló:', err));
        this._fadeVolume(newEl, 0, targetVol, FADE_MS);
 
        if (prev && prev.el) {
            this._fadeVolume(prev.el, prev.el.volume, 0, FADE_MS, () => {
                prev.el.pause();
                prev.el.src = ''; // liberar
            });
        }
    }

    stopMusic() {
        if (!this.currentMusic) return;
        const prev = this.currentMusic;
        this.currentMusic = null;
        this._fadeVolume(prev.el, prev.el.volume, 0, FADE_MS, () => {
            prev.el.pause();
            prev.el.src = "";
        });
    }

    _fadeVolume(el, from, to, duration, onDone) {
        if (el._fadeTimer) clearInterval(el._fadeTimer);
        const steps = FADE_STEPS;
        const stepTime = duration / steps;
        const delta = (to - from) / steps;
        let current = from;
        let i = 0;
        el.volume = Math.max(0, Math.min(1, from));
        el._fadeTimer = setInterval(() => {
            i++;
            current += delta;
            el.volume = Math.max(0, Math.min(1, current));
            if (i >= steps) {
                clearInterval(el._fadeTimer);
                el._fadeTimer = null;
                el.volume = Math.max(0, Math.min(1, to));
                if (onDone) onDone();
            }
        }, stepTime);
    }

    // Efectos 
    playSfx(key) {
        if (this.muted) return;
        const entry = this.sfxPools[key];
        if (!entry) return;
        const a = entry.pool[entry.index];
        entry.index = (entry.index + 1) % entry.pool.length;
        try {
            a.currentTime = 0;
            a.volume = this.sfxVolume;
            a.play().catch(() => {});
        } catch (e) { /* ignorar */ }
    }

    // Controles públicos
    setMusicVolume(v) {
        this.musicVolume = Math.max(0, Math.min(1, v));
        if (this.currentMusic && !this.muted) {
            this.currentMusic.el.volume = this.musicVolume;
        }
        this._saveSettings();
    }
 
    setSfxVolume(v) {
        this.sfxVolume = Math.max(0, Math.min(1, v));
        this._saveSettings();
    }
 
    setMuted(m) {
        this.muted = !!m;
        if (this.currentMusic) {
            this.currentMusic.el.volume = this.muted ? 0 : this.musicVolume;
        }
        this._saveSettings();
    }
 
    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }
 
    getState() {
        return {
            musicVolume: this.musicVolume,
            sfxVolume:   this.sfxVolume,
            muted:       this.muted
        };
    }
}

// Exportar una única instacia global
export const audio = new AudioManager();
window.audio = audio; // accesible dede consola para debug