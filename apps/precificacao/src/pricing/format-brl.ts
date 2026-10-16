const currency = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Display-only BRL formatting. Keeps canonical decimal input exact through cent rounding. */
export function formatBrl(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) return `R$ ${value.replace('.', ',')}`;
  const whole = BigInt(match[1] ?? '0');
  const fraction = (match[2] ?? '').padEnd(3, '0');
  const cents = BigInt(fraction.slice(0, 2) || '0') + ((fraction[2] ?? '0') >= '5' ? 1n : 0n);
  const rounded = whole * 100n + cents;
  const major = rounded / 100n;
  const minor = (rounded % 100n).toString().padStart(2, '0');
  return `R$ ${currency.format(major)},${minor}`;
}
