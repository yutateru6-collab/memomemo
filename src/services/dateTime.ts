/**
 * Convert a Date/epoch to the local value expected by <input type="datetime-local">.
 * Do not use toISOString() here because it converts to UTC and shifts the visible time.
 */
export function toDateTimeLocalValue(input: Date | number): string {
  const date = typeof input === 'number' ? new Date(input) : input;
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
