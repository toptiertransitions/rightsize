import { notFound } from "next/navigation";
import { getInvoiceById, getTenantById, getInvoiceSettings } from "@/lib/airtable";
import { PaymentFlow } from "./PaymentFlow";

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PayPage({ params }: Props) {
  const { id } = await params;

  const invoice = await getInvoiceById(id).catch(() => null);
  if (!invoice) notFound();

  const [tenant, settings] = await Promise.all([
    getTenantById(invoice.tenantId).catch(() => null),
    getInvoiceSettings().catch(() => null),
  ]);

  const isPaid = invoice.status === "Paid";
  const companyName = settings?.companyName || "Top Tier Transitions";
  const fluidpayConfigured = !!process.env.FLUIDPAY_API_KEY;
  // Pre-fill email from invoice sent-to or project client email
  const prefillEmail = invoice.sentToEmail || tenant?.clientEmail || "";

  const lineItems = invoice.lineItems && invoice.lineItems.length > 0 ? invoice.lineItems : null;
  const positiveItems = lineItems?.filter((li) => li.rate >= 0) ?? [];
  const creditItems = lineItems?.filter((li) => li.rate < 0) ?? [];
  const hasCredits = creditItems.length > 0;
  const subtotalAmount = positiveItems.reduce((s, li) => s + li.hours * li.rate, 0);

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="bg-[#2E6B4F] rounded-t-2xl px-8 py-6">
          {settings?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt={companyName}
              className="max-h-12 max-w-[180px] object-contain mb-3"
            />
          )}
          <p className="text-[#F5F0E8] text-xl font-bold">{companyName}</p>
          <p className="text-[#a8d4bc] text-sm mt-1">Invoice Payment</p>
        </div>

        {/* Body */}
        <div className="bg-white rounded-b-2xl px-8 py-8 shadow-sm">
          {/* Invoice meta */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Invoice</p>
              <p className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Type</p>
              <p className="text-sm font-medium text-gray-700">{invoice.type}</p>
            </div>
          </div>

          {/* Project */}
          {tenant && (
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-0.5">Project</p>
              <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
            </div>
          )}

          {/* Line items or single service */}
          {lineItems && lineItems.length > 0 ? (
            <div className="mb-4 pb-4 border-b border-gray-100 space-y-1">
              {positiveItems.map((li, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{li.serviceName}</span>
                  <span className="text-gray-900 font-medium">{fmt(li.hours * li.rate)}</span>
                </div>
              ))}
              {hasCredits && (
                <>
                  <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-600">{fmt(subtotalAmount)}</span>
                  </div>
                  {creditItems.map((li, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-blue-700 italic">{li.serviceName}</span>
                      <span className="text-blue-700 italic">-{fmt(Math.abs(li.hours * li.rate))}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-0.5">Service</p>
              <p className="text-sm font-semibold text-gray-900">{invoice.serviceName}</p>
            </div>
          )}

          {/* Amount */}
          <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-4 mb-6 text-center">
            <p className="text-xs text-[#2E6B4F] uppercase tracking-wide font-semibold mb-1">
              {hasCredits ? "Balance Owed" : "Amount Due"}
            </p>
            <p className="text-4xl font-bold text-[#2E6B4F]">{fmt(invoice.amount)}</p>
            {isPaid && (
              <p className="text-sm font-semibold text-emerald-600 mt-2">Paid</p>
            )}
          </div>

          {/* Payment section */}
          {isPaid ? (
            <div className="text-center py-3">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                This invoice has been paid. Thank you!
              </div>
            </div>
          ) : fluidpayConfigured ? (
            <PaymentFlow
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              amount={invoice.amount}
              companyName={companyName}
              prefillEmail={prefillEmail}
            />
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">
                To pay this invoice, please contact your coordinator.
              </p>
              {settings?.companyEmail && (
                <a
                  href={`mailto:${settings.companyEmail}`}
                  className="text-sm font-medium text-[#2E6B4F] hover:underline mt-1 block"
                >
                  {settings.companyEmail}
                </a>
              )}
              {settings?.companyPhone && (
                <p className="text-sm text-gray-500 mt-1">{settings.companyPhone}</p>
              )}
            </div>
          )}

          {/* Footer note */}
          <p className="text-xs text-gray-400 text-center mt-5 leading-relaxed">
            {settings?.invoiceFooter || `Questions? Contact ${companyName}.`}
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by Rightsize
        </p>
      </div>
    </div>
  );
}
