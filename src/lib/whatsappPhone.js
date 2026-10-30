export function normalizeWhatsAppNumber(value) {
  const input = String(value || '').trim();
  const compact = input.replace(/[\s().-]/g, '');
  if (!/^(?:\+|00)?\d+$/.test(compact)) return null;

  const digits = compact.startsWith('00')
    ? compact.slice(2)
    : compact.startsWith('+') ? compact.slice(1) : compact;

  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return digits;
}

export function whatsappChatUrl(value) {
  const number = normalizeWhatsAppNumber(value);
  return number ? `https://wa.me/${number}` : null;
}
