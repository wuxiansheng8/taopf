import assert from 'node:assert/strict';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { readSubnetStorageSnapshot } from '../dist/chain/subnetStorageReader.js';

function encoded(value) {
  const json = typeof value?.toJSON === 'function' ? value.toJSON() : value;
  return typeof json === 'object' ? JSON.stringify(json) : String(json);
}

const endpoint = process.env.TAOPF_RPC_ENDPOINT || 'wss://entrypoint-finney.opentensor.ai:443';
const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });

try {
  const header = await api.rpc.chain.getHeader();
  const apiAt = await api.at(header.hash);
  const snapshot = await readSubnetStorageSnapshot(apiAt);
  assert.ok(snapshot.subnets.length > 0, '未读取到非 Root 子网');

  const runtimeApi = apiAt.call.subnetInfoRuntimeApi;
  if (typeof runtimeApi?.getAllDynamicInfo === 'function') {
    const dynamic = (await runtimeApi.getAllDynamicInfo()).toJSON();
    for (const subnet of snapshot.subnets.slice(0, 20)) {
      const runtimeSubnet = dynamic.find((item) => Number(item?.netuid) === subnet.netuid);
      assert.ok(runtimeSubnet, `Runtime API 缺少子网 ${subnet.netuid}`);
      assert.equal(subnet.subnetName, Buffer.from(runtimeSubnet.subnetName).toString('utf8'));
      assert.equal(encoded(subnet.networkRegisteredAt), encoded(runtimeSubnet.networkRegisteredAt));
      assert.equal(encoded(subnet.taoInEmission), encoded(runtimeSubnet.taoInEmission));
      assert.equal(encoded(subnet.alphaInEmission), encoded(runtimeSubnet.alphaInEmission));
      assert.equal(encoded(subnet.alphaOutEmission), encoded(runtimeSubnet.alphaOutEmission));
      assert.equal(encoded(subnet.taoIn), encoded(runtimeSubnet.taoIn));
      assert.equal(encoded(subnet.alphaIn), encoded(runtimeSubnet.alphaIn));
      assert.equal(encoded(subnet.movingPrice), encoded(runtimeSubnet.movingPrice));
    }
  }

  const rawPrices = await apiAt.call.swapRuntimeApi.currentAlphaPriceAll();
  const prices = rawPrices.toJSON() ?? [];
  const priceNetuids = new Set(prices.map((item) => Number(item.netuid)));
  for (const subnet of snapshot.subnets) {
    assert.ok(priceNetuids.has(subnet.netuid), `Alpha 价格缺少子网 ${subnet.netuid}`);
  }

  console.log(`兼容性检查通过: block=${header.number} subnets=${snapshot.subnets.length}`);
} finally {
  await api.disconnect();
}
