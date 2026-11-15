const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

const viewports = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

async function runSweep() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9244',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9244/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let id = 1;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const reqId = id++;
        const handler = (e) => {
          const data = JSON.parse(e.data);
          if (data.id === reqId) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });

    await send('Page.enable');
    await send('DOM.enable');

    // Authenticate
    await send('Page.navigate', { url: 'http://localhost:5173' });
    await new Promise((r) => setTimeout(r, 1000));
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('access_token', '${token}');
        localStorage.setItem('user_name', 'Ritik Panjwani');
        localStorage.setItem('user_id', '1');
        localStorage.setItem('user_username', 'ritikpanjwani');
        location.reload();
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const results = [];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width <= 430,
      });

      await new Promise((r) => setTimeout(r, 800));

      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const doc = document.documentElement;
            const body = document.body;
            const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
            const clientWidth = doc.clientWidth;
            const hasHorizontalOverflow = scrollWidth > clientWidth + 1; // 1px threshold for rounding
            
            // Check for buttons with zero touch target or overlapping bounding rects
            const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
            let smallTargets = 0;
            if (window.innerWidth <= 430) {
              smallTargets = buttons.filter(b => {
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
              }).length;
            }

            return {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollWidth,
              clientWidth,
              hasHorizontalOverflow,
              overflowDiff: Math.max(0, scrollWidth - clientWidth),
              visibleButtons: buttons.filter(b => b.getBoundingClientRect().width > 0).length,
              smallTargets
            };
          })()
        `,
        returnByValue: true,
      });

      results.push(evalRes.result.value);
    }

    console.log(JSON.stringify(results, null, 2));
    ws.close();
  } finally {
    chromeProcess.kill();
  }
}

runSweep().catch(console.error);
