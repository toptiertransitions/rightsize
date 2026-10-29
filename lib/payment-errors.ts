// Shown to clients on the invoice pay page whenever a payment error is general
// or unknown. These cases may mean the charge actually went through (timeouts,
// unreachable processor), so the client is told not to retry.
export const PAYMENT_PROCESSOR_ERROR_MSG =
  "There is an error with the payment processor at the moment. Please contact billing@toptiertransitions.com and do not attempt another payment at the moment. Thank you!";

const GENERIC_ERROR_PATTERN = /general|unknown|unexpected|internal|system error|server error|processor error|gateway error/i;

/** True when a processor message is missing or too vague to help the client. */
export function isGenericPaymentError(msg: string | undefined | null): boolean {
  return !msg || !msg.trim() || GENERIC_ERROR_PATTERN.test(msg);
}
