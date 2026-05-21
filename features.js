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
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const PARTICLE_COUNT = isMobile ? 25 : 60;
    const CONNECT_DIST = isMobile ? 80 : 120;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    class Dot {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.4;
            this.vy = (Math.random() - 0.5) * 0.4;
            this.r = Math.random() * 1.5 + 0.5;
        }
        update() {
            // Gentle mouse attraction
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 200 && dist > 0) {
                this.vx += (dx / dist) * 0.015;
                this.vy += (dy / dist) * 0.015;
            }
            this.vx *= 0.99;
            this.vy *= 0.99;
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Dot());

    function drawParticles() {
        if (document.hidden) { requestAnimationFrame(drawParticles); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Get accent color from CSS
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.update();
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.3;
            ctx.fill();

            // Connect nearby particles
            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const d = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
                if (d < CONNECT_DIST) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = accent;
                    ctx.globalAlpha = 0.08 * (1 - d / CONNECT_DIST);
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;
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

    if (imageUrl && activityImg && defaultIcon) {
        activityImg.src = imageUrl;
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
                    heartbeatInterval = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ op: 3 }));
                        }
                    }, msg.d.heartbeat_interval);
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
            <img src="${avatarUrl}" alt="Kazu | カズ" class="w-12 h-12 rounded-xl object-cover border border-blue-500/20 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">
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
        widget.innerHTML = `
            <a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="steam-game-card group flex items-start gap-3 w-full">
                ${data.displayImg ? `<img src="${data.displayImg}" alt="${data.profileName}" class="w-12 h-12 rounded-xl object-cover border border-blue-500/20 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">` : ''}
                <div class="overflow-hidden w-full">
                    <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">${data.profileName}</div>
                    <div class="text-xs text-gray-400 truncate">${data.statusText}</div>
                    ${data.gameHtml || ''}
                </div>
            </a>
        `;
    } else if (data.type === 'game') {
        widget.innerHTML = `
            <a href="${data.link}" target="_blank" class="steam-game-card group flex items-start gap-3 w-full">
                ${data.logo ? `<img src="${data.logo}" alt="${data.name}" class="w-12 h-12 rounded-xl object-cover border border-blue-500/20 shadow-md flex-shrink-0" onerror="this.onerror=null; this.src='images/kazu small.png';">` : ''}
                <div class="overflow-hidden w-full">
                    <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">${data.name}</div>
                    <div class="text-xs text-gray-400 truncate">${data.hours}h last 2 weeks</div>
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
                // Clean HTML entities from stateMessage
                statusText = statusText.replace(/<[^>]+>/g, '').trim();

                let gameHtml = '';
                const gameIcon = xml.querySelector('inGameInfo gameIcon')?.textContent;
                const displayImg = currentGame && gameIcon ? gameIcon : avatarIcon;

                if (currentGame) {
                    gameHtml = `<div class="text-xs text-cyan-300 mt-1 truncate">🎮 ${currentGame}</div>`;
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



