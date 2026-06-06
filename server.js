import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const ANNAS_MIRRORS = [
  "https://annas-archive.org",
  "https://annas-archive.gl",
  "https://annas-archive.pk",
  "https://annas-archive.gd"
];

const LIBGEN_MIRRORS = [
  "https://libgen.li",
  "https://libgen.rs",
  "https://libgen.is",
  "https://libgen.st"
];

async function fetchWithMirrors(mirrors, path, options = {}) {
  for (const mirror of mirrors) {
    try {
      const url = `${mirror}${path}`;
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
      if (resp.ok) return { resp, mirror };
    } catch (err) {
      console.error(`Mirror ${mirror} failed: ${err.message}`);
    }
  }
  return null;
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
  gutenberg: async (query) => {
    const url = `https://gutendex.com/books?search=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).slice(0, 20).map(d => ({
      title: d.title || "Unknown",
      author: d.authors?.[0]?.name || "Unknown",
      year: "",
      extension: "EPUB",
      coverId: null,
      coverUrl: d.formats?.["image/jpeg"],
      olid: d.id.toString(),
      ia: d.formats?.["application/epub+zip"],
      hasEpub: !!d.formats?.["application/epub+zip"],
      hasPdf: false,
      source: "gutenberg"
    }));
  },
  ol: async (query) => {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=30&fields=key,title,author_name,cover_i,first_publish_year,ebook_access,has_fulltext,ia`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
  annas: async (query) => {
    const path = `/search?q=${encodeURIComponent(query)}`;
    const result = await fetchWithMirrors(ANNAS_MIRRORS, path, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!result) return [];
    
    const html = await result.resp.text();
    const results = [];
    const resultRegex = /<div class="result">([\s\S]*?)<\/div>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 20) {
      const content = match[1];
      const md5Match = content.match(/href="\/md5\/([a-f0-9]{32})"/);
      const titleMatch = content.match(/<div class="title">([\s\S]*?)<\/div>/);
      const authorMatch = content.match(/<div class="author">([\s\S]*?)<\/div>/);
      const extMatch = content.match(/<span class="extension">([\s\S]*?)<\/span>/);
      if (md5Match && titleMatch) {
        const md5 = md5Match[1];
        results.push({
          title: titleMatch[1].trim(),
          author: authorMatch ? authorMatch[1].trim() : "Unknown",
          year: "",
          extension: extMatch ? extMatch[1].trim().toUpperCase() : "EPUB",
          coverId: null,
          coverUrl: null,
          olid: md5,
          ia: `${result.mirror}/md5/${md5}`,
          hasEpub: true,
          hasPdf: false,
          source: "annas"
        });
      }
    }
    return results;
  },
  libgen: async (query) => {
    const path = `/search.php?req=${encodeURIComponent(query)}`;
    const result = await fetchWithMirrors(LIBGEN_MIRRORS, path, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!result) return [];

    const html = await result.resp.text();
    const results = [];
    // LibGen results are usually in a table with <tr> tags
    const rowRegex = /<tr class="[^"]*">([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null && results.length < 20) {
      const row = match[1];
      const titleMatch = row.match(/<a href="\/g?id=([0-9]+)">([\s\S]*?)<\/a>/);
      const authorMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/); // Simplistic, might need refinement
      if (titleMatch) {
        const id = titleMatch[1];
        results.push({
          title: titleMatch[2].trim(),
          author: "Unknown",
          year: "",
          extension: "PDF",
          coverId: null,
          coverUrl: null,
          olid: id,
          ia: `${result.mirror}/get?id=${id}`,
          hasEpub: false,
          hasPdf: true,
          source: "libgen"
        });
      }
    }
    return results;
  }
};

function filterResults(results, filter) {
  if (!filter || filter === "all") return results;

  return results.filter(r => {
    const ext = (r.extension || "").toUpperCase();
    switch (filter) {
      case "books":
        return ext === "EPUB" || r.source === "gutenberg" || r.source === "ol";
      case "papers":
        return r.source === "libgen" || (r.source === "annas" && (ext === "PDF" || r.title.toLowerCase().includes("abstract")));
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
