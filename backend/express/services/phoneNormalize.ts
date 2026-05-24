/**
 * Normalize and validate Egyptian mobile/landline numbers for COD orders.
 */
export function normalizeEgyptianPhone(raw: string): { ok: true; phone: string } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: 'phone is required' };
  }

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('20')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, '');

  if (digits.length === 10 && digits.startsWith('1')) {
    digits = digits;
  } else if (digits.length === 11 && digits.startsWith('01')) {
    digits = digits.slice(1);
  } else if (digits.length < 10 || digits.length > 11) {
    return {
      ok: false,
      error: 'phone must be a valid Egyptian number (10–11 digits, e.g. 01xxxxxxxxx)',
    };
  }

  if (!/^1[0125]\d{8,9}$/.test(digits)) {
    return {
      ok: false,
      error: 'phone must be a valid Egyptian mobile number (starts with 010, 011, 012, or 015)',
    };
  }

  const normalized = `+20${digits.length === 10 ? digits : digits.slice(-10)}`;
  return { ok: true, phone: normalized };
}
