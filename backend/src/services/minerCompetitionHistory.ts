const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
export const EXPECTED_BLOCKS_PER_DAY = 7200;

export interface MinerRegistrationObservation {
  netuid: number;
  isReplacement: boolean | null;
}

interface RegistrationCounts {
  registrations: number;
  replacements: number;
  unknownReplacements: number;
}

interface EmissionAggregate {
  sum: number;
  count: number;
}

interface HistoryBlock {
  timestampMs: number;
  minerPools: Map<number, number>;
  registrations: Map<number, RegistrationCounts>;
}

export interface MinerCompetitionHistorySubnet {
  registrationCount: number;
  replacementCount: number;
  unknownReplacementCount: number;
  recentEmissionAverage: number | null;
  previousEmissionAverage: number | null;
}

export interface MinerCompetitionHistorySnapshot {
  observedBlocks: number;
  coverageRatio: number;
  subnets: Map<number, MinerCompetitionHistorySubnet>;
}

class MinerCompetitionHistory {
  private recentBlocks: HistoryBlock[] = [];
  private previousBlocks: HistoryBlock[] = [];
  private latestBlockNumber = 0;
  private recentEmissions = new Map<number, EmissionAggregate>();
  private previousEmissions = new Map<number, EmissionAggregate>();
  private registrations = new Map<number, RegistrationCounts>();

  recordBlock(
    blockNumber: number,
    timestampMs: number,
    minerPools: Map<number, number>,
    observations: MinerRegistrationObservation[]
  ): void {
    if (blockNumber <= this.latestBlockNumber) return;

    const registrations = this.countRegistrations(observations);
    const block = { timestampMs, minerPools, registrations };

    this.latestBlockNumber = blockNumber;
    this.recentBlocks.push(block);
    this.adjustEmissions(this.recentEmissions, minerPools, 1);
    this.adjustRegistrations(registrations, 1);
    this.advanceWindows(timestampMs);
  }

  getSnapshot(): MinerCompetitionHistorySnapshot {
    const subnets = new Map<number, MinerCompetitionHistorySubnet>();
    const netuids = new Set([
      ...this.recentEmissions.keys(),
      ...this.previousEmissions.keys(),
      ...this.registrations.keys()
    ]);

    for (const netuid of netuids) {
      const registration = this.registrations.get(netuid);
      const recent = this.recentEmissions.get(netuid);
      const previous = this.previousEmissions.get(netuid);

      subnets.set(netuid, {
        registrationCount: registration?.registrations || 0,
        replacementCount: registration?.replacements || 0,
        unknownReplacementCount: registration?.unknownReplacements || 0,
        recentEmissionAverage: recent && recent.count > 0 ? recent.sum / recent.count : null,
        previousEmissionAverage: previous && previous.count > 0 ? previous.sum / previous.count : null
      });
    }

    const observedBlocks = this.recentBlocks.length + this.previousBlocks.length;
    return {
      observedBlocks,
      coverageRatio: Math.min(1, observedBlocks / EXPECTED_BLOCKS_PER_DAY),
      subnets
    };
  }

  private advanceWindows(latestTimestampMs: number): void {
    const cutoff12h = latestTimestampMs - HALF_DAY_MS;
    const cutoff24h = latestTimestampMs - DAY_MS;

    while (this.recentBlocks[0]?.timestampMs < cutoff12h) {
      const block = this.recentBlocks.shift()!;
      this.adjustEmissions(this.recentEmissions, block.minerPools, -1);
      this.adjustEmissions(this.previousEmissions, block.minerPools, 1);
      this.previousBlocks.push(block);
    }

    while (this.previousBlocks[0]?.timestampMs < cutoff24h) {
      const block = this.previousBlocks.shift()!;
      this.adjustEmissions(this.previousEmissions, block.minerPools, -1);
      this.adjustRegistrations(block.registrations, -1);
    }
  }

  private countRegistrations(
    observations: MinerRegistrationObservation[]
  ): Map<number, RegistrationCounts> {
    const counts = new Map<number, RegistrationCounts>();

    for (const observation of observations) {
      const current = counts.get(observation.netuid) || {
        registrations: 0,
        replacements: 0,
        unknownReplacements: 0
      };
      current.registrations += 1;
      if (observation.isReplacement === true) current.replacements += 1;
      if (observation.isReplacement === null) current.unknownReplacements += 1;
      counts.set(observation.netuid, current);
    }

    return counts;
  }

  private adjustEmissions(
    target: Map<number, EmissionAggregate>,
    values: Map<number, number>,
    direction: 1 | -1
  ): void {
    for (const [netuid, value] of values) {
      const aggregate = target.get(netuid) || { sum: 0, count: 0 };
      aggregate.sum += value * direction;
      aggregate.count += direction;

      if (aggregate.count === 0) target.delete(netuid);
      else target.set(netuid, aggregate);
    }
  }

  private adjustRegistrations(
    values: Map<number, RegistrationCounts>,
    direction: 1 | -1
  ): void {
    for (const [netuid, value] of values) {
      const total = this.registrations.get(netuid) || {
        registrations: 0,
        replacements: 0,
        unknownReplacements: 0
      };
      total.registrations += value.registrations * direction;
      total.replacements += value.replacements * direction;
      total.unknownReplacements += value.unknownReplacements * direction;

      if (total.registrations === 0) this.registrations.delete(netuid);
      else this.registrations.set(netuid, total);
    }
  }
}

export const minerCompetitionHistory = new MinerCompetitionHistory();
