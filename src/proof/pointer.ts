export function jsonPointer(data: unknown, pointer: string): unknown {
  if (pointer === '') return data;
  if (!/^(?:\/(?:[^~]|~[01])*)+$/.test(pointer)) throw new Error('Invalid RFC 6901 JSON pointer: ' + pointer);
  let value = data;
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)))
      throw new Error('JSON pointer does not resolve: ' + pointer);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
