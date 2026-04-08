import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getContractById, getAllServices } from "@/lib/airtable";
import { createQBOInvoice } from "@/lib/qbo";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTSales", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { contractId, customerName } = await req.json();
  if (!contractId) return NextResponse.json({ error: "Missing contractId" }, { status: 400 });

  const contract = await getContractById(contractId);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.status !== "Signed") {
    return NextResponse.json({ error: "Contract is not signed" }, { status: 400 });
  }

  const lineItems = contract.lineItems;
  if (!lineItems?.length) {
    return NextResponse.json({ error: "Contract has no line items" }, { status: 400 });
  }

  // Load services to get qboItemId mappings
  const services = await getAllServices().catch(() => []);
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const invoiceLineItems = lineItems.map((item) => ({
    serviceName: item.serviceName,
    hours: item.hours,
    rate: item.rate,
    qboItemId: serviceMap.get(item.serviceId)?.qboItemId,
  }));

  try {
    const invoice = await createQBOInvoice({
      customerName: customerName || "Client",
      lineItems: invoiceLineItems,
      memo: `Contract ${contract.id.slice(0, 8)}`,
    });
    return NextResponse.json({ invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invoice creation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
