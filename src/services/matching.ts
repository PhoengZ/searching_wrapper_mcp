export function matchText(text: string, keywords: string[], mode: string): string[] {
  const haystack = text.normalize('NFC').toLocaleLowerCase('th');
  const needles = [...new Set(keywords.map(keyword => keyword.normalize('NFC').toLocaleLowerCase('th')))];
  const matched = needles.filter(keyword => haystack.includes(keyword));
  return mode === 'all' && matched.length !== needles.length ? [] : matched;
}
export function matchesDate(date: string | null, range: { date_from?: string; date_to?: string; timezone: string }): boolean {
  if (!range.date_from && !range.date_to) return true;
  if (!date || !Number.isFinite(Date.parse(date))) return false;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: range.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return (!range.date_from || day >= range.date_from) && (!range.date_to || day <= range.date_to);
}
