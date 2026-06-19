(() => {
  const BIRTH_YEAR = 2001;
  const BIRTH_MONTH = 10; // November, 0-indexed
  const BIRTH_DAY = 9;
  const TIMEZONE = 'Europe/London';
  const DISCORD_ID = '346360416827473921';
  const STEAM_VANITY = 'Kazu-Hani';

  const $ = (id) => document.getElementById(id);

  // ---------- Seasons ----------
  // Preview any season on any date: ?season=birthday|christmas|pride|all (comma-combinable, e.g. ?season=birthday,christmas)
  const SEASON_OVERRIDE = (() => {
    try {
      const p = new URLSearchParams(location.search).get('season');
      if (!p) return null;
      const v = p.toLowerCase();
      if (v === 'all') return { birthday: true, christmas: true, pride: true };
      const set = v.split(',').map((s) => s.trim());
      return {
        birthday: set.includes('birthday') || set.includes('bday'),
        christmas: set.includes('christmas') || set.includes('xmas'),
        pride: set.includes('pride'),
      };
    } catch (e) { return null; }
  })();

  function seasonState(now) {
    if (SEASON_OVERRIDE) return SEASON_OVERRIDE;
    const m = now.getMonth(), d = now.getDate(); // LOCAL time (matches the birthday isToday check)
    return {
      birthday: (m === BIRTH_MONTH && d === BIRTH_DAY), // Nov 9
      christmas: (m === 11 && d === 25),                // Dec 25
      pride: (m === 5),                                 // all of June
    };
  }

  let bdayCelebrated = false; // latch so confetti fires once per OFF->ON birthday transition

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
    applySeasons(); // re-evaluate every second so a page left open crosses midnight correctly
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

  function gameIconUrl(game) {
    const img = game && game.assets && (game.assets.large_image || game.assets.small_image);
    if (!img) return '';
    if (img.startsWith('mp:external/')) {
      return 'https://media.discordapp.net/external/' + img.slice('mp:external/'.length);
    }
    if (img.startsWith('mp:')) {
      return 'https://media.discordapp.net/' + img.slice('mp:'.length);
    }
    if (game.application_id) {
      return 'https://cdn.discordapp.com/app-assets/' + game.application_id + '/' + img + '.png';
    }
    return '';
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

        const iconUrl = gameIconUrl(game);
        const iconEl = $('discordGameIcon');
        const emojiEl = $('discordGameEmoji');
        if (iconUrl) {
          iconEl.src = iconUrl;
          iconEl.classList.remove('hidden');
          emojiEl.classList.add('hidden');
        } else {
          iconEl.classList.add('hidden');
          emojiEl.classList.remove('hidden');
        }
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

  // ---------- Motivational quotes ----------
  const FALLBACK_QUOTES = [
    ['The only way to do great work is to love what you do.', 'Steve Jobs'],
    ['Believe you can and you’re halfway there.', 'Theodore Roosevelt'],
    ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
    ['Whether you think you can or you think you can’t, you’re right.', 'Henry Ford'],
    ['Success is not final, failure is not fatal: it is the courage to continue that counts.', 'Winston Churchill'],
    ['The future belongs to those who believe in the beauty of their dreams.', 'Eleanor Roosevelt'],
    ['Hardships often prepare ordinary people for an extraordinary destiny.', 'C.S. Lewis'],
    ['It is during our darkest moments that we must focus to see the light.', 'Aristotle'],
    ['Do not wait to strike till the iron is hot; make it hot by striking.', 'William Butler Yeats'],
    ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
    ['Act as if what you do makes a difference. It does.', 'William James'],
    ['Success usually comes to those who are too busy to be looking for it.', 'Henry David Thoreau'],
    ['The harder I work, the luckier I seem to get.', 'Coleman Cox'],
    ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
    ['Everything you’ve ever wanted is on the other side of fear.', 'George Addair'],
    ['Hard work beats talent when talent doesn’t work hard.', 'Tim Notke'],
    ['Dream big and dare to fail.', 'Norman Vaughan'],
    ['Opportunities don’t happen, you create them.', 'Chris Grosser'],
    ['I find that the harder I work, the more luck I seem to have.', 'Thomas Jefferson'],
    ['The only limit to our realization of tomorrow is our doubts of today.', 'Franklin D. Roosevelt'],
    ['What you get by achieving your goals is not as important as what you become by achieving your goals.', 'Zig Ziglar'],
    ['You are never too old to set another goal or to dream a new dream.', 'C.S. Lewis'],
    ['It always seems impossible until it’s done.', 'Nelson Mandela'],
    ['Don’t be afraid to give up the good to go for the great.', 'John D. Rockefeller'],
    ['The way to get started is to quit talking and begin doing.', 'Walt Disney'],
    ['If you are working on something exciting that you care about, you don’t have to be pushed.', 'Steve Jobs'],
    ['Success is walking from failure to failure with no loss of enthusiasm.', 'Winston Churchill'],
    ['Quality is not an act, it is a habit.', 'Aristotle'],
    ['Either you run the day, or the day runs you.', 'Jim Rohn'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['Believe in yourself and all that you are.', 'Christian D. Larson'],
    ['Knowing yourself is the beginning of all wisdom.', 'Aristotle'],
    ['You don’t have to be great to start, but you have to start to be great.', 'Zig Ziglar'],
    ['Strive not to be a success, but rather to be of value.', 'Albert Einstein'],
    ['The mind is everything. What you think you become.', 'Buddha'],
    ['Failure will never overtake me if my determination to succeed is strong enough.', 'Og Mandino'],
    ['We may encounter many defeats but we must not be defeated.', 'Maya Angelou'],
    ['Imagine your life is perfect in every respect; what would it look like?', 'Brian Tracy'],
    ['We generate fears while we sit. We overcome them by action.', 'Henry Link'],
    ['Whatever the mind dwells upon, it expands.', 'Robert Cooper'],
    ['Limitations live only in our minds. If we use our imaginations, our possibilities become limitless.', 'Jamie Paolinetti'],
    ['You take your life in your own hands, and what happens? A terrible thing: no one to blame.', 'Erica Jong'],
    ['What’s money? A man is a success if he gets up in the morning and goes to bed at night and in between does what he wants.', 'Bob Dylan'],
    ['A successful man is one who can lay a firm foundation with the bricks others have thrown at him.', 'David Brinkley'],
    ['I find that the harder I work, the more luck I seem to have.', 'Coleman Cox'],
    ['The road to success and the road to failure are almost exactly the same.', 'Colin R. Davis'],
    ['The only place where your dream becomes impossible is in your own thinking.', 'Robert H. Schuller'],
    ['All progress takes place outside the comfort zone.', 'Michael John Bobak'],
    ['Push yourself, because no one else is going to do it for you.', 'Unknown'],
    ['Great things never come from comfort zones.', 'Unknown'],
    ['Sometimes later becomes never. Do it now.', 'Unknown'],
    ['Little things make big days.', 'Unknown'],
    ['Don’t stop when you’re tired. Stop when you’re done.', 'Unknown'],
  ];

  function showFallbackQuote() {
    const [text, author] = FALLBACK_QUOTES[(Math.random() * FALLBACK_QUOTES.length) | 0];
    $('quoteText').textContent = text;
    $('quoteAuthor').textContent = '— ' + author;
    $('quoteBox').classList.add('visible');
  }

  async function loadQuote() {
    try {
      const r = await fetch('https://zenquotes.io/api/random');
      const j = await r.json();
      const q = j && j[0];
      if (!q || !q.q) throw new Error('bad payload');
      $('quoteText').textContent = q.q;
      $('quoteAuthor').textContent = '— ' + (q.a || 'Unknown');
      $('quoteBox').classList.add('visible');
    } catch (e) {
      showFallbackQuote();
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

  // ---------- Seasonal effects ----------
  function applySeasons() {
    const s = seasonState(new Date());
    const body = document.body;
    body.classList.toggle('season-birthday', s.birthday);
    body.classList.toggle('season-christmas', s.christmas);
    body.classList.toggle('season-pride', s.pride);
    if (s.birthday && !bdayCelebrated) { bdayCelebrated = true; fireConfetti(); }
    if (!s.birthday) bdayCelebrated = false; // re-arm if it turns off (e.g. preview param removed)
  }

  function fireConfetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.getElementById('confetti-canvas')) return; // already running
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function size() { canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
    size();
    const COLORS = ['#ff5ea8', '#a05cff', '#5cc6ff', '#ffd34d', '#3ddc97', '#ff7a59'];
    const parts = [];
    for (let i = 0; i < 140; i++) parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.32 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11, vy: Math.random() * -13 - 4, g: 0.28 + Math.random() * 0.12,
      size: 5 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
    const start = performance.now(), DURATION = 3200;
    function frame(t) {
      const e = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - e / DURATION);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (e < DURATION) requestAnimationFrame(frame); else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  // ---------- Entrance animation cleanup ----------
  // The social cards reveal via a filled CSS animation, which would otherwise
  // keep their transform locked and kill the :hover lift. Once each card's
  // entrance finishes, clear the inline animation so hover works normally.
  document.querySelectorAll('.social-card').forEach((el) => {
    el.addEventListener('animationend', () => { el.style.animation = 'none'; }, { once: true });
  });

  // ---------- Boot ----------
  applySeasons();
  tick();
  setInterval(tick, 1000);
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
  loadDiscord();
  setInterval(loadDiscord, 20 * 1000);
  loadSteam();
  setInterval(loadSteam, 5 * 60 * 1000);
  loadQuote();
})();
