// The partner network is almost entirely Illinois today. Illinois zip codes
// are 600xx through 629xx.
export function isIllinoisZip(zip: string): boolean {
  const prefix = Number(zip.trim().slice(0, 3));
  return prefix >= 600 && prefix <= 629;
}

/** True only for a full 5-digit zip outside Illinois; blank or partial is false. */
export function isNonIllinoisZip(zip: string | undefined): boolean {
  return !!zip && /^\d{5}$/.test(zip.trim()) && !isIllinoisZip(zip);
}
