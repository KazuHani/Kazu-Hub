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
    const PARTICLE_COUNT = 60;
    const CONNECT_DIST = 120;

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

function updateDiscordUI(status, activityText) {
    const dot = document.getElementById('discord-status-dot');
    const text = document.getElementById('discord-status-text');
    const activity = document.getElementById('discord-activity');
    if (!dot || !text || !activity) return;

    dot.className = 'status-dot ' + status;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    activity.textContent = activityText;
}

function parseDiscordData(d) {
    const status = d.discord_status || 'offline';
    let activityText = status === 'offline' ? 'No activity' : 'Chilling';
    if (d.activities && d.activities.length > 0) {
        const act = d.activities.find(a => a.type !== 4) || d.activities[0]; // Skip custom status
        if (act.type === 4 && act.state) {
            activityText = act.state;
        } else if (act.name) {
            activityText = `Playing ${act.name}`;
        }
    }
    updateDiscordUI(status, activityText);
}

// Try REST first, then fall back to WebSocket
async function initDiscordStatus() {
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
    } catch (e) { /* fall through to WebSocket */ }

    // WebSocket approach (works even without REST)
    try {
        const ws = new WebSocket('wss://api.lanyard.rest/socket');
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.op === 1) {
                // Hello — send init
                ws.send(JSON.stringify({
                    op: 2,
                    d: { subscribe_to_id: DISCORD_ID }
                }));
                // Heartbeat
                setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ op: 3 }));
                    }
                }, msg.d.heartbeat_interval);
            } else if (msg.op === 0 && msg.d) {
                parseDiscordData(msg.d);
            }
        };
        ws.onerror = () => {
            updateDiscordUI('offline', 'Join Lanyard Discord to enable');
        };
    } catch (e) {
        updateDiscordUI('offline', 'Status unavailable');
    }
}

document.addEventListener('DOMContentLoaded', initDiscordStatus);


/* --- STEAM ACTIVITY WIDGET --- */
async function fetchSteamActivity() {
    const widget = document.getElementById('steam-widget');
    if (!widget) return;

    // Try multiple CORS proxy approaches
    const STEAM_URL = 'https://steamcommunity.com/id/Kazu-Hani/?xml=1';
    const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(STEAM_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(STEAM_URL)}`,
    ];

    let xmlText = null;

    for (const proxyUrl of proxies) {
        try {
            const res = await fetch(proxyUrl);
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
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(gamesUrl)}`);
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
                if (currentGame) {
                    gameHtml = `<div class="text-xs text-cyan-300 mt-1">🎮 ${currentGame}</div>`;
                }

                widget.innerHTML = `
                    <a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="steam-game-card group">
                        ${avatarIcon ? `<img src="${avatarIcon}" alt="${profileName}" class="steam-game-img">` : ''}
                        <div>
                            <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">${profileName}</div>
                            <div class="text-xs text-gray-400">${statusText}</div>
                            ${gameHtml}
                        </div>
                    </a>
                `;
                return;
            }

            if (games.length > 0) {
                // Games list XML
                const game = games[0];
                const name = game.querySelector('name')?.textContent || 'Unknown';
                const logo = game.querySelector('logo')?.textContent || '';
                const hours = game.querySelector('hoursLast2Weeks')?.textContent || '0';
                const link = game.querySelector('storeLink')?.textContent || '#';

                widget.innerHTML = `
                    <a href="${link}" target="_blank" class="steam-game-card group">
                        ${logo ? `<img src="${logo}" alt="${name}" class="steam-game-img">` : ''}
                        <div>
                            <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">${name}</div>
                            <div class="text-xs text-gray-400">${hours}h last 2 weeks</div>
                        </div>
                    </a>
                `;
                return;
            }
        } catch (e) {
            console.warn('Steam XML parse error:', e);
        }
    }

    // Fallback: show a direct link to their Steam profile
    widget.innerHTML = `
        <a href="https://steamcommunity.com/id/Kazu-Hani/" target="_blank" class="steam-game-card group">
            <svg class="w-8 h-8 text-blue-400 fill-current flex-shrink-0" viewBox="0 0 256 259"><path d="M127.779 0C60.42 0 5.24 52.412 0 119.014l68.724 28.674a35.812 35.812 0 0 1 20.426-6.366c.682 0 1.356.019 2.02.056l30.566-44.71v-.626c0-26.903 21.69-48.796 48.353-48.796 26.662 0 48.352 21.893 48.352 48.796 0 26.902-21.69 48.804-48.352 48.804-.37 0-.73-.009-1.098-.018l-43.593 31.377c.028.582.046 1.163.046 1.735 0 20.204-16.283 36.636-36.294 36.636-17.566 0-32.263-12.658-35.584-29.412L4.41 164.654c15.223 54.313 64.673 94.132 123.369 94.132 70.818 0 128.221-57.938 128.221-129.393C256 57.93 198.597 0 127.779 0z"/></svg>
            <div>
                <div class="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">Kazu Hani</div>
                <div class="text-xs text-gray-400">View Steam Profile →</div>
            </div>
        </a>
    `;
}
document.addEventListener('DOMContentLoaded', fetchSteamActivity);



