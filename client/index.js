/* global document:true */
/* global WebSocket:true */
/* global ethereum:true */
/* global window:true */

(async (w) => {
  const addLog = (msg) => {
    const logEntry = document.createElement('li');
    logEntry.innerText = `${new Date().toString()}\n${msg}`;
    document.querySelector('#messages').appendChild(logEntry);
  };

  const checkUnlocked = async () => {
    if (w.ethereum) {
      await w.ethereum.enable(); // Ensure access to MetaMask
    }
    return new Promise(async (resolve, reject) => {
      const accounts = await ethereum.request({ method: 'eth_accounts' });
      if (accounts) {
        return resolve(accounts && !!accounts[0]);
      }
      return reject(new Error('No Account'));
    });
  };

  const execute = (requestId, method, params) =>
    new Promise(async (resolve, reject) => {
      try {
        const result = await window.ethereum.request({
          method,
          params,
        });
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });

  async function executeAction(requestId, { method, params }, reply) {
    let result;
    addLog(
      `Request ID: ${requestId}
      Calling ${method}: ${JSON.stringify(params)}`
    );
    try {
      result = await execute(requestId, method, params);
    } catch (e) {
      return reply('executed', requestId, {
        error: e.message,
      });
    }
    return reply('executed', requestId, result);
  }

  if (!w?.ethereum?.isMetaMask) {
    return addLog('MetaMask not found!');
  }
  if (!(await checkUnlocked())) {
    return addLog('Please unlock MetaMask first and then reload this page');
  }
  const socket = new WebSocket('ws://localhost:3333');
  const reply = (action, requestId, payload) =>
    socket.send(JSON.stringify({ action, requestId, payload }));
  socket.onmessage = (msg) => {
    let message;
    try {
      message = JSON.parse(msg.data);
    } catch (e) {
      console.log('error', e);
      return addLog(
        'Could not parse websocket message. Is it a proper JSON command?'
      );
    }
    if (message.action === 'execute') {
      return executeAction(message.requestId, message.payload, reply);
    }
    return true;
  };

  return true;
})(window);
