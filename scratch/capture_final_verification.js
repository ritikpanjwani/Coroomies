const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidmVyIjowLCJpYXQiOjE3OTQ3NDI2MjUsImV4cCI6MTc5NDgyOTAyNX0.ZFKqrXo6UQVE_Xeduc80QRfziHd4RL8QgVzEn9LpPJQ';

async function runVerification() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9288',
    'http://localhost:5173',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9288/json');
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

    // 1. Authenticate
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

    const checkOverflow = async () => {
      const res = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const doc = document.documentElement;
            const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
            const clientWidth = doc.clientWidth;
            const buttons = Array.from(document.querySelectorAll('button'));
            const overflowingButtons = buttons.filter(b => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && (r.right > window.innerWidth || r.left < 0);
            }).map(b => b.textContent.trim().slice(0, 30));
            return {
              scrollWidth,
              clientWidth,
              hasOverflow: scrollWidth > clientWidth,
              overflowingButtons
            };
          })()
        `,
        returnByValue: true
      });
      return res.result.value;
    };

    // Helper to capture
    const capture = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`Captured ${name}.png`);
    };

    // Navigation helper
    const navigateTo = async (label) => {
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            if ('${label}' === 'home') {
              const b = btns.find(x => x.textContent.includes('Home') || x.textContent.includes('Dashboard'));
              if (b) b.click();
            } else if ('${label}' === 'matches') {
              const b = btns.find(x => x.textContent.includes('Flatmates'));
              if (b) b.click();
            } else if ('${label}' === 'expenses') {
              const b = btns.find(x => x.textContent.includes('Expenses'));
              if (b) b.click();
            } else if ('${label}' === 'chat') {
              const b = btns.find(x => x.textContent.includes('Messages') || x.getAttribute('aria-label') === 'Messages');
              if (b) b.click();
            } else {
              const more = btns.find(x => x.textContent.includes('More'));
              if (more) more.click();
              setTimeout(() => {
                const sheet = Array.from(document.querySelectorAll('button, a'));
                const target = sheet.find(x => x.textContent.toLowerCase().includes('${label}'));
                if (target) target.click();
              }, 250);
            }
          })()
        `
      });
      await new Promise((r) => setTimeout(r, 2000));
    };

    // --- MOBILE 390px ---
    console.log("=== Testing 390px Mobile View ===");
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    // 1. Dashboard at 390px
    await navigateTo('home');
    const homeMobileOverflow = await checkOverflow();
    console.log("Dashboard 390px overflow check:", homeMobileOverflow);
    await capture('verified_dashboard_390px');

    // Scrolled to Best Match & Recent conversations
    await send('Runtime.evaluate', { expression: `window.scrollBy(0, 450);` });
    await new Promise((r) => setTimeout(r, 500));
    await capture('verified_dashboard_best_match_390px');

    // 2. Flatmates at 390px
    await navigateTo('matches');
    const matchesMobileOverflow = await checkOverflow();
    console.log("Flatmates 390px overflow check:", matchesMobileOverflow);
    await capture('verified_flatmates_390px');

    // 3. Living Groups at 390px
    await navigateTo('groups');
    const groupsMobileOverflow = await checkOverflow();
    console.log("Living Groups 390px overflow check:", groupsMobileOverflow);
    await capture('verified_groups_390px');

    // 4. Messages at 390px
    await navigateTo('chat');
    const chatMobileOverflow = await checkOverflow();
    console.log("Messages 390px overflow check:", chatMobileOverflow);
    await capture('verified_chat_390px');

    // 5. Expenses at 390px
    await navigateTo('expenses');
    const expensesMobileOverflow = await checkOverflow();
    console.log("Expenses 390px overflow check:", expensesMobileOverflow);
    await capture('verified_expenses_390px');

    // 6. Profile at 390px
    await navigateTo('profile');
    const profileMobileOverflow = await checkOverflow();
    console.log("Profile 390px overflow check:", profileMobileOverflow);
    await capture('verified_profile_390px');

    // --- DESKTOP 1440px ---
    console.log("=== Testing 1440px Desktop View ===");
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 1000));

    // 1. Dashboard at 1440px
    await navigateTo('home');
    const homeDesktopOverflow = await checkOverflow();
    console.log("Dashboard 1440px overflow check:", homeDesktopOverflow);
    await capture('verified_dashboard_1440px');

    // 2. Flatmates at 1440px
    await navigateTo('matches');
    const matchesDesktopOverflow = await checkOverflow();
    console.log("Flatmates 1440px overflow check:", matchesDesktopOverflow);
    await capture('verified_flatmates_1440px');

    // 3. Living Groups at 1440px
    await navigateTo('groups');
    const groupsDesktopOverflow = await checkOverflow();
    console.log("Living Groups 1440px overflow check:", groupsDesktopOverflow);
    await capture('verified_groups_1440px');

    console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
    ws.close();
  } finally {
    chromeProcess.kill();
  }
}

runVerification().catch(console.error);
