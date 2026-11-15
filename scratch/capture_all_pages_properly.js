const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

const pagesToTest = [
  'home',
  'matches',
  'chat',
  'expenses',
  'groups',
  'household',
  'assistant',
  'notifications',
  'profile',
  'settings'
];

async function capture() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--window-size=1280,900',
    '--remote-debugging-port=9222',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9222/json');
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

    // Login
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('access_token', '${token}');
        localStorage.setItem('user_id', '1');
        localStorage.setItem('user_name', 'Ritik Panjwani');
        window.location.reload();
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    for (const page of pagesToTest) {
      console.log(`Navigating to ${page}...`);
      // We can trigger React navigation by calling the internal navigation or clicking
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            // Check if there is an item in desktop or mobile nav
            const allButtons = Array.from(document.querySelectorAll('button'));
            if ('${page}' === 'chat') {
              const b = allButtons.find(x => x.textContent.includes('Messages') || x.getAttribute('aria-label') === 'Messages');
              if (b) b.click();
            } else if ('${page}' === 'matches') {
              const b = allButtons.find(x => x.textContent.includes('Flatmates'));
              if (b) b.click();
            } else if ('${page}' === 'expenses') {
              const b = allButtons.find(x => x.textContent.includes('Expenses'));
              if (b) b.click();
            } else if ('${page}' === 'home') {
              const b = allButtons.find(x => x.textContent.includes('Home') || x.textContent.includes('Dashboard'));
              if (b) b.click();
            } else {
              // Open More sheet or click sidebar
              const more = allButtons.find(x => x.textContent.includes('More'));
              if (more) more.click();
              setTimeout(() => {
                const sheetBtns = Array.from(document.querySelectorAll('button'));
                const target = sheetBtns.find(x => x.textContent.toLowerCase().includes('${page}'));
                if (target) target.click();
              }, 200);
            }
          })()
        `,
      });

      await new Promise((r) => setTimeout(r, 1200));

      // 360px mobile screenshot
      await send('Emulation.setDeviceMetricsOverride', {
        width: 360,
        height: 800,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await new Promise((r) => setTimeout(r, 600));
      let shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `real_before_${page}_360px.png`), Buffer.from(shot.data, 'base64'));

      // 1280px desktop screenshot
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 850,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 500));
      shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `real_before_${page}_1280px.png`), Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshots for ${page}`);
    }

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    chromeProcess.kill();
  }
}

capture();
