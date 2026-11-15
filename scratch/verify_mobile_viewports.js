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

// Start a lightweight static server for dist
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(distDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexHtml = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexHtml).pipe(res);
  }
});

server.listen(4173, async () => {
  console.log('Static server listening on http://localhost:4173');

  const widths = [320, 360, 375, 390, 430];
  let allPassed = true;

  for (const width of widths) {
    console.log(`\n--- Testing viewport width: ${width}px ---`);
    const chromeProcess = spawn(edgePath, [
      '--headless',
      '--disable-gpu',
      `--window-size=${width},800`,
      '--remote-debugging-port=9222',
      'http://localhost:4173',
    ]);

    // Give browser time to launch
    await new Promise((r) => setTimeout(r, 1800));

    try {
      // Connect to CDP
      const targetsRes = await fetch('http://127.0.0.1:9222/json');
      const targets = await targetsRes.json();
      const pageTarget = targets.find((t) => t.type === 'page');

      if (!pageTarget) {
        throw new Error('Page target not found in CDP');
      }

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

      // Emulate device metrics
      await sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 2,
        mobile: true,
      });

      // Wait a moment for layout to settle
      await new Promise((r) => setTimeout(r, 800));

      // Evaluate document dimensions
      const evalRes = await sendCommand('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            innerWidth: window.innerWidth,
            hasHorizontalScrollbar: document.documentElement.scrollWidth > window.innerWidth
          })
        `,
        returnByValue: true,
      });

      const metrics = JSON.parse(evalRes.result.value);
      console.log(`Metrics at ${width}px:`, metrics);

      if (metrics.scrollWidth <= width && !metrics.hasHorizontalScrollbar) {
        console.log(`[PASS] Width ${width}px has no horizontal overflow!`);
      } else {
        console.error(`[FAIL] Width ${width}px has horizontal overflow: scrollWidth=${metrics.scrollWidth} > ${width}`);
        allPassed = false;
      }

      ws.close();
    } catch (err) {
      console.error(`Error during test at ${width}px:`, err.message);
      allPassed = false;
    } finally {
      chromeProcess.kill();
      // wait for process termination
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  server.close(() => {
    if (allPassed) {
      console.log('\nALL VIEWPORT RESPONSIVE TESTS PASSED SUCCESSFULLY! (5/5)');
      process.exit(0);
    } else {
      console.error('\nSOME VIEWPORT TESTS FAILED.');
      process.exit(1);
    }
  });
});
