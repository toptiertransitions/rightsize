import { notFound } from "next/navigation";
import { getInvoiceById, getTenantById, getInvoiceSettings } from "@/lib/airtable";

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
  const paymentLinkUrl = settings?.paymentLinkUrl || "";

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

          {/* Service */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Service</p>
            <p className="text-sm font-semibold text-gray-900">{invoice.serviceName}</p>
          </div>

          {/* Amount */}
          <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-4 mb-6 text-center">
            <p className="text-xs text-[#2E6B4F] uppercase tracking-wide font-semibold mb-1">Amount Due</p>
            <p className="text-4xl font-bold text-[#2E6B4F]">{fmt(invoice.amount)}</p>
            {isPaid && (
              <p className="text-sm font-semibold text-emerald-600 mt-2">Paid</p>
            )}
          </div>

          {/* Pay button or paid state */}
          {isPaid ? (
            <div className="text-center py-3">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                This invoice has been paid. Thank you!
              </div>
            </div>
          ) : paymentLinkUrl ? (
            <a
              href={paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold text-base py-3.5 rounded-xl transition-colors"
            >
              Pay Now
            </a>
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
