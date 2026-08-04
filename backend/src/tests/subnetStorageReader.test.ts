import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryBlockEmissionSnapshot } from '../chain/storageReader.js';
import { readSubnetStorageSnapshot } from '../chain/subnetStorageReader.js';

function codec(value: unknown) {
  return {
    toJSON: () => value,
    toString: () => String(value)
  };
}

test('reads a complete subnet snapshot without Runtime API calls', async () => {
  const storage = new Proxy({}, {
    get: (target, name) => Reflect.has(target, name) ? Reflect.get(target, name) : String(name)
  });
  const values = [
    10, 20, 30, 4_000_000_000n, 500_000_000n, 4_294_967_296,
    { subnetName: '0x416c706861' }, 123, true, 40, { bits: 0 }, { bits: 0 }, true, true, 7, 256, 50,
    65_535, 4_096, 64
  ].map(codec);

  const apiAt = {
    query: {
      subtensorModule: Object.assign(storage, {
        networksAdded: {
          entries: async () => [
            [{ args: [codec(0)] }, codec(true)],
            [{ args: [codec(7)] }, codec(true)]
          ]
        }
      })
    },
    queryMulti: async () => values
  };

  const snapshot = await readSubnetStorageSnapshot(apiAt as any);
  assert.equal(snapshot.subnets.length, 1);
  assert.deepEqual(snapshot.subnets[0], {
    netuid: 7,
    taoInEmission: values[0],
    alphaInEmission: values[1],
    alphaOutEmission: values[2],
    taoIn: values[3],
    alphaIn: values[4],
    movingPrice: values[5],
    subnetName: 'Alpha',
    networkRegisteredAt: values[7],
    emissionEnabled: values[8],
    excessTao: values[9],
    rootProp: values[10],
    minerBurned: values[11],
    ownerCutEnabled: values[12],
    registrationAllowed: values[13],
    subnetworkN: values[14],
    maxAllowedUids: values[15],
    subnetLocked: values[16]
  });
  assert.equal(snapshot.globalOwnerCut, values[17]);
  assert.equal(snapshot.networkImmunityPeriod, values[18]);
  assert.equal(snapshot.subnetLimit, values[19]);
});

test('does not replace a failed alpha price Runtime API call with a reserve ratio', async () => {
  const storage = new Proxy({}, {
    get: (target, name) => Reflect.has(target, name) ? Reflect.get(target, name) : String(name)
  });
  const values = [
    10, 20, 30, 4_000_000_000n, 500_000_000n, 4_294_967_296,
    { subnetName: '0x416c706861' }, 123, true, 40, { bits: 0 }, { bits: 0 }, true, true, 7, 256, 50,
    65_535, 4_096, 64
  ].map(codec);
  const apiAt = {
    query: {
      system: { events: async () => [] },
      subtensorModule: Object.assign(storage, {
        networksAdded: { entries: async () => [[{ args: [codec(7)] }, codec(true)]] }
      })
    },
    call: {
      subnetRegistrationRuntimeApi: { getNetworkRegistrationCost: async () => codec(1) },
      swapRuntimeApi: {
        currentAlphaPriceAll: async () => { throw new Error('price endpoint failed'); }
      }
    },
    queryMulti: async () => values
  };

  await assert.rejects(queryBlockEmissionSnapshot(apiAt as any), /price endpoint failed/);
});
