// The partner's point of contact (the person in the headshot), shown small
// under the company name. Skipped when the name is already part of the
// company name (Realtors list as "Brokerage | Town | Name").
export function PartnerContactName({ contactName, vendorName, className = "mt-0.5" }: { contactName?: string; vendorName: string; className?: string }) {
  const name = contactName?.trim();
  if (!name || vendorName.toLowerCase().includes(name.toLowerCase())) return null;
  return <p className={`text-xs font-medium text-gray-500 truncate ${className}`}>{name}</p>;
}
