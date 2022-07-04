import type MetaMaskConnector from './MetaMaskConnector';

type Callback = (err?: Error | null, payload?: Record<string, any>) => any;

export class RemoteMetaMaskProvider {
  private _connector: MetaMaskConnector;
  private _callbacks: Map<string, Callback>;

  constructor(connector: MetaMaskConnector) {
    this._connector = connector;
    this._callbacks = new Map();
  }

  // Generate a request id to track callbacks from async methods
  static generateRequestId(): string {
    const s4 = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  // When connected to a remote network, the return values for "gasPrice" and
  // "value" are strings, so we will need to properly format them for ethers.
  // Ideally we would use the big number type from bn.js or bignumber.js but
  // ethers does not support any big number type other than it's own.
  static formatResult(
    _result: Record<string, string | number>
  ): Record<string, string | number> | Record<string, string | number>[] {
    const result = _result;

    // Format "gasPrice"
    if (result && typeof result.gasPrice === 'string') {
      result.gasPrice = parseInt(result.gasPrice, 10);
    }

    // Format "value"
    if (result && typeof result.value === 'string') {
      result.value = parseInt(result.value, 10);
    }

    // Format for "eth_filter"
    if (result && result.logIndex) return [result];

    return result;
  }

  // Define send method
  send(payload: Record<string, any>, _callback: Callback) {
    if (!this._connector.ready()) {
      return _callback(
        new Error('Unable to send. Not connected to a MetaMask socket.')
      );
    }

    // Because requests are handled across a WebSocket, their callbacks need to
    // be associated with an ID which is returned with the response.
    const requestId = RemoteMetaMaskProvider.generateRequestId();

    // Set the callback using the requestId
    this._callbacks.set(requestId, _callback);

    // Set the payload to allow reassignment
    return this._connector
      .send('execute', requestId, payload, 'executed')
      .then(({ requestId: responseRequestId, result }) => {
        // Exit if a response for this request was already handled
        if (!this._callbacks.has(responseRequestId)) return;

        // Get the request callback using the returned request id
        const requestCallback = this._callbacks.get(responseRequestId);

        if (!requestCallback) {
          throw new Error('requestCallback not found');
        }

        // Throw error if send error
        if (result?.error) {
          requestCallback(new Error(result.error));
        }

        // Format result to work with ethers
        const formattedResult = RemoteMetaMaskProvider.formatResult(result);

        // Handle request callback
        requestCallback(null, {
          id: payload.id,
          jsonrpc: '2.0',
          result: formattedResult,
        });

        // Delete the callback after the request has been handled
        this._callbacks.delete(responseRequestId);
      })
      .catch((err) => _callback(err));
  }

  // Define async send method
  sendAsync(payload, callback): void {
    this.send(payload, callback);
  }
}

export default RemoteMetaMaskProvider;
