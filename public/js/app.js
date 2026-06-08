(function () {
  var searchInput = document.getElementById("search-input");
  var searchFilter = document.getElementById("search-filter");
  var clearSearch = document.getElementById("clear-search");
  var searchBtn = document.getElementById("search-btn");
  var themeToggle = document.getElementById("theme-toggle");
  var resultsList = document.getElementById("results-list");
  var recentList = document.getElementById("recent-list");
  var recentArea = document.getElementById("recent-books");
  var placeholder = document.getElementById("placeholder");
  var statusEl = document.getElementById("status");
  var readerPlaceholder = document.getElementById("reader-placeholder");
  var readerIframe = document.getElementById("reader-iframe");
  var iframeFallback = document.getElementById("iframe-fallback");
  var openExternal = document.getElementById("open-external");
  var epubViewport = document.getElementById("epub-viewport");
  var navBar = document.getElementById("nav-bar");
  var navPrev = document.getElementById("nav-prev");
  var navNext = document.getElementById("nav-next");
  var navPage = document.getElementById("nav-page");
  var navTotal = document.getElementById("nav-total");
  var fileUpload = document.getElementById("file-upload");
  var toastEl = document.getElementById("toast");
  var readerSettings = document.getElementById("reader-settings");
  var readerTts = document.getElementById("reader-tts");
  var zenModeBtn = document.getElementById("zen-mode");
  var settingsOverlay = document.getElementById("settings-overlay");
  var closeSettings = document.getElementById("close-settings");
  var tocOverlay = document.getElementById("toc-overlay");
  var closeToc = document.getElementById("close-toc");
  var tocList = document.getElementById("toc-list");
  var readerTocBtn = document.getElementById("reader-toc");
  var fontInc = document.getElementById("font-inc");
  var fontDec = document.getElementById("font-dec");
  var fontSizeVal = document.getElementById("font-size-val");
  var fontFamily = document.getElementById("font-family");
  var lineSpacing = document.getElementById("line-spacing");
  var advancedToggle = document.getElementById("advanced-toggle");
  var advancedPanel = document.getElementById("advanced-panel");
  var yearFrom = document.getElementById("year-from");
  var yearTo = document.getElementById("year-to");
  var formatFilter = document.getElementById("format-filter");
  var sortSelect = document.getElementById("sort-select");
  var suggestionsDropdown = document.getElementById("suggestions-dropdown");
  var collectionsArea = document.getElementById("collections-area");
  var collectionsGrid = document.getElementById("collections-grid");
  var trendingArea = document.getElementById("trending-area");
  var trendingList = document.getElementById("trending-list");
  var bookDetailModal = document.getElementById("book-detail-modal");
  var bookDetailContent = document.getElementById("book-detail-content");
  var closeBookDetail = document.getElementById("close-book-detail");
  var loadMoreBtn = document.getElementById("load-more-btn");
  var keyboardShortcutsModal = document.getElementById("keyboard-shortcuts-modal");
  var closeShortcuts = document.getElementById("close-shortcuts");
  var exportBtn = document.getElementById("export-btn");
  var importBtn = document.getElementById("import-btn");
  var importFile = document.getElementById("import-file");
  var shortcutsBtn = document.getElementById("shortcuts-btn");
  var healthBtn = document.getElementById("health-btn");
  var healthModal = document.getElementById("health-modal");
  var healthContent = document.getElementById("health-content");
  var closeHealth = document.getElementById("close-health");

  var currentFontSize = 100;
  var isTtsPlaying = false;
  var rendition = null;
  var book = null;
  var searching = false;
  var iframeLoadTimer = null;
  var currentIaUrl = "";
  var recentBooks = JSON.parse(localStorage.getItem("recentBooks") || "[]");
  var favoriteBooks = JSON.parse(localStorage.getItem("favoriteBooks") || "[]");
  var favoritesArea = document.getElementById("favorites-area");
  var favoritesList = document.getElementById("favorites-list");
  var allResults = [];
  var currentPage = 1;
  var hasMorePages = false;
  var currentQuery = "";
  var suggestionTimer = null;

  function applyReaderTheme() {
    if (!rendition) return;
    var family = fontFamily.value;
    var spacing = lineSpacing.value;
    var size = currentFontSize + "%";
    rendition.themes.register("custom", {
      "body": { "font-family": family, "font-size": size, "line-height": spacing }
    });
    rendition.themes.select("custom");
  }

  readerSettings.addEventListener("click", function () { settingsOverlay.style.display = "flex"; });
  closeSettings.addEventListener("click", function () { settingsOverlay.style.display = "none"; });
  closeToc.addEventListener("click", function () { tocOverlay.style.display = "none"; });
  readerTocBtn.addEventListener("click", function () {
    if (!book) { toast("No book open", true); return; }
    renderTOC();
    tocOverlay.style.display = "flex";
  });

  function renderTOC() {
    tocList.innerHTML = "";
    var nav = book.navigation;
    if (!nav || nav.length === 0) {
      tocList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">No Table of Contents available.</div>';
      return;
    }
    nav.forEach(function (item) {
      var el = document.createElement("div");
      el.className = "toc-item";
      el.textContent = item.label;
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.addEventListener("click", function () {
        rendition.display(item.href);
        tocOverlay.style.display = "none";
        toast("Navigating to: " + item.label);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
      });
      tocList.appendChild(el);
    });
  }

  fontInc.addEventListener("click", function () {
    currentFontSize += 10;
    fontSizeVal.textContent = currentFontSize + "%";
    applyReaderTheme();
  });
  fontDec.addEventListener("click", function () {
    if (currentFontSize > 50) {
      currentFontSize -= 10;
      fontSizeVal.textContent = currentFontSize + "%";
      applyReaderTheme();
    }
  });
  fontFamily.addEventListener("change", applyReaderTheme);
  lineSpacing.addEventListener("change", applyReaderTheme);

  zenModeBtn.addEventListener("click", function () {
    document.body.classList.toggle("zen-mode");
    zenModeBtn.innerHTML = document.body.classList.contains("zen-mode") ?
      '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
  });

  readerTts.addEventListener("click", function () {
    if (isTtsPlaying) {
      window.speechSynthesis.cancel();
      isTtsPlaying = false;
      readerTts.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      return;
    }
    if (!rendition) { toast("No book open", true); return; }
    var text = "";
    try {
      var contents = rendition.getContents();
      contents.forEach(function (c) {
        try {
          var doc = c.document;
          if (doc && doc.body) text += (doc.body.innerText || doc.body.textContent || "") + " ";
        } catch (_) {}
      });
    } catch (e) {}
    if (!text || !text.trim()) { toast("No text found to read.", true); return; }
    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 5000) text = text.slice(0, 5000);
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onend = function () { isTtsPlaying = false; readerTts.innerHTML = '<i class="fa-solid fa-volume-high"></i>'; };
    utterance.onerror = function () { isTtsPlaying = false; readerTts.innerHTML = '<i class="fa-solid fa-volume-high"></i>'; };
    window.speechSynthesis.speak(utterance);
    isTtsPlaying = true;
    readerTts.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
  });

  function saveRecent(book) {
    recentBooks = recentBooks.filter(function (b) { return b.olid !== book.olid; });
    recentBooks.unshift(book);
    recentBooks = recentBooks.slice(0, 10);
    localStorage.setItem("recentBooks", JSON.stringify(recentBooks));
    renderRecentBooks();
  }

  function toggleFavorite(book, event) {
    if (event) event.stopPropagation();
    var index = favoriteBooks.findIndex(function (b) { return b.olid === book.olid; });
    if (index > -1) {
      favoriteBooks.splice(index, 1);
      toast("Removed from favorites");
    } else {
      favoriteBooks.unshift(book);
      toast("Added to favorites");
    }
    localStorage.setItem("favoriteBooks", JSON.stringify(favoriteBooks));
    renderFavorites();
  }

  function renderFavorites() {
    if (favoriteBooks.length === 0) {
      favoritesArea.hidden = true;
      return;
    }
    favoritesArea.hidden = false;
    favoritesList.innerHTML = "";
    favoriteBooks.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "result";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                     '<div class="title">' + esc(r.title) + '</div>' +
                     '<button class="fav-btn" style="background:none;border:none;cursor:pointer;color:var(--text);padding:0 4px" title="Remove from favorites"><i class="fa-solid fa-star" style="color:#f59e0b"></i></button>' +
                     '</div>';
      el.addEventListener("click", function () { openBook(r); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") openBook(r); });
      el.querySelector(".fav-btn").addEventListener("click", function (e) { toggleFavorite(r, e); });
      favoritesList.appendChild(el);
    });
  }

  function renderRecentBooks() {
    if (recentBooks.length === 0) {
      recentArea.hidden = true;
      return;
    }
    recentArea.hidden = false;
    recentList.innerHTML = "";
    recentBooks.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "result";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.innerHTML = '<div class="title">' + esc(r.title) + '</div>';
      el.addEventListener("click", function () { openBook(r); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") openBook(r); });
      recentList.appendChild(el);
    });
  }

  themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark");
    var isDark = document.body.classList.contains("dark");
    themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
  renderRecentBooks();
  renderFavorites();

  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = isError ? "show error" : "show";
    setTimeout(function () { toastEl.classList.remove("show"); }, 4000);
  }

  searchInput.addEventListener("input", function () {
    clearSearch.hidden = searchInput.value.trim() === "";
    clearTimeout(suggestionTimer);
    var q = searchInput.value.trim();
    if (q.length >= 2) {
      suggestionTimer = setTimeout(function () { fetchSuggestions(q); }, 250);
    } else {
      suggestionsDropdown.style.display = "none";
    }
  });

  searchInput.addEventListener("focus", function () {
    var q = searchInput.value.trim();
    if (q.length >= 2 && suggestionsDropdown.children.length > 0) {
      suggestionsDropdown.style.display = "block";
    }
  });

  document.addEventListener("click", function (e) {
    if (!suggestionsDropdown.contains(e.target) && e.target !== searchInput) {
      suggestionsDropdown.style.display = "none";
    }
  });

  clearSearch.addEventListener("click", function () {
    searchInput.value = "";
    clearSearch.hidden = true;
    suggestionsDropdown.style.display = "none";
    searchInput.focus();
  });

  async function fetchSuggestions(q) {
    try {
      var resp = await fetch("/api/suggestions?q=" + encodeURIComponent(q));
      var data = await resp.json();
      var suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        suggestionsDropdown.style.display = "none";
        return;
      }
      suggestionsDropdown.innerHTML = "";
      suggestions.forEach(function (s) {
        var el = document.createElement("div");
        el.className = "suggestion-item";
        el.innerHTML = '<i class="fa-solid fa-magnifying-glass" style="width:16px;color:var(--text-muted);font-size:12px"></i>' +
                       '<div><div style="font-weight:500">' + esc(s.title) + '</div>' +
                       (s.author ? '<div style="font-size:11px;color:var(--text-muted)">' + esc(s.author) + '</div>' : '') + '</div>';
        el.addEventListener("click", function () {
          searchInput.value = s.title;
          suggestionsDropdown.style.display = "none";
          search();
        });
        suggestionsDropdown.appendChild(el);
      });
      suggestionsDropdown.style.display = "block";
    } catch (err) {
      suggestionsDropdown.style.display = "none";
    }
  }

  if (advancedToggle) {
    advancedToggle.addEventListener("click", function () {
      var isOpen = advancedPanel.style.display === "flex";
      advancedPanel.style.display = isOpen ? "none" : "flex";
      advancedToggle.innerHTML = isOpen ?
        '<i class="fa-solid fa-sliders"></i> Advanced' :
        '<i class="fa-solid fa-xmark"></i> Close';
    });
  }

  if (collectionsArea) {
    loadCollections();
  }
  if (trendingArea) {
    loadTrending();
  }

  async function loadCollections() {
    try {
      var resp = await fetch("/api/collections");
      var data = await resp.json();
      collectionsGrid.innerHTML = "";
      (data.collections || []).forEach(function (col) {
        var el = document.createElement("div");
        el.className = "collection-card";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.innerHTML = '<i class="fa-solid ' + col.icon + '" style="font-size:20px;color:var(--text-muted)"></i>' +
                       '<div style="font-weight:500;font-size:13px">' + esc(col.name) + '</div>';
        el.addEventListener("click", function () {
          searchInput.value = col.query;
          clearSearch.hidden = false;
          search();
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { searchInput.value = col.query; clearSearch.hidden = false; search(); }
        });
        collectionsGrid.appendChild(el);
      });
    } catch (err) {}
  }

  async function loadTrending() {
    try {
      var resp = await fetch("/api/trending");
      var data = await resp.json();
      var trending = data.trending || [];
      if (trending.length === 0) {
        trendingArea.hidden = true;
        return;
      }
      trendingArea.hidden = false;
      trendingList.innerHTML = "";
      trending.forEach(function (q) {
        var el = document.createElement("div");
        el.className = "trending-chip";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.textContent = q;
        el.addEventListener("click", function () {
          searchInput.value = q;
          clearSearch.hidden = false;
          search();
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { searchInput.value = q; clearSearch.hidden = false; search(); }
        });
        trendingList.appendChild(el);
      });
    } catch (err) {}
  }

  async function search(append) {
    var q = searchInput.value.trim();
    if (!q) { toast("Enter a query.", true); return; }
    if (searching && !append) return;

    if (!append) {
      currentPage = 1;
      allResults = [];
      currentQuery = q;
    }

    searching = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "Searching\u2026";
    statusEl.textContent = "Searching sources...";
    statusEl.className = "";

    if (!append) {
      resultsList.innerHTML = "";
      placeholder.hidden = true;
      for (var i = 0; i < 6; i++) {
        var sk = document.createElement("div");
        sk.className = "result skeleton";
        sk.style.height = "60px";
        resultsList.appendChild(sk);
      }
    }

    var sources = [
      { id: "gutenberg", url: "/api/search/gutenberg" },
      { id: "ol", url: "/api/search/ol" },
      { id: "libgen", url: "/api/search/libgen" }
    ];

    function renderSourceChips(sources) {
      var container = document.getElementById("sources-status");
      if (!container) return;
      container.innerHTML = "";
      sources.forEach(function (s) {
        var chip = document.createElement("div");
        chip.className = "source-chip";
        chip.setAttribute("data-source", s.id);
        chip.textContent = s.id;
        container.appendChild(chip);
      });
    }

    function updateSourceChip(id, status, count) {
      var container = document.getElementById("sources-status");
      if (!container) return;
      var chip = container.querySelector('[data-source="' + id + '"]');
      if (!chip) return;
      switch (status) {
        case "loading":
          chip.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="width:12px"></i> ' + id + "\u2026";
          chip.style.opacity = "0.9";
          break;
        case "ok":
          chip.innerHTML = '<i class="fa-solid fa-check-circle" style="color:#16a34a;width:12px"></i> ' + id + (count ? " (" + count + ")" : "");
          chip.style.opacity = "1";
          break;
        case "fail":
          chip.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626;width:12px"></i> ' + id + " (failed)";
          chip.style.opacity = "0.6";
          break;
      }
    }

    var totalResults = 0;
    var failedSources = 0;
    renderSourceChips(sources);

    async function fetchSource(source) {
      updateSourceChip(source.id, "loading");
      try {
        var filter = searchFilter.value;
        var sort = sortSelect ? sortSelect.value : "relevance";
        var yFrom = yearFrom ? yearFrom.value : "";
        var yTo = yearTo ? yearTo.value : "";
        var fmt = formatFilter ? formatFilter.value : "";
        var url = source.url + "?q=" + encodeURIComponent(q) + "&filter=" + encodeURIComponent(filter) +
                  "&sort=" + encodeURIComponent(sort) +
                  (yFrom ? "&yearFrom=" + yFrom : "") +
                  (yTo ? "&yearTo=" + yTo : "") +
                  (fmt ? "&format=" + fmt : "");
        var resp = await fetch(url);
        var data = await resp.json();
        if (!resp.ok) throw new Error();
        var results = data.results || [];
        totalResults += results.length;
        if (totalResults > 0 && resultsList.querySelector(".skeleton")) {
          resultsList.innerHTML = "";
        }
        renderResults(results, true);
        statusEl.textContent = totalResults + " results found";
        updateSourceChip(source.id, "ok", results.length);
      } catch (err) {
        failedSources++;
        updateSourceChip(source.id, "fail");
      }
    }

    var promises = sources.map(async function (s) { await fetchSource(s); });
    await Promise.all(promises);

    if (totalResults === 0) {
      resultsList.innerHTML = "";
      placeholder.hidden = false;
      if (failedSources === sources.length) {
        statusEl.textContent = "Search failed. Please try again.";
        statusEl.className = "error";
      } else {
        statusEl.textContent = "No results found.";
      }
    } else {
      statusEl.textContent = totalResults + " results found";
    }

    if (collectionsArea) collectionsArea.hidden = true;
    if (trendingArea) trendingArea.hidden = true;

    searching = false;
    searchBtn.disabled = false;
    searchBtn.textContent = "Search";
  }

  function renderResults(results, append) {
    if (!append) resultsList.innerHTML = "";
    placeholder.hidden = results.length > 0 || !append;
    if (results.length === 0) return;
    var frag = document.createDocumentFragment();
    results.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "result";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      var cover = r.coverUrl ? r.coverUrl : (r.coverId ? "https://covers.openlibrary.org/b/id/" + r.coverId + "-S.jpg" : "");
      var sourceName = { ol: "Open Library", gutenberg: "Gutenberg", libgen: "LibGen" }[r.source] || r.source;
      var descSnippet = r.description ? r.description.replace(/<[^>]*>/g, "").slice(0, 120) + (r.description.length > 120 ? "\u2026" : "") : "";
      var isFav = favoriteBooks.some(function (b) { return b.olid === r.olid; });
      el.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
          (cover ? '<img src="' + cover + '" alt="" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#e2e8f0" loading="lazy" />' : '<div style="width:32px;height:48px;border-radius:4px;background:#e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-book" style="color:#94a3b8"></i></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div class="title">' + esc(r.title) + '</div>' +
            '<div class="author">' + esc(r.author) + '</div>' +
            (descSnippet ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(descSnippet) + '</div>' : '') +
            '<div class="meta">' +
               (r.year ? '<span>' + r.year + '</span>' : '') +
               (r.extension ? '<span style="font-family:monospace;font-weight:600;color:#4f46e5">' + esc(r.extension) + '</span>' : '') +
               (r.language ? '<span>' + esc(r.language) + '</span>' : '') +
               (r.fileSize ? '<span>' + esc(r.fileSize) + '</span>' : '') +
               (sourceName ? '<span style="color:#64748b;font-style:italic">' + esc(sourceName) + '</span>' : '') +
               (!r.hasEpub && !r.hasPdf && r.source !== "ol" ? '<span style="color:#dc2626;font-size:10px">No free download</span>' : '') +
             '</div>' +
           '</div>' +
           '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' +
             '<button class="detail-btn" title="Book Details" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:4px"><i class="fa-solid fa-circle-info"></i></button>' +
             '<button class="fav-star" title="' + (isFav ? "Remove from favorites" : "Add to favorites") + '" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:' + (isFav ? "#f59e0b" : "var(--text-muted)") + '"><i class="fa-solid fa-star"></i></button>' +
           '</div>' +
         '</div>';
      el.addEventListener("click", function (e) {
        if (e.target.closest(".detail-btn")) { showBookDetail(r); return; }
        if (e.target.closest(".fav-star")) { toggleFavorite(r, e); return; }
        openBook(r);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") openBook(r);
      });
      frag.appendChild(el);
    });
    resultsList.appendChild(frag);
  }

  function esc(s) { if (!s) return ""; var d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

  async function showBookDetail(r) {
    bookDetailModal.style.display = "flex";
    bookDetailContent.innerHTML = '<div style="text-align:center;padding:40px"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--text-muted)"></i></div>';

    try {
      var resp = await fetch("/api/book-detail?source=" + encodeURIComponent(r.source) + "&id=" + encodeURIComponent(r.olid) + "&ia=" + encodeURIComponent(r.ia || ""));
      var data = await resp.json();
      var d = data.detail || {};
      var cover = r.coverUrl || r.coverId ? (r.coverUrl || "https://covers.openlibrary.org/b/id/" + r.coverId + "-M.jpg") : "";
      var sourceName = { ol: "Open Library", gutenberg: "Gutenberg", libgen: "LibGen" }[r.source] || r.source;

      var html = '<div style="display:flex;gap:20px;flex-wrap:wrap">';
      if (cover) html += '<img src="' + cover + '" style="width:120px;height:180px;object-fit:cover;border-radius:4px;background:var(--bg-secondary)" />';
      html += '<div style="flex:1;min-width:200px">';
      html += '<h2 style="font-size:18px;font-weight:600;margin-bottom:8px">' + esc(r.title) + '</h2>';
      html += '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">by ' + esc(r.author) + '</p>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">';
      if (r.year) html += '<span class="detail-tag"><i class="fa-regular fa-calendar"></i> ' + esc(r.year) + '</span>';
      if (r.extension) html += '<span class="detail-tag" style="color:#4f46e5;font-weight:600">' + esc(r.extension) + '</span>';
      if (r.language) html += '<span class="detail-tag"><i class="fa-solid fa-language"></i> ' + esc(r.language) + '</span>';
      if (r.fileSize) html += '<span class="detail-tag"><i class="fa-solid fa-hard-drive"></i> ' + esc(r.fileSize) + '</span>';
      html += '<span class="detail-tag"><i class="fa-solid fa-database"></i> ' + esc(sourceName) + '</span>';
      html += '</div>';
      if (d.description) {
        var desc = typeof d.description === "string" ? d.description : "";
        desc = desc.replace(/<[^>]*>/g, "").slice(0, 500);
        if (d.description.length > 500) desc += "\u2026";
        html += '<p style="font-size:12px;line-height:1.6;color:var(--text-muted);margin-bottom:12px">' + esc(desc) + '</p>';
      }
      if (d.subjects && d.subjects.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">';
        var subjects = Array.isArray(d.subjects) ? d.subjects.slice(0, 6) : [];
        subjects.forEach(function (s) {
          var subject = typeof s === "string" ? s : s.name || "";
          if (subject) html += '<span class="detail-tag" style="font-size:10px">' + esc(subject) + '</span>';
        });
        html += '</div>';
      }
      if (d.files && d.files.length > 0) {
        html += '<div style="margin-top:8px"><div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px">Available Files:</div>';
        d.files.forEach(function (f) {
          var size = f.size ? (parseInt(f.size) > 1048576 ? (parseInt(f.size) / 1048576).toFixed(1) + " MB" : (parseInt(f.size) / 1024).toFixed(0) + " KB") : "";
          html += '<div style="font-size:11px;color:var(--text-muted)"><i class="fa-solid fa-file"></i> ' + esc(f.name) + (size ? " (" + size + ")" : "") + '</div>';
        });
        html += '</div>';
      }
      html += '</div></div>';
      html += '<div style="margin-top:16px;display:flex;gap:8px">';
      html += '<button onclick="document.getElementById(\'book-detail-modal\').style.display=\'none\';" style="padding:8px 16px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500">Open Book</button>';
      html += '<button onclick="document.getElementById(\'book-detail-modal\').style.display=\'none\';" style="padding:8px 16px;background:var(--bg-secondary);color:var(--text);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:12px">Close</button>';
      html += '</div>';

      bookDetailContent.innerHTML = html;

      bookDetailContent.querySelector("button").addEventListener("click", function () {
        bookDetailModal.style.display = "none";
        openBook(r);
      });
    } catch (err) {
      bookDetailContent.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Could not load book details.</div>';
    }
  }

  closeBookDetail.addEventListener("click", function () { bookDetailModal.style.display = "none"; });
  bookDetailModal.addEventListener("click", function (e) { if (e.target === bookDetailModal) bookDetailModal.style.display = "none"; });

  function openBook(r) {
    if (!r.hasEpub && r.extension !== "PDF" && r.source !== "ol") {
      toast("No viewable format available.", true);
      return;
    }
    toast("Opening: " + r.title + "\u2026");
    saveRecent(r);
    closeBook();
    readerPlaceholder.hidden = true;
    epubViewport.hidden = true;
    iframeFallback.hidden = true;
    readerIframe.hidden = false;

    if (r.source === "ol") {
      currentIaUrl = "https://archive.org/details/" + encodeURIComponent(r.ia);
      openExternal.href = currentIaUrl;
      readerIframe.src = "https://archive.org/embed/" + encodeURIComponent(r.ia);
      armIframeWatchdog();
    } else if (r.source === "gutenberg") {
      var gutUrl = "https://archive.org/download/" + r.ia + "/" + r.ia + ".epub";
      readerIframe.hidden = true;
      epubViewport.hidden = false;
      loadEpubFromUrl(gutUrl, r.title);
    } else if (r.extension === "EPUB" || r.extension === "MOBI" || r.extension === "AZW3") {
      readerIframe.hidden = true;
      epubViewport.hidden = false;
      loadEpubFromUrl(r.ia, r.title);
    } else if (r.extension === "PDF") {
      if (r.ia && r.ia.startsWith("http")) {
        readerIframe.src = "/api/download-proxy?url=" + encodeURIComponent(r.ia);
      } else {
        readerIframe.src = r.ia;
      }
      armIframeWatchdog();
    } else if (r.source === "ol") {
      currentIaUrl = "https://archive.org/details/" + encodeURIComponent(r.ia);
      openExternal.href = currentIaUrl;
      readerIframe.src = "https://archive.org/embed/" + encodeURIComponent(r.ia);
      armIframeWatchdog();
    }
  }

  async function loadEpubFromUrl(url, title) {
    if (url && !url.startsWith("http")) {
      url = "https://archive.org/download/" + url + "/" + url + ".epub";
    }
    try {
      var proxyUrl = "/api/download-proxy?url=" + encodeURIComponent(url);
      var resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error("Failed to download book via proxy.");
      var buffer = await resp.arrayBuffer();
      book = ePub(buffer);
      rendition = book.renderTo(epubViewport, { width: "100%", height: "100%", spread: "none", flow: "paginated" });

      var savedCfi = localStorage.getItem("progress_" + (url.split("/md5/")[1] || url));
      if (savedCfi) {
        await rendition.display(savedCfi);
      } else {
        await rendition.display();
      }

      navBar.hidden = false;
      if (book.spine) navTotal.textContent = book.spine.length || "-";
      rendition.on("relocated", function () {
        if (rendition.location && rendition.location.start && rendition.location.start.displayed) {
          navPage.textContent = rendition.location.start.displayed.page || "-";
          if (rendition.location.start.displayed.total) navTotal.textContent = rendition.location.start.displayed.total;
          var cfi = rendition.location.start.cfi;
          if (cfi) {
            localStorage.setItem("progress_" + (url.split("/md5/")[1] || url), cfi);
          }
        }
      });
      toast("Loaded: " + title);
    } catch (err) {
      epubViewport.hidden = true;
      readerPlaceholder.hidden = false;
      toast("Error: " + err.message, true);
    }
  }

  function armIframeWatchdog() {
    if (iframeLoadTimer) clearTimeout(iframeLoadTimer);
    iframeLoadTimer = setTimeout(function () {
      if (!readerIframe.hidden && readerIframe.src) {
        showIframeFallback("The embedded reader didn't load in time.");
      }
    }, 12000);
  }

  function showIframeFallback(reason) {
    if (iframeLoadTimer) { clearTimeout(iframeLoadTimer); iframeLoadTimer = null; }
    readerIframe.hidden = true;
    iframeFallback.hidden = false;
    toast(reason || "Embed blocked. Use the link below.", true);
  }

  readerIframe.addEventListener("load", function () {
    if (iframeLoadTimer) { clearTimeout(iframeLoadTimer); iframeLoadTimer = null; }
  });

  function closeBook() {
    if (iframeLoadTimer) { clearTimeout(iframeLoadTimer); iframeLoadTimer = null; }
    if (rendition) { try { rendition.destroy(); } catch (_) {} rendition = null; }
    book = null;
    navBar.hidden = true;
    navPage.textContent = "-";
    navTotal.textContent = "-";
    epubViewport.innerHTML = "";
    epubViewport.hidden = true;
    readerIframe.src = "";
    readerIframe.hidden = true;
    iframeFallback.hidden = true;
    currentIaUrl = "";
    readerPlaceholder.hidden = false;
  }

  navPrev.addEventListener("click", function () { if (rendition) rendition.prev(); });
  navNext.addEventListener("click", function () { if (rendition) rendition.next(); });

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === "t" || e.key === "T") { themeToggle.click(); }
    if (e.key === "/" || e.key === "k") { e.preventDefault(); searchInput.focus(); }
    if (e.key === "Escape") {
      if (bookDetailModal.style.display === "flex") { bookDetailModal.style.display = "none"; return; }
      if (settingsOverlay.style.display === "flex") { settingsOverlay.style.display = "none"; return; }
      if (tocOverlay.style.display === "flex") { tocOverlay.style.display = "none"; return; }
      if (healthModal.style.display === "flex") { healthModal.style.display = "none"; return; }
      if (keyboardShortcutsModal.style.display === "flex") { keyboardShortcutsModal.style.display = "none"; return; }
      if (document.body.classList.contains("zen-mode")) { zenModeBtn.click(); }
    }
    if (e.key === "?") { keyboardShortcutsModal.style.display = "flex"; }
    if (e.key === "z") { zenModeBtn.click(); }
    if (e.key === "s") { readerSettings.click(); }

    if (!rendition) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); rendition.prev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); rendition.next(); }
  });

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", function () {
      search(true);
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      var data = {
        favorites: favoriteBooks,
        recent: recentBooks,
        exportDate: new Date().toISOString(),
        version: "2.0.0"
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "proton-books-export-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Data exported successfully");
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", function () { importFile.click(); });
  }
  if (importFile) {
    importFile.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (data.favorites) {
            favoriteBooks = data.favorites;
            localStorage.setItem("favoriteBooks", JSON.stringify(favoriteBooks));
            renderFavorites();
          }
          if (data.recent) {
            recentBooks = data.recent;
            localStorage.setItem("recentBooks", JSON.stringify(recentBooks));
            renderRecentBooks();
          }
          toast("Data imported successfully");
        } catch (err) {
          toast("Invalid import file", true);
        }
      };
      reader.readAsText(file);
      importFile.value = "";
    });
  }

  if (shortcutsBtn) {
    shortcutsBtn.addEventListener("click", function () { keyboardShortcutsModal.style.display = "flex"; });
  }
  if (closeShortcuts) {
    closeShortcuts.addEventListener("click", function () { keyboardShortcutsModal.style.display = "none"; });
  }

  if (healthBtn) {
    healthBtn.addEventListener("click", async function () {
      healthModal.style.display = "flex";
      healthContent.innerHTML = '<div style="text-align:center;padding:40px"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--text-muted)"></i></div>';
      try {
        var resp = await fetch("/api/health");
        var data = await resp.json();
        var html = '<div style="display:flex;flex-direction:column;gap:12px">';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Status</span><span style="font-weight:600;color:#16a34a">' + esc(data.status) + '</span></div>';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Version</span><span style="font-weight:600">' + esc(data.version) + '</span></div>';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Uptime</span><span style="font-weight:600">' + data.uptime + 's</span></div>';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Sources</span><span style="font-weight:600">' + data.sources.join(", ") + '</span></div>';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Cache Size</span><span style="font-weight:600">' + data.cacheSize + '</span></div>';
        html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted);font-size:13px">Timestamp</span><span style="font-weight:600">' + esc(data.timestamp) + '</span></div>';
        html += '</div>';
        healthContent.innerHTML = html;
      } catch (err) {
        healthContent.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Could not load health info.</div>';
      }
    });
  }
  if (closeHealth) {
    closeHealth.addEventListener("click", function () { healthModal.style.display = "none"; });
  }

  fileUpload.addEventListener("change", async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "epub" && ext !== "pdf" && ext !== "txt") { toast("Select an .epub, .pdf, or .txt file.", true); return; }
    toast("Opening: " + file.name + "\u2026");
    closeBook();
    readerPlaceholder.hidden = true;

    if (ext === "pdf") {
      epubViewport.hidden = true;
      readerIframe.hidden = false;
      readerIframe.src = URL.createObjectURL(file);
    } else if (ext === "txt") {
      epubViewport.hidden = true;
      readerIframe.hidden = true;
      var text = await file.text();
      var textDiv = document.createElement("div");
      textDiv.style.padding = "40px";
      textDiv.style.whiteSpace = "pre-wrap";
      textDiv.style.fontSize = "14px";
      textDiv.style.lineHeight = "1.6";
      textDiv.style.overflowY = "auto";
      textDiv.style.height = "100%";
      textDiv.textContent = text;
      epubViewport.innerHTML = "";
      epubViewport.appendChild(textDiv);
      epubViewport.hidden = false;
    } else {
      epubViewport.hidden = false;
      readerIframe.hidden = true;
      try {
        var buffer = await file.arrayBuffer();
        book = ePub(buffer);
        rendition = book.renderTo(epubViewport, {
          width: "100%", height: "100%", spread: "none", flow: "paginated", manager: "default"
        });
        await rendition.display();
        navBar.hidden = false;
        if (book.spine) navTotal.textContent = book.spine.length || "-";
        rendition.on("relocated", function () {
          if (rendition.location && rendition.location.start && rendition.location.start.displayed) {
            navPage.textContent = rendition.location.start.displayed.page || "-";
            if (rendition.location.start.displayed.total) navTotal.textContent = rendition.location.start.displayed.total;
          }
        });
        toast("Loaded: " + file.name);
      } catch (err) {
        epubViewport.hidden = true;
        readerPlaceholder.hidden = false;
        toast("Error: " + err.message, true);
      }
    }
    fileUpload.value = "";
  });

  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", async function (e) {
    e.preventDefault();
    var files = Array.from(e.dataTransfer.files).filter(function (f) {
      var ext = f.name.split(".").pop().toLowerCase();
      return ext === "epub" || ext === "pdf" || ext === "txt";
    });
    if (files.length === 0) { toast("Drop an .epub, .pdf, or .txt file.", true); return; }
    var file = files[0];
    toast("Opening: " + file.name + "\u2026");
    closeBook();
    readerPlaceholder.hidden = true;
    var ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      epubViewport.hidden = true;
      readerIframe.hidden = false;
      readerIframe.src = URL.createObjectURL(file);
    } else if (ext === "txt") {
      epubViewport.hidden = true;
      readerIframe.hidden = true;
      var text = await file.text();
      var textDiv = document.createElement("div");
      textDiv.style.padding = "40px";
      textDiv.style.whiteSpace = "pre-wrap";
      textDiv.style.fontSize = "14px";
      textDiv.style.lineHeight = "1.6";
      textDiv.style.overflowY = "auto";
      textDiv.style.height = "100%";
      textDiv.textContent = text;
      epubViewport.innerHTML = "";
      epubViewport.appendChild(textDiv);
      epubViewport.hidden = false;
    } else {
      epubViewport.hidden = false;
      readerIframe.hidden = true;
      try {
        var buffer = await file.arrayBuffer();
        book = ePub(buffer);
        rendition = book.renderTo(epubViewport, { width: "100%", height: "100%", spread: "none", flow: "paginated" });
        await rendition.display();
        navBar.hidden = false;
        if (book.spine) navTotal.textContent = book.spine.length || "-";
        rendition.on("relocated", function () {
          if (rendition.location && rendition.location.start && rendition.location.start.displayed) {
            navPage.textContent = rendition.location.start.displayed.page || "-";
            if (rendition.location.start.displayed.total) navTotal.textContent = rendition.location.start.displayed.total;
          }
        });
        toast("Loaded: " + file.name);
      } catch (err) {
        readerPlaceholder.hidden = false;
        epubViewport.hidden = true;
        toast("Error: " + err.message, true);
      }
    }
  });

  searchBtn.addEventListener("click", function () { search(false); });
  searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { suggestionsDropdown.style.display = "none"; search(false); } });
})();
