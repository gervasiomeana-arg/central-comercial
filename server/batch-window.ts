const windows = { buscar: 9, enviar: 13, revisar: 19 } as const;
export type CommercialBatch = keyof typeof windows;
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23',
});

export function batchWindow(now = new Date()): CommercialBatch | undefined {
  const hour = Number(clock.format(now));
  return (Object.keys(windows) as CommercialBatch[]).find(phase => windows[phase] === hour);
}
