const { spawn } = require('child_process');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const p = spawn(edgePath, ['--headless', '--disable-gpu', '--remote-debugging-port=9255', 'http://localhost:5173']);
setTimeout(async () => {
  try {
    const r = await fetch('http://127.0.0.1:9255/json');
    const d = await r.json();
    const ws = new WebSocket(d[0].webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            Array.from(document.querySelectorAll('button')).map(b => {
              const rect = b.getBoundingClientRect();
              return { text: b.textContent.trim().slice(0, 30), w: Math.round(rect.width), h: Math.round(rect.height), aria: b.getAttribute('aria-label') };
            }).filter(x => x.w > 0 && (x.w < 36 || x.h < 36))
          `,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      console.log(JSON.stringify(JSON.parse(e.data).result.result.value, null, 2));
      p.kill();
      process.exit(0);
    };
  } catch (err) {
    p.kill();
  }
}, 1500);
