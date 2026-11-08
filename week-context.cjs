// Calendar arithmetic on the supplied local ISO date, independent of server timezone/DST.
function weekContext(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Invalid local date");
  const date = new Date(today + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== today) throw new Error("Invalid local date");
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const iso = offset => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10); };
  return `Weeks always run Monday through Sunday, using the user's local date (${today}), never the server's date. Sunday is the LAST day of the current week.
This week: ${iso(0)} (Monday) through ${iso(6)} (Sunday), inclusive.
Next week: ${iso(7)} (Monday) through ${iso(13)} (Sunday), inclusive.
The week after next: ${iso(14)} (Monday) through ${iso(20)} (Sunday), inclusive.
Resolve explicit weekdays within those ranges: next Monday / 下周一 = ${iso(7)}; next Sunday / 下周日 = ${iso(13)}; the Monday after next / 下下周一 = ${iso(14)}. On a Sunday, next week starts TOMORROW, not seven or eight days later. Do not shift Sunday into the following week. Clear week-relative weekdays are not ambiguous: do not request confirmation just for saying next week. If only a week is supplied with no specific day or clear date range, ask which day rather than inventing a deadline.`;
}
module.exports = weekContext;
