import { keccak } from 'ethereumjs-util';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { ethers } from 'ethers';
import { EIP712Message } from './types';

export default class Eth {
  private provider: ethers.providers.Web3Provider;
  private signer: ethers.Signer;

  constructor(_provider) {
    this.provider = _provider;
    this.signer = this.provider.getSigner();
  }

  setLoadConfig(): void {}

  async getAddress(
    path?: string,
    boolDisplay?: boolean,
    boolChaincode?: boolean
  ): Promise<{
    publicKey: string;
    address: string;
    chainCode?: string;
  }> {
    const address = await this.signer.getAddress();

    return {
      publicKey: '',
      address,
    };
  }

  async signTransactionAndBroadCast(
    path: string | null,
    rawTxHex: string,
    resolution?: null
  ): Promise<{
    v: string;
    s: string;
    r: string;
  }> {
    const address = await this.signer.getAddress();

    const txRaw = ethers.utils.parseTransaction(`0x${rawTxHex}`);
    const tx = {
      to: txRaw.to,
      from: address,
      nonce: txRaw.nonce.toString(),
      gasLimit: txRaw.gasLimit?.toHexString(),
      gasPrice: txRaw.gasPrice?.toHexString(),
      // data: txRaw.data || undefined, // Not working when we have data ?
      value: txRaw.value.toHexString(),
      chainId: txRaw.chainId,
      type: '0',
    };
    const txHash = await this.provider.send('eth_sendTransaction', [tx]);

    const broadcastedTx = await this.provider.getTransaction(txHash);

    const r = broadcastedTx.r!.slice(2);
    const s = broadcastedTx.s!.slice(2);
    const v = Buffer.from(broadcastedTx.v!.toString(16), 'hex')
      .toString('hex')
      .padStart(2, '0');

    const signature = ethers.utils.joinSignature({
      r: broadcastedTx.r!,
      s: broadcastedTx.s!,
      v: broadcastedTx.v!,
    });

    return {
      r,
      s,
      v,
    };
  }

  async signTransaction(
    path: string | null,
    rawTxHex: string,
    resolution?: null
  ): Promise<{
    v: string;
    s: string;
    r: string;
  }> {
    const address = await this.signer.getAddress();
    const signature = await this.provider.send('eth_sign', [
      address,
      `0x${keccak(Buffer.from(rawTxHex, 'hex')).toString('hex')}`,
    ]);

    const splitSig = ethers.utils.splitSignature(signature);
    const r = splitSig.r.slice(2);
    const s = splitSig.s.slice(2);
    const v = Buffer.from(splitSig.v.toString(16), 'hex')
      .toString('hex')
      .padStart(2, '0');

    return {
      r,
      s,
      v,
    };
  }

  async signPersonalMessage(
    path: 'string' | null,
    messageHex: string
  ): Promise<{
    v: number;
    s: string;
    r: string;
  }> {
    const message = Buffer.from(messageHex, 'hex').toString('ascii');
    const signature = await this.signer.signMessage(message);

    const splitSig = ethers.utils.splitSignature(signature);
    const r = splitSig.r.slice(2);
    const s = splitSig.s.slice(2);
    const v = splitSig.v;

    return {
      r,
      s,
      v,
    };
  }

  async signEIP712HashedMessage(
    path: string | null,
    domainSeparatorHex: string,
    hashStructMessageHex: string
  ): Promise<{
    v: number;
    s: string;
    r: string;
  }> {
    const message = keccak(
      Buffer.concat([
        Buffer.from('1901', 'hex'),
        Buffer.from(domainSeparatorHex.slice(2), 'hex'),
        Buffer.from(hashStructMessageHex.slice(2), 'hex'),
      ])
    );

    const address = await this.signer.getAddress();
    const signature = await this.provider.send('eth_sign', [
      address,
      `0x${message.toString('hex')}`,
    ]);

    const splitSig = ethers.utils.splitSignature(signature);
    const r = splitSig.r.slice(2);
    const s = splitSig.s.slice(2);
    const v = splitSig.v;

    return {
      r,
      s,
      v,
    };
  }

  async signEIP712Message(
    path: string | null,
    jsonMessage: EIP712Message,
    fullImplem = false
  ): Promise<{
    v: number;
    s: string;
    r: string;
  }> {
    const { domain, types, message } = jsonMessage;
    const { EIP712Domain, ...typesRest } = types;
    // @ts-ignore
    const signature = await this.signer._signTypedData(
      domain,
      typesRest,
      message
    );

    const splitSig = ethers.utils.splitSignature(signature);
    const r = splitSig.r.slice(2);
    const s = splitSig.s.slice(2);
    const v = splitSig.v;

    return {
      r,
      s,
      v,
    };
  }
}
