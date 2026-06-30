export function parseRpcEndpoints(value: string): string[] {
  const seen = new Set<string>();
  const endpoints = value
    .split(/[\s,，]+/)
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);

  return endpoints.filter((endpoint) => {
    if (seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
}

export function normalizeRpcEndpoints(value: string): string {
  return parseRpcEndpoints(value).join('\n');
}
