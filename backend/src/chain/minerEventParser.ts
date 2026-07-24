export interface ParsedMinerRegEvent {
  blockNumber: number;
  eventIndex: number;
  netuid: number;
  uid: number;
}

export function parseMinerRegEvents(records: any[], blockNumber: number): ParsedMinerRegEvent[] {
  const events: ParsedMinerRegEvent[] = [];
  records.forEach((record, eventIndex) => {
    const { event } = record;
    if (event.section === 'subtensorModule' && event.method === 'NeuronRegistered') {
      try {
        const netuid = Number(event.data[0].toString());
        const uid = Number(event.data[1].toString());
        if (Number.isInteger(netuid) && netuid > 0 && Number.isInteger(uid)) {
          events.push({ blockNumber, eventIndex, netuid, uid });
        }
      } catch (err) {
        // Ignore malformed event
      }
    }
  });
  return events;
}
