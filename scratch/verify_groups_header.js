const { spawn } = require('child_process');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

async function checkGroupHeader() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9266',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9266/json');
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
        localStorage.setItem('groups_id', '83');
        location.reload();
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Navigate to Living Groups
    await send('Runtime.evaluate', {
      expression: `
        const moreBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('More'));
        if (moreBtn) moreBtn.click();
        setTimeout(() => {
          const grpLink = Array.from(document.querySelectorAll('button, a')).find(b => b.textContent.includes('Living Groups'));
          if (grpLink) grpLink.click();
        }, 300);
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    const checkRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const header = document.querySelector('header') || document.querySelector('.sticky');
          const addPeopleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add People'));
          const addPeopleVisible = addPeopleBtn ? (addPeopleBtn.offsetWidth > 0 && addPeopleBtn.offsetHeight > 0 && window.getComputedStyle(addPeopleBtn).display !== 'none') : false;
          
          return {
            url: window.location.href,
            addPeopleFound: !!addPeopleBtn,
            addPeopleVisible,
            headerButtons: Array.from(document.querySelectorAll('header button, .sticky button')).map(b => ({
              text: b.textContent.trim(),
              aria: b.getAttribute('aria-label') || b.getAttribute('title'),
              display: window.getComputedStyle(b).display
            }))
          };
        })()
      `,
      returnByValue: true
    });

    console.log("Check result:", JSON.stringify(checkRes.result.value, null, 2));
    ws.close();
  } finally {
    chromeProcess.kill();
  }
}

checkGroupHeader().catch(console.error);
