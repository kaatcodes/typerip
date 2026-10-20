// Local TypeRip server: serves the app and proxies Adobe Fonts pages so the
// browser can read them (fonts.adobe.com sends no CORS headers).
//
//   node server.js            start and open TypeRip in the default browser
//   node server.js --no-open  start without opening a browser
//
// Shuts itself down after IDLE_MINUTES without requests.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.TYPERIP_PORT) || 8787;
const IDLE_MINUTES = 30;
const ROOT = __dirname;
const APP_URL = `http://localhost:${PORT}/`;
const HEALTH_PATH = '/__typerip';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

function openBrowser() {
    if (process.argv.includes('--no-open')) return;
    const cmd = process.platform === 'win32' ? `start "" "${APP_URL}"`
              : process.platform === 'darwin' ? `open "${APP_URL}"`
              : `xdg-open "${APP_URL}"`;
    exec(cmd);
}

// Only Adobe Fonts family and collection pages may be proxied.
function isAllowedTarget(target) {
    return target.protocol === 'https:' &&
           target.hostname === 'fonts.adobe.com' &&
           (target.pathname.startsWith('/fonts/') || target.pathname.startsWith('/collections/'));
}

async function handleProxy(reqUrl, res) {
    let target;
    try {
        target = new URL(reqUrl.searchParams.get('url'));
    } catch (e) {
        return send(res, 400, 'Missing or invalid url parameter.');
    }
    if (!isAllowedTarget(target)) {
        return send(res, 403, 'Only fonts.adobe.com/fonts/... and /collections/... URLs can be fetched.');
    }
    try {
        const upstream = await fetch(target, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
        });
        send(res, upstream.status, await upstream.text(), 'text/html; charset=utf-8');
    } catch (e) {
        send(res, 502, 'Could not reach fonts.adobe.com: ' + e.message);
    }
}

function handleStatic(reqUrl, res) {
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath.endsWith('/')) relPath += 'index.html';
    const filePath = path.join(ROOT, path.normalize(relPath));
    // Stay inside the app folder and never serve dotfiles (.git etc).
    if (!filePath.startsWith(ROOT + path.sep) || relPath.split('/').some(part => part.startsWith('.'))) {
        return send(res, 404, 'Not found');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) return send(res, 404, 'Not found');
        send(res, 200, data, MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    });
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(body);
}

let idleTimer;
function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        console.log(`No activity for ${IDLE_MINUTES} minutes, shutting down.`);
        process.exit(0);
    }, IDLE_MINUTES * 60 * 1000);
}

const server = http.createServer((req, res) => {
    resetIdleTimer();
    const reqUrl = new URL(req.url, APP_URL);
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    if (reqUrl.pathname === HEALTH_PATH) return send(res, 200, 'typerip');
    if (reqUrl.pathname === '/proxy') return handleProxy(reqUrl, res);
    handleStatic(reqUrl, res);
});

server.on('error', async (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    // Port taken: if it's already TypeRip, just open it again.
    try {
        const r = await fetch(`http://${HOST}:${PORT}${HEALTH_PATH}`);
        if ((await r.text()) === 'typerip') {
            console.log('TypeRip is already running.');
            openBrowser();
            return;
        }
    } catch (e) {}
    console.error(`Port ${PORT} is in use by another program. Set TYPERIP_PORT to use a different port.`);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log(`TypeRip running at ${APP_URL}`);
    resetIdleTimer();
    openBrowser();
});
