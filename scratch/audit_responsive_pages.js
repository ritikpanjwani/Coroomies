const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const screenshotDir = 'C:\\Users\\Ritik Panjwani\\.gemini\\antigravity\\brain\\174cf3c3-3a85-4cb7-89f6-66db0eb7076e\\audit_screenshots';

// Supply a short-lived token only through the local environment; never commit
// bearer credentials to an audit script.
const token = process.env.COROOMIES_AUDIT_TOKEN;
if (!token) {
  throw new Error('Set COROOMIES_AUDIT_TOKEN before running this authenticated audit.');
}

const VIEWPORTS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920];
const PAGES = ['home', 'matches', 'chat', 'expenses', 'groups', 'household', 'assistant', 'notifications', 'profile', 'settings'];

async function runAudit() {
  console.log('Starting Complete Responsive & Layout Audit via Edge CDP...');

  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--window-size=1280,900',
    '--remote-debugging-port=9222',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9222/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');

    if (!pageTarget) throw new Error('Page target not found');

    const WebSocket = globalThis.WebSocket;
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let reqId = 1;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = reqId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });

    // Navigate to local frontend
    await send('Page.navigate', { url: 'http://localhost:5173' });
    await new Promise((r) => setTimeout(r, 1500));

    // First: Audit Unauthenticated Pages (Login & Register)
    console.log('\n========================================');
    console.log('AUDITING UNAUTHENTICATED PAGES');
    console.log('========================================');

    const unauthResults = [];
    for (const w of [320, 360, 375, 390, 430, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 800,
        deviceScaleFactor: 2,
        mobile: w <= 768,
      });
      await new Promise((r) => setTimeout(r, 600));

      const res = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollWidth = document.documentElement.scrollWidth;
            const innerWidth = window.innerWidth;
            const overflowing = [];
            document.querySelectorAll('*').forEach(el => {
              const r = el.getBoundingClientRect();
              if (r.right > innerWidth + 1) {
                overflowing.push({
                  tag: el.tagName.toLowerCase(),
                  className: el.className ? el.className.toString().slice(0, 80) : '',
                  right: Math.round(r.right),
                  width: Math.round(r.width)
                });
              }
            });
            return JSON.stringify({
              width: innerWidth,
              scrollWidth,
              overflow: scrollWidth > innerWidth,
              overflowCount: overflowing.length,
              sampleOverflows: overflowing.slice(0, 3)
            });
          })()
        `,
        returnByValue: true,
      });

      const data = JSON.parse(res.result.value);
      console.log(`Login at ${w}px: overflow=${data.overflow} (scrollWidth=${data.scrollWidth}/${w})`);
      if (data.overflow) {
        console.log('  Overflow elements:', data.sampleOverflows);
      }
      unauthResults.push({ page: 'login', ...data });

      if (w === 360 || w === 1280) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `before_login_${w}px.png`), Buffer.from(shot.data, 'base64'));
      }
    }

    // Now inject token and test Logged-in app
    console.log('\n========================================');
    console.log('LOGGING IN & AUDITING DASHBOARD & PAGES');
    console.log('========================================');

    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('access_token', '${token}');
        localStorage.setItem('user_id', '1');
        localStorage.setItem('user_name', 'Ritik Panjwani');
        window.location.reload();
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const auditMatrix = [];

    for (const pageName of PAGES) {
      console.log(`\n--- Auditing Page: [${pageName}] ---`);

      // Switch to this page via window navigation or clicking
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            // Find and click nav button or dispatch
            const nav = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toLowerCase().includes('${pageName}'));
            if (nav) nav.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 800));

      for (const w of VIEWPORTS) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: w,
          height: w <= 768 ? 840 : 900,
          deviceScaleFactor: 2,
          mobile: w <= 768,
        });
        await new Promise((r) => setTimeout(r, 400));

        const res = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const scrollWidth = document.documentElement.scrollWidth;
              const innerWidth = window.innerWidth;
              const overflowing = [];
              const smallTouchTargets = [];

              document.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.right > innerWidth + 1 && r.width > 0 && r.height > 0) {
                  overflowing.push({
                    tag: el.tagName.toLowerCase(),
                    className: el.className ? el.className.toString().slice(0, 80) : '',
                    id: el.id || '',
                    right: Math.round(r.right),
                    width: Math.round(r.width)
                  });
                }
              });

              document.querySelectorAll('button, a[href], input, select').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40)) {
                  smallTouchTargets.push({
                    tag: el.tagName.toLowerCase(),
                    text: el.innerText ? el.innerText.trim().slice(0, 25) : (el.getAttribute('aria-label') || ''),
                    width: Math.round(r.width),
                    height: Math.round(r.height)
                  });
                }
              });

              return JSON.stringify({
                page: '${pageName}',
                width: innerWidth,
                scrollWidth,
                overflow: scrollWidth > innerWidth,
                overflowingCount: overflowing.length,
                overflowingSample: overflowing.slice(0, 4),
                smallTouchCount: smallTouchTargets.length,
                smallTouchSample: smallTouchTargets.slice(0, 3)
              });
            })()
          `,
          returnByValue: true,
        });

        const data = JSON.parse(res.result.value);
        if (data.overflow) {
          console.log(`[OVERFLOW] ${pageName} at ${w}px: scrollWidth=${data.scrollWidth} > ${w} (${data.overflowingCount} items)`);
          console.log('   Sample:', data.overflowingSample);
        } else {
          // Log summary
          if (w === 360 || w === 1280) {
            console.log(`[PASS] ${pageName} at ${w}px: OK (scrollWidth=${data.scrollWidth}, touchTargets < 40px: ${data.smallTouchCount})`);
          }
        }

        auditMatrix.push(data);

        // Capture representative before screenshots
        if ((w === 360 || w === 1280) && ['home', 'matches', 'chat', 'groups', 'expenses', 'profile'].includes(pageName)) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          const shotPath = path.join(screenshotDir, `before_${pageName}_${w}px.png`);
          fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
          console.log(`   Captured screenshot: ${shotPath}`);
        }
      }
    }

    const reportPath = path.join(screenshotDir, 'audit_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ unauth: unauthResults, app: auditMatrix }, null, 2));
    console.log(`\nSaved raw audit data to: ${reportPath}`);

    ws.close();
  } catch (err) {
    console.error('Audit failed with error:', err);
  } finally {
    chromeProcess.kill();
  }
}

runAudit();
