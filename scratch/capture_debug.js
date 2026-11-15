const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

async function captureDebug() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9277',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9277/json');
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
    await new Promise((r) => setTimeout(r, 2000));

    // Capture home page scrolled to Best Match
    const homeShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'debug_home_top_390px.png'), Buffer.from(homeShot.data, 'base64'));

    await send('Runtime.evaluate', {
      expression: `window.scrollBy(0, 400);`
    });
    await new Promise((r) => setTimeout(r, 500));
    const homeScrolled = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'debug_home_scrolled_390px.png'), Buffer.from(homeScrolled.data, 'base64'));

    // Check Best Match buttons and card bounding box
    const cardInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = Array.from(document.querySelectorAll('div, section, article')).filter(el => el.textContent.includes('Best match'));
          const bestMatchCard = cards[cards.length - 1];
          const buttons = Array.from(document.querySelectorAll('button')).map(b => {
            const r = b.getBoundingClientRect();
            return {
              text: b.textContent.trim().slice(0, 25),
              left: Math.round(r.left),
              right: Math.round(r.right),
              width: Math.round(r.width),
              overflowsScreen: r.right > window.innerWidth
            };
          });
          return {
            windowWidth: window.innerWidth,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            buttons: buttons.filter(b => b.width > 0)
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Card Info:", JSON.stringify(cardInfo.result.value, null, 2));

    // Navigate to Flatmates
    await send('Runtime.evaluate', {
      expression: `
        const b = Array.from(document.querySelectorAll('nav button')).find(x => x.textContent.includes('Flatmates'));
        if (b) b.click();
      `
    });
    await new Promise((r) => setTimeout(r, 2000));
    const flatmatesShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'debug_flatmates_390px.png'), Buffer.from(flatmatesShot.data, 'base64'));

    // Navigate to Groups
    await send('Runtime.evaluate', {
      expression: `
        const more = Array.from(document.querySelectorAll('nav button')).find(x => x.textContent.includes('More'));
        if (more) more.click();
        setTimeout(() => {
          const grp = Array.from(document.querySelectorAll('button, a')).find(x => x.textContent.includes('Living Groups'));
          if (grp) grp.click();
        }, 300);
      `
    });
    await new Promise((r) => setTimeout(r, 2500));
    const groupsShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'debug_groups_390px.png'), Buffer.from(groupsShot.data, 'base64'));

    ws.close();
  } finally {
    chromeProcess.kill();
  }
}

captureDebug().catch(console.error);
