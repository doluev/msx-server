import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Включаем CORS
app.use(cors());

// Раздаём статические файлы (start.json, menu.json)
app.use(express.static(path.join(__dirname, "public")));

// Демоданные для поиска
const catalog = [
  { title: "Демо видео 1", url: "https://msx.benzac.de/media/video1.mp4", type: "video" },
  { title: "Демо видео 2", url: "https://msx.benzac.de/media/video2.mp4", type: "video" },
  { title: "Страница проекта MSX", url: "https://msx.benzac.de/", type: "link" }
];

// Эндпоинт поиска
app.get("/search", (req, res) => {
  const q = String(req.query.input ?? "").trim().toLowerCase();
  const results = q
    ? catalog.filter(i => i.title.toLowerCase().includes(q))
    : [];

  res.json({
    headline: `{ico:search} "${q || "Пустой запрос"}"`,
    hint: results.length ? `Найдено: ${results.length}` : "Ничего не найдено",
    template: {
      type: "separate",
      layout: "0,0,2,4",
      icon: "msx-white-soft:movie",
      color: "msx-glass",
      decompress: true
    },
    items: results.map(r => ({
      title: r.title,
      playerLabel: r.title,
      action:
        r.type === "video"
          ? `video:${r.url}`
          : `link:${r.url}`
    }))
  });
});

// Запуск
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MSX server listening on http://localhost:${PORT}`);
});
