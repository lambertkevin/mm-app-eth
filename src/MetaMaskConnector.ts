import path from 'path';
import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import RemoteMetaMaskProvider from './RemoteMetaMaskProvider';
import { ethers } from 'ethers';

const DEFAULT_PORT = 3333;

export class MetaMaskConnector {
  public config;
  private _app: ReturnType<typeof express> | undefined;
  private _wss: WebSocket.Server | undefined;
  private _ws: WebSocket | undefined;
  private _server: http.Server | undefined;

  constructor(options) {
    this.config = {
      port: DEFAULT_PORT,
      ...options,
    };
  }

  async start(): Promise<void> {
    this._app = express();
    this._app.use(express.static(path.join('.', 'client')));
    this._wss = await this._runServer();
    await this._initialize();
  }

  stop(): Promise<true> {
    return new Promise((resolve) => {
      this?._wss?.close(() => {
        this?._server?.close(() => {
          resolve(true);
        });
      });
    });
  }

  _runServer(): Promise<WebSocket.Server> {
    return new Promise((resolve, reject) => {
      this._server = this?._app?.listen(this.config.port, 'localhost', () => {
        return resolve(
          new WebSocket.Server({
            server: this._server,
          })
        );
      });
    });
  }

  _initialize(): Promise<void> {
    return new Promise((resolve) => {
      this?._wss?.on('connection', (ws) => {
        // Only allow one conection at a time
        if (this.ready()) {
          return ws.close();
        }
        ws.on('close', () => {
          delete this._ws;
        });
        ws.on('message', (msg) => {
          if (msg === 'disconnect') {
            this.stop();
          }
        });
        this._ws = ws;
        if (this.config.onConnect) this.config.onConnect();
        return resolve();
      });
    });
  }

  ready(): boolean {
    return this?._ws?.readyState === WebSocket.OPEN;
  }

  static handleMessage(
    msg: string
  ): ReturnType<typeof MetaMaskConnector.handleAction> {
    let message;
    try {
      message = JSON.parse(msg);
    } catch (e) {
      throw new Error('Could not parse message from socket. Is it valid JSON?');
    }
    const { action, requestId, payload } = message;
    return this.handleAction(action, requestId, payload);
  }

  static handleAction(
    action: string,
    requestId: string,
    payload: Record<string, any>
  ): {
    responseAction: string;
    responseRequestId: string;
    responsePayload: Record<string, any>;
  } {
    if (action === 'error') {
      throw new Error(
        'handleAction error: ' + JSON.stringify(payload, null, 2)
      );
    }
    return {
      responseAction: action,
      responseRequestId: requestId,
      responsePayload: payload,
    };
  }

  send(
    action: string,
    requestId: string,
    payload: Record<string, any>,
    requiredAction: string
  ): Promise<{ requestId: string; result: Record<string, any> }> {
    return new Promise((resolve) => {
      const onMsg = (msg) => {
        const { responseAction, responseRequestId, responsePayload } =
          MetaMaskConnector.handleMessage(msg.data);
        if (
          requiredAction === responseAction &&
          requestId === responseRequestId
        ) {
          this?._ws?.removeEventListener('message', onMsg);
          resolve({
            requestId: responseRequestId,
            result: responsePayload,
          });
        }
      };
      this?._ws?.addEventListener('message', onMsg);
      const msg = JSON.stringify({
        action,
        requestId,
        payload,
      });
      this?._ws?.send(msg);
    });
  }

  getProvider(): ethers.providers.Web3Provider {
    return new ethers.providers.Web3Provider(new RemoteMetaMaskProvider(this));
  }
}

export default MetaMaskConnector;
