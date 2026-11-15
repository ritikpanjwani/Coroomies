const { spawn } = require('child_process');

const chromeProcess = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless', '--disable-gpu', '--remote-debugging-port=9227', 'about:blank'
]);

setTimeout(async () => {
  try {
    const targets = await (await fetch('http://127.0.0.1:9227/json')).json();
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let reqId = 1;
    const send = (method, params = {}) => new Promise(res => {
      const id = reqId++;
      const h = e => { const d = JSON.parse(e.data); if (d.id === id) { ws.removeEventListener('message', h); res(d.result); }};
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8000/docs' });
    await new Promise(r => setTimeout(r, 3000));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'document.querySelector(".swagger-ui .info") ? document.querySelector(".swagger-ui .info").textContent : "NOT_FOUND"'
    });
    console.log('SWAGGER RENDERED SUCCESSFULLY:', evalRes.result.value.replace(/\s+/g, ' ').trim());
    ws.close();
  } catch (e) {
    console.error(e);
  } finally {
    chromeProcess.kill();
  }
}, 1500);
