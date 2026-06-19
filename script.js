(() => {
  const BIRTH_YEAR = 2001;
  const BIRTH_MONTH = 10; // November, 0-indexed
  const BIRTH_DAY = 9;
  const TIMEZONE = 'Europe/London';
  const DISCORD_ID = '346360416827473921';
  const STEAM_VANITY = 'Kazu-Hani';

  const $ = (id) => document.getElementById(id);

  // ---------- Clock / age / birthday ----------
  function computeClock() {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
    const dateStr = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);

    let age = now.getFullYear() - BIRTH_YEAR;
    const m = now.getMonth(), d = now.getDate();
    const hadBday = (m > BIRTH_MONTH) || (m === BIRTH_MONTH && d >= BIRTH_DAY);
    if (!hadBday) age--;

    let target = new Date(now.getFullYear(), BIRTH_MONTH, BIRTH_DAY);
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (todayMid > target) target = new Date(now.getFullYear() + 1, BIRTH_MONTH, BIRTH_DAY);
    const days = Math.round((target - todayMid) / 86400000);
    const isToday = (m === BIRTH_MONTH && d === BIRTH_DAY);

    let bdayText, bdaySub;
    if (isToday) {
      bdayText = '🎉 Today!';
      bdaySub = 'Happy birthday — turning ' + (age + 1);
    } else {
      bdayText = days + (days === 1 ? ' day' : ' days');
      bdaySub = 'until turning ' + (age + 1);
    }
    return { timeStr, dateStr, ageStr: String(age), bdayText, bdaySub };
  }

  function tick() {
    const c = computeClock();
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    set('liveTime', c.timeStr);
    set('liveDate', c.dateStr);
    set('liveAge', c.ageStr);
    set('liveBday', c.bdayText);
    set('liveBdaySub', c.bdaySub);
  }

  // ---------- Weather ----------
  function weatherInfo(code, isDay) {
    if (code === 0) return { e: isDay ? '☀️' : '🌙', d: 'Clear sky' };
    if (code === 1) return { e: isDay ? '🌤️' : '🌙', d: 'Mainly clear' };
    if (code === 2) return { e: '⛅', d: 'Partly cloudy' };
    if (code === 3) return { e: '☁️', d: 'Overcast' };
    if (code === 45 || code === 48) return { e: '🌫️', d: 'Foggy' };
    if (code >= 51 && code <= 57) return { e: '🌦️', d: 'Drizzle' };
    if (code >= 61 && code <= 67) return { e: '🌧️', d: 'Rain' };
    if (code >= 71 && code <= 77) return { e: '❄️', d: 'Snow' };
    if (code >= 80 && code <= 82) return { e: '🌧️', d: 'Rain showers' };
    if (code >= 85 && code <= 86) return { e: '🌨️', d: 'Snow showers' };
    if (code >= 95) return { e: '⛈️', d: 'Thunderstorm' };
    return { e: '🌡️', d: 'Cloudy' };
  }

  async function loadWeather() {
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=52.414&longitude=-4.081&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Europe%2FLondon');
      const j = await r.json();
      const w = j.current;
      const info = weatherInfo(w.weather_code, w.is_day === 1);
      $('weatherBgIcon').textContent = info.e;
      $('liveTemp').textContent = Math.round(w.temperature_2m) + '°C';
      $('liveWeatherDesc').textContent = info.d;
      $('liveWind').textContent = 'Wind ' + Math.round(w.wind_speed_10m) + ' km/h';
      $('weatherLoaded').classList.remove('hidden');
      $('weatherLoading').classList.add('hidden');
    } catch (e) {
      // keep showing the loading state if the fetch fails
    }
  }

  // ---------- Discord (Lanyard) ----------
  const STATUS_MAP = {
    online: ['Online', '#43b581'],
    idle: ['Idle', '#faa61a'],
    dnd: ['Do Not Disturb', '#f04747'],
    offline: ['Offline', '#747f8d'],
  };

  let sharedAvatarUrl = ''; // Steam avatar wins once loaded, shared with Discord card

  function discordAvatarUrl(u) {
    return u.avatar
      ? 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + (u.avatar.startsWith('a_') ? '.gif' : '.png') + '?size=128'
      : 'https://cdn.discordapp.com/embed/avatars/0.png';
  }

  let lastDiscordFallbackAvatar = '';

  async function loadDiscord() {
    try {
      const r = await fetch('https://api.lanyard.rest/v1/users/' + DISCORD_ID);
      const j = await r.json();
      if (!j || !j.success || !j.data || !j.data.discord_user) return;
      const dc = j.data;
      const u = dc.discord_user;

      const displayName = u.global_name || u.display_name || u.username;
      lastDiscordFallbackAvatar = discordAvatarUrl(u);
      $('discordAvatar').src = sharedAvatarUrl || lastDiscordFallbackAvatar;
      $('discordName').textContent = displayName;

      const s = STATUS_MAP[dc.discord_status] || STATUS_MAP.offline;
      $('discordStatusText').textContent = '● ' + s[0];
      $('discordStatusText').style.color = s[1];
      $('discordStatusDot').style.background = s[1];

      const game = (dc.activities || []).find((a) => a.type === 0);
      const isSpotify = !!(dc.listening_to_spotify && dc.spotify);

      if (game) {
        $('discordGameName').textContent = game.name || 'a game';
        const parts = [game.details, game.state].filter(Boolean);
        const sub = parts.join(' · ');
        $('discordGameSub').textContent = sub;
        $('discordGameSub').classList.toggle('hidden', parts.length === 0);
        $('discordGame').classList.remove('hidden');
      } else {
        $('discordGame').classList.add('hidden');
      }

      if (isSpotify) {
        $('spotifySong').textContent = dc.spotify.song || '';
        $('spotifyArtist').textContent = dc.spotify.artist || '';
        if (dc.spotify.album_art_url) $('spotifyArt').src = dc.spotify.album_art_url;
        $('discordSpotify').classList.remove('hidden');
      } else {
        $('discordSpotify').classList.add('hidden');
      }

      const idle = !game && !isSpotify;
      if (idle) {
        $('discordIdle').textContent = dc.discord_status === 'offline'
          ? 'Currently offline — catch me later ❄️'
          : 'Online, not in a game right now';
        $('discordIdle').classList.remove('hidden');
      } else {
        $('discordIdle').classList.add('hidden');
      }

      $('discordLoaded').classList.remove('hidden');
      $('discordLoading').classList.add('hidden');
    } catch (e) {
      // keep the connecting state on failure
    }
  }

  // ---------- Steam ----------
  function steamStatusInfo(state) {
    if (state === 'in-game') return ['In-Game', '#90c040'];
    if (state === 'online') return ['Online', '#57cbde'];
    if (state === 'away') return ['Away', '#faa61a'];
    return ['Offline', '#9fc0d8'];
  }

  async function loadSteam() {
    const STEAM_URL = 'https://steamcommunity.com/id/' + STEAM_VANITY + '/?xml=1';
    try {
      let xmlText;
      try {
        const r = await fetch(STEAM_URL);
        if (!r.ok) throw new Error('bad status');
        xmlText = await r.text();
      } catch (e) {
        const r2 = await fetch('https://corsproxy.io/?' + encodeURIComponent(STEAM_URL));
        if (!r2.ok) throw new Error('proxy failed');
        xmlText = await r2.text();
      }
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML parse error');
      const txt = (tag, ctx) => { const el = (ctx || doc).querySelector(tag); return el ? el.textContent.trim() : ''; };

      const avatar = txt('avatarFull') || txt('avatarMedium') || txt('avatarIcon');
      if (!avatar) throw new Error('no avatar found');

      const onlineState = txt('onlineState') || 'offline';
      const inGameEl = doc.querySelector('inGameInfo');
      const currentGame = inGameEl ? txt('gameName', inGameEl) : '';

      const games = [];
      doc.querySelectorAll('mostPlayedGame').forEach((g) => {
        const name = txt('gameName', g);
        const logo = txt('gameLogo', g) || txt('gameLogoSmall', g) || txt('gameIcon', g);
        const hoursPlayed = parseFloat((txt('hoursPlayed', g) || '0').replace(/,/g, '')) || 0;
        const hoursOnRecord = parseFloat((txt('hoursOnRecord', g) || '0').replace(/,/g, '')) || 0;
        if (name) games.push({ name, logo, hoursPlayed, hoursOnRecord });
      });

      sharedAvatarUrl = avatar;
      $('steamAvatar').src = avatar;
      const discordImg = $('discordAvatar');
      if (discordImg) discordImg.src = avatar;

      const [statusText, statusColor] = steamStatusInfo(onlineState);
      $('steamStatusText').textContent = '● ' + statusText;
      $('steamStatusText').style.color = statusColor;

      if (currentGame) {
        $('steamGameName').textContent = currentGame;
        $('steamGame').classList.remove('hidden');
      } else {
        $('steamGame').classList.add('hidden');
      }

      const recent = games.slice(0, 3).map((g) => ({
        name: g.name,
        logo: g.logo,
        hoursStr: g.hoursPlayed > 0 ? g.hoursPlayed.toFixed(1) + ' hrs recently' : (g.hoursOnRecord > 0 ? g.hoursOnRecord.toFixed(1) + ' hrs total' : 'played'),
      }));
      const listEl = $('recentGamesList');
      if (recent.length) {
        listEl.innerHTML = recent.map((g) => (
          '<div class="recent-game-row">' +
            '<img class="recent-game-logo" src="' + g.logo + '" alt="' + g.name.replace(/"/g, '&quot;') + '" loading="lazy">' +
            '<div style="min-width:0;flex:1;">' +
              '<div class="recent-game-name">' + g.name + '</div>' +
              '<div class="recent-game-hours">' + g.hoursStr + '</div>' +
            '</div>' +
          '</div>'
        )).join('');
        $('steamRecent').classList.remove('hidden');
      } else {
        $('steamRecent').classList.add('hidden');
      }

      $('steamLoaded').classList.remove('hidden');
      $('steamLoading').classList.add('hidden');
      $('steamErr').classList.add('hidden');
    } catch (e) {
      console.warn('Steam load failed:', e);
      $('steamLoading').classList.add('hidden');
      $('steamLoaded').classList.add('hidden');
      $('steamErr').classList.remove('hidden');
    }
  }

  // ---------- Theme toggle ----------
  const orb = $('theme-orb');
  const orbIcon = $('orb-icon');

  function applyTheme(dark) {
    document.body.dataset.theme = dark ? 'dark' : 'light';
    orb.dataset.dark = dark ? '1' : '0';
    orb.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    orbIcon.textContent = dark ? '🌙' : '☀️';
  }

  let isDark = true;
  try {
    const saved = localStorage.getItem('kazu-dark');
    if (saved !== null) isDark = saved === '1';
  } catch (e) {}
  applyTheme(isDark);

  orb.addEventListener('click', () => {
    isDark = !isDark;
    try { localStorage.setItem('kazu-dark', isDark ? '1' : '0'); } catch (e) {}
    applyTheme(isDark);
  });

  // ---------- Back to top ----------
  const toTopBtn = $('toTopBtn');
  window.addEventListener('scroll', () => {
    toTopBtn.classList.toggle('hidden', window.scrollY <= 420);
  }, { passive: true });
  toTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // ---------- Boot ----------
  tick();
  setInterval(tick, 1000);
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
  loadDiscord();
  setInterval(loadDiscord, 20 * 1000);
  loadSteam();
  setInterval(loadSteam, 5 * 60 * 1000);
})();
