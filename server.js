import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

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
        // Кэш для результатов парсинга
        this.cache = {
            data: null,
            timestamp: null,
            ttl: 5 * 60 * 1000 // 5 минут
        };
    }

    async parsePage(url) {
        try {
            console.log(`🔍 Парсим страницу динамически: ${url}`);
            const m3u8Requests = new Set();

            const browser = await chromium.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();

            // Перехват сетевых запросов
            page.on('request', (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8') && /(master.*\.m3u8$|index.*\.m3u8$)/i.test(reqUrl)) {
                    console.log(`[MOVIE] Найдено по сети: ${reqUrl}`);
                    m3u8Requests.add(reqUrl);
                }
            });

            await page.goto(url, { timeout: 60000, waitUntil: 'networkidle' });

            // Проверка DOM <video src>
            const videoSources = await page.evaluate(() => {
                const videos = Array.from(document.querySelectorAll('video[src]'));
                return videos
                    .map(video => video.getAttribute('src'))
                    .filter(src => src && src.includes('.m3u8'));
            });

            videoSources.forEach(src => {
                console.log(`[MOVIE-DOM] Найден src в <video>: ${src}`);
                m3u8Requests.add(src);
            });

            // Немного ждём, чтобы успели прилететь запросы
            await page.waitForTimeout(800);

            await browser.close();

            // Конвертируем Set в массив и валидируем
            const uniqueLinks = Array.from(m3u8Requests);
            const validatedLinks = uniqueLinks.filter(link => this.validateM3U8Link(link));

            console.log(`✅ Найдено ${validatedLinks.length} валидных m3u8 ссылок`);
            return validatedLinks;

        } catch (error) {
            console.error('❌ Ошибка парсинга:', error.message);
            return [];
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

