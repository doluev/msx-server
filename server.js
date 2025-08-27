import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

// Получаем __dirname в ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Статика под /msx
app.use("/msx", express.static(path.join(__dirname, "public/msx")));

// Класс для парсинга M3U8 ссылок
class M3U8Parser {
    constructor() {
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        // Кэш для результатов парсинга
        this.cache = {
            data: null,
            timestamp: null,
            ttl: 5 * 60 * 1000 // 5 минут
        };
    }

    async parsePage(url) {
        try {
            console.log(`🔍 Парсим страницу: ${url}`);
            const response = await this.client.get(url);
            const $ = cheerio.load(response.data);
            let m3u8Links = new Set();

            // 1. Поиск в script тегах
            $('script').each((index, element) => {
                const scriptContent = $(element).html();
                if (scriptContent) {
                    const matches = scriptContent.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
                    if (matches) {
                        matches.forEach(match => m3u8Links.add(match));
                    }
                }
            });

            // 2. Поиск в data-src атрибутах
            $('[data-src]').each((index, element) => {
                const dataSrc = $(element).attr('data-src');
                if (dataSrc && dataSrc.includes('.m3u8')) {
                    const fullUrl = this.resolveUrl(dataSrc, url);
                    if (fullUrl) m3u8Links.add(fullUrl);
                }
            });

            // 3. Поиск в source тегах
            $('source').each((index, element) => {
                const src = $(element).attr('src');
                if (src && src.includes('.m3u8')) {
                    const fullUrl = this.resolveUrl(src, url);
                    if (fullUrl) m3u8Links.add(fullUrl);
                }
            });

            // 4. Поиск в video тегах
            $('video').each((index, element) => {
                const src = $(element).attr('src');
                if (src && src.includes('.m3u8')) {
                    const fullUrl = this.resolveUrl(src, url);
                    if (fullUrl) m3u8Links.add(fullUrl);
                }
            });

            // 5. Общий поиск в HTML тексте
            const pageText = response.data;
            const additionalMatches = pageText.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
            if (additionalMatches) {
                additionalMatches.forEach(match => m3u8Links.add(match));
            }

            // 6. Поиск в JSON структурах
            const jsonMatches = pageText.match(/"[^"]*\.m3u8[^"]*"/g);
            if (jsonMatches) {
                jsonMatches.forEach(match => {
                    const cleanUrl = match.replace(/"/g, '').replace(/\\"/g, '"');
                    if (this.isValidUrl(cleanUrl)) {
                        m3u8Links.add(cleanUrl);
                    }
                });
            }

            // Конвертируем Set в массив и валидируем
            const uniqueLinks = Array.from(m3u8Links);
            const validatedLinks = uniqueLinks.filter(link => this.validateM3U8Link(link));

            console.log(`✅ Найдено ${validatedLinks.length} валидных m3u8 ссылок`);
            return validatedLinks;

        } catch (error) {
            console.error('❌ Ошибка парсинга:', error.message);
            return [];
        }
    }

    resolveUrl(relativePath, baseUrl) {
        try {
            if (relativePath.startsWith('http')) {
                return relativePath;
            }
            const resolved = new URL(relativePath, baseUrl);
            return resolved.href;
        } catch (error) {
            return null;
        }
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (error) {
            return false;
        }
    }

    validateM3U8Link(url) {
        try {
            const parsed = new URL(url);
            if (!parsed.protocol || !parsed.hostname) {
                return false;
            }

            if (!url.toLowerCase().includes('.m3u8')) {
                return false;
            }

            if (url.includes('undefined') || url.includes('null') || url.length > 500) {
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    detectQuality(url) {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('1080') || urlLower.includes('fhd')) {
            return '1080p';
        } else if (urlLower.includes('720') || urlLower.includes('hd')) {
            return '720p';
        } else if (urlLower.includes('480')) {
            return '480p';
        } else if (urlLower.includes('360')) {
            return '360p';
        } else {
            return 'Auto';
        }
    }

    createMSXVideosJson(m3u8Links, title = 'Gabriel') {
        const items = m3u8Links.map((link, index) => {
            const quality = this.detectQuality(link);
            const videoTitle = `${title} - ${quality}`;
            
            return {
                title: videoTitle,
                playerLabel: videoTitle,
                action: `video:${link}`,
                icon: "movie"
            };
        });

        // Если нет ссылок, возвращаем заглушку
        if (items.length === 0) {
            items.push({
                title: "Видео не найдено",
                playerLabel: "Попробуйте позже",
                action: "info:Не удалось найти видеопотоки",
                icon: "warning"
            });
        }

        return {
            type: "pages",
            headline: `${title} (${items.length} потоков)`,
            template: {
                tag: "Web",
                type: "separate", 
                layout: "0,0,2,4",
                icon: "msx-white-soft:movie",
                color: "msx-glass"
            },
            items: items
        };
    }

    // Метод с кэшированием
    async getVideosWithCache(url, title) {
        const now = Date.now();
        
        // Проверяем кэш
        if (this.cache.data && this.cache.timestamp && (now - this.cache.timestamp) < this.cache.ttl) {
            console.log('📋 Используем кэшированные данные');
            return this.cache.data;
        }

        // Парсим заново
        const m3u8Links = await this.parsePage(url);
        const msxData = this.createMSXVideosJson(m3u8Links, title);
        
        // Сохраняем в кэш
        this.cache.data = msxData;
        this.cache.timestamp = now;
        
        return msxData;
    }
}

// Создаем экземпляр парсера
const parser = new M3U8Parser();

// Пример каталога фильмов (оставляем для поиска)
const catalog = [
    { title: "Gabriel", url: "https://kinovod270825.pro/film/113467-gabriel", type: "movie" },
    { title: "Демо видео 1", url: "https://msx.benzac.de/media/video1.mp4", type: "video" },
    { title: "Демо видео 2", url: "https://msx.benzac.de/media/video2.mp4", type: "video" }
];

// Главный эндпоинт для получения videos.json в формате MSX
app.get("/msx/videos.json", async (req, res) => {
    try {
        console.log('🎬 Запрос на получение videos.json');
        
        const targetUrl = 'https://kinovod270825.pro/film/113467-gabriel';
        const movieTitle = 'Gabriel';
        
        const msxData = await parser.getVideosWithCache(targetUrl, movieTitle);
        
        res.json(msxData);
        
    } catch (error) {
        console.error('❌ Ошибка в videos.json:', error);
        res.status(500).json({
            type: "pages",
            headline: "Ошибка загрузки",
            template: {
                tag: "Web",
                type: "separate",
                layout: "0,0,2,4",
                icon: "msx-white-soft:warning",
                color: "msx-glass-red"
            },
            items: [{
                title: "Ошибка сервера",
                playerLabel: "Попробуйте позже",
                action: `info:${error.message}`,
                icon: "warning"
            }]
        });
    }
});

// Эндпоинт поиска (расширенный)
app.get("/msx/search", async (req, res) => {
    const q = String(req.query.input || "").toLowerCase();
    const results = q ? catalog.filter(f => f.title.toLowerCase().includes(q)) : [];
    
    // Преобразуем результаты для MSX
    const msxItems = await Promise.all(results.map(async (f) => {
        if (f.type === "movie") {
            // Для фильмов возвращаем ссылку на наш videos.json
            return {
                icon: "movie",
                label: f.title,
                action: `content:${req.protocol}://${req.get('host')}/msx/videos.json`
            };
        } else {
            // Для обычных видео
            return {
                icon: "movie", 
                label: f.title,
                action: `video:${f.url}`
            };
        }
    }));
    
    res.json({
        type: "pages",
        headline: `Результаты поиска: "${q}"`,
        template: { type: "button", layout: "0,0,3,3" },
        items: msxItems
    });
});

// Дополнительный эндпоинт для получения информации о фильме
app.get("/msx/movie/:id", async (req, res) => {
    try {
        const movieId = req.params.id;
        
        // В зависимости от ID можно парсить разные фильмы
        let targetUrl = 'https://kinovod270825.pro/film/113467-gabriel';
        let movieTitle = 'Gabriel';
        
        // Здесь можно добавить логику для разных фильмов
        // if (movieId === 'other-movie') { ... }
        
        const msxData = await parser.getVideosWithCache(targetUrl, movieTitle);
        res.json(msxData);
        
    } catch (error) {
        console.error(`❌ Ошибка получения фильма ${req.params.id}:`, error);
        res.status(500).json({
            type: "pages",
            headline: "Ошибка загрузки фильма",
            items: []
        });
    }
});

// Эндпоинт для принудительного обновления кэша
app.get("/msx/refresh", async (req, res) => {
    try {
        console.log('🔄 Принудительное обновление кэша');
        parser.cache.timestamp = null; // Сбрасываем кэш
        
        const targetUrl = 'https://kinovod270825.pro/film/113467-gabriel';
        const msxData = await parser.getVideosWithCache(targetUrl, 'Gabriel');
        
        res.json({
            success: true,
            message: 'Кэш обновлен',
            videos_found: msxData.items.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Проверка здоровья сервиса
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        service: "MSX M3U8 Parser",
        timestamp: new Date().toISOString(),
        cache_active: parser.cache.data !== null
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
    console.log(`🚀 MSX server running at http://localhost:${PORT}/msx/start.json`)
);
