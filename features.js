/* ===================================================
   KAZU HANI — NEW FEATURES v2.0
   Particles, Carousel, Visualizer, Discord, Steam, Accent Toggle
   =================================================== */

/* --- INTERACTIVE PARTICLE CANVAS --- */
(function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let mouseX = -1000, mouseY = -1000;
    let particles = [];
    
    // Performance: Adapt particle count to device specs & user settings
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // On mobile, the particle canvas is fully disabled for performance.
    // CSS already sets opacity:0 on #particle-canvas for mobile.
    // We return here to prevent the RAF loop from running at all.
    if (isMobile || prefersReducedMotion) return;
    
    const PARTICLE_COUNT = 45;
    const CONNECT_DIST = 110;


    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    class CrystalShard {
        constructor() {
            this.reset(true);
        }

        reset(init = false) {
            this.x = Math.random() * canvas.width;
            this.y = init ? Math.random() * canvas.height : -20;
            this.size = Math.random() * 5 + 2.5;
            this.vx = (Math.random() - 0.5) * 0.3;
            // Drifts downwards like ice dust
            this.vy = Math.random() * 0.3 + 0.15;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.015;
            // Shape: 3=Triangle, 4=Diamond, 6=Hexagon
            const r = Math.random();
            this.sides = r < 0.35 ? 3 : (r < 0.75 ? 4 : 6);

            // Precompute vertex coordinates for faster rendering
            this.vertices = [];
            const angleStep = (Math.PI * 2) / this.sides;
            for (let i = 0; i < this.sides; i++) {
                const angle = i * angleStep;
                this.vertices.push({
                    x: Math.cos(angle) * this.size,
                    y: Math.sin(angle) * this.size
                });
            }
        }

        update() {
            // Deflect from mouse (like wind around a solid object)
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 150 && dist > 0) {
                // Stronger repulsion when closer
                const force = (150 - dist) / 150;
                this.vx -= (dx / dist) * force * 0.08;
                this.vy -= (dy / dist) * force * 0.08;
            } else {
                // Return to normal drift speed
                this.vx *= 0.98;
                this.vy = this.vy * 0.95 + (Math.random() * 0.1 + 0.2) * 0.05;
            }

            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.rotationSpeed;

            // Boundary wrapping
            if (this.y > canvas.height + 20) {
                this.reset(false);
            }
            if (this.x < -20) {
                this.x = canvas.width + 20;
            } else if (this.x > canvas.width + 20) {
                this.x = -20;
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.beginPath();
            
            // Draw regular polygon for crystal structure using precomputed vertices
            for (let i = 0; i < this.vertices.length; i++) {
                const v = this.vertices[i];
                if (i === 0) ctx.moveTo(v.x, v.y);
                else ctx.lineTo(v.x, v.y);
            }
            
            ctx.closePath();
            
            // Crystal style gradient stroke/fill
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
            ctx.fillStyle = 'rgba(165, 243, 252, 0.15)';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    // Cache accent color dynamically
    let cachedAccent = '#00f2fe';
    function updateAccentColor() {
        cachedAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() ||
                       getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
                       '#00f2fe';
    }
    updateAccentColor();

    const accentObserver = new MutationObserver(updateAccentColor);
    accentObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    accentObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new CrystalShard());

    let particlesRafId = null;
    function drawParticles() {
        if (document.hidden || document.body.classList.contains('global-paused')) {
            particlesRafId = null;
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const connectionGroups = {};

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.update();
            p.draw();

            // Connect nearby crystals to show molecular grid/lattice
            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const dx = p.x - q.x;
                const dy = p.y - q.y;
                // Performance: use squared distance check first to avoid Math.sqrt
                const distSq = dx * dx + dy * dy;
                const connectDistSq = CONNECT_DIST * CONNECT_DIST;
                if (distSq < connectDistSq) {
                    const d = Math.sqrt(distSq);
                    const alpha = 0.045 * (1 - d / CONNECT_DIST);
                    const roundedAlpha = Math.round(alpha * 100) / 100;
                    if (roundedAlpha > 0) {
                        if (!connectionGroups[roundedAlpha]) {
                            connectionGroups[roundedAlpha] = [];
                        }
                        connectionGroups[roundedAlpha].push(p.x, p.y, q.x, q.y);
                    }
                }
            }
        }

        // Batch draw connection lines
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = cachedAccent;
        for (const alpha in connectionGroups) {
            ctx.globalAlpha = parseFloat(alpha);
            ctx.beginPath();
            const lines = connectionGroups[alpha];
            for (let i = 0; i < lines.length; i += 4) {
                ctx.moveTo(lines[i], lines[i+1]);
                ctx.lineTo(lines[i+2], lines[i+3]);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0; // Reset

        particlesRafId = requestAnimationFrame(drawParticles);
    }
    particlesRafId = requestAnimationFrame(drawParticles);

    // Event listener to resume particle rendering when visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !document.body.classList.contains('global-paused') && !particlesRafId) {
            particlesRafId = requestAnimationFrame(drawParticles);
        }
    });
})();


/* --- ARTWORK CAROUSEL --- */
let currentSlide = 0;

function initCarousel() {
    const track = document.getElementById('artwork-track');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track || !dotsContainer) return;

    const slides = track.querySelectorAll('.carousel-slide');
    dotsContainer.innerHTML = '';
    slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.onclick = () => goToSlide(i);
        dotsContainer.appendChild(dot);
    });
}

function slideCarousel(dir) {
    const track = document.getElementById('artwork-track');
    if (!track) return;
    const slides = track.querySelectorAll('.carousel-slide');
    currentSlide = (currentSlide + dir + slides.length) % slides.length;
    goToSlide(currentSlide);
}

function goToSlide(index) {
    const track = document.getElementById('artwork-track');
    if (!track) return;
    const slides = track.querySelectorAll('.carousel-slide');
    currentSlide = index;
    track.scrollTo({ left: slides[index].offsetLeft, behavior: 'smooth' });

    // Update dots
    const dots = document.querySelectorAll('.carousel-dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

// Init carousel on load
document.addEventListener('DOMContentLoaded', initCarousel);


/* --- AUDIO VISUALIZER --- */
function initVisualizer() {
    const container = document.getElementById('audio-visualizer');
    if (!container) return;
    container.innerHTML = '';
    const barCount = 16;
    for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'vis-bar';
        const speed = (0.8 + Math.random() * 0.8).toFixed(2);
        const min = (4 + Math.random() * 6).toFixed(0);
        const max = (20 + Math.random() * 36).toFixed(0);
        bar.style.setProperty('--bar-speed', speed + 's');
        bar.style.setProperty('--bar-min', min + 'px');
        bar.style.setProperty('--bar-max', max + 'px');
        bar.style.animationDelay = (Math.random() * 1).toFixed(2) + 's';
        container.appendChild(bar);
    }
}
document.addEventListener('DOMContentLoaded', initVisualizer);


/* --- DISCORD LIVE STATUS (Lanyard API — REST + WebSocket) --- */
const DISCORD_ID = '346360416827473921';

/* --- SECURITY SANITIZATION HELPERS --- */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch (e) {}
    return '';
}

let musicProgressInterval = null;

function resolveActivityImageUrl(act) {
    if (!act || !act.assets || !act.assets.large_image) {
        if (act && act.name === 'YouTube Music') {
            return 'images/youtube.png';
        }
        return null;
    }
    const img = act.assets.large_image;
    if (img.startsWith('mp:')) {
        return 'https://media.discordapp.net/' + img.substring(3);
    }
    if (img.startsWith('http://') || img.startsWith('https://')) {
        return img;
    }
    return `https://cdn.discordapp.com/app-assets/${act.application_id}/${img}.png`;
}

function updateDiscordUI(status, activityText, imageUrl = null, state = null, musicData = null, voiceData = null) {
    const dot = document.getElementById('discord-status-dot');
    const text = document.getElementById('discord-status-text');
    const activity = document.getElementById('discord-activity');
    const card = document.getElementById('discord-status');
    
    if (!dot || !text || !activity || !card) return;

    dot.className = 'status-dot ' + status;
    
    let resolvedStatusText = 'Offline';
    if (status === 'online') resolvedStatusText = 'Online';
    else if (status === 'idle') resolvedStatusText = 'Idle';
    else if (status === 'dnd') resolvedStatusText = 'Do Not Disturb';
    
    text.textContent = resolvedStatusText;
    activity.textContent = activityText;

    // Resolve card state styling
    const resolvedState = state || (status === 'offline' ? 'offline' : 'chilling');
    card.classList.remove('discord-state-offline', 'discord-state-chilling', 'discord-state-spotify', 'discord-state-youtube-music', 'discord-state-gaming', 'discord-state-streaming');
    card.classList.add('discord-state-' + resolvedState);

    // --- MUSIC SECTION ---
    const musicContainer = document.getElementById('discord-music-container');
    if (musicContainer) {
        if (musicData && musicData.active) {
            musicContainer.classList.remove('hidden');
            
            const trackArt = document.getElementById('music-album-art');
            const trackTitle = document.getElementById('music-track-title');
            const trackArtist = document.getElementById('music-track-artist');
            const platformLogo = document.getElementById('music-platform-logo');
            const progressBar = document.getElementById('music-progress-bar');
            const timeElapsed = document.getElementById('music-time-elapsed');
            const timeTotal = document.getElementById('music-time-total');

            if (trackArt) trackArt.src = sanitizeUrl(musicData.albumArt) || 'images/kazu small.png';
            if (trackTitle) trackTitle.textContent = musicData.title || 'Unknown Track';
            if (trackArtist) trackArtist.textContent = musicData.artist || 'Unknown Artist';

            if (progressBar) {
                if (musicData.platform === 'spotify') {
                    progressBar.classList.remove('bg-red-500');
                    progressBar.classList.add('bg-[#1ed760]'); // Premium Spotify Green
                } else if (musicData.platform === 'youtube_music') {
                    progressBar.classList.remove('bg-emerald-500', 'bg-[#1ed760]');
                    progressBar.classList.add('bg-red-500');
                }
            }

            if (platformLogo) {
                if (musicData.platform === 'spotify') {
                    platformLogo.innerHTML = `
                        <svg class="w-3.5 h-3.5 text-[#1ed760] fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.782-8.892-.977-.336.075-.668-.135-.745-.47-.077-.337.135-.668.47-.746 3.854-.882 7.15-.506 9.822 1.13.295.178.387.563.205.856zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.845-.107-.97-.52-.125-.413.107-.847.52-.973 3.67-1.114 8.24-.57 11.35 1.344.366.226.486.707.26 1.073zm.106-2.833C14.384 8.54 8.56 8.347 5.176 9.373a1.002 1.002 0 0 1-1.21-.715 1 1 0 0 1 .714-1.212c3.886-1.18 10.32-.953 14.39 1.464a1 1 0 0 1-.722 1.876 1 1 0 0 1-.362-.057z"/>
                        </svg>`;
                } else if (musicData.platform === 'youtube_music') {
                    platformLogo.innerHTML = `
                        <svg class="w-3.5 h-3.5 text-[#ff0000] fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                        </svg>`;
                } else {
                    platformLogo.innerHTML = '';
                }
            }

            if (musicProgressInterval) {
                clearInterval(musicProgressInterval);
                musicProgressInterval = null;
            }

            const updateProgress = () => {
                const now = Date.now();
                const startTime = musicData.startTime;
                const endTime = musicData.endTime;

                if (startTime) {
                    const elapsed = now - startTime;
                    if (endTime) {
                        const duration = endTime - startTime;
                        const percent = Math.min(100, Math.max(0, (elapsed / duration) * 100));
                        if (progressBar) progressBar.style.width = percent + '%';
                        if (timeElapsed) timeElapsed.textContent = formatTime(elapsed);
                        if (timeTotal) timeTotal.textContent = formatTime(duration);
                    } else {
                        if (progressBar) progressBar.style.width = '100%';
                        if (timeElapsed) timeElapsed.textContent = formatTime(elapsed);
                        if (timeTotal) timeTotal.textContent = '--:--';
                    }
                } else {
                    if (progressBar) progressBar.style.width = '0%';
                    if (timeElapsed) timeElapsed.textContent = '0:00';
                    if (timeTotal) timeTotal.textContent = '0:00';
                }
            };

            updateProgress();
            musicProgressInterval = setInterval(updateProgress, 1000);
        } else {
            musicContainer.classList.add('hidden');
            if (musicProgressInterval) {
                clearInterval(musicProgressInterval);
                musicProgressInterval = null;
            }
        }
    }

    // --- VOICE SECTION ---
    const voiceContainer = document.getElementById('discord-voice-container');
    if (voiceContainer) {
        if (voiceData && voiceData.active) {
            voiceContainer.classList.remove('hidden');
            
            const voiceMute = document.getElementById('voice-icon-mute');
            const voiceDeaf = document.getElementById('voice-icon-deaf');

            if (voiceMute) {
                if (voiceData.selfMute) voiceMute.classList.remove('hidden');
                else voiceMute.classList.add('hidden');
            }
            if (voiceDeaf) {
                if (voiceData.selfDeaf) voiceDeaf.classList.remove('hidden');
                else voiceDeaf.classList.add('hidden');
            }
        } else {
            voiceContainer.classList.add('hidden');
        }
    }

    // Toggle idle status placeholder
    const idlePlaceholder = document.getElementById('discord-idle-placeholder');
    if (idlePlaceholder) {
        const hasMusic = musicData && musicData.active;
        const hasVoice = voiceData && voiceData.active;
        if (hasMusic || hasVoice) {
            idlePlaceholder.classList.add('hidden');
        } else {
            idlePlaceholder.classList.remove('hidden');
        }
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function formatTime(ms) {
    if (isNaN(ms) || ms < 0) return '0:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function parseDiscordData(d) {
    const status = d.discord_status || 'offline';
    let activityText = status === 'offline' ? 'No activity' : 'Chilling';
    let imageUrl = null;
    let state = status === 'offline' ? 'offline' : 'chilling';
    
    let musicData = { active: false };
    let voiceData = { active: false };

    // 1. Parse Voice State
    if (d.voice && d.voice.channel_id) {
        voiceData = {
            active: true,
            selfMute: !!d.voice.self_mute,
            selfDeaf: !!d.voice.self_deaf
        };
    }

    // 2. Parse Spotify
    if (d.spotify) {
        musicData = {
            active: true,
            title: d.spotify.song,
            artist: d.spotify.artist,
            albumArt: d.spotify.album_art_url,
            startTime: d.spotify.timestamps ? d.spotify.timestamps.start : null,
            endTime: d.spotify.timestamps ? d.spotify.timestamps.end : null,
            platform: 'spotify'
        };
        activityText = `Listening to ${d.spotify.song}`;
        imageUrl = d.spotify.album_art_url;
        state = 'spotify';
    } 
    // 3. Else Parse YouTube Music from activities
    else if (d.activities && d.activities.length > 0) {
        const ytActivity = d.activities.find(act => act.name === 'YouTube Music');
        if (ytActivity) {
            musicData = {
                active: true,
                title: ytActivity.details || 'Unknown Track',
                artist: ytActivity.state || 'Unknown Artist',
                albumArt: resolveActivityImageUrl(ytActivity),
                startTime: ytActivity.timestamps ? ytActivity.timestamps.start : null,
                endTime: ytActivity.timestamps ? ytActivity.timestamps.end : null,
                platform: 'youtube_music'
            };
            activityText = `Listening to ${musicData.title}`;
            imageUrl = musicData.albumArt;
            state = 'youtube-music';
        }
    }

    // 4. Parse Other Activities if not Spotify / YouTube Music
    if (d.activities && d.activities.length > 0) {
        const customAct = d.activities.find(act => act.type === 4);
        const gameAct = d.activities.find(act => act.type !== 4 && act.name !== 'YouTube Music' && act.name !== 'Spotify');
        
        if (gameAct) {
            if (!musicData.active) {
                activityText = `Playing ${gameAct.name}`;
                imageUrl = resolveActivityImageUrl(gameAct);
                if (gameAct.type === 1) {
                    state = 'streaming';
                } else {
                    state = 'gaming';
                }
            }
        } else if (customAct && customAct.state && !musicData.active) {
            activityText = customAct.state;
        }
    }

    // Save to cache to optimize subsequent page load speeds
    try {
        const discordData = {
            status,
            activityText,
            imageUrl,
            state,
            musicData,
            voiceData,
            timestamp: Date.now()
        };
        localStorage.setItem('discord_status_cache', JSON.stringify(discordData));
    } catch (e) {}

    updateDiscordUI(status, activityText, imageUrl, state, musicData, voiceData);
}

// WebSocket-first approach with instant caching and REST fallback
async function initDiscordStatus() {
    // Testing override for developers
    const urlParams = new URLSearchParams(window.location.search);
    const testDiscord = urlParams.get('test_discord');
    if (testDiscord) {
        let mockData = {};
        if (testDiscord.includes('offline')) {
            mockData = { discord_status: 'offline' };
        } else {
            mockData = { discord_status: 'online', activities: [] };
            if (testDiscord.includes('dnd')) mockData.discord_status = 'dnd';
            if (testDiscord.includes('idle')) mockData.discord_status = 'idle';

            // Check for spotify
            if (testDiscord.includes('spotify')) {
                mockData.spotify = {
                    song: 'Chill Vibes',
                    artist: 'Kazu & Hani',
                    album_art_url: 'images/kazu small.png',
                    timestamps: { start: Date.now() - 45000, end: Date.now() + 180000 }
                };
            }
            // Check for youtube_music
            else if (testDiscord.includes('youtube_music')) {
                mockData.activities = [{
                    type: 0,
                    name: 'YouTube Music',
                    details: 'Midnight City',
                    state: 'M83',
                    timestamps: { start: Date.now() - 60000, end: Date.now() + 240000 },
                    assets: { large_image: 'mp:external/youtube_art' }
                }];
            }

            // Check for gaming
            if (testDiscord.includes('gaming')) {
                mockData.activities = mockData.activities || [];
                mockData.activities.push({
                    type: 0,
                    name: 'Minecraft',
                    state: 'Exploring caves'
                });
            }

            // Check for voice
            if (testDiscord.includes('voice')) {
                mockData.voice = {
                    channel_id: '12345',
                    self_mute: testDiscord.includes('mute'),
                    self_deaf: testDiscord.includes('deaf') || testDiscord.includes('muted')
                };
            }
        }
        parseDiscordData(mockData);
        return; // Skip real API connection
    }

    // 1. Try to load and display from cache immediately to optimize speed
    const cachedDataStr = localStorage.getItem('discord_status_cache');
    if (cachedDataStr) {
        try {
            const cached = JSON.parse(cachedDataStr);
            updateDiscordUI(cached.status, cached.activityText, cached.imageUrl, cached.state, cached.musicData, cached.voiceData);
        } catch (e) {
            localStorage.removeItem('discord_status_cache');
        }
    }

    let wsConnected = false;
    let wsTimeout = null;
    let heartbeatInterval = null;
    let ws = null;

    // Helper to transition to REST fallback
    function handleWsFailure() {
        if (wsConnected) return; // If we already got live data, ignore
        cleanupWs();
        initDiscordStatusREST();
    }

    function cleanupWs() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        if (wsTimeout) {
            clearTimeout(wsTimeout);
            wsTimeout = null;
        }
        if (ws) {
            try {
                ws.close();
            } catch (e) {}
            ws = null;
        }
    }

    // Try WebSocket first
    try {
        ws = new WebSocket('wss://api.lanyard.rest/socket');
        
        // Timeout if WebSocket doesn't connect/respond in 3 seconds
        wsTimeout = setTimeout(() => {
            if (!wsConnected) {
                console.warn("Discord WebSocket timed out. Falling back to REST.");
                handleWsFailure();
            }
        }, 3000);

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.op === 1) {
                    // Hello — send init
                    ws.send(JSON.stringify({
                        op: 2,
                        d: { subscribe_to_id: DISCORD_ID }
                    }));
                    // Heartbeat
                    // Ensure the heartbeat interval is a valid number and clamped to prevent resource exhaustion (DoS)
                    const rawInterval = parseInt(msg.d.heartbeat_interval, 10);
                    const interval = (!isNaN(rawInterval) && rawInterval >= 5000 && rawInterval <= 300000) ? rawInterval : 30000;

                    heartbeatInterval = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ op: 3 }));
                        }
                    }, interval);
                } else if (msg.op === 0 && msg.d) {
                    wsConnected = true;
                    if (wsTimeout) {
                        clearTimeout(wsTimeout);
                        wsTimeout = null;
                    }
                    parseDiscordData(msg.d);
                }
            } catch (e) {
                console.error("Error parsing WebSocket message:", e);
            }
        };

        ws.onerror = () => {
            handleWsFailure();
        };

        ws.onclose = () => {
            if (!wsConnected) {
                handleWsFailure();
            } else {
                // Attempt WebSocket reconnect in 5s if it closed post-connection
                cleanupWs();
                setTimeout(initDiscordStatus, 5000);
            }
        };
    } catch (e) {
        handleWsFailure();
    }

    // REST fallback function
    async function initDiscordStatusREST() {
        try {
            const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    parseDiscordData(data.data);
                    // Set up polling since REST works
                    setInterval(async () => {
                        try {
                            const r = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
                            if (r.ok) {
                                const d = await r.json();
                                if (d.success && d.data) parseDiscordData(d.data);
                            }
                        } catch (e) { /* silent */ }
                    }, 30000);
                    return;
                }
            }
        } catch (e) {
            // If cache not present, fallback to Offline
            if (!localStorage.getItem('discord_status_cache')) {
                updateDiscordUI('offline', 'Status unavailable');
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', initDiscordStatus);


/* --- STEAM ACTIVITY WIDGET --- */
const FALLBACK_STEAM_GAMES = [
    {
        name: "s&box",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/590830/7cc1dedaa1eb9a36b9a7eb204a79800ae1a328fa/capsule_184x69.jpg",
        hours: "2.4",
        link: "https://store.steampowered.com/app/590830/sbox/"
    },
    {
        name: "Satisfactory",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/526870/fe7cbb345c177f83f829a61f0e0ab951b42c7ab1/capsule_184x69.jpg",
        hours: "2.2",
        link: "https://store.steampowered.com/app/526870/Satisfactory/"
    },
    {
        name: "VRChat",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/438100/capsule_184x69.jpg",
        hours: "1.7",
        link: "https://store.steampowered.com/app/438100/VRChat/"
    }
];

function renderSteamFallback() {
    renderSteamWidget({
        type: 'profile',
        profileName: 'Kazu | カズ',
        statusText: 'Online',
        displayImg: 'https://avatars.akamai.steamstatic.com/ed2c7926fdb6d4680d3a57847cf06afe690418ba_full.jpg',
        recentGames: FALLBACK_STEAM_GAMES
    });
}

function renderSteamWidget(data) {
    const widget = document.getElementById('steam-widget');
    if (!widget) return;

    const displayImg = sanitizeUrl(data.displayImg || 'https://avatars.akamai.steamstatic.com/ed2c7926fdb6d4680d3a57847cf06afe690418ba_full.jpg');
    const profileName = escapeHtml(data.profileName || 'Kazu | カズ');
    const statusText = escapeHtml(data.statusText || 'Online');
    const inGame = data.currentGame || null;
    const games = data.recentGames || FALLBACK_STEAM_GAMES;

    // Apply glow effect classes dynamically depending on status
    const card = document.getElementById('steam-activity');
    if (card) {
        card.classList.remove('steam-state-offline', 'steam-state-online', 'steam-state-ingame');
        if (inGame) {
            card.classList.add('steam-state-ingame');
        } else if (statusText.toLowerCase().includes('offline')) {
            card.classList.add('steam-state-offline');
        } else {
            card.classList.add('steam-state-online');
        }
    }

    const isOffline = statusText.toLowerCase().includes('offline');
    const statusDotClass = (inGame || !isOffline) ? 'online' : 'offline';
    const badgeClass = inGame ? 'steam-badge-ingame' : (isOffline ? 'steam-badge-offline' : 'steam-badge-online');
    const badgeLabel = inGame ? '&#127918; IN-GAME' : (isOffline ? 'OFFLINE' : 'ONLINE');

    const displayedGames = (games || []).slice(0, 3);
    const maxHours = Math.max(0.1, ...displayedGames.map(g => parseFloat(g.hours) || 0));

    let gamesHtml = '';
    if (displayedGames.length > 0) {
        gamesHtml = '<div class="md:col-span-7 flex flex-col gap-1 w-full mt-4 md:mt-0 md:pl-5 md:border-l md:border-white/10">' +
            '<div class="flex items-center justify-between mb-2">' +
            '<span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Recent Activity</span>' +
            '<a href="https://steamcommunity.com/id/Kazu-Hani/games/?tab=recent" target="_blank" class="steam-view-all text-[10px] text-gray-500 transition-colors flex items-center gap-1 font-medium">View all</a>' +
            '</div>' +
            '<div class="flex flex-col gap-0.5">' +
            displayedGames.map(function(g) {
                var pct = Math.max(6, Math.round((parseFloat(g.hours) / maxHours) * 100));
                return '<a href="' + escapeHtml(sanitizeUrl(g.link)) + '" target="_blank" class="steam-game-row flex items-center gap-3 w-full p-1.5 rounded-xl transition-all duration-200">' +
                    '<img src="' + escapeHtml(sanitizeUrl(g.logo)) + '" alt="' + escapeHtml(g.name) + '" width="88" height="33" class="steam-capsule w-[88px] h-[33px] rounded-md object-cover border border-white/5 transition-all duration-300 flex-shrink-0" onerror="this.onerror=null;this.src=\'images/youtube.png\';">' +
                    '<div class="overflow-hidden flex-grow min-w-0">' +
                    '<div class="steam-game-name text-xs font-bold text-white transition-colors truncate">' + escapeHtml(g.name) + '</div>' +
                    '<div class="text-[10px] text-gray-500 truncate mt-0.5">' + escapeHtml(g.hours) + ' hrs past 2 wks</div>' +
                    '<div class="w-full h-[3px] rounded-full bg-white/[0.06] mt-1.5 overflow-hidden">' +
                    '<div class="steam-progress-bar h-full rounded-full" style="width:' + pct + '%"></div>' +
                    '</div></div></a>';
            }).join('') +
            '</div></div>';
    }

    widget.innerHTML =
        '<div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full z-10 relative">' +
        '<div class="md:col-span-5 flex flex-col items-center text-center gap-2 w-full">' +
        '<a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="flex flex-col items-center gap-2 w-full group/profile">' +
        '<div class="relative flex-shrink-0">' +
        '<img src="' + displayImg + '" alt="' + profileName + '" width="72" height="72" class="steam-avatar w-24 h-24 md:w-[72px] md:h-[72px] rounded-xl object-cover border-2 border-white/10 shadow-lg transition-all duration-300" onerror="this.onerror=null;this.src=\'images/kazu small.png\';">'+
        '<span class="status-dot ' + statusDotClass + '" style="position:absolute;bottom:-3px;right:-3px;z-index:10;"></span>' +
        '</div>' +
        '<div class="steam-profile-name text-sm font-bold text-white transition-colors truncate w-full leading-tight">' + profileName + '</div>' +
        '</a>' +
        '<div class="steam-badge ' + badgeClass + '">' + badgeLabel + '</div>' +
        (inGame ? '<div class="text-[10px] text-white/50 truncate max-w-[150px] leading-tight">' + escapeHtml(inGame) + '</div>' : '') +
        '<a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="glass-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold w-full max-w-[120px] mt-1">' +
        'View Profile</a></div>' +
        gamesHtml +
        '</div>';
}

async function fetchSteamActivity() {
    const widget = document.getElementById('steam-widget');
    if (!widget) return;

    // Check localStorage cache first
    const cachedDataStr = localStorage.getItem('steam_activity_cache');
    if (cachedDataStr) {
        try {
            const cachedData = JSON.parse(cachedDataStr);
            if (cachedData && cachedData.displayImg && !cachedData.displayImg.includes('_full')) {
                throw new Error('Upgrade cache to high-res');
            }
            // Render cached data immediately
            renderSteamWidget(cachedData);
            
            // If cache is less than 5 minutes old, skip network fetch to optimize speed
            if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
                return;
            }
        } catch (e) {
            localStorage.removeItem('steam_activity_cache');
        }
    } else {
        // Render fallback immediately so there's no layout shift or blank states
        renderSteamFallback();
    }

    // Try multiple CORS proxy approaches
    const STEAM_URL = 'https://steamcommunity.com/id/Kazu-Hani/?xml=1';
    const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(STEAM_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(STEAM_URL)}`,
    ];

    let xmlText = null;

    for (const proxyUrl of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) continue;
            const data = await res.json().catch(() => null);
            if (data && data.contents) {
                xmlText = data.contents; // allorigins wraps in {contents: ...}
                break;
            }
            // If not JSON, try as raw text
            if (!data) {
                xmlText = await res.text();
                if (xmlText && xmlText.includes('<profile>')) break;
                xmlText = null;
            }
        } catch (e) {
            continue;
        }
    }

    // If proxies failed, try the games feed directly via allorigins /get
    if (!xmlText) {
        try {
            const gamesUrl = 'https://steamcommunity.com/id/Kazu-Hani/games/?tab=recent&xml=1';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(gamesUrl)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.contents) xmlText = data.contents;
            }
        } catch (e) { /* continue */ }
    }

    if (xmlText) {
        try {
            const parser = new DOMParser();
            const xml = parser.parseFromString(xmlText, 'text/xml');

            // Check for profile XML (has <profile> root)
            const profileName = xml.querySelector('steamID')?.textContent;
            const onlineState = xml.querySelector('onlineState')?.textContent;
            const stateMessage = xml.querySelector('stateMessage')?.textContent;
            const avatarIcon = xml.querySelector('avatarIcon')?.textContent;
            const avatarMedium = xml.querySelector('avatarMedium')?.textContent;
            const avatarFull = xml.querySelector('avatarFull')?.textContent;
            const currentGame = xml.querySelector('inGameInfo gameName')?.textContent;

            // Check for games list XML
            const games = xml.querySelectorAll('game');

            if (profileName) {
                // Profile XML found
                let statusText = stateMessage || onlineState || 'Offline';
                // Clean HTML entities safely using DOMParser (immune to XSS and flags)
                if (statusText) {
                    try {
                        const doc = new DOMParser().parseFromString(statusText, 'text/html');
                        statusText = doc.body.textContent || statusText;
                    } catch (e) {}
                }
                statusText = statusText.trim();

                const displayImg = avatarFull || avatarMedium || avatarIcon || 'https://avatars.akamai.steamstatic.com/ed2c7926fdb6d4680d3a57847cf06afe690418ba_full.jpg';

                // Parse recently played games
                const mostPlayedGamesElements = xml.querySelectorAll('mostPlayedGames mostPlayedGame');
                const recentGames = [];
                mostPlayedGamesElements.forEach(g => {
                    const name = g.querySelector('gameName')?.textContent;
                    const logo = g.querySelector('gameLogo')?.textContent || g.querySelector('gameIcon')?.textContent;
                    const hours = g.querySelector('hoursPlayed')?.textContent || '0';
                    const link = g.querySelector('gameLink')?.textContent || '#';
                    if (name) {
                        // Clean HTML entities safely
                        let cleanName = name;
                        try {
                            const doc = new DOMParser().parseFromString(name, 'text/html');
                            cleanName = doc.body.textContent || name;
                        } catch(e) {}
                        recentGames.push({ name: cleanName, logo, hours, link });
                    }
                });

                const steamData = {
                    type: 'profile',
                    profileName,
                    statusText,
                    displayImg,
                    currentGame: currentGame || null,
                    recentGames: recentGames.length > 0 ? recentGames : FALLBACK_STEAM_GAMES,
                    timestamp: Date.now()
                };

                localStorage.setItem('steam_activity_cache', JSON.stringify(steamData));
                renderSteamWidget(steamData);
                return;
            }

            if (games.length > 0) {
                // Games list XML fallback
                const recentGames = [];
                games.forEach((g, index) => {
                    if (index >= 3) return;
                    const name = g.querySelector('name')?.textContent || 'Unknown';
                    const logo = g.querySelector('logo')?.textContent || '';
                    const hours = g.querySelector('hoursLast2Weeks')?.textContent || '0';
                    const link = g.querySelector('storeLink')?.textContent || '#';
                    recentGames.push({ name, logo, hours, link });
                });

                const steamData = {
                    type: 'profile',
                    profileName: 'Kazu | カズ',
                    statusText: 'Online',
                    displayImg: 'https://avatars.akamai.steamstatic.com/ed2c7926fdb6d4680d3a57847cf06afe690418ba_full.jpg',
                    recentGames,
                    timestamp: Date.now()
                };

                localStorage.setItem('steam_activity_cache', JSON.stringify(steamData));
                renderSteamWidget(steamData);
                return;
            }
        } catch (e) {
            console.warn('Steam XML parse error:', e);
        }
    }

    // If fetch failed and we don't have cached data, ensure fallback is rendered
    if (!localStorage.getItem('steam_activity_cache')) {
        renderSteamFallback();
    }
}
document.addEventListener('DOMContentLoaded', fetchSteamActivity);

/* --- PLAYLIST SIDEBAR CONTROLS --- */
function openPlaylistSidebar(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const sidebar = document.getElementById('playlist-sidebar');
    const iframe = document.getElementById('playlist-iframe');
    if (!sidebar || !iframe) return;

    // Load iframe content dynamically only when opened
    let isYoutube = false;
    if (iframe.src) {
        try {
            const url = new URL(iframe.src);
            if (url.hostname === 'www.youtube-nocookie.com' || url.hostname === 'youtube-nocookie.com') {
                isYoutube = true;
            }
        } catch (e) {
            // Invalid URL
        }
    }
    if (!isYoutube) {
        // Standard YouTube embed format for playlists with no-cookie domain
        iframe.src = "https://www.youtube-nocookie.com/embed/videoseries?list=PLEWxJlvxPVrkYhMCA1IlYwDh5bg-jf39m";
    }

    sidebar.classList.add('active');
    document.body.classList.add('sidebar-active');
    
    // Play sound click
    if (window.playClick) window.playClick();
}

function closePlaylistSidebar() {
    const sidebar = document.getElementById('playlist-sidebar');
    if (sidebar) {
        sidebar.classList.remove('active');
    }
    document.body.classList.remove('sidebar-active');
    if (window.playClick) window.playClick();
}

window.openPlaylistSidebar = openPlaylistSidebar;
window.closePlaylistSidebar = closePlaylistSidebar;