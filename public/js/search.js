/* ── Search Module ── */

window.SearchModule = (() => {
  "use strict";

  async function search(query, source, endpointBase, lang) {
    const params = new URLSearchParams({ q: query, source });
    if (endpointBase && source === "annas") {
      params.set("base", endpointBase);
    }
    if (lang) params.set("lang", lang);
    const resp = await fetch(`/api/search?${params}`);
    const data = await resp.json();

    if (!resp.ok && !data.results) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return {
      results: (data.results || []).slice(0, 50),
    };
  }

  async function resolveDetail(url) {
    const resp = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data;
  }

  function renderResults(cards, container, onSelect) {
    container.innerHTML = "";

    if (!cards || cards.length === 0) {
      container.innerHTML = `
        <div class="placeholder-card">
          <i class="fa-solid fa-book-open placeholder-icon"></i>
          <p>No results found.</p>
          <p class="text-xs text-slate-400 mt-1">Try a different search term.</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    cards.forEach((card, idx) => {
      const ext = (card.extension || "").toLowerCase();
      const iconMap = {
        epub: "fa-file-epub",
        pdf: "fa-file-pdf",
        mobi: "fa-file",
        azw3: "fa-file",
        djvu: "fa-file",
        txt: "fa-file-lines",
        cbz: "fa-file-archive",
        cbr: "fa-file-archive",
      };
      const icon = iconMap[ext] || "fa-file";

      const el = document.createElement("div");
      el.className = "result-card";
      el.dataset.index = idx;

      el.innerHTML = `
        <div class="title-row">
          <i class="fa-solid ${icon} fa-lg file-icon"></i>
          <div class="flex-1 min-w-0">
            <div class="title-text">${escapeHtml(card.title) || "Unknown Title"}</div>
            <div class="author-text">${card.author ? escapeHtml(card.author) : "Unknown author"}</div>
            <div class="meta-row">
              ${card.language ? `<span><i class="fa-solid fa-globe"></i>${escapeHtml(card.language)}</span>` : ""}
              ${card.extension ? `<span class="ext-badge">${escapeHtml(card.extension)}</span>` : ""}
              ${card.size ? `<span>${escapeHtml(card.size)}</span>` : ""}
            </div>
          </div>
        </div>
      `;

      el.addEventListener("click", () => onSelect(card));
      fragment.appendChild(el);
    });

    container.appendChild(fragment);
  }

  function escapeHtml(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  return { search, resolveDetail, renderResults };
})();
