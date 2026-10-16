/** Normalize owner-entered BRL/decimal text without converting through Number. */
export function normalizePricingDecimalInput(input: string, scale: number, optional = false): string {
  const value = input.trim();
  if (!value) {
    if (optional) return '';
    throw new Error('Este valor é obrigatório.');
  }
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) throw new Error('Escala decimal inválida.');

  let whole: string;
  let fraction = '';
  if (value.includes(',')) {
    const parts = value.split(',');
    if (parts.length !== 2 || !/^\d+$/u.test(parts[1] ?? '')) throw new Error('Use o formato decimal brasileiro válido.');
    const integerPart = parts[0] ?? '';
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/u.test(integerPart)) throw new Error('Use o formato decimal brasileiro válido.');
    whole = integerPart.replaceAll('.', '');
    fraction = parts[1] ?? '';
  } else if (value.includes('.')) {
    if (/^\d{1,3}(?:\.\d{3})+$/u.test(value)) {
      whole = value.replaceAll('.', '');
    } else {
      const parts = value.split('.');
      if (parts.length !== 2 || !/^\d+$/u.test(parts[0] ?? '') || !/^\d+$/u.test(parts[1] ?? '')) {
        throw new Error('Use o formato decimal brasileiro válido.');
      }
      whole = parts[0] ?? '';
      fraction = parts[1] ?? '';
    }
  } else {
    if (!/^\d+$/u.test(value)) throw new Error('Use apenas dígitos e separadores decimais.');
    whole = value;
  }

  const canonicalWhole = whole.replace(/^0+(?=\d)/u, '');
  const canonicalFraction = fraction.replace(/0+$/u, '');
  if (canonicalWhole.length > 26) throw new Error('Use até 26 dígitos inteiros.');
  if (canonicalFraction.length > scale) throw new Error(`Use até ${scale} casas decimais.`);
  return canonicalWhole + (canonicalFraction ? `.${canonicalFraction}` : '');
}
