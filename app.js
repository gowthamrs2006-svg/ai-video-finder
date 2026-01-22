/* GM Video Finder AI
 * Plain HTML/CSS/JS. Offline-ready. Beginner-friendly but scalable.
 * - Safe public search URLs only
 * - India-focused categories + languages + trending shortcuts
 * - Platform selection + "open selected" with 8-tab safety limit (advanced mode overrides)
 */

(() => {
  "use strict";

  const STORAGE_KEYS = {
    theme: "gm_theme",
    recent: "gm_recent_searches",
    category: "gm_category",
    language: "gm_language",
    advanced: "gm_advanced",
    selected: "gm_selected_platforms"
  };

  const TAB_LIMIT_DEFAULT = 8;

  /** @type {Record<string, HTMLElement>} */
  const els = {
    query: document.getElementById("query"),
    searchBtn: document.getElementById("searchBtn"),
    clearBtn: document.getElementById("clearBtn"),
    results: document.getElementById("results"),
    themeToggle: document.getElementById("themeToggle"),
    shareBtn: document.getElementById("shareBtn"),
    recentChips: document.getElementById("recentChips"),
    categoryChips: document.getElementById("categoryChips"),
    languageChips: document.getElementById("languageChips"),
    trendingChips: document.getElementById("trendingChips"),
    advancedToggle: document.getElementById("advancedToggle"),
    selectAllBtn: document.getElementById("selectAllBtn"),
    selectNoneBtn: document.getElementById("selectNoneBtn"),
    openSelectedBtn: document.getElementById("openSelectedBtn"),
    selectionInfo: document.getElementById("selectionInfo"),
    platformCount: document.getElementById("platformCount"),
    platformGrid: document.getElementById("platformGrid"),
    resultsHint: document.getElementById("resultsHint"),
    themeColorMeta: document.getElementById("themeColorMeta"),
    swStatus: document.getElementById("swStatus"),
    loadingOverlay: document.getElementById("loadingOverlay")
  };

  // ---------------------------
  // Helpers
  // ---------------------------
  function safeGetJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function safeSetJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function qs() {
    return (els.query.value || "").trim();
  }

  function withLanguage(query, lang) {
    const clean = (lang || "").trim();
    if (!clean || clean === "Any") return query;
    // Append language keyword to query (simple + effective).
    return `${query} ${clean}`;
  }

  function encode(q) {
    return encodeURIComponent(q);
  }

  // Safe public search helpers:
  function googleSiteSearch(domain, query) {
    return `https://www.google.com/search?q=${encode(`site:${domain} ${query}`)}`;
  }
  function googleVideos(query) {
    return `https://www.google.com/search?tbm=vid&q=${encode(query)}`;
  }
  function bingVideos(query) {
    return `https://www.bing.com/videos/search?q=${encode(query)}`;
  }
  function ddgVideos(query) {
    return `https://duckduckgo.com/?q=${encode(query)}&iax=videos&ia=videos`;
  }

  function showLoading(show) {
    els.loadingOverlay.hidden = !show;
  }

  // ---------------------------
  // Sound Manager (Web Audio API)
  // ---------------------------
  const SoundManager = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),

    playTone(freq, type, duration, vol = 0.1, slide = 0) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
      }

      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    },

    playClick() { this.playTone(600, 'sine', 0.1, 0.05); },
    playHover() { this.playTone(800, 'sine', 0.05, 0.01); },
    playToggleOn() {
      this.playTone(400, 'sine', 0.15, 0.05, 200);
    },
    playToggleOff() {
      this.playTone(600, 'sine', 0.15, 0.05, -200);
    },
    playSuccess() {
      // Arpeggio C Major
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
        setTimeout(() => this.playTone(f, 'sine', 0.3, 0.04), i * 60);
      });
    },
    playClear() {
      this.playTone(300, 'triangle', 0.2, 0.05, -100);
    },
    playLaunch() {
      this.playTone(400, 'square', 0.1, 0.02);
      setTimeout(() => this.playTone(800, 'square', 0.2, 0.02), 100);
    }
  };

  // Init audio context on first user interaction
  document.addEventListener('click', () => {
    if (SoundManager.ctx.state === 'suspended') SoundManager.ctx.resume();
  }, { once: true });

  // ---------------------------
  // Theme (default: dark)
  // ---------------------------
  function getTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved === "dark" || saved === "light") return saved;
    return "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    els.themeColorMeta.setAttribute("content", theme === "dark" ? "#070A12" : "#111111");
    els.themeToggle.textContent = theme === "dark" ? "Dark" : "Light";
  }

  // ---------------------------
  // Recents (kept from existing app)
  // ---------------------------
  function getRecent() {
    const arr = safeGetJSON(STORAGE_KEYS.recent, []);
    return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
  }

  function setRecent(items) {
    safeSetJSON(STORAGE_KEYS.recent, items.slice(0, 8));
  }

  function addRecent(q) {
    const cleaned = (q || "").trim();
    if (!cleaned) return;
    const prev = getRecent();
    const next = [cleaned, ...prev.filter(x => x.toLowerCase() !== cleaned.toLowerCase())];
    setRecent(next);
    renderRecent();
  }

  function clearHistory() {
    SoundManager.playClear();
    setRecent([]);
    renderRecent();
  }

  function renderRecent() {
    const items = getRecent();
    els.recentChips.innerHTML = "";

    if (items.length === 0) return;

    // Add Clear button
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "chip";
    clearBtn.style.color = "var(--danger)";
    clearBtn.style.borderColor = "var(--danger)";
    clearBtn.textContent = "Clear History";
    clearBtn.title = "Clear all recent searches";
    clearBtn.addEventListener("click", clearHistory);
    els.recentChips.appendChild(clearBtn);

    items.forEach(q => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = q;
      b.title = "Search again";
      b.addEventListener("click", () => {
        SoundManager.playClick();
        els.query.value = q;
        runSearch(true);
      });
      els.recentChips.appendChild(b);
    });
  }

  // ---------------------------
  // Categories / Languages / Trending
  // ---------------------------
  const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "ott", label: "🎬 OTT" },
    { id: "shorts", label: "📱 Shorts" },
    { id: "education", label: "🎓 Education" },
    { id: "news", label: "📰 News" },
    { id: "social", label: "💬 Social / Discussion" },
    { id: "gaming", label: "🎮 Gaming" }
  ];

  const LANGUAGES = [
    "Any",
    "Hindi",
    "Tamil",
    "Telugu",
    "Malayalam",
    "Kannada",
    "Bengali",
    "Marathi"
  ];

  const TRENDING_INDIA = [
    { label: "IPL", q: "IPL highlights" },
    { label: "Movies", q: "new movies trailer" },
    { label: "Exams", q: "competitive exams tips" },
    { label: "Tech", q: "latest tech India" },
    { label: "News", q: "breaking news India" },
    { label: "Cricket", q: "cricket best moments" },
    { label: "Bollywood", q: "Bollywood songs" },
    { label: "Jobs", q: "government jobs updates" }
  ];

  let activeCategory = localStorage.getItem(STORAGE_KEYS.category) || "all";
  if (!CATEGORIES.some(c => c.id === activeCategory)) activeCategory = "all";

  let activeLanguage = localStorage.getItem(STORAGE_KEYS.language) || "Any";
  if (!LANGUAGES.includes(activeLanguage)) activeLanguage = "Any";

  let advancedMode = localStorage.getItem(STORAGE_KEYS.advanced) === "true";

  // ---------------------------
  // 60+ Platforms (safe public search URLs)
  // ---------------------------
  /**
   * Platform shape:
   * { id, name, category, hint, icon, makeUrl(query) }
   */
  const PLATFORMS = [
    // Video / global
    { id: "youtube", name: "YouTube", category: "all", hint: "Videos + creators", icon: "YT", makeUrl: q => `https://www.youtube.com/results?search_query=${encode(q)}` },
    { id: "yt_shorts", name: "YouTube Shorts", category: "shorts", hint: "Shorts feed", icon: "YS", makeUrl: q => `https://www.youtube.com/results?search_query=${encode(q + " #shorts")}` },
    { id: "vimeo", name: "Vimeo", category: "all", hint: "High-quality videos", icon: "VI", makeUrl: q => `https://vimeo.com/search?q=${encode(q)}` },
    { id: "dailymotion", name: "Dailymotion", category: "all", hint: "Video search", icon: "DM", makeUrl: q => `https://www.dailymotion.com/search/${encode(q)}/videos` },
    { id: "rumble", name: "Rumble", category: "all", hint: "Video platform", icon: "RU", makeUrl: q => `https://rumble.com/search/all?q=${encode(q)}` },

    // OTT (India-focused, mostly via site search)
    { id: "hotstar", name: "Hotstar", category: "ott", hint: "via Google site search", icon: "HS", makeUrl: q => googleSiteSearch("hotstar.com", q) },
    { id: "jiocinema", name: "JioCinema", category: "ott", hint: "via Google site search", icon: "JC", makeUrl: q => googleSiteSearch("jiocinema.com", q) },
    { id: "sony_liv", name: "Sony LIV", category: "ott", hint: "via Google site search", icon: "SL", makeUrl: q => googleSiteSearch("sonyliv.com", q) },
    { id: "zee5", name: "ZEE5", category: "ott", hint: "via Google site search", icon: "Z5", makeUrl: q => googleSiteSearch("zee5.com", q) },
    { id: "voot", name: "Voot", category: "ott", hint: "via Google site search", icon: "VT", makeUrl: q => googleSiteSearch("voot.com", q) },
    { id: "mxplayer", name: "MX Player", category: "ott", hint: "via Google site search", icon: "MX", makeUrl: q => googleSiteSearch("mxplayer.in", q) },
    { id: "primevideo", name: "Prime Video", category: "ott", hint: "via Google site search", icon: "PV", makeUrl: q => googleSiteSearch("primevideo.com", q) },
    { id: "netflix", name: "Netflix", category: "ott", hint: "via Google site search", icon: "NF", makeUrl: q => googleSiteSearch("netflix.com", q) },
    { id: "aha", name: "Aha", category: "ott", hint: "via Google site search", icon: "AH", makeUrl: q => googleSiteSearch("aha.video", q) },
    { id: "sunnxt", name: "Sun NXT", category: "ott", hint: "via Google site search", icon: "SN", makeUrl: q => googleSiteSearch("sunnxt.com", q) },
    { id: "hoichoi", name: "Hoichoi", category: "ott", hint: "via Google site search", icon: "HC", makeUrl: q => googleSiteSearch("hoichoi.tv", q) },
    { id: "jiosaavn", name: "JioSaavn (music video)", category: "ott", hint: "via Google site search", icon: "JS", makeUrl: q => googleSiteSearch("jiosaavn.com", q) },

    // Shorts / social video
    { id: "instagram", name: "Instagram", category: "shorts", hint: "Reels & posts", icon: "IG", makeUrl: q => `https://www.instagram.com/explore/search/keyword/?q=${encode(q)}` },
    { id: "facebook_watch", name: "Facebook Watch", category: "shorts", hint: "Watch search", icon: "FB", makeUrl: q => `https://www.facebook.com/watch/search/?q=${encode(q)}` },
    { id: "snapchat", name: "Snapchat Spotlight", category: "shorts", hint: "via Google site search", icon: "SC", makeUrl: q => googleSiteSearch("snapchat.com", q + " spotlight") },
    { id: "tiktok", name: "TikTok", category: "shorts", hint: "Short videos", icon: "TT", makeUrl: q => `https://www.tiktok.com/search?q=${encode(q)}` },

    // India short-video apps (mostly via site search)
    { id: "sharechat", name: "ShareChat", category: "shorts", hint: "via Google site search", icon: "SH", makeUrl: q => googleSiteSearch("sharechat.com", q) },
    { id: "moj", name: "Moj", category: "shorts", hint: "via Google site search", icon: "MJ", makeUrl: q => googleSiteSearch("mojapp.in", q) },
    { id: "josh", name: "Josh", category: "shorts", hint: "via Google site search", icon: "JO", makeUrl: q => googleSiteSearch("myjosh.in", q) },
    { id: "chingari", name: "Chingari", category: "shorts", hint: "via Google site search", icon: "CH", makeUrl: q => googleSiteSearch("chingari.io", q) },
    { id: "roposo", name: "Roposo", category: "shorts", hint: "via Google site search", icon: "RP", makeUrl: q => googleSiteSearch("roposo.com", q) },
    { id: "mitron", name: "Mitron", category: "shorts", hint: "via Google site search", icon: "MI", makeUrl: q => googleSiteSearch("mitron.tv", q) },

    // Social / discussion
    { id: "x", name: "X (Twitter)", category: "social", hint: "Posts & videos", icon: "X", makeUrl: q => `https://x.com/search?q=${encode(q)}&src=typed_query` },
    { id: "reddit", name: "Reddit", category: "social", hint: "Communities", icon: "RD", makeUrl: q => `https://www.reddit.com/search/?q=${encode(q)}` },
    { id: "quora", name: "Quora", category: "social", hint: "Q&A", icon: "Q", makeUrl: q => `https://www.quora.com/search?q=${encode(q)}` },
    { id: "medium", name: "Medium", category: "social", hint: "Articles", icon: "ME", makeUrl: q => `https://medium.com/search?q=${encode(q)}` },
    { id: "pinterest", name: "Pinterest", category: "social", hint: "Ideas & videos", icon: "PI", makeUrl: q => `https://www.pinterest.com/search/pins/?q=${encode(q)}` },

    // Education
    { id: "khan", name: "Khan Academy", category: "education", hint: "Learning videos", icon: "KA", makeUrl: q => googleSiteSearch("khanacademy.org", q) },
    { id: "nptel", name: "NPTEL", category: "education", hint: "Courses", icon: "NP", makeUrl: q => googleSiteSearch("nptel.ac.in", q) },
    { id: "swayam", name: "SWAYAM", category: "education", hint: "Gov courses", icon: "SW", makeUrl: q => googleSiteSearch("swayam.gov.in", q) },
    { id: "unacademy", name: "Unacademy", category: "education", hint: "via Google site search", icon: "UA", makeUrl: q => googleSiteSearch("unacademy.com", q) },
    { id: "byjus", name: "BYJU'S", category: "education", hint: "via Google site search", icon: "BJ", makeUrl: q => googleSiteSearch("byjus.com", q) },
    { id: "coursera", name: "Coursera", category: "education", hint: "Courses", icon: "CO", makeUrl: q => `https://www.coursera.org/search?query=${encode(q)}` },
    { id: "udemy", name: "Udemy", category: "education", hint: "Courses", icon: "UD", makeUrl: q => `https://www.udemy.com/courses/search/?q=${encode(q)}` },
    { id: "edx", name: "edX", category: "education", hint: "Courses", icon: "EX", makeUrl: q => `https://www.edx.org/search?q=${encode(q)}` },

    // News (India)
    { id: "aajtak", name: "Aaj Tak", category: "news", hint: "via Google site search", icon: "AT", makeUrl: q => googleSiteSearch("aajtak.in", q) },
    { id: "ndtv", name: "NDTV", category: "news", hint: "via Google site search", icon: "ND", makeUrl: q => googleSiteSearch("ndtv.com", q) },
    { id: "indiatoday", name: "India Today", category: "news", hint: "via Google site search", icon: "IT", makeUrl: q => googleSiteSearch("indiatoday.in", q) },
    { id: "abp", name: "ABP", category: "news", hint: "via Google site search", icon: "AB", makeUrl: q => googleSiteSearch("abplive.com", q) },
    { id: "zeenews", name: "Zee News", category: "news", hint: "via Google site search", icon: "ZN", makeUrl: q => googleSiteSearch("zeenews.india.com", q) },
    { id: "timesofindia", name: "Times of India", category: "news", hint: "via Google site search", icon: "TO", makeUrl: q => googleSiteSearch("timesofindia.indiatimes.com", q) },
    { id: "hindustantimes", name: "Hindustan Times", category: "news", hint: "via Google site search", icon: "HT", makeUrl: q => googleSiteSearch("hindustantimes.com", q) },
    { id: "thehindu", name: "The Hindu", category: "news", hint: "via Google site search", icon: "TH", makeUrl: q => googleSiteSearch("thehindu.com", q) },
    { id: "bbc_hindi", name: "BBC Hindi", category: "news", hint: "via Google site search", icon: "BH", makeUrl: q => googleSiteSearch("bbc.com/hindi", q) },

    // Gaming
    { id: "twitch", name: "Twitch", category: "gaming", hint: "Streams & clips", icon: "TW", makeUrl: q => `https://www.twitch.tv/search?term=${encode(q)}` },
    { id: "loco", name: "Loco", category: "gaming", hint: "via Google site search", icon: "LO", makeUrl: q => googleSiteSearch("loco.gg", q) },
    { id: "rooter", name: "Rooter", category: "gaming", hint: "via Google site search", icon: "RT", makeUrl: q => googleSiteSearch("rooter.gg", q) },
    { id: "kick", name: "Kick", category: "gaming", hint: "Streams", icon: "KI", makeUrl: q => googleSiteSearch("kick.com", q) },

    // Search engines (video)
    { id: "google_videos", name: "Google Videos", category: "all", hint: "Video results", icon: "GV", makeUrl: q => googleVideos(q) },
    { id: "bing_videos", name: "Bing Videos", category: "all", hint: "Video results", icon: "BV", makeUrl: q => bingVideos(q) },
    { id: "ddg_videos", name: "DuckDuckGo Videos", category: "all", hint: "Video results", icon: "DV", makeUrl: q => ddgVideos(q) }
  ];

  // Add more platforms (bulk, beginner-friendly):
  // Many platforms are covered via safe "site:domain" search (public, no APIs).
  const EXTRA_SITE_PLATFORMS = [
    // OTT / India + global
    ["lionsgateplay.com", "Lionsgate Play", "ott", "LG"],
    ["appletv.apple.com", "Apple TV", "ott", "ATV"],
    ["youtube.com", "YouTube (India trending)", "ott", "YI"],
    ["justwatch.com", "JustWatch (India)", "ott", "JW"],

    // Shorts / social
    ["threads.net", "Threads", "shorts", "THR"],
    ["linkedin.com", "LinkedIn", "social", "LI"],
    ["telegram.org", "Telegram", "social", "TG"],
    ["whatsapp.com", "WhatsApp Channels", "social", "WA"],

    // Education
    ["vedantu.com", "Vedantu", "education", "VE"],
    ["toppr.com", "Toppr", "education", "TP"],
    ["skillshare.com", "Skillshare", "education", "SS"],
    ["freecodecamp.org", "freeCodeCamp", "education", "FC"],
    ["geeksforgeeks.org", "GeeksforGeeks", "education", "GG"],

    // News
    ["republicworld.com", "Republic World", "news", "RW"],
    ["firstpost.com", "Firstpost", "news", "FP"],
    ["theprint.in", "The Print", "news", "PR"],
    ["economictimes.indiatimes.com", "Economic Times", "news", "ET"],
    ["livemint.com", "Mint", "news", "LM"],
    ["news18.com", "News18", "news", "N18"],

    // Gaming
    ["youtube.com/gaming", "YouTube Gaming", "gaming", "YG"],
    ["steamcommunity.com", "Steam Community", "gaming", "ST"],
    ["reddit.com/r/IndianGaming", "IndianGaming (Reddit)", "gaming", "IG"]
  ];

  EXTRA_SITE_PLATFORMS.forEach(([domain, name, category, icon], idx) => {
    PLATFORMS.push({
      id: `site_${idx}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name,
      category,
      hint: "via Google site search",
      icon: icon || "S",
      makeUrl: (q) => googleSiteSearch(domain, q)
    });
  });

  // Ensure 60+ (we’re above it after extras).

  // ---------------------------
  // Platform enable/selection logic
  // ---------------------------
  function enabledPlatforms() {
    if (activeCategory === "all") return PLATFORMS;
    return PLATFORMS.filter(p => p.category === activeCategory);
  }

  function loadSelectedSet() {
    const saved = safeGetJSON(STORAGE_KEYS.selected, []);
    const set = new Set(Array.isArray(saved) ? saved : []);
    // Only keep ids that still exist:
    const valid = new Set(PLATFORMS.map(p => p.id));
    return new Set([...set].filter(id => valid.has(id)));
  }

  let selectedSet = loadSelectedSet();

  function saveSelectedSet() {
    safeSetJSON(STORAGE_KEYS.selected, [...selectedSet]);
  }

  function selectAllEnabled() {
    enabledPlatforms().forEach(p => selectedSet.add(p.id));
    saveSelectedSet();
    renderPlatformGrid();
  }

  function selectNoneEnabled() {
    enabledPlatforms().forEach(p => selectedSet.delete(p.id));
    saveSelectedSet();
    renderPlatformGrid();
  }

  function ensureSelectionDefaults() {
    // If nothing selected in current category, default-select all enabled for convenience.
    const enabled = enabledPlatforms();
    const hasAny = enabled.some(p => selectedSet.has(p.id));
    if (!hasAny) {
      enabled.forEach(p => selectedSet.add(p.id));
      saveSelectedSet();
    }
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function chipButton(label, active, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (active ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => { SoundManager.playClick(); onClick(); });
    return b;
  }

  function renderCategories() {
    els.categoryChips.innerHTML = "";
    CATEGORIES.forEach(c => {
      els.categoryChips.appendChild(
        chipButton(c.label, c.id === activeCategory, () => {
          activeCategory = c.id;
          localStorage.setItem(STORAGE_KEYS.category, activeCategory);
          ensureSelectionDefaults();
          renderAllUI();
          // keep results aligned with current query
          runSearch(false);
        })
      );
    });
  }

  function renderLanguages() {
    els.languageChips.innerHTML = "";
    LANGUAGES.forEach(l => {
      els.languageChips.appendChild(
        chipButton(l, l === activeLanguage, () => {
          activeLanguage = l;
          localStorage.setItem(STORAGE_KEYS.language, activeLanguage);
          runSearch(false);
        })
      );
    });
  }

  function renderTrending() {
    els.trendingChips.innerHTML = "";
    TRENDING_INDIA.forEach(t => {
      els.trendingChips.appendChild(
        chipButton(t.label, false, () => {
          els.query.value = t.q;
          runSearch(true);
        })
      );
    });
  }

  function renderPlatformGrid() {
    const list = enabledPlatforms();
    els.platformGrid.innerHTML = "";

    els.platformCount.textContent = `${list.length} enabled`;

    list.forEach(p => {
      const card = document.createElement("div");
      card.className = "platformCard" + (selectedSet.has(p.id) ? " selected" : "");
      card.title = "Toggle selection";

      const icon = document.createElement("div");
      icon.className = "pIcon";
      icon.textContent = (p.icon || p.name.slice(0, 2)).toUpperCase();

      const meta = document.createElement("div");
      meta.className = "pMeta";
      const name = document.createElement("div");
      name.className = "pName";
      name.textContent = p.name;
      const cat = document.createElement("div");
      cat.className = "pCat";
      cat.textContent = p.hint || p.category;
      meta.appendChild(name);
      meta.appendChild(cat);

      const toggle = document.createElement("input");
      toggle.className = "pToggle";
      toggle.type = "checkbox";
      toggle.checked = selectedSet.has(p.id);
      toggle.setAttribute("aria-label", `Select ${p.name}`);

      // Toggle selection on click (card or checkbox).
      function flip() {
        // Toggle sound
        if (selectedSet.has(p.id)) {
          selectedSet.delete(p.id);
          SoundManager.playToggleOff();
        } else {
          selectedSet.add(p.id);
          SoundManager.playToggleOn();
        }
        saveSelectedSet();
        renderPlatformGrid();
        updateSelectionInfo();
        runSearch(false);
      }

      toggle.addEventListener("change", flip);
      card.addEventListener("click", (e) => {
        // Avoid double toggles
        if (e.target === toggle) return;
        flip();
      });

      card.appendChild(icon);
      card.appendChild(meta);
      card.appendChild(toggle);
      els.platformGrid.appendChild(card);
    });

    updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const enabled = enabledPlatforms();
    const selectedEnabled = enabled.filter(p => selectedSet.has(p.id));
    const limit = advancedMode ? selectedEnabled.length : Math.min(selectedEnabled.length, TAB_LIMIT_DEFAULT);
    els.selectionInfo.textContent = `${selectedEnabled.length} selected • Open will launch ${limit}${advancedMode ? "" : ` (max ${TAB_LIMIT_DEFAULT})`}`;
    els.openSelectedBtn.textContent = `Open Selected (max ${advancedMode ? "All" : TAB_LIMIT_DEFAULT})`;
  }

  function renderResultsCards(query) {
    // Render selected platform links as "results"
    const enabled = enabledPlatforms();
    const selected = enabled.filter(p => selectedSet.has(p.id));
    els.results.innerHTML = "";

    if (!query) {
      els.resultsHint.textContent = "Type a keyword and press Search to generate links.";
      return;
    }

    els.resultsHint.textContent = `Showing ${selected.length} selected platforms for: “${query}”`;

    // Play success sound if manual search
    // We can infer manual search if we are rendering results differently, but sound is triggered in runSearch usually. 
    // Actually runSearch is better place for sound.

    selected.forEach((p, index) => {
      const a = document.createElement("a");
      a.className = "linkCard";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.href = p.makeUrl(query);

      // Animation staggered
      a.className += " anim-enter";
      a.style.animationDelay = (0.05 * Math.min(index, 20)) + 's';

      const left = document.createElement("div");
      left.className = "linkMeta";

      const name = document.createElement("div");
      name.className = "linkName";
      name.textContent = p.name;

      const desc = document.createElement("div");
      desc.className = "linkDesc";
      desc.textContent = p.hint || "Search";

      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = (p.category || "all").toUpperCase();

      left.appendChild(name);
      left.appendChild(desc);
      a.appendChild(left);
      a.appendChild(pill);
      els.results.appendChild(a);
    });
  }

  // ---------------------------
  // Smart Search Logic
  // ---------------------------
  function runSearch(saveRecentFlag = true) {
    const raw = qs();
    if (!raw) {
      els.results.innerHTML = "";
      els.resultsHint.textContent = "";
      return;
    }

    const query = withLanguage(raw, activeLanguage);
    if (saveRecentFlag) addRecent(raw);

    // Small loading micro-interaction (doesn't open tabs, so safe to delay).
    showLoading(true);
    window.setTimeout(() => {
      showLoading(false);
      SoundManager.playSuccess();
      renderResultsCards(query);
    }, 350);
  }

  function openSelected() {
    const raw = qs();
    if (!raw) return;

    const query = withLanguage(raw, activeLanguage);
    const enabled = enabledPlatforms();
    const selected = enabled.filter(p => selectedSet.has(p.id));

    const limit = advancedMode ? selected.length : TAB_LIMIT_DEFAULT;
    const toOpen = selected.slice(0, limit);

    // Pop-up blockers: open immediately in the click handler, no async waits.
    toOpen.forEach(p => window.open(p.makeUrl(query), "_blank", "noopener,noreferrer"));

    if (!advancedMode && selected.length > TAB_LIMIT_DEFAULT) {
      els.resultsHint.textContent = `Opened ${TAB_LIMIT_DEFAULT} tabs. Enable Advanced Mode to open all (${selected.length}).`;
    } else {
      els.resultsHint.textContent = `Opened ${toOpen.length} tab(s).`;
    }
    SoundManager.playLaunch();
  }

  function clearAll() {
    els.query.value = "";
    els.results.innerHTML = "";
    els.resultsHint.textContent = "";
    SoundManager.playClear();
    els.query.focus();
  }

  async function share() {
    const q = qs();
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q);
    try {
      await navigator.clipboard.writeText(url.toString());
      els.shareBtn.textContent = "Copied";
      setTimeout(() => (els.shareBtn.textContent = "Share"), 900);
    } catch {
      // Fallback (older browsers)
      // eslint-disable-next-line no-alert
      prompt("Copy link:", url.toString());
    }
  }

  function bootFromUrl() {
    const url = new URL(window.location.href);
    const q = (url.searchParams.get("q") || "").trim();
    if (q) {
      els.query.value = q;
      runSearch(true);
    }
  }

  function renderAllUI() {
    renderCategories();
    renderLanguages();
    renderTrending();
    renderPlatformGrid();
    updateSelectionInfo();
  }

  // ---------------------------
  // Events
  // ---------------------------
  // Events
  // ---------------------------
  els.searchBtn.addEventListener("click", () => { SoundManager.playClick(); runSearch(true); });
  els.clearBtn.addEventListener("click", () => { SoundManager.playClick(); clearAll(); });
  els.openSelectedBtn.addEventListener("click", openSelected); // launch sound is inside function

  els.selectAllBtn.addEventListener("click", selectAllEnabled);
  els.selectNoneBtn.addEventListener("click", selectNoneEnabled);

  els.query.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(true);
    if (e.key === "Escape") clearAll();
  });

  els.themeToggle.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(curr === "dark" ? "light" : "dark");
    SoundManager.playClick();
  });

  els.advancedToggle.addEventListener("change", () => {
    advancedMode = !!els.advancedToggle.checked;
    localStorage.setItem(STORAGE_KEYS.advanced, String(advancedMode));
    updateSelectionInfo();
    SoundManager.playClick();
  });

  els.shareBtn.addEventListener("click", () => { SoundManager.playClick(); share(); });

  // ---------------------------
  // Init
  // ---------------------------
  applyTheme(getTheme());
  els.advancedToggle.checked = advancedMode;

  renderRecent();
  ensureSelectionDefaults();
  renderAllUI();
  bootFromUrl();
  els.query.focus();

  // ---------------------------
  // Fun Letters Animation Setup
  // ---------------------------
  const h1 = document.querySelector(".brand h1");
  if (h1) {
    const text = h1.textContent;
    h1.innerHTML = "";
    // Split text but keep spaces
    [...text].forEach((char, i) => {
      const span = document.createElement("span");
      span.textContent = char;
      if (char === " ") {
        span.style.width = "0.3em";
        span.style.display = "inline-block";
      } else {
        span.className = "fun-letter";
        // Randomize delay slightly for organic feel
        span.style.animationDelay = `${(i * 0.1) + (Math.random() * 0.2)}s`;
      }
      h1.appendChild(span);
    });
  }

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").then(() => {
      els.swStatus.textContent = "Offline-ready";
    }).catch(() => {
      els.swStatus.textContent = "";
    });
  }
})();

