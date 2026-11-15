const { spawn } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function testDocs() {
  const chromeProcess = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const targetsRes = await fetch('http://127.0.0.1:9225/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');

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

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Console.messageAdded') {
          console.log('CONSOLE:', data.params.message.text);
        }
        if (data.method === 'Runtime.exceptionThrown') {
          console.log('EXCEPTION:', JSON.stringify(data.params.exceptionDetails));
        }
      } catch (e) {}
    });

    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: 'http://127.0.0.1:8000/docs' });
    await new Promise((r) => setTimeout(r, 4000));

    const res = await send('Runtime.evaluate', {
      expression: 'typeof SwaggerUIBundle'
    });
    console.log('typeof SwaggerUIBundle:', res.result ? res.result.value : res);

    const readyState = await send('Runtime.evaluate', {
      expression: 'document.readyState'
    });
    console.log('document.readyState:', readyState.result ? readyState.result.value : readyState);

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProcess.kill();
  }
}

testDocs();
