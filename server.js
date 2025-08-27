import { chromium } from 'playwright';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
console.log(`🚀 [CORS] ${new Date().toISOString()} CORS middleware enabled`);

// Статические файлы
app.use("/msx", express.static(path.join(__dirname, "public/msx"), {
  setHeaders: (res, path) => {
    console.log(`📁 [STATIC] ${new Date().toISOString()} Serving file: ${path}`);
  }
}));

// Тестовый эндпоинт для проверки сервера
app.get("/health", (req, res) => {
  console.log(`🩺 [HEALTH] ${new Date().toISOString()} Health check requested`);
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function parsePage(url) {
  try {
    console.log(`🔍 [PARSE] ${new Date().toISOString()} Начинаем парсинг страницы: ${url}`);
    const m3u8Requests = new Set();

    console.log(`🚀 [PLAYWRIGHT] ${new Date().toISOString()} Запускаем браузер Chromium...`);
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    console.log(`✅ [PLAYWRIGHT] ${new Date().toISOString()} Браузер успешно запущен`);

    console.log(`📄 [PLAYWRIGHT] ${new Date().toISOString()} Создаём новую страницу...`);
    const page = await browser.newPage();
    console.log(`✅ [PLAYWRIGHT] ${new Date().toISOString()} Новая страница создана`);

    console.log(`🌐 [NETWORK] ${new Date().toISOString()} Настраиваем перехват сетевых запросов...`);
    page.on('request', (request) => {
      const reqUrl = request.url();
      console.log(`[NETWORK] ${new Date().toISOString()} Перехвачен запрос: ${reqUrl}`);
      if (reqUrl.includes('.m3u8') && /(master.*\.m3u8$|index.*\.m3u8$)/i.test(reqUrl)) {
        console.log(`🎥 [MOVIE] ${new Date().toISOString()} Найдена .m3u8 ссылка: ${reqUrl}`);
        m3u8Requests.add(reqUrl);
      }
    });

    console.log(`🔗 [NAVIGATION] ${new Date().toISOString()} Переходим на страницу...`);
    await page.goto(url, { timeout: 60000, waitUntil: 'networkidle' }).catch(err => {
      console.error(`❌ [NAVIGATION] ${new Date().toISOString()} Не удалось загрузить страницу: ${err.message}`);
    });
    console.log(`✅ [NAVIGATION] ${new Date().toISOString()} Страница загружена`);

    console.log(`🎬 [INTERACTION] ${new Date().toISOString()} Пытаемся кликнуть на кнопку Play...`);
    await page.click('button.play', { timeout: 5000 }).catch(err => {
      console.log(`⚠️ [INTERACTION] ${new Date().toISOString()} Кнопка Play не найдена: ${err.message}`);
    });

    console.log(`📹 [DOM] ${new Date().toISOString()} Проверяем <video> теги...`);
    const videoSources = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video[src]'));
      return videos
        .map(video => video.getAttribute('src'))
        .filter(src => src && src.includes('.m3u8'));
    });
    videoSources.forEach(src => {
      console.log(`🎥 [MOVIE-DOM] ${new Date().toISOString()} Найден src в <video>: ${src}`);
      m3u8Requests.add(src);
    });

    console.log(`⏳ [WAIT] ${new Date().toISOString()} Ожидаем 3s для дополнительных запросов...`);
    await page.waitForTimeout(3000);

    console.log(`🔌 [PLAYWRIGHT] ${new Date().toISOString()} Закрываем браузер...`);
    await browser.close();
    console.log(`✅ [PLAYWRIGHT] ${new Date().toISOString()} Браузер закрыт`);

    const uniqueLinks = Array.from(m3u8Requests);
    console.log(`🎯 [RESULT] ${new Date().toISOString()} Найдено ${uniqueLinks.length} ссылок: ${JSON.stringify(uniqueLinks)}`);
    return uniqueLinks.filter(link => link.includes('.m3u8'));
  } catch (error) {
    console.error(`❌ [ERROR] ${new Date().toISOString()} Ошибка парсинга: ${error.message}`);
    return [];
  }
}

app.get("/msx/videos.json", async (req, res) => {
  try {
    console.log(`📥 [HTTP] ${new Date().toISOString()} Получен запрос на /msx/videos.json`);
    const targetUrl = 'https://kinovod270825.pro/film/113467-gabriel';
    const movieTitle = 'Gabriel';

    console.log(`⏳ [HTTP] ${new Date().toISOString()} Ожидаем завершения парсинга...`);
    const m3u8Links = await parsePage(targetUrl);
    console.log(`📋 [DATA] ${new Date().toISOString()} Парсинг завершён, формируем JSON...`);

    const items = m3u8Links.map(link => ({
      title: `${movieTitle} - ${link.includes('1080') ? '1080p' : '720p'}`,
      playerLabel: `${movieTitle} - ${link.includes('1080') ? '1080p' : '720p'}`,
      action: `video:${link}`,
      icon: 'movie'
    }));

    if (items.length === 0) {
      console.log(`⚠️ [DATA] ${new Date().toISOString()} Ссылки не найдены, возвращаем заглушку`);
      items.push({
        title: 'Видео не найдено',
        playerLabel: 'Попробуйте позже',
        action: 'info:Не удалось найти видеопотоки',
        icon: 'warning'
      });
    }

    const msxData = {
      type: 'pages',
      headline: `Gabriel (${items.length} потоков)`,
      template: {
        tag: 'Web',
        type: 'separate',
        layout: '0,0,2,4',
        icon: 'msx-white-soft:movie',
        color: 'msx-glass'
      },
      items
    };
    console.log(`📤 [HTTP] ${new Date().toISOString()} Отправляем ответ: ${JSON.stringify(msxData, null, 2)}`);
    res.json(msxData);
  } catch (error) {
    console.error(`❌ [HTTP] ${new Date().toISOString()} Ошибка в /msx/videos.json: ${error.message}`);
    res.status(500).json({
      type: 'pages',
      headline: 'Ошибка загрузки',
      items: [{
        title: 'Ошибка сервера',
        playerLabel: 'Попробуйте позже',
        action: `info:${error.message}`,
        icon: 'warning'
      }]
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 [SERVER] ${new Date().toISOString()} Server running on port ${PORT}`);
});
