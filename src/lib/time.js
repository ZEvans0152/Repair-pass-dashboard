// Parse an API date string as UTC (appends 'Z' when the timezone marker is missing)
export function parseUTC(date) {
  let d = date;
  if (typeof d === 'string' && !/Z|[+-]\d{2}:?\d{2}$/.test(d)) {
    d = d + 'Z';
  }
  return new Date(d);
}

// Format a date in Eastern Time (EST/EDT), e.g. "Jun 11, 2:30 PM"
export function formatET(date, withYear = false) {
  // Date strings from the API are UTC but may lack a timezone marker —
  // append 'Z' so they aren't misread as local time.
  let d = date;
  if (typeof d === 'string' && !/Z|[+-]\d{2}:?\d{2}$/.test(d)) {
    d = d + 'Z';
  }
  return new Date(d).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  });
}