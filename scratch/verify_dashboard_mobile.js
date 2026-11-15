const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const distDir = path.resolve(__dirname, '../frontend/dist');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(distDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexHtml = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexHtml).pipe(res);
  }
});

server.listen(4174, async () => {
  const widths = [320, 360, 375, 390, 430];
  let allPassed = true;

  for (const width of widths) {
    console.log(`\n--- Testing Logged-In Dashboard at ${width}px ---`);
    const chromeProcess = spawn(edgePath, [
      '--headless',
      '--disable-gpu',
      `--window-size=${width},800`,
      '--remote-debugging-port=9223',
      'http://localhost:4174',
    ]);

    await new Promise((r) => setTimeout(r, 1800));

    try {
      const targetsRes = await fetch('http://127.0.0.1:9223/json');
      const targets = await targetsRes.json();
      const pageTarget = targets.find((t) => t.type === 'page');

      if (!pageTarget) throw new Error('Page target not found');

      const WebSocket = globalThis.WebSocket;
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });

      let id = 1;
      const sendCommand = (method, params = {}) =>
        new Promise((resolve) => {
          const reqId = id++;
          const handler = (event) => {
            const data = JSON.parse(event.data);
            if (data.id === reqId) {
              ws.removeEventListener('message', handler);
              resolve(data.result);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });

      await sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 2,
        mobile: true,
      });

      // Inject auth credentials into localStorage and reload
      await sendCommand('Runtime.evaluate', {
        expression: `
          localStorage.setItem('access_token', 'mock_jwt_token_for_ui_test');
          localStorage.setItem('user_name', 'Ritik Panjwani');
          localStorage.setItem('user_id', '1');
          window.location.reload();
        `,
      });

      // Wait for dashboard to mount
      await new Promise((r) => setTimeout(r, 1200));

      const evalRes = await sendCommand('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            innerWidth: window.innerWidth,
            hasHorizontalScrollbar: document.documentElement.scrollWidth > window.innerWidth,
            hasMobileNav: !!document.querySelector('nav[aria-label="Primary mobile navigation"]'),
            headerText: document.querySelector('header')?.innerText?.slice(0, 30) || 'None'
          })
        `,
        returnByValue: true,
      });

      const metrics = JSON.parse(evalRes.result.value);
      console.log(`Metrics:`, metrics);

      if (metrics.scrollWidth <= width && !metrics.hasHorizontalScrollbar) {
        console.log(`[PASS] Logged-in Dashboard at ${width}px has no horizontal overflow!`);
      } else {
        console.error(`[FAIL] Logged-in Dashboard at ${width}px has horizontal overflow: ${metrics.scrollWidth} > ${width}`);
        allPassed = false;
      }

      ws.close();
    } catch (err) {
      console.error(`Error during dashboard test at ${width}px:`, err.message);
      allPassed = false;
    } finally {
      chromeProcess.kill();
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  server.close(() => {
    if (allPassed) {
      console.log('\nALL LOGGED-IN DASHBOARD RESPONSIVE TESTS PASSED! (5/5)');
      process.exit(0);
    } else {
      console.error('\nSOME DASHBOARD VIEWPORT TESTS FAILED.');
      process.exit(1);
    }
  });
});
