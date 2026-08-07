// Standard ISO 7064 MOD 97-10 remainder for a numeric string, computed
// digit-by-digit to avoid exceeding JS's safe integer range for long IBANs.
function mod97(numericString: string): number {
  let remainder = 0;
  for (const ch of numericString) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}

/** Standard IBAN validation: move the first 4 characters to the end, letters -> digits, mod 97 must equal 1. */
function isValidIban(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String(code - 55); // A=10 ... Z=35
      return ch;
    })
    .join("");
  return mod97(numeric) === 1;
}

/**
 * Converts a Czech domestic account number ("prefix-account" or just
 * "account") plus a 4-digit bank code into an IBAN, using the standard
 * Czech BBAN layout (bank code[4] + prefix[6] + account[10] = 20 digits)
 * and the ISO 7064 MOD 97-10 check-digit algorithm. Self-validates the
 * result before returning it — this handles real money; never surface an
 * unvalidated IBAN. Returns null on any parse or validation failure.
 */
export function czechAccountToIban(accountNumber: string, bankCode: string): string | null {
  const bank = bankCode.replace(/\s/g, "");
  if (!/^\d{4}$/.test(bank)) return null;

  const raw = accountNumber.replace(/\s/g, "");
  let prefix = "0";
  let account = raw;
  if (raw.includes("-")) {
    const parts = raw.split("-");
    if (parts.length !== 2) return null;
    [prefix, account] = parts;
  }
  if (!/^\d+$/.test(prefix) || !/^\d+$/.test(account)) return null;
  if (prefix.length > 6 || account.length > 10 || account.length === 0) return null;

  const prefixPadded = prefix.padStart(6, "0");
  const accountPadded = account.padStart(10, "0");
  const bban = bank + prefixPadded + accountPadded; // 20 digits

  // "CZ" -> C=12, Z=35 -> "1235", plus "00" placeholder for the check digits.
  const forChecksum = bban + "123500";
  const checkDigits = String(98 - mod97(forChecksum)).padStart(2, "0");
  const iban = `CZ${checkDigits}${bban}`;

  return isValidIban(iban) ? iban : null;
}

function spaydSanitize(input: string, maxLength: number): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, maxLength);
}

/** Builds a Czech QR Platba (SPAYD) payload string for a single payment. */
export function buildSpaydString(iban: string, amountCzk: number, message: string): string {
  const amount = amountCzk.toFixed(2);
  const msg = spaydSanitize(message, 60);
  return `SPD*1.0*ACC:${iban}*AM:${amount}*CC:CZK*MSG:${msg}`;
}