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
            
            // Draw regular polygon for crystal structure
            const angleStep = (Math.PI * 2) / this.sides;
            for (let i = 0; i < this.sides; i++) {
                const angle = i * angleStep;
                const px = Math.cos(angle) * this.size;
                const py = Math.sin(angle) * this.size;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
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

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new CrystalShard());

    function drawParticles() {
        if (document.hidden) { requestAnimationFrame(drawParticles); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Get accent colors dynamically
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00f2fe';

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.update();
            p.draw();

            // Connect nearby crystals to show molecular grid/lattice
            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const d = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
                if (d < CONNECT_DIST) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = accent;
                    ctx.globalAlpha = 0.045 * (1 - d / CONNECT_DIST);
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(drawParticles);
    }
    requestAnimationFrame(drawParticles);
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

function updateDiscordUI(status, activityText, imageUrl = null) {
    const dot = document.getElementById('discord-status-dot');
    const text = document.getElementById('discord-status-text');
    const activity = document.getElementById('discord-activity');
    const defaultIcon = document.getElementById('discord-default-icon');
    const activityImg = document.getElementById('discord-activity-img');
    
    if (!dot || !text || !activity) return;

    dot.className = 'status-dot ' + status;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    activity.textContent = activityText;

    const sanitizedImgUrl = sanitizeUrl(imageUrl);
    if (sanitizedImgUrl && activityImg && defaultIcon) {
        activityImg.src = sanitizedImgUrl;
        activityImg.classList.remove('hidden');
        defaultIcon.classList.add('hidden');
    } else if (activityImg && defaultIcon) {
        activityImg.classList.add('hidden');
        defaultIcon.classList.remove('hidden');
    }
}

function parseDiscordData(d) {
    const status = d.discord_status || 'offline';
    let activityText = status === 'offline' ? 'No activity' : 'Chilling';
    let imageUrl = null;

    if (d.spotify) {
        activityText = `Listening to ${d.spotify.song}`;
        imageUrl = d.spotify.album_art_url;
    } else if (d.activities && d.activities.length > 0) {
        const act = d.activities.find(a => a.type !== 4) || d.activities[0]; // Skip custom status
        if (act.type === 4 && act.state) {
            activityText = act.state;
        } else if (act.name) {
            activityText = `Playing ${act.name}`;
            if (act.assets && act.assets.large_image) {
                if (act.assets.large_image.startsWith("mp:")) {
                    imageUrl = "https://media.discordapp.net/" + act.assets.large_image.substring(3);
                } else {
                    imageUrl = `https://cdn.discordapp.com/app-assets/${act.application_id}/${act.assets.large_image}.png`;
                }
            }
        }
    }

    // Save to cache to optimize subsequent page load speeds
    try {
        const discordData = {
            status,
            activityText,
            imageUrl,
            timestamp: Date.now()
        };
        localStorage.setItem('discord_status_cache', JSON.stringify(discordData));
    } catch (e) {}

    updateDiscordUI(status, activityText, imageUrl);
}

// WebSocket-first approach with instant caching and REST fallback
async function initDiscordStatus() {
    // 1. Try to load and display from cache immediately to optimize speed
    const cachedDataStr = localStorage.getItem('discord_status_cache');
    if (cachedDataStr) {
        try {
            const cached = JSON.parse(cachedDataStr);
            updateDiscordUI(cached.status, cached.activityText, cached.imageUrl);
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
function renderSteamFallback() {
    const widget = document.getElementById('steam-widget');
    const defaultLogo = document.getElementById('steam-default-logo');
    if (!widget) return;
    
    // Hide default logo so we only have one avatar/logo
    if (defaultLogo) defaultLogo.classList.add('hidden');
    
    const avatarUrl = 'https://avatars.akamai.steamstatic.com/ed2c7926fdb6d4680d3a57847cf06afe690418ba_full.jpg';
    widget.innerHTML = `
        <a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="steam-game-card group flex items-start gap-3 w-full">
            <img src="${avatarUrl}" alt="Kazu | カズ" class="w-12 h-12 rounded-md object-cover border border-cyan-500/10 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">
            <div class="overflow-hidden w-full">
                <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">Kazu | カズ</div>
                <div class="text-xs text-gray-400 truncate">View Steam Profile →</div>
            </div>
        </a>
    `;
}

function renderSteamWidget(data) {
    const widget = document.getElementById('steam-widget');
    const defaultLogo = document.getElementById('steam-default-logo');
    if (!widget) return;

    if (defaultLogo) defaultLogo.classList.add('hidden');

    if (data.type === 'profile') {
        const displayImg = sanitizeUrl(data.displayImg);
        const profileName = escapeHtml(data.profileName);
        const statusText = escapeHtml(data.statusText);
        widget.innerHTML = `
            <a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="steam-game-card group flex items-start gap-3 w-full">
                ${displayImg ? `<img src="${displayImg}" alt="${profileName}" class="w-12 h-12 rounded-md object-cover border border-cyan-500/10 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">` : ''}
                <div class="overflow-hidden w-full">
                    <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">${profileName}</div>
                    <div class="text-xs text-gray-400 truncate">${statusText}</div>
                    ${data.gameHtml || ''}
                </div>
            </a>
        `;
    } else if (data.type === 'game') {
        const link = sanitizeUrl(data.link);
        const logo = sanitizeUrl(data.logo);
        const name = escapeHtml(data.name);
        const hours = escapeHtml(data.hours);
        widget.innerHTML = `
            <a href="${link}" target="_blank" class="steam-game-card group flex items-start gap-3 w-full">
                ${logo ? `<img src="${logo}" alt="${name}" class="w-12 h-12 rounded-md object-cover border border-cyan-500/10 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">` : ''}
                <div class="overflow-hidden w-full">
                    <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">${name}</div>
                    <div class="text-xs text-gray-400 truncate">${hours}h last 2 weeks</div>
                </div>
            </a>
        `;
    }
}

async function fetchSteamActivity() {
    const widget = document.getElementById('steam-widget');
    if (!widget) return;

    // Check localStorage cache first
    const cachedDataStr = localStorage.getItem('steam_activity_cache');
    if (cachedDataStr) {
        try {
            const cachedData = JSON.parse(cachedDataStr);
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

                let gameHtml = '';
                const gameIcon = xml.querySelector('inGameInfo gameIcon')?.textContent;
                const displayImg = currentGame && gameIcon ? gameIcon : avatarIcon;

                if (currentGame) {
                    gameHtml = `<div class="text-xs text-cyan-300 mt-1 truncate">🎮 ${escapeHtml(currentGame)}</div>`;
                }

                const steamData = {
                    type: 'profile',
                    profileName,
                    statusText,
                    displayImg,
                    gameHtml,
                    timestamp: Date.now()
                };

                localStorage.setItem('steam_activity_cache', JSON.stringify(steamData));
                renderSteamWidget(steamData);
                return;
            }

            if (games.length > 0) {
                // Games list XML
                const game = games[0];
                const name = game.querySelector('name')?.textContent || 'Unknown';
                const logo = game.querySelector('logo')?.textContent || '';
                const hours = game.querySelector('hoursLast2Weeks')?.textContent || '0';
                const link = game.querySelector('storeLink')?.textContent || '#';

                const steamData = {
                    type: 'game',
                    name,
                    logo,
                    hours,
                    link,
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



