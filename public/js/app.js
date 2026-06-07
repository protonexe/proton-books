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

  var currentFontSize = 100;
  var isTtsPlaying = false;
  
  function applyReaderTheme() {
    if (!rendition) return;
    var family = fontFamily.value;
    var spacing = lineSpacing.value;
    var size = currentFontSize + "%";
    
    rendition.themes.register("custom", {
      "body": {
        "font-family": family,
        "font-size": size,
        "line-height": spacing
      }
    });
    rendition.themes.select("custom");
  }

  readerSettings.addEventListener("click", function () {
    settingsOverlay.style.display = "flex";
  });

  closeSettings.addEventListener("click", function () {
    settingsOverlay.style.display = "none";
  });
  
  closeToc.addEventListener("click", function () {
    tocOverlay.style.display = "none";
  });

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
      el.addEventListener("click", function () {
        rendition.display(item.href);
        tocOverlay.style.display = "none";
        toast("Navigating to: " + item.label);
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
          if (doc && doc.body) {
            text += (doc.body.innerText || doc.body.textContent || "") + " ";
          }
        } catch (_) {}
      });
    } catch (e) {
      console.error("TTS contents error:", e);
    }

    if (!text || !text.trim()) {
      toast("No text found to read.", true);
      return;
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 5000) text = text.slice(0, 5000);

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onend = function () {
      isTtsPlaying = false;
      readerTts.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    };
    utterance.onerror = function () {
      isTtsPlaying = false;
      readerTts.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    };
    window.speechSynthesis.speak(utterance);
    isTtsPlaying = true;
    readerTts.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
  });
  var rendition = null;
  var searching = false;
  var iframeLoadTimer = null;
  var currentIaUrl = "";
  var recentBooks = JSON.parse(localStorage.getItem("recentBooks") || "[]");
  var favoriteBooks = JSON.parse(localStorage.getItem("favoriteBooks") || "[]");
  var favoritesArea = document.getElementById("favorites-area");
  var favoritesList = document.getElementById("favorites-list");
  
  function saveRecent(book) {
    recentBooks = recentBooks.filter(b => b.olid !== book.olid);
    recentBooks.unshift(book);
    recentBooks = recentBooks.slice(0, 5);
    localStorage.setItem("recentBooks", JSON.stringify(recentBooks));
    renderRecentBooks();
  }

  function toggleFavorite(book, event) {
    if (event) event.stopPropagation();
    var index = favoriteBooks.findIndex(b => b.olid === book.olid);
    if (index > -1) {
      favoriteBooks.splice(index, 1);
    } else {
      favoriteBooks.unshift(book);
    }
    localStorage.setItem("favoriteBooks", JSON.stringify(favoriteBooks));
    renderFavorites();
    // If this book is currently in the results list, update its star icon
    updateFavoriteIcons();
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
      el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                     '<div class="title">' + esc(r.title) + '</div>' +
                     '<button class="fav-btn" style="background:none;border:none;cursor:pointer;color:var(--text);padding:0 4px"><i class="fa-solid fa-star" style="color:#f59e0b"></i></button>' +
                     '</div>';
      el.addEventListener("click", function () { openBook(r); });
      el.querySelector(".fav-btn").addEventListener("click", function (e) { toggleFavorite(r, e); });
      favoritesList.appendChild(el);
    });
  }

  function updateFavoriteIcons() {
    var results = document.querySelectorAll(".result");
    results.forEach(function(el) {
      // This is tricky because we don't have the book object. 
      // We might need to store the olid in a data attribute.
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
      el.innerHTML = '<div class="title">' + esc(r.title) + '</div>';
      el.addEventListener("click", function () { openBook(r); });
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

  searchInput.addEventListener("input", function() {
    clearSearch.hidden = searchInput.value.trim() === "";
  });

  clearSearch.addEventListener("click", function() {
    searchInput.value = "";
    clearSearch.hidden = true;
    searchInput.focus();
  });

  async function search() {
    var q = searchInput.value.trim();
    if (!q) { toast("Enter a query.", true); return; }
    if (searching) return;
    searching = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "Searching…";
    statusEl.textContent = "Searching sources...";
    statusEl.className = "";
    
    resultsList.innerHTML = "";
    placeholder.hidden = true;
    
    // Add skeletons
    for(var i=0; i<6; i++) {
      var sk = document.createElement("div");
      sk.className = "result skeleton";
      sk.style.height = "60px";
      resultsList.appendChild(sk);
    }

    var sources = [
      { id: "gutenberg", url: "/api/search/gutenberg" },
      { id: "ol", url: "/api/search/ol" },
      { id: "libgen", url: "/api/search/libgen" }
    ];

    // Render source status chips above results
    function renderSourceChips(sources) {
      var container = document.getElementById('sources-status');
      if (!container) return;
      container.innerHTML = '';
      sources.forEach(function(s) {
        var chip = document.createElement('div');
        chip.className = 'source-chip';
        chip.setAttribute('data-source', s.id);
        chip.style.padding = '6px 10px';
        chip.style.borderRadius = '999px';
        chip.style.background = 'var(--bg-secondary)';
        chip.style.color = 'var(--text)';
        chip.style.fontSize = '12px';
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '8px';
        chip.textContent = s.id;
        container.appendChild(chip);
      });
    }

    function updateSourceChip(id, status, count) {
      var container = document.getElementById('sources-status');
      if (!container) return;
      var chip = container.querySelector('[data-source="' + id + '"]');
      if (!chip) return;
      switch (status) {
        case 'loading':
          chip.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="width:12px"></i> ' + id + '…';
          chip.style.opacity = '0.9';
          break;
        case 'ok':
          chip.innerHTML = '<i class="fa-solid fa-check-circle" style="color:#16a34a;width:12px"></i> ' + id + (count ? ' (' + count + ')' : '');
          chip.style.opacity = '1';
          break;
        case 'fail':
          chip.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626;width:12px"></i> ' + id + ' (failed)';
          chip.style.opacity = '0.6';
          break;
        default:
          chip.textContent = id;
      }
    }

    var totalResults = 0;
    var failedSources = 0;

    // Prepare UI chips
    renderSourceChips(sources);

    async function fetchSource(source) {
      updateSourceChip(source.id, 'loading');
      try {
        var filter = searchFilter.value;
        var url = source.url + "?q=" + encodeURIComponent(q) + "&filter=" + encodeURIComponent(filter);
        var resp = await fetch(url);
        var data = await resp.json();
        if (!resp.ok) throw new Error();

        var results = data.results || [];
        totalResults += results.length;

        // Clear skeletons on the very first successful result
        if (totalResults > 0 && resultsList.querySelector(".skeleton")) {
          resultsList.innerHTML = "";
        }

        renderResults(results, true);
        statusEl.textContent = totalResults + " results found";
        updateSourceChip(source.id, 'ok', results.length);
      } catch (err) {
        failedSources++;
        updateSourceChip(source.id, 'fail');
      }
    }

    var allResolved = [];
    var promises = sources.map(async (s) => {
      await fetchSource(s);
      allResolved.push(s.id);
    });

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

    searching = false;
    searchBtn.disabled = false;
    searchBtn.textContent = "Search";
  }

  function renderResults(results, append) {
    if (!append) {
      resultsList.innerHTML = "";
    }
    placeholder.hidden = results.length > 0 || !append;
    if (results.length === 0) return;
    var frag = document.createDocumentFragment();
    results.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "result";
      var cover = r.coverUrl ? r.coverUrl : (r.coverId ? 'https://covers.openlibrary.org/b/id/' + r.coverId + '-S.jpg' : '');
      var sourceName = { ol: "Open Library", gutenberg: "Gutenberg", annas: "Anna's Archive", libgen: "LibGen", scihub: "Sci-Hub" }[r.source] || r.source;
      var descSnippet = r.description ? r.description.replace(/<[^>]*>/g, '').slice(0, 120) + (r.description.length > 120 ? '…' : '') : '';
      el.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
          (cover ? '<img src="' + cover + '" alt="" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#e2e8f0" loading="lazy" />' : '<div style="width:32px;height:48px;border-radius:4px;background:#e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-book" style="color:#94a3b8"></i></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div class="title">' + esc(r.title) + '</div>' +
            '<div class="author">' + esc(r.author) + '</div>' +
            (descSnippet ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(descSnippet) + '</div>' : '') +
            '<div class="meta">' +
              (r.year ? '<span>'+r.year+'</span>' : '') +
              (r.extension ? '<span style="font-family:monospace;font-weight:600;color:#4f46e5">'+esc(r.extension)+'</span>' : '') +
              (sourceName ? '<span style="color:#64748b;font-style:italic">'+esc(sourceName)+'</span>' : '') +
              (!r.hasEpub && r.source !== "ol" ? '<span style="color:#dc2626;font-size:10px">No free download</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      el.addEventListener("click", function () { openBook(r); });
      frag.appendChild(el);
    });
    resultsList.appendChild(frag);
  }

  function esc(s) { if (!s) return ""; var d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

  function openBook(r) {
    if (!r.hasEpub && r.extension !== "PDF") { toast("No viewable format available.", true); return; }
    toast("Opening: " + r.title + "…");
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
    } else if (r.extension === "EPUB") {
      readerIframe.hidden = true;
      epubViewport.hidden = false;
      loadEpubFromUrl(r.ia, r.title);
    } else if (r.extension === "PDF") {
      readerIframe.src = r.ia; 
      armIframeWatchdog();
    }
  }

  async function loadEpubFromUrl(url, title) {
    try {
      var proxyUrl = "/api/download-proxy?url=" + encodeURIComponent(url);
      var resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error("Failed to download book via proxy.");
      var buffer = await resp.arrayBuffer();
      book = ePub(buffer);
      rendition = book.renderTo(epubViewport, { width: "100%", height: "100%", spread: "none", flow: "paginated" });
      
      // Restore progress
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
          
          // Save progress
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
    if (e.key === "t" || e.key === "T") {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT") return;
      themeToggle.click();
    }
    if (!rendition) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); rendition.prev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); rendition.next(); }
  });

  fileUpload.addEventListener("change", async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext !== "epub" && ext !== "pdf" && ext !== "txt") { toast("Select an .epub, .pdf, or .txt file.", true); return; }
    toast("Opening: " + file.name + "…");
    closeBook();
    readerPlaceholder.hidden = true;
    
    if (ext === "pdf") {
      epubViewport.hidden = true;
      readerIframe.hidden = false;
      var blobUrl = URL.createObjectURL(file);
      readerIframe.src = blobUrl;
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
          width: "100%", 
          height: "100%", 
          spread: "none", 
          flow: "paginated",
          manager: "default"
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
        console.error("EPUB Load Error:", err);
        readerPlaceholder.hidden = false;
        epubViewport.hidden = true;
        toast("Error: " + err.message, true);
      }
    }
    fileUpload.value = "";
  });

  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", async function (e) {
    e.preventDefault();
    var files = Array.from(e.dataTransfer.files).filter(function (f) { 
      var ext = f.name.split('.').pop().toLowerCase();
      return ext === "epub" || ext === "pdf" || ext === "txt"; 
    });
    if (files.length === 0) { toast("Drop an .epub, .pdf, or .txt file.", true); return; }
    
    var file = files[0];
    toast("Opening: " + file.name + "…");
    closeBook();
    readerPlaceholder.hidden = true;
    
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext === "pdf") {
      epubViewport.hidden = true;
      readerIframe.hidden = false;
      var blobUrl = URL.createObjectURL(file);
      readerIframe.src = blobUrl;
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

  searchBtn.addEventListener("click", search);
  searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") search(); });
})();
