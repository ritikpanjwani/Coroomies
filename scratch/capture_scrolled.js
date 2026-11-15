const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

async function captureScrolled() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9230',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9230/json');
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

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

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
    await new Promise((r) => setTimeout(r, 2500));

    // Navigate to Matches
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Flatmates'));
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Scroll down 400px
    await send('Runtime.evaluate', {
      expression: `window.scrollBy(0, 450);`,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'after_matches_scrolled_390px.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved after_matches_scrolled_390px.png');

    ws.close();
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chromeProcess.kill();
  }
}

captureScrolled();
