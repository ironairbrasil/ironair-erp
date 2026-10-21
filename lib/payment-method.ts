export function normalizePaymentMethod(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ');
  if (/account money|saldo em conta/.test(text)) return 'Saldo em conta';
  if (/parcela|installment|credit|credito|visa|mastercard|master card|\bmaster\b|elo|amex|american express|hipercard/.test(text)) return 'Cartão de crédito';
  if (/debit|debito/.test(text)) return 'Cartão de débito';
  if (/\bpix\b/.test(text)) return 'Pix';
  if (/boleto|bank slip/.test(text)) return 'Boleto';
  if (/cash|dinheiro/.test(text)) return 'Dinheiro';
  return raw;
}

export function paymentMethodMatches(value: unknown, selected: string): boolean {
  return !selected || normalizePaymentMethod(value) === selected;
}
