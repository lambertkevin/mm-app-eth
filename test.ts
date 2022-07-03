import { encode } from 'rlp';
import { ethers } from 'ethers';
import { TypedDataUtils } from 'eth-sig-util';
import { Transaction } from '@ethereumjs/tx';
import MetaMaskConnector from './MetaMaskConnector';
import Eth from './mm-app-eth';
import eip712 from './eip712.json';
import Common from '@ethereumjs/common';
import BigNumber from 'bignumber.js';
import { keccak } from 'ethereumjs-util';

const domainHash = (message) => {
  return TypedDataUtils.hashStruct(
    'EIP712Domain',
    message.domain,
    message.types,
    true
  );
};
const messageHash = (message) => {
  return TypedDataUtils.hashStruct(
    message.primaryType,
    message.message,
    message.types,
    true
  );
};

const connector = new MetaMaskConnector({
  port: 3333, // this is the default port
  onConnect() {
    console.log('MetaMask client connected');
  }, // Function to run when MetaMask is connected (optional)
});

connector.start().then(async () => {
  // Now go to http://localhost:3333 in your MetaMask enabled web browser.

  const provider = new ethers.providers.Web3Provider(connector.getProvider());
  const signer = provider.getSigner();

  const eth = new Eth(provider);
  const { address } = await eth.getAddress();
  console.log(
    'Network',
    await provider.getNetwork().then(({ name, chainId }) => ({ name, chainId }))
  );
  const balance = await signer.getBalance();
  console.log('Balance', ethers.utils.formatEther(balance));

  // // Verify personal sign
  const message = 'coucou';
  const pmSig = await eth.signPersonalMessage(
    null,
    Buffer.from(message).toString('hex')
  );
  const pmSigLike = {
    r: `0x${pmSig.r}`,
    s: `0x${pmSig.s}`,
    v: pmSig.v,
  };
  const pmSigJoinedSig = ethers.utils.joinSignature(pmSigLike);
  console.log(
    'Personal Message sig',
    ethers.utils.verifyMessage(message, pmSigJoinedSig) === address
      ? '✅'
      : '❌'
  );

  // Verify typedData sign with hashes
  const { EIP712Domain, ...restTypes } = eip712.types;
  const typedDataEncoder = ethers.utils._TypedDataEncoder.from(
    restTypes as any
  );
  const hashedDomain = domainHash(eip712);
  const hashMessage = messageHash(eip712);
  const eip712HashSig = await eth.signEIP712HashedMessage(
    null,
    `0x${hashedDomain.toString('hex')}`,
    `0x${hashMessage.toString('hex')}`
  );
  const eip712HashSigLike = {
    r: `0x${eip712HashSig.r}`,
    s: `0x${eip712HashSig.s}`,
    v: eip712HashSig.v,
  };
  const eip712HashJoinedSig = ethers.utils.joinSignature(eip712HashSigLike);
  console.log(
    'EIP712 Hash sig',
    ethers.utils.verifyTypedData(
      eip712.domain,
      restTypes as any,
      eip712.message,
      eip712HashJoinedSig
    ) === address
      ? '✅'
      : '❌'
  );

  // Verify typedData sign
  const eip712Sign = await eth.signEIP712Message(null, eip712);
  const eip712SigLike = {
    r: `0x${eip712Sign.r}`,
    s: `0x${eip712Sign.s}`,
    v: eip712Sign.v,
  };
  const eip712JoinedSig = ethers.utils.joinSignature(eip712SigLike);
  console.log(
    'EIP 712 Full Object sig',
    ethers.utils.verifyTypedData(
      eip712.domain,
      restTypes as any,
      eip712.message,
      eip712JoinedSig
    ) === address
      ? '✅'
      : '❌'
  );

  // Sign transaction
  const nonce = await provider.getTransactionCount(address);
  const common = Common.custom(
    { name: 'goerli', chainId: 5, networkId: 5 },
    { baseChain: 'goerli' }
  );

  const to = '0x6cbcd73cd8e8a42844662f0a0e76d7f79afd933d';
  const data = Buffer.from('0x', 'hex');
  const value = ethers.utils.parseEther('0.001');

  const gasPrice = await provider.getGasPrice();
  const gasLimit = await provider.estimateGas({
    to,
    data,
    value,
  });

  const ethTxObject = {
    nonce,
    to,
    gasLimit: gasLimit.toHexString(),
    gasPrice: gasPrice.toHexString(),
    data: `0x${data.toString('hex')}`,
    value: value.toHexString(),
    chainId: 5,
    type: 0,
  };

  // Typed-Transaction features
  const unsignedTx = new Transaction(ethTxObject, { common });
  const unsignedTxRaw = unsignedTx.raw();
  unsignedTxRaw[6] = Buffer.from([common.chainIdBN().toNumber()]);
  const unsignedTxHex = Buffer.from(encode(unsignedTxRaw)).toString('hex');
  const txSig = await eth.signTransaction(null, unsignedTxHex, null);
  console.log(
    'Transaction sig',
    ethers.utils.recoverAddress(
      `0x${keccak(Buffer.from(unsignedTxHex, 'hex')).toString('hex')}`,
      { r: `0x${txSig.r}`, s: `0x${txSig.s}`, v: parseInt(txSig.v, 16) }
    ) === address
      ? '✅'
      : '❌'
  );
  const signedTx = ethers.utils.serializeTransaction(
    {
      ...ethTxObject,
      value,
    },
    {
      r: `0x${txSig.r}`,
      s: `0x${txSig.s}`,
      v: parseInt(txSig.v, 16),
    }
  );
  const result = await provider.sendTransaction(signedTx);
  const confirmed = await result.wait();
  console.log('Transaction broadcasting', { confirmed });
});
