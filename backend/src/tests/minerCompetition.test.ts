import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMinerRegEvents } from '../chain/minerEventParser.js';
import {
  calculateMinerPoolTaoPerBlock,
  classifyMinerRegistrationEvents
} from '../services/minerCompetitionService.js';
import { SubnetBlockData } from '../../../shared/types.js';

function registrationRecord(netuid: number, uid: number) {
  return {
    event: {
      section: 'subtensorModule',
      method: 'NeuronRegistered',
      data: [netuid, uid].map(value => ({ toString: () => String(value) }))
    }
  };
}

describe('miner competition analytics', () => {
  it('parses registration event indexes and ignores root registrations', () => {
    const events = parseMinerRegEvents([
      registrationRecord(0, 1),
      registrationRecord(19, 255)
    ], 1000);

    assert.deepEqual(events, [{
      blockNumber: 1000,
      eventIndex: 1,
      netuid: 19,
      uid: 255
    }]);
  });

  it('distinguishes filling the last slot from replacing a UID', () => {
    const events = [
      { blockNumber: 1000, eventIndex: 0, netuid: 19, uid: 255 },
      { blockNumber: 1000, eventIndex: 1, netuid: 19, uid: 42 }
    ];
    const classified = classifyMinerRegistrationEvents(events, new Map([[19, 255]]));

    assert.equal(classified[0].isReplacement, false);
    assert.equal(classified[1].isReplacement, true);
  });

  it('marks replacement status unknown after an unobserved block gap', () => {
    const [classified] = classifyMinerRegistrationEvents([
      { blockNumber: 1000, eventIndex: 0, netuid: 19, uid: 42 }
    ], null);

    assert.equal(classified.isReplacement, null);
  });

  it('uses the miner pool formula', () => {
    const subnet = {
      alpha_out: 10,
      owner_cut: 0.1,
      miner_burned: 0.2,
      alpha_price: 0.5
    } as SubnetBlockData;

    assert.equal(calculateMinerPoolTaoPerBlock(subnet), 1.8);
  });
});
