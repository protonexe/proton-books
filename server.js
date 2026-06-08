import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = "2.0.0";

const metadataCache = new Map();
const searchCache = new Map();
const searchHistory = [];
const MAX_HISTORY = 50;
const CACHE_TTL = 5 * 60 * 1000;

const LIBGEN_MIRRORS = [
  "https://libgen.li",
  "https://libgen.rs",
  "https://libgen.is",
  "https://libgen.st"
];

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 30;

function rateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

if (rateLimitMap.size > 1000) {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW;
  for (const [key, val] of rateLimitMap) {
    if (val.start < cutoff) rateLimitMap.delete(key);
  }
}

function getCached(key) {
  const entry = searchCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  searchCache.delete(key);
  return null;
}

function setCache(key, data) {
  searchCache.set(key, { data, ts: Date.now() });
  if (searchCache.size > 200) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
}

function addSearchHistory(query) {
  const q = query.toLowerCase().trim();
  const idx = searchHistory.findIndex(h => h.query === q);
  if (idx > -1) {
    searchHistory[idx].count++;
    searchHistory[idx].lastAt = Date.now();
  } else {
    searchHistory.push({ query: q, count: 1, lastAt: Date.now() });
  }
  if (searchHistory.length > MAX_HISTORY) searchHistory.shift();
}

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
          year: item.volumeInfo?.publishedDate?.slice(0, 4) || null,
          language: item.volumeInfo?.language || null,
          pageCount: item.volumeInfo?.pageCount || null,
          publisher: item.volumeInfo?.publisher || null,
          isbn: (item.volumeInfo?.industryIdentifiers || []).find(i => i.type === "ISBN_13")?.identifier || null,
          categories: item.volumeInfo?.categories || []
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
        year: r.year || match.year,
        language: r.language || match.language,
        pageCount: r.pageCount || match.pageCount,
        publisher: r.publisher || match.publisher,
        isbn: r.isbn || match.isbn,
        categories: r.categories || match.categories
      };
    }
    return r;
  });
}

app.use(express.json());
app.use(express.static("public"));

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  if (req.path.startsWith("/api/")) {
    if (!rateLimit(ip)) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
  }
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: VERSION,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    sources: Object.keys(sourceHandlers),
    cacheSize: searchCache.size,
    rateLimitEntries: rateLimitMap.size
  });
});

app.get("/api/version", (req, res) => {
  res.json({ version: VERSION, name: "Proton Books", engine: "Node.js " + process.version });
});

app.get("/api/suggestions", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) return res.json({ suggestions: [] });

  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&fields=items(volumeInfo(title,authors))`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return res.json({ suggestions: [] });
    const data = await resp.json();
    const suggestions = (data.items || []).map(item => ({
      title: item.volumeInfo?.title || "",
      author: (item.volumeInfo?.authors || [])[0] || ""
    })).filter(s => s.title);
    res.json({ suggestions });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

app.get("/api/book-detail", async (req, res) => {
  const { source, id, ia } = req.query;
  if (!source || !id) return res.status(400).json({ error: "Missing ?source= and ?id=" });

  try {
    let detail = {};

    if (source === "ol") {
      const resp = await fetch(`https://openlibrary.org/works/${id}.json`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        detail = {
          title: data.title,
          description: typeof data.description === "string" ? data.description : data.description?.value || "",
          subjects: data.subjects || [],
          firstPublished: data.first_publish_year || null,
          covers: (data.covers || []).slice(0, 5).map(c => `https://covers.openlibrary.org/b/id/${c}-M.jpg`),
          links: (data.links || []).slice(0, 3).map(l => ({ title: l.title, url: l.url }))
        };
      }
      if (ia) {
        try {
          const metaResp = await fetch(`https://archive.org/metadata/${ia}`, { signal: AbortSignal.timeout(4000) });
          if (metaResp.ok) {
            const metaData = await metaResp.json();
            detail.description = detail.description || metaData.metadata?.description || "";
            detail.subjects = detail.subjects.length ? detail.subjects : (metaData.metadata?.subject || []);
            detail.imageCount = metaData.metadata?.imagecount || 0;
            detail.files = (metaData.files || []).filter(f => ["epub", "pdf", "txt", "djvu"].includes(f.format?.toLowerCase())).map(f => ({
              name: f.name,
              format: f.format,
              size: f.size
            }));
          }
        } catch (_) {}
      }
    } else if (source === "gutenberg") {
      const resp = await fetch(`https://archive.org/metadata/${id}`, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) {
        const data = await resp.json();
        detail = {
          title: data.metadata?.title,
          description: data.metadata?.description || "",
          creator: data.metadata?.creator || "",
          subjects: data.metadata?.subject || [],
          imageCount: data.metadata?.imagecount || 0,
          files: (data.files || []).filter(f => ["epub", "pdf", "txt", "djvu"].includes(f.format?.toLowerCase())).map(f => ({
            name: f.name,
            format: f.format,
            size: f.size
          }))
        };
      }
    } else if (source === "libgen") {
      for (const mirror of LIBGEN_MIRRORS) {
        try {
          const resp = await fetch(`${mirror}/json.php?ids=${id}`, { signal: AbortSignal.timeout(3000) });
          if (resp.ok) {
            const data = await resp.json();
            const book = Array.isArray(data) ? data[0] : null;
            if (book && book.title) {
              detail = {
                title: book.title || "",
                author: book.author || "",
                year: book.year || "",
                extension: book.extension || "",
                fileSize: book.filesize ? (parseInt(book.filesize) > 1048576 ? (parseInt(book.filesize) / 1048576).toFixed(1) + " MB" : (parseInt(book.filesize) / 1024).toFixed(0) + " KB") : "",
                pages: book.pages || "",
                language: book.language || "",
                publisher: book.publisher || "",
                isbn: book.isbn || "",
                description: book.description || "",
                coverUrl: book.coverurl ? `${mirror}/get.php?md5=${book.md5}` : null
              };
              break;
            }
          }
        } catch (_) {}
      }
    }

    res.json({ detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/similar", async (req, res) => {
  const q = (req.query.q || "").trim();
  const source = req.query.source || "";
  if (!q) return res.json({ results: [] });

  try {
    const subjects = q.split(" ").slice(0, 2).join(" ");
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(subjects)}&limit=5&fields=key,title,author_name,cover_i,first_publish_year,ia,has_fulltext`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return res.json({ results: [] });
    const data = await resp.json();
    const results = (data.docs || []).map(d => {
      const iaId = (d.has_fulltext && d.ia && d.ia.length > 0) ? d.ia[0] : null;
      return {
        title: d.title || "Unknown",
        author: d.author_name ? d.author_name.join(", ") : "Unknown",
        year: d.first_publish_year || "",
        coverId: d.cover_i || null,
        olid: d.key.replace("/works/", ""),
        ia: iaId,
        source: "ol",
        hasEpub: !!iaId
      };
    });
    res.json({ results });
  } catch (err) {
    res.json({ results: [] });
  }
});

app.get("/api/trending", (req, res) => {
  const trending = [...searchHistory]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(h => h.query);
  res.json({ trending });
});

app.get("/api/search/history", (req, res) => {
  const history = [...searchHistory]
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 20);
  res.json({ history });
});

app.get("/api/collections", (req, res) => {
  res.json({
    collections: [
      { id: "classic-literature", name: "Classic Literature", query: "classic literature fiction", icon: "fa-book" },
      { id: "science", name: "Science & Nature", query: "science nature physics biology", icon: "fa-flask" },
      { id: "history", name: "History", query: "history civilization ancient", icon: "fa-landmark" },
      { id: "philosophy", name: "Philosophy", query: "philosophy ethics logic", icon: "fa-brain" },
      { id: "technology", name: "Technology", query: "computer programming technology", icon: "fa-microchip" },
      { id: "art", name: "Art & Design", query: "art design painting architecture", icon: "fa-palette" },
      { id: "poetry", name: "Poetry", query: "poetry poems verse", icon: "fa-feather" },
      { id: "adventure", name: "Adventure & Travel", query: "adventure travel exploration", icon: "fa-compass" },
      { id: "mystery", name: "Mystery & Thriller", query: "mystery detective thriller", icon: "fa-mask" },
      { id: "romance", name: "Romance", query: "romance love story", icon: "fa-heart" },
      { id: "comics", name: "Comics & Graphic Novels", query: "comic graphic novel", icon: "fa-icons" },
      { id: "textbooks", name: "Textbooks & Education", query: "textbook education mathematics", icon: "fa-graduation-cap" }
    ]
  });
});

app.get("/api/download-proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      redirect: 'follow'
    });
    if (!response.ok) {
      console.error(`[proxy] Fetch failed for ${url} with status ${response.status}`);
      throw new Error(`Proxy error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length") || "";
    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    response.body.pipe(res);
  } catch (err) {
    console.error(`[proxy] Critical error for ${url}: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

const sourceHandlers = {
  ol: async (query, options = {}) => {
    let url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,first_publish_year,ebook_access,has_fulltext,ia,language`;
    if (options.language) url += `&language=${options.language}`;
    console.log(`[ol] Searching: ${url}`);
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      console.log(`[ol] Response status: ${resp.status}`);
      if (!resp.ok) {
        console.error(`[ol] HTTP error: ${resp.status} ${resp.statusText}`);
        return [];
      }
      const data = await resp.json();
      if (!data.docs) {
        console.warn(`[ol] No docs found in response`);
        return [];
      }
      let results = data.docs.filter(d => d.key).slice(0, 20).map(d => {
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
          source: "ol",
          language: (d.language || [])[0] || ""
        };
      });
      if (options.yearFrom || options.yearTo) {
        results = results.filter(r => {
          const y = parseInt(r.year);
          if (!y) return true;
          if (options.yearFrom && y < options.yearFrom) return false;
          if (options.yearTo && y > options.yearTo) return false;
          return true;
        });
      }
      console.log(`[ol] Found ${results.length} results`);
      return results;
    } catch (err) {
      console.error(`[ol] Critical error: ${err.message}`);
      return [];
    }
  },

  libgen: async (query, options = {}) => {
    let path = `/index.php?req=${encodeURIComponent(query)}&curtab=f`;
    console.log(`[libgen] Searching path: ${path}`);
    const result = await fetchWithMirrors(LIBGEN_MIRRORS, path, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!result) {
      console.error(`[libgen] All mirrors failed for path: ${path}`);
      return [];
    }
    console.log(`[libgen] Mirror ${result.mirror} succeeded with status ${result.resp.status}`);
    try {
      const html = await result.resp.text();
      const results = [];
      const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
      if (!tbodyMatch) {
        console.warn(`[libgen] No <tbody> found in HTML response`);
        return [];
      }
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
          let fileSize = "";
          for (const td of allTds) {
            const text = td[1].replace(/<[^>]*>/g, "").trim();
            if (text.match(/^\d+(\.\d+)?\s*(KB|MB|GB|bytes)$/i)) {
              fileSize = text;
              break;
            }
          }
          let language = "";
          for (const td of allTds) {
            const text = td[1].replace(/<[^>]*>/g, "").trim().toLowerCase();
            if (["english","french","german","spanish","russian","chinese","japanese","italian","portuguese","arabic","dutch","polish","turkish","czech","swedish","danish","norwegian","finnish","greek","hebrew","romanian","hungarian","korean","hindi","thai","vietnamese","indonesian","malay","ukrainian","bulgarian","serbian","croatian","slovak","slovenian","lithuanian","latvian","estonian","catalan","basque","galician","icelandic","irish","scottish","welsh"].includes(text)) {
              language = text.charAt(0).toUpperCase() + text.slice(1);
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
            source: "libgen",
            fileSize: fileSize,
            language: language
          });
        }
      }
      let filtered = results;
      if (options.yearFrom || options.yearTo) {
        filtered = filtered.filter(r => {
          const y = parseInt(r.year);
          if (!y) return true;
          if (options.yearFrom && y < options.yearFrom) return false;
          if (options.yearTo && y > options.yearTo) return false;
          return true;
        });
      }
      if (options.format) {
        filtered = filtered.filter(r => r.extension === options.format.toUpperCase());
      }
      console.log(`[libgen] Found ${filtered.length} results`);
      return filtered;
    } catch (err) {
      console.error(`[libgen] Parsing error: ${err.message}`);
      return [];
    }
  },

  gutenberg: async (query, options = {}) => {
    let url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`mediatype:(texts) AND collection:gutenberg AND (${query})`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&fl[]=imagecount&rows=20&output=json`;
    console.log(`[gutenberg] Searching: ${url}`);
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      console.log(`[gutenberg] Response status: ${resp.status}`);
      if (!resp.ok) {
        console.error(`[gutenberg] HTTP error: ${resp.status} ${resp.statusText}`);
        return [];
      }
      const data = await resp.json();
      const docs = data.response?.docs || [];
      console.log(`[gutenberg] Found ${docs.length} docs in response`);
      let results = docs.map(d => {
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
      if (options.yearFrom || options.yearTo) {
        results = results.filter(r => {
          const y = parseInt(r.year);
          if (!y) return true;
          if (options.yearFrom && y < options.yearFrom) return false;
          if (options.yearTo && y > options.yearTo) return false;
          return true;
        });
      }
      return results;
    } catch (err) {
      console.error(`[gutenberg] Critical error: ${err.message}`);
      return [];
    }
  },
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

function sortResults(results, sort) {
  if (!sort || sort === "relevance") return results;
  const sorted = [...results];
  switch (sort) {
    case "title-asc":
      return sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "title-desc":
      return sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    case "year-asc":
      return sorted.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
    case "year-desc":
      return sorted.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    case "author":
      return sorted.sort((a, b) => (a.author || "").localeCompare(b.author || ""));
    default:
      return sorted;
  }
}

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  const filter = req.query.filter || "all";
  const sort = req.query.sort || "relevance";
  const yearFrom = parseInt(req.query.yearFrom) || null;
  const yearTo = parseInt(req.query.yearTo) || null;
  const format = req.query.format || "";
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 20;
  if (!query) return res.status(400).json({ error: "Missing ?q=" });

  addSearchHistory(query);

  const cacheKey = `${query}:${filter}:${sort}:${yearFrom}:${yearTo}:${format}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  const options = { yearFrom, yearTo, format };

  try {
    const searchPromises = Object.entries(sourceHandlers).map(async ([id, handler]) => {
      try {
        const result = await Promise.race([
          handler(query, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Source ${id} timed out`)), 20000)
          )
        ]);
        return result;
      } catch (err) {
        console.error(`[search] ${id} failed:`, err.message);
        return [];
      }
    });
    const allResults = await Promise.all(searchPromises);
    let mergedResults = allResults.flat();
    mergedResults = filterResults(mergedResults, filter);
    mergedResults = deduplicateResults(mergedResults);
    mergedResults = sortResults(mergedResults, sort);
    mergedResults = await enrichMetadata(mergedResults, query);

    const totalResults = mergedResults.length;
    const totalPages = Math.ceil(totalResults / perPage);
    const startIdx = (page - 1) * perPage;
    const pagedResults = mergedResults.slice(startIdx, startIdx + perPage);

    const response = {
      results: pagedResults,
      pagination: {
        page,
        perPage,
        totalResults,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      query,
      filter,
      sort
    };

    setCache(cacheKey, response);
    res.json(response);
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

app.get("/api/book-url", (req, res) => {
  const ia = (req.query.ia || "").trim();
  if (!ia) return res.status(400).json({ error: "Missing ?ia=" });
  res.json({ downloadUrl: `https://archive.org/download/${ia}/${ia}.epub` });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Network access: http://<your-local-ip>:${PORT}`);
  console.log(`Version: ${VERSION}`);
});
