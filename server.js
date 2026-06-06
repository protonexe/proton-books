import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const LIBGEN_MIRRORS = [
  "https://libgen.li"
];

const metadataCache = new Map();

async function fetchWithMirrors(mirrors, path, options = {}) {
  for (const mirror of mirrors) {
    try {
      const url = `${mirror}${path}`;
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
      if (resp.ok) return { resp, mirror };
    } catch (err) {
      console.error(`Mirror ${mirror} failed: ${err.message}`);
    }
  }
  return null;
}

async function enrichMetadata(results, query) {
  if (!results || results.length === 0) return results;
  const cacheKey = query.toLowerCase().trim();
  let meta = metadataCache.get(cacheKey);
  if (!meta) {
    try {
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) {
        const data = await resp.json();
        meta = (data.items || []).map(item => ({
          title: (item.volumeInfo?.title || "").toLowerCase(),
          author: (item.volumeInfo?.authors?.[0] || "").toLowerCase(),
          cover: item.volumeInfo?.imageLinks?.thumbnail || null,
          description: item.volumeInfo?.description || null,
          year: item.volumeInfo?.publishedDate?.slice(0, 4) || null
        })).filter(m => m.title);
        metadataCache.set(cacheKey, meta);
        if (metadataCache.size > 100) {
          const firstKey = metadataCache.keys().next().value;
          metadataCache.delete(firstKey);
        }
      }
    } catch (err) {
      console.error(`[metadata] error: ${err.message}`);
      meta = [];
    }
  }
  if (!meta || meta.length === 0) return results;

  return results.map(r => {
    if (r.coverUrl && r.source !== "ol") return r;
    const title = (r.title || "").toLowerCase();
    const author = (r.author || "").toLowerCase();
    const match = meta.find(m => title.includes(m.title) || (author && m.author && author.includes(m.author)));
    if (match) {
      return {
        ...r,
        coverUrl: r.coverUrl || match.cover,
        description: r.description || match.description,
        year: r.year || match.year
      };
    }
    return r;
  });
}

app.use(express.static("public"));

app.get("/api/download-proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const sourceHandlers = {
  ol: async (query) => {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,first_publish_year,ebook_access,has_fulltext,ia`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!data.docs) return [];
    return data.docs.filter(d => d.key).slice(0, 20).map(d => {
      const iaId = (d.has_fulltext && d.ia && d.ia.length > 0) ? d.ia[0] : null;
      return {
        title: d.title || "Unknown",
        author: d.author_name ? d.author_name.join(", ") : "Unknown",
        year: d.first_publish_year || "",
        extension: iaId ? "EPUB" : "",
        coverId: d.cover_i || null,
        olid: d.key.replace("/works/", ""),
        ia: iaId,
        hasEpub: !!iaId,
        hasPdf: false,
        source: "ol"
      };
    });
  },

  libgen: async (query) => {
    const path = `/index.php?req=${encodeURIComponent(query)}&curtab=f`;
    const result = await fetchWithMirrors(LIBGEN_MIRRORS, path, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!result) return [];

    const html = await result.resp.text();
    const results = [];

    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) return [];
    const tbody = tbodyMatch[1];

    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(tbody)) !== null && results.length < 20) {
      const row = match[1];

      const idMatch = row.match(/\/file\.php\?id=(\d+)/);
      const md5Match = row.match(/md5=([a-f0-9]{32})/);
      const allTds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];

      if (idMatch && allTds.length >= 5 && allTds[0]) {
        const id = idMatch[1];
        const md5 = md5Match ? md5Match[1] : null;
        const firstTdHtml = allTds[0][1];
        const title = firstTdHtml
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);

        const authorTd = allTds[1] ? allTds[1][1].replace(/<[^>]*>/g, "").trim() : "Unknown";
        const yearTd = allTds[3] ? allTds[3][1].match(/(\d{4})/) : null;
        const year = yearTd ? yearTd[1] : "";

        let ext = "PDF";
        for (const td of allTds) {
          const text = td[1].replace(/<[^>]*>/g, "").trim().toLowerCase();
          if (["epub","pdf","mobi","azw3","fb2","djvu","cbr","cbz","doc","rtf","lit","odt","html","txt"].includes(text)) {
            ext = text.toUpperCase();
            break;
          }
        }

        results.push({
          title: title,
          author: authorTd || "Unknown",
          year: year,
          extension: ext,
          coverId: null,
          coverUrl: null,
          olid: id,
          ia: md5 ? `${result.mirror}/get.php?md5=${md5}` : `${result.mirror}/file.php?id=${id}`,
          hasEpub: ext === "EPUB" || ext === "MOBI" || ext === "AZW3",
          hasPdf: ext === "PDF",
          source: "libgen"
        });
      }
    }
    return results;
  },

  gutenberg: async (query) => {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`mediatype:(texts) AND collection:gutenberg AND (${query})`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&fl[]=imagecount&rows=20&output=json`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.response?.docs || []).map(d => {
        const id = d.identifier;
        return {
          title: d.title || "Unknown",
          author: d.creator || "Unknown",
          year: d.date || "",
          extension: "EPUB",
          coverId: null,
          coverUrl: `https://archive.org/services/img/${id}`,
          olid: id,
          ia: id,
          hasEpub: true,
          hasPdf: false,
          source: "gutenberg"
        };
      });
    } catch (_) {
      return [];
    }
  }
};

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const normalized = (r.title || "").toLowerCase().trim()
      .replace(/^the\s+/i, "")
      .replace(/[^\w\s]/gi, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function filterResults(results, filter) {
  if (!filter || filter === "all") return results;

  return results.filter(r => {
    const ext = (r.extension || "").toUpperCase();
    switch (filter) {
      case "books":
        return ext === "EPUB" || r.source === "gutenberg" || r.source === "ol";
      case "papers":
        return ext === "PDF" && r.source === "libgen";
      case "comics":
        return ext === "CBR" || ext === "CBZ" || r.title.toLowerCase().includes("comic");
      case "magazines":
        return ext === "PDF" && r.source === "libgen";
      default:
        return true;
    }
  });
}

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  const filter = req.query.filter || "all";
  if (!query) return res.status(400).json({ error: "Missing ?q=" });

  try {
    const searchPromises = Object.entries(sourceHandlers).map(async ([id, handler]) => {
      try {
        return await handler(query);
      } catch (err) {
        console.error(`[search] ${id} failed:`, err.message);
        return [];
      }
    });
    const allResults = await Promise.all(searchPromises);
    let mergedResults = allResults.flat();
    mergedResults = filterResults(mergedResults, filter);
    mergedResults = deduplicateResults(mergedResults);
    mergedResults = await enrichMetadata(mergedResults, query);
    res.json({ results: mergedResults });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/search/:source", async (req, res) => {
  const { source } = req.params;
  const query = (req.query.q || "").trim();
  const filter = req.query.filter || "all";
  if (!query) return res.status(400).json({ error: "Missing ?q=" });

  const handler = sourceHandlers[source];
  if (!handler) return res.status(404).json({ error: "Unsupported source" });

  try {
    let results = await handler(query);
    results = filterResults(results, filter);
    results = await enrichMetadata(results, query);
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/book-url", async (req, res) => {
  const ia = (req.query.ia || "").trim();
  if (!ia) return res.status(400).json({ error: "Missing ?ia=" });
  res.json({ downloadUrl: `https://archive.org/download/${ia}/${ia}.epub` });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Network access: http://<your-local-ip>:${PORT}`);
});
