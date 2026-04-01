import { getContractByToken, getTenantById } from "@/lib/airtable";
import { SigningClient } from "./SigningClient";

function formatCost(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

function MessagePage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md w-full text-center">
        <p className="text-sm font-medium text-forest-600 mb-4">Top Tier Transitions</p>
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default async function SignPage({ params }: PageProps) {
  const { token } = await params;
  const contract = await getContractByToken(token).catch(() => null);

  // Link is dead (token was rotated on resend)
  if (!contract) {
    return (
      <MessagePage
        title="This link is no longer active"
        message="This signing link has expired or been replaced. Please check your email from Top Tier Transitions for the most recent quote."
      />
    );
  }

  // Superseded by a newer resent quote
  if (contract.status === "Superseded") {
    return (
      <MessagePage
        title="This quote has been updated"
        message="This is an outdated version of your service agreement. Please check your email from Top Tier Transitions for the updated quote and signing link."
      />
    );
  }

  // Archived by TTT staff
  if (contract.status === "Archived") {
    return (
      <MessagePage
        title="This quote is no longer available"
        message="This service agreement has been closed. Please contact your Top Tier Transitions coordinator if you have any questions."
      />
    );
  }

  const tenant = await getTenantById(contract.tenantId).catch(() => null);

  const useLineItems = (contract.lineItems?.length ?? 0) > 0;

  const legacyPhases = [
    { label: "Rightsizing", hours: contract.rightsizingHours, rate: contract.rightsizingRate },
    { label: "Packing", hours: contract.packingHours, rate: contract.packingRate },
    { label: "Unpacking", hours: contract.unpackingHours, rate: contract.unpackingRate },
  ];

  // A contract may have status "Signed" because TTT staff set it as the primary quote,
  // but the client hasn't actually signed yet (signedAt is empty in that case).
  // Only show the "Agreement Signed" confirmation when the client has truly signed.
  const alreadySigned = contract.status === "Signed" && !!contract.signedAt;

  return (
    <div className="min-h-screen bg-cream-50" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-forest-600 mb-2">Top Tier Transitions</p>
          <h1 className="text-3xl font-bold text-gray-900">{tenant?.name ?? "Service Agreement"}</h1>
          <p className="text-gray-500 mt-1">Service Agreement</p>
        </div>

        {/* Estimate breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Estimated Services</h2>
          </div>
          {useLineItems ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Service</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hours</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {contract.lineItems!.map((item) => (
                  <tr key={item.serviceId} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-gray-700">{item.serviceName}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{item.hours}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{formatCost(item.rate)}/hr</td>
                    <td className="px-6 py-3 text-right text-gray-900">{formatCost(item.hours * item.rate)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-forest-200 bg-forest-50">
                  <td className="px-6 py-4 font-bold text-forest-700" colSpan={3}>Total</td>
                  <td className="px-6 py-4 text-right font-bold text-forest-700">{formatCost(contract.totalCost)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phase</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hours</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {legacyPhases.map(({ label, hours, rate }) => (
                  <tr key={label} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-gray-700">{label}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{hours}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{formatCost(rate)}/hr</td>
                    <td className="px-6 py-3 text-right text-gray-900">{formatCost(hours * rate)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-forest-200 bg-forest-50">
                  <td className="px-6 py-4 font-bold text-forest-700" colSpan={3}>Total</td>
                  <td className="px-6 py-4 text-right font-bold text-forest-700">{formatCost(contract.totalCost)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Contract body */}
        {contract.contractBody && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Agreement Terms</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
              {contract.contractBody}
            </div>
          </div>
        )}

        {/* Signed confirmation or signing UI */}
        {alreadySigned ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-800 mb-1">Agreement Signed</h3>
            <p className="text-sm text-green-700">
              Signed by <strong>{contract.signedByName}</strong> on{" "}
              {contract.signedAt ? new Date(contract.signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
            </p>
          </div>
        ) : (
          <SigningClient token={token} />
        )}
      </div>
    </div>
  );
}
