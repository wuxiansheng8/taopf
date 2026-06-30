export const RAO_PER_TAO = 1e9;

const FIXED_32_DENOMINATOR = 4294967296;

export function codecToNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    return value.startsWith('0x') ? Number(BigInt(value)) : Number(value);
  }

  const json = typeof value.toJSON === 'function' ? value.toJSON() : value;
  if (typeof json === 'number') return json;
  if (typeof json === 'string') {
    return json.startsWith('0x') ? Number(BigInt(json)) : Number(json);
  }
  if (json && typeof json === 'object' && 'bits' in json) {
    return codecToNumber(json.bits);
  }

  return Number(value.toString());
}

export function fixed32ToNumber(value: any): number {
  if (!value) return 0;

  const json = typeof value.toJSON === 'function' ? value.toJSON() : value;
  if (json && typeof json === 'object' && 'bits' in json) {
    return codecToNumber(json.bits) / FIXED_32_DENOMINATOR;
  }

  return codecToNumber(value) / FIXED_32_DENOMINATOR;
}

export function codecToBoolean(value: any, fallback = true): boolean {
  if (value === null || value === undefined) return fallback;
  return value.toJSON?.() === true || value === true;
}
