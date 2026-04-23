#!/usr/bin/env node
/**
 * MPStats CORS Proxy
 * Запуск: node proxy.js
 * Порт: 3333
 *
 * Проксирует запросы к mpstats.io, добавляя нужные заголовки.
 * Программа обращается к http://localhost:3333/api/... вместо https://mpstats.io/api/...
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3333;
const MPSTATS_HOST = 'mpstats.io';

const server = http.createServer((req, res) => {
  // CORS — разрешаем запросы из браузера (локальный файл или любой origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mpstats-TOKEN, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', proxy: 'MPStats CORS Proxy', port: PORT }));
    return;
  }

  // Всё остальное — проксируем на mpstats.io
  const parsedUrl = url.parse(req.url);
  const targetPath = parsedUrl.path; // например /api/wb/get/categories

  // Забираем токен из заголовка запроса
  const token = req.headers['x-mpstats-token'] || req.headers['X-Mpstats-TOKEN'] || '';

  const options = {
    hostname: MPSTATS_HOST,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      'X-Mpstats-TOKEN': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 WB-SEO-Generator/1.0',
    }
  };

  console.log(`[${new Date().toLocaleTimeString()}] → ${req.method} https://${MPSTATS_HOST}${targetPath}`);

  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`[${new Date().toLocaleTimeString()}] ← ${proxyRes.statusCode} ${targetPath}`);

    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*',
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`[ОШИБКА] ${e.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Proxy error: ${e.message}` }));
  });

  // Если есть тело запроса — передаём
  req.pipe(proxyReq);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║      MPStats CORS Proxy запущен       ║');
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log('  ╠═══════════════════════════════════════╣');
  console.log('  ║  Оставьте это окно открытым пока      ║');
  console.log('  ║  работаете с программой WB SEO.       ║');
  console.log('  ║  Для остановки нажмите Ctrl+C         ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ❌ Порт ${PORT} уже занят. Прокси уже запущен, или закройте другую программу на этом порту.\n`);
  } else {
    console.error(`\n  ❌ Ошибка сервера: ${e.message}\n`);
  }
  process.exit(1);
});
