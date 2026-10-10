// What the bank-account APIs return -- never tokenEncrypted (docs/bank-payments-design.md);
// tokenSetAt != null means a token is stored (cleared together with it).
export const BANK_ACCOUNT_SELECT = {
  id: true, label: true, accountNumber: true, bankCode: true, tokenSetAt: true, lastCheckedAt: true, lastSuccessAt: true, lastError: true, active: true,
  events: { where: { bankCheckEnabled: true }, select: { id: true, name: true } },
} as const;

export const FIO_BANK_CODE = "2010";
// Czech account number: optional prefix (up to 6 digits) + number (2-10 digits).
export const ACCOUNT_NUMBER = /^(\d{1,6}-)?\d{2,10}$/;
export const FIO_TOKEN = /^[A-Za-z0-9]{64}$/;
// Fio tokens expire 180 days after creation.
export const TOKEN_VALID_DAYS = 180;
