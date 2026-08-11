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

const ET_WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Current wall-clock time in America/New_York, broken into the parts Home's
// Attention rule needs: the Eastern calendar date (to match market_snapshots
// .date), the Eastern hour (to gate the post-10am briefing-completion
// check), and whether today is a weekday (the briefing timer is Mon-Fri
// only, so weekends never expect a briefing).
export function easternNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  const weekday = ET_WEEKDAYS[get('weekday')];

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday,
    isWeekday: weekday >= 1 && weekday <= 5
  };
}
