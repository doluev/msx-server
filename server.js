const { chromium } = require('playwright');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

async function parsePage(url) {
  try {
    console.log(`🔍 [PARSE] Начинаем парсинг страницы: ${url}`);
    const m3u8Requests = new Set();

    console.log('🚀 [PLAYWRIGHT] Запускаем браузер Chromium...');
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
    console.log('✅ [PLAYWRIGHT] Браузер успешно запущен');

    console.log('📄 [PLAYWRIGHT] Создаём новую страницу...');
    const page = await browser.newPage();
    console.log('✅ [PLAYWRIGHT] Новая страница создана');

    console.log('🌐 [NETWORK] Настраиваем перехват сетевых запросов...');
    page.on('request', (request) => {
      const reqUrl = request.url();
      console.log(`[NETWORK] Перехвачен запрос: ${reqUrl}`);
      if (reqUrl.includes('.m3u8') && /(master.*\.m3u8$|index.*\.m3u8$)/i.test(reqUrl)) {
        console.log(`🎥 [MOVIE] Найдена .m3u8 ссылка: ${reqUrl}`);
        m3u8Requests.add(reqUrl);
      }
    });

    console.log('🔗 [NAVIGATION] Переходим на страницу...');
    await page.goto(url, { timeout: 60000, waitUntil: 'networkidle' }).catch(err => {
      console.error(`❌ [NAVIGATION] Не удалось загрузить страницу: ${err.message}`);
    });
    console.log('✅ [NAVIGATION] Страница загружена');

    console.log('🎬 [INTERACTION] Пытаемся кликнуть на кнопку Play...');
    await page.click('button.play', { timeout: 5000 }).catch(err => {
      console.log(`⚠️ [INTERACTION] Кнопка Play не найдена: ${err.message}`);
    });

    console.log('📹 [DOM] Проверяем <video> теги...');
    const videoSources = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video[src]'));
      return videos
        .map(video => video.getAttribute('src'))
        .filter(src => src && src.includes('.m3u8'));
    });
    videoSources.forEach(src => {
      console.log(`🎥 [MOVIE-DOM] Найден src в <video>: ${src}`);
      m3u8Requests.add(src);
    });

    console.log('⏳ [WAIT] Ожидаем 1s для дополнительных запросов...');
    await page.waitForTimeout(1000);

    console.log('🔌 [PLAYWRIGHT] Закрываем браузер...');
    await browser.close();
    console.log('✅ [PLAYWRIGHT] Браузер закрыт');

    const uniqueLinks = Array.from(m3u8Requests);
    console.log(`🎯 [RESULT] Найдено ${uniqueLinks.length} ссылок: ${JSON.stringify(uniqueLinks)}`);
    return uniqueLinks.filter(link => link.includes('.m3u8'));
  } catch (error) {
    console.error(`❌ [ERROR] Ошибка парсинга: ${error.message}`);
    return [];
  }
}

app.get("/msx/videos.json", async (req, res) => {
  try {
    console.log('📥 [HTTP] Получен запрос на /msx/videos.json');
    const targetUrl = 'https://kinovod270825.pro/film/113467-gabriel';
    const movieTitle = 'Gabriel';

    const m3u8Links = await parsePage(targetUrl);
    console.log(`📋 [DATA] Формируем JSON-ответ для MSX...`);
    const items = m3u8Links.map(link => ({
      title: `${movieTitle} - ${link.includes('1080') ? '1080p' : '720p'}`,
      playerLabel: `${movieTitle} - ${link.includes('1080') ? '1080p' : '720p'}`,
      action: `video:${link}`,
      icon: 'movie'
    }));

    if (items.length === 0) {
      console.log('⚠️ [DATA] Ссылки не найдены, возвращаем заглушку');
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
    console.log(`📤 [HTTP] Отправляем ответ: ${JSON.stringify(msxData, null, 2)}`);

    res.json(msxData);
  } catch (error) {
    console.error(`❌ [HTTP] Ошибка в /msx/videos.json: ${error.message}`);
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
  console.log(`🚀 [SERVER] Server running on port ${PORT}`);
});
