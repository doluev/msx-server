import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Статика (JSON файлы) по /msx/
app.use("/msx", express.static(path.join(__dirname, "public")));

// Пример каталога
const catalog = [
  { title: "Демо видео 1", url: "https://msx.benzac.de/media/video1.mp4", type: "video" },
  { title: "Демо видео 2", url: "https://msx.benzac.de/media/video2.mp4", type: "video" },
  { title: "MSX сайт", url: "https://msx.benzac.de/", type: "link" }
];

// Поиск
app.get("/msx/search", (req, res) => {
  const q = String(req.query.input ?? "").trim().toLowerCase();
  const results = q
    ? catalog.filter(i => i.title.toLowerCase().includes(q))
    : [];

  res.json({
    headline: `{ico:search} Результаты по запросу: "${q || "..." }"`,
    hint: results.length ? `Найдено: ${results.length}` : "Нет совпадений",
    template: {
      type: "separate",
      layout: "0,0,2,4",
      icon: "msx-white-soft:movie",
      color: "msx-glass"
    },
    items: results.map(r => ({
      title: r.title,
      action: r.type === "video" ? `video:${r.url}` : `link:${r.url}`
    }))
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MSX server running at http://localhost:${PORT}/msx/start.json`);
});
