export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York'
  });
}

export function timestamp() {
  return {
    iso: new Date().toISOString(),
    unix: Date.now(),
    local: new Date().toString(),
    utc: new Date().toUTCString(),
    eastern: new Date().toLocaleString('en-CA', { timeZone: 'America/New_York' })
  };
}
