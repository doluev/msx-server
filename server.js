import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// ES Module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Статика под /msx
app.use("/msx", express.static(path.join(__dirname, "public/msx")));

// Пример каталога фильмов
const catalog = [
  { title: "Демо видео 1", url: "https://msx.benzac.de/media/video1.mp4", type: "video" },
  { title: "Демо видео 2", url: "https://msx.benzac.de/media/video2.mp4", type: "video" }
];

// Эндпоинт поиска
app.get("/msx/search", (req, res) => {
  const q = String(req.query.input || "").toLowerCase();
  const results = q ? catalog.filter(f => f.title.toLowerCase().includes(q)) : [];

  res.json({
    type: "pages",
    headline: `Результаты поиска: "${q}"`,
    template: { type: "button", layout: "0,0,3,3" },
    items: results.map(f => ({
      icon: "movie",
      label: f.title,
      action: f.type === "video" ? `video:${f.url}` : `link:${f.url}`
    }))
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`MSX server running at http://localhost:${PORT}/msx/start.json`)
);
