/** created_at is stored as 'YYYY-MM-DDTHH:MM:SS.fff' in UTC, no zone suffix. */

export function date(s) {
  return s ? s.slice(0, 10) : '';
}

export function datetime(s) {
  return s ? s.slice(0, 19).replace('T', ' ') : '';
}

export function num(n) {
  return (n ?? 0).toLocaleString('en-US');
}

/** Days between an ISO-ish timestamp and now, as a coarse "Nd ago" label. */
export function ago(s) {
  if (!s) return '';
  const then = Date.parse(s + 'Z');
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo ago' : `${months}mo ago`;
}
