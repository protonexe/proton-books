/* ── EPUB Reader Module ── */

window.ReaderModule = (() => {
  "use strict";

  let currentBook = null;
  let currentRendition = null;
  let isLoaded = false;

  const viewerEl = document.getElementById("viewer");
  const placeholderEl = document.getElementById("reader-placeholder");
  const navBar = document.getElementById("nav-bar");
  const navPrev = document.getElementById("nav-prev");
  const navNext = document.getElementById("nav-next");
  const navCur = document.getElementById("nav-page-current");
  const navTotal = document.getElementById("nav-page-total");

  /* ── Public API ── */

  async function loadEbook(source) {
    closeBook();

    placeholderEl.hidden = true;

    let book;
    try {
      if (source instanceof ArrayBuffer) {
        book = ePub(source);
      } else if (source instanceof Blob) {
        const ab = await source.arrayBuffer();
        book = ePub(ab);
      } else if (typeof source === "string") {
        book = ePub(source);
      } else {
        throw new Error("Unsupported source type — pass a URL, ArrayBuffer, or Blob.");
      }

      currentBook = book;

      const rendition = book.renderTo(viewerEl, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
        allowScriptedContent: false,
      });
      currentRendition = rendition;

      await rendition.display();

      navBar.hidden = false;
      isLoaded = true;

      const totalSpine = book.spine ? (book.spine.length || 0) : 0;
      navTotal.textContent = totalSpine || "-";

      function updateLocation() {
        if (!rendition.location) return;
        const start = rendition.location.start;
        if (start && start.displayed) {
          const page = start.displayed.page || 0;
          const total = start.displayed.total || 0;
          navCur.textContent = page || "-";
          if (total) navTotal.textContent = total;
        }
      }

      rendition.on("relocated", updateLocation);
      updateLocation();

      return true;
    } catch (err) {
      viewerEl.innerHTML = "";
      placeholderEl.hidden = false;
      isLoaded = false;
      throw err;
    }
  }

  function closeBook() {
    if (currentRendition) {
      try { currentRendition.destroy(); } catch (_) { /* noop */ }
      currentRendition = null;
    }
    currentBook = null;
    isLoaded = false;
    navBar.hidden = true;
    navCur.textContent = "-";
    navTotal.textContent = "-";
    viewerEl.innerHTML = "";
    placeholderEl.hidden = false;
  }

  function prevPage() {
    if (!currentRendition) return;
    currentRendition.prev();
  }

  function nextPage() {
    if (!currentRendition) return;
    currentRendition.next();
  }

  function getIsLoaded() {
    return isLoaded;
  }

  /* ── Wire navigation events ── */

  navPrev.addEventListener("click", prevPage);
  navNext.addEventListener("click", nextPage);

  document.addEventListener("keydown", (e) => {
    if (!isLoaded) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); prevPage(); }
    if (e.key === "ArrowRight") { e.preventDefault(); nextPage(); }
  });

  return { loadEbook, closeBook, prevPage, nextPage, getIsLoaded };
})();
