"use client";

import { useState, useEffect } from "react";
import type { Tenant, Invoice, InvoiceSettings, Service, Contract, TimeEntry } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
  tenant: Tenant;
  services: Service[];
  contracts: Contract[];
  timeEntries: TimeEntry[];
  ownerEmail: string;
  currentUserEmail: string;
  invoiceSettings: InvoiceSettings | null;
  invoices?: Invoice[];
}

type Tab = "Deposit" | "Full";
type DepositMode = "percent" | "amount";
type FullSource = "contract" | "logged" | "specific";

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceCreatorModal({
  isOpen,
  onClose,
  onCreated,
  tenant,
  services,
  contracts,
  timeEntries,
  ownerEmail,
  currentUserEmail,
  invoiceSettings,
  invoices = [],
}: Props) {
  const [tab, setTab] = useState<Tab>("Deposit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Deposit state
  const [depositMode, setDepositMode] = useState<DepositMode>("percent");
  const [depositPercent, setDepositPercent] = useState(40);
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedContractId, setSelectedContractId] = useState(contracts[0]?.id ?? "");
  const [depositServiceId, setDepositServiceId] = useState(
    (services.find((s) => s.name.toLowerCase() === "services") ?? services[0])?.id ?? ""
  );

  // Full invoice state
  const [fullSource, setFullSource] = useState<FullSource>("contract");
  const [fullContractId, setFullContractId] = useState(contracts[0]?.id ?? "");
  const [specificAmount, setSpecificAmount] = useState("");
  const [specificServiceId, setSpecificServiceId] = useState(services[0]?.id ?? "");

  // Deposit credit state
  const paidDeposits = invoices.filter((inv) => inv.type === "Deposit" && inv.status === "Paid");
  const totalPaidDeposit = paidDeposits.reduce((s, inv) => s + (inv.paidAmount ?? inv.amount), 0);
  const [applyDeposit, setApplyDeposit] = useState(totalPaidDeposit > 0);

  // Reset applyDeposit when switching to Full tab or when modal opens
  useEffect(() => {
    if (tab === "Full") setApplyDeposit(totalPaidDeposit > 0);
  }, [tab, totalPaidDeposit]);

  // Shared
  const [sendEmail, setSendEmail] = useState(false);
  const [sentToEmail, setSentToEmail] = useState(ownerEmail);
  const [ccEmail, setCcEmail] = useState(currentUserEmail);
  const [pushToQBO, setPushToQBO] = useState(false);

  // Deposit calc
  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const contractTotal = selectedContract?.totalCost ?? 0;
  const depositAmountCalc =
    depositMode === "percent"
      ? Math.round((depositPercent / 100) * contractTotal * 100) / 100
      : parseFloat(depositAmount) || 0;

  // Full invoice calc
  const fullContract = contracts.find((c) => c.id === fullContractId);
  const contractLineItems = fullContract?.lineItems ?? [];
  const contractNetTotal = contractLineItems.reduce((s, li) => s + li.hours * li.rate, 0);

  // Logged hours: group timeEntries by focusArea -> match to service
  const serviceByName = new Map(services.map((s) => [s.name.toLowerCase(), s]));
  const loggedGroups: Map<string, { service: Service; hours: number }> = new Map();
  for (const entry of timeEntries) {
    const svc = serviceByName.get(entry.focusArea.toLowerCase());
    if (!svc) continue;
    const existing = loggedGroups.get(svc.id);
    const hrs = entry.durationMinutes / 60;
    if (existing) {
      existing.hours += hrs;
    } else {
      loggedGroups.set(svc.id, { service: svc, hours: hrs });
    }
  }
  const loggedTotal = Array.from(loggedGroups.values()).reduce(
    (s, g) => s + g.service.hourlyRate * g.hours,
    0
  );

  const fullSubtotal =
    fullSource === "contract"
      ? contractNetTotal
      : fullSource === "logged"
      ? loggedTotal
      : parseFloat(specificAmount) || 0;

  const effectiveDeposit = tab === "Full" && applyDeposit && totalPaidDeposit > 0 ? totalPaidDeposit : 0;
  const fullAmount = fullSubtotal - effectiveDeposit;

  const selectedDepositService = services.find((s) => s.id === depositServiceId);
  const selectedSpecificService = services.find((s) => s.id === specificServiceId);

  const finalAmount = tab === "Deposit" ? depositAmountCalc : fullAmount;

  useEffect(() => {
    if (contracts[0]?.id) {
      setSelectedContractId(contracts[0].id);
      setFullContractId(contracts[0].id);
    }
    if (services.length > 0) {
      const servicesEntry = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
      setDepositServiceId(servicesEntry.id);
      setSpecificServiceId(services[0].id);
    }
    setSentToEmail(ownerEmail);
    setCcEmail(currentUserEmail);
  }, [contracts, services, ownerEmail, currentUserEmail]);

  const depositCreditLineItem = {
    serviceId: "",
    serviceName: "Deposit Applied",
    hours: 1,
    rate: -totalPaidDeposit,
  };

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      let body: Record<string, unknown> = {
        tenantId: tenant.id,
        type: tab,
        amount: finalAmount,
        tenantName: tenant.name,
        pushToQBO,
        sendEmail,
        sentToEmail: sendEmail ? sentToEmail : undefined,
        ccEmail: sendEmail ? ccEmail : undefined,
      };

      if (tab === "Deposit") {
        body = {
          ...body,
          serviceId: depositServiceId,
          serviceName: selectedDepositService?.name ?? "",
          depositType: depositMode === "percent" ? "PercentOfEstimate" : "SpecificAmount",
          depositPercent: depositMode === "percent" ? depositPercent : undefined,
          contractId: depositMode === "percent" ? selectedContractId : undefined,
        };
      } else {
        // Full invoice
        const withDepositCredit = effectiveDeposit > 0;

        if (fullSource === "contract") {
          const svc = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
          const lineItems = [
            ...contractLineItems.map((li) => ({
              serviceId: li.serviceId,
              serviceName: li.serviceName,
              hours: li.hours,
              rate: li.rate,
            })),
            ...(withDepositCredit ? [depositCreditLineItem] : []),
          ];
          body = {
            ...body,
            serviceId: svc?.id ?? "",
            serviceName: svc?.name ?? "Services",
            contractId: fullContractId,
            lineItems,
          };
        } else if (fullSource === "logged") {
          const svc = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
          const lineItems = [
            ...Array.from(loggedGroups.values()).map((g) => ({
              serviceId: g.service.id,
              serviceName: g.service.name,
              hours: Math.round(g.hours * 100) / 100,
              rate: g.service.hourlyRate,
            })),
            ...(withDepositCredit ? [depositCreditLineItem] : []),
          ];
          body = {
            ...body,
            serviceId: svc?.id ?? "",
            serviceName: svc?.name ?? "Services",
            lineItems,
          };
        } else {
          // Specific amount
          const lineItems = withDepositCredit
            ? [
                {
                  serviceId: specificServiceId,
                  serviceName: selectedSpecificService?.name ?? "",
                  hours: 1,
                  rate: fullSubtotal,
                },
                depositCreditLineItem,
              ]
            : undefined;
          body = {
            ...body,
            serviceId: specificServiceId,
            serviceName: selectedSpecificService?.name ?? "",
            ...(lineItems ? { lineItems } : {}),
          };
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      onCreated(data.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Create Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {(["Deposit", "Full"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "Full" ? "Full Invoice" : "Deposit"}
              </button>
            ))}
          </div>

          {/* DEPOSIT TAB */}
          {tab === "Deposit" && (
            <div className="space-y-4">
              {/* Mode pills */}
              <div className="flex gap-2">
                {(["percent", "amount"] as DepositMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDepositMode(m)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                      depositMode === m
                        ? "bg-forest-600 text-white border-forest-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {m === "percent" ? "% of Estimate" : "Specific Amount"}
                  </button>
                ))}
              </div>

              {depositMode === "percent" && (
                <>
                  {/* Contract selector */}
                  {contracts.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Signed Contract
                      </label>
                      <select
                        value={selectedContractId}
                        onChange={(e) => setSelectedContractId(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      >
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.signedAt ? new Date(c.signedAt).toLocaleDateString() : "Signed"} — {fmt(c.totalCost)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                      No signed contracts found. Sign a contract first to create a deposit from it.
                    </p>
                  )}

                  {/* Percent input */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Deposit Percentage
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={depositPercent}
                        onChange={(e) => setDepositPercent(Number(e.target.value))}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={depositPercent}
                          onChange={(e) => setDepositPercent(Math.max(1, Math.min(100, Number(e.target.value))))}
                          className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </div>
                    {contractTotal > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        = <span className="font-semibold text-gray-800">{fmt(depositAmountCalc)}</span> of {fmt(contractTotal)}
                      </p>
                    )}
                  </div>
                </>
              )}

              {depositMode === "amount" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Deposit Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    />
                  </div>
                </div>
              )}

              {/* Service selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Service
                </label>
                <select
                  value={depositServiceId}
                  onChange={(e) => setDepositServiceId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                >
                  {services.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* FULL INVOICE TAB */}
          {tab === "Full" && (
            <div className="space-y-4">
              {/* Source radio */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Invoice Source
                </label>
                <div className="space-y-2">
                  {(["contract", "logged", "specific"] as FullSource[]).map((src) => (
                    <label key={src} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        checked={fullSource === src}
                        onChange={() => setFullSource(src)}
                        className="text-forest-600"
                      />
                      <span className="text-sm text-gray-700">
                        {src === "contract" ? "Contract Hours" : src === "logged" ? "Logged Hours" : "Specific Amount"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {fullSource === "contract" && (
                <div className="space-y-3">
                  {contracts.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Contract
                      </label>
                      <select
                        value={fullContractId}
                        onChange={(e) => setFullContractId(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      >
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.signedAt ? new Date(c.signedAt).toLocaleDateString() : "Signed"} — {fmt(c.totalCost)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                      No signed contracts found.
                    </p>
                  )}
                  {contractLineItems.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Service</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Hrs</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Rate</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractLineItems.map((li, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 text-gray-700">{li.serviceName}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">{li.hours}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">{fmt(li.rate)}</td>
                              <td className="px-3 py-2 text-gray-800 font-medium text-right">{fmt(li.hours * li.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {fullSource === "logged" && (
                <div className="space-y-2">
                  {loggedGroups.size === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                      No logged time entries found for this project.
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Service</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Hrs</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Rate</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(loggedGroups.values()).map((g, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 text-gray-700">{g.service.name}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">
                                {Math.round(g.hours * 100) / 100}
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-right">{fmt(g.service.hourlyRate)}</td>
                              <td className="px-3 py-2 text-gray-800 font-medium text-right">
                                {fmt(g.service.hourlyRate * g.hours)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {fullSource === "specific" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={specificAmount}
                        onChange={(e) => setSpecificAmount(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Service
                    </label>
                    <select
                      value={specificServiceId}
                      onChange={(e) => setSpecificServiceId(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    >
                      {services.filter((s) => s.isActive).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Deposit credit section */}
              {totalPaidDeposit > 0 && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl px-4 py-3 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyDeposit}
                      onChange={(e) => setApplyDeposit(e.target.checked)}
                      className="rounded text-forest-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium text-blue-900">
                      Apply paid deposit ({fmt(totalPaidDeposit)})
                    </span>
                  </label>
                  {applyDeposit && fullSubtotal > 0 && (
                    <div className="space-y-1.5 text-sm border-t border-blue-200 pt-3">
                      <div className="flex justify-between text-gray-700">
                        <span>Subtotal</span>
                        <span>{fmt(fullSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-blue-700">
                        <span>Deposit Applied</span>
                        <span>-{fmt(totalPaidDeposit)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900 border-t border-blue-200 pt-1.5">
                        <span>Balance Owed</span>
                        <span>{fmt(Math.max(0, fullSubtotal - totalPaidDeposit))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount summary */}
          <div className="bg-forest-50 border border-forest-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-forest-800">Invoice Total</span>
            <span className="text-xl font-bold text-forest-700">{fmt(Math.max(0, finalAmount))}</span>
          </div>

          {/* Email section */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="rounded text-forest-600 w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Send email notification</span>
            </label>
            {sendEmail && (
              <div className="space-y-2 pl-7">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="email"
                    value={sentToEmail}
                    onChange={(e) => setSentToEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">CC (optional)</label>
                  <input
                    type="email"
                    value={ccEmail}
                    onChange={(e) => setCcEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* QBO toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pushToQBO}
              onChange={(e) => setPushToQBO(e.target.checked)}
              className="rounded text-forest-600 w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">Push to QuickBooks</span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || Math.max(0, finalAmount) <= 0}
              className="flex-1 py-2.5 rounded-xl bg-forest-600 text-white font-semibold text-sm hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating…" : "Create Invoice"}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
