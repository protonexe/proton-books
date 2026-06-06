(function () {
  var searchInput = document.getElementById("search-input");
  var clearSearch = document.getElementById("clear-search");
  var searchBtn = document.getElementById("search-btn");
  var themeToggle = document.getElementById("theme-toggle");
  var resultsList = document.getElementById("results-list");
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

  var book = null;
  var rendition = null;
  var searching = false;
  var iframeLoadTimer = null;
  var currentIaUrl = "";

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
    statusEl.textContent = "";
    statusEl.className = "";
    
    // Add skeleton loaders
    resultsList.innerHTML = "";
    for(var i=0; i<5; i++) {
      var sk = document.createElement("div");
      sk.className = "result skeleton";
      sk.style.height = "60px";
      resultsList.appendChild(sk);
    }

    try {
      var resp = await fetch("/api/search?q=" + encodeURIComponent(q));
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "HTTP " + resp.status);
      renderResults(data.results || []);
      statusEl.textContent = (data.results || []).length + " results";
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "error";
      resultsList.innerHTML = "";
      placeholder.hidden = false;
      toast(err.message, true);
    } finally {
      searching = false;
      searchBtn.disabled = false;
      searchBtn.textContent = "Search";
    }
  }

  function renderResults(results) {
    resultsList.innerHTML = "";
    placeholder.hidden = results.length > 0;
    if (results.length === 0) return;
    var frag = document.createDocumentFragment();
    results.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "result";
      var cover = r.coverUrl ? r.coverUrl : (r.coverId ? 'https://covers.openlibrary.org/b/id/' + r.coverId + '-S.jpg' : '');
      var sourceName = { ol: "Open Library", gutenberg: "Gutenberg", annas: "Anna's Archive" }[r.source] || r.source;
      el.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
          (cover ? '<img src="' + cover + '" alt="" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#e2e8f0" loading="lazy" />' : '<div style="width:32px;height:48px;border-radius:4px;background:#e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-book" style="color:#94a3b8"></i></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div class="title">' + esc(r.title) + '</div>' +
            '<div class="author">' + esc(r.author) + '</div>' +
            '<div class="meta">' +
              (r.year ? '<span>'+r.year+'</span>' : '') +
              (r.extension ? '<span style="font-family:monospace;font-weight:600;color:#4f46e5">'+esc(r.extension)+'</span>' : '') +
              (sourceName ? '<span style="color:#64748b;font-style:italic">'+esc(sourceName)+'</span>' : '') +
              (!r.hasEpub ? '<span style="color:#dc2626;font-size:10px">No free download</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      if (r.hasEpub) el.addEventListener("click", function () { openBook(r); });
      frag.appendChild(el);
    });
    resultsList.appendChild(frag);
  }

  function esc(s) { if (!s) return ""; var d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

  function openBook(r) {
    if (!r.hasEpub && r.extension !== "PDF") { toast("No viewable format available.", true); return; }
    toast("Opening: " + r.title + "…");
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
    } else if (r.source === "gutenberg" || r.extension === "EPUB") {
      readerIframe.hidden = true;
      epubViewport.hidden = false;
      loadEpubFromUrl(r.ia, r.title);
    } else if (r.extension === "PDF") {
      // For PDFs, use the native iframe viewer
      readerIframe.src = r.ia; 
      armIframeWatchdog();
    } else if (r.source === "annas") {
      currentIaUrl = r.ia;
      openExternal.href = currentIaUrl;
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
      await rendition.display();
      navBar.hidden = false;
      if (book.spine) navTotal.textContent = book.spine.length || "-";
      rendition.on("relocated", function () {
        if (rendition.location && rendition.location.start && rendition.location.start.displayed) {
          navPage.textContent = rendition.location.start.displayed.page || "-";
          if (rendition.location.start.displayed.total) navTotal.textContent = rendition.location.start.displayed.total;
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
