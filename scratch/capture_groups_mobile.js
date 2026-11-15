const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

async function testGroupsHeader() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9232',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9232/json');
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

    // Log in and go to groups
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

    // Go to More -> Groups
    await send('Runtime.evaluate', {
      expression: `
        const moreBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('More'));
        if (moreBtn) moreBtn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 1000));

    await send('Runtime.evaluate', {
      expression: `
        const grpLink = Array.from(document.querySelectorAll('button, a')).find(b => b.textContent.includes('Living Groups'));
        if (grpLink) grpLink.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Click specifically on the group item
    await send('Runtime.evaluate', {
      expression: `
        const item = Array.from(document.querySelectorAll('div, button')).find(el => el.textContent.includes('Test Settle Group'));
        if (item) item.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'after_group_detail_390px.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved after_group_detail_390px.png');

    ws.close();
  } catch (err) {
    console.error('Error during group header test:', err);
  } finally {
    chromeProcess.kill();
  }
}

testGroupsHeader();
