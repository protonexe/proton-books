import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const ANNAS_MIRROR = process.env.ANNAS_MIRROR || "https://annas-archive.org";

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

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Missing ?q=" });

  const sources = [
    { id: "gutenberg", fetch: async () => {
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
    }},
    { id: "ol", fetch: async () => {
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
    }},
    { id: "annas", fetch: async () => {
        const url = `${ANNAS_MIRROR}/search?q=${encodeURIComponent(query)}`;
        const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return [];
        const html = await resp.text();
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
              ia: `${ANNAS_MIRROR}/md5/${md5}`,
              hasEpub: true,
              hasPdf: false,
              source: "annas"
            });
          }
        }
        return results;
    }}
  ];

  try {
    const searchPromises = sources.map(s => s.fetch().catch(() => []));
    const allResults = await Promise.all(searchPromises);
    const mergedResults = allResults.flat();
    
    res.json({ results: mergedResults });
  } catch (err) {
    console.error(`[search]`, err.message);
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
