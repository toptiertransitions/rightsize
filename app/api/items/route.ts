import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createItem, deleteItem, getItemById, getItemsForTenant, getLocalVendorById, getSystemRole, getTenantById, getUserRoleForTenant, updateItem } from "@/lib/airtable";
import { buildVendorAssignmentEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Default client share % by route — auto-applied on create and on route change
const ROUTE_CLIENT_SHARE: Record<string, number> = {
  "ProFoundFinds Consignment": 67,
  "FB/Marketplace": 59,
  "Online Marketplace": 59,
};

// Non-TTT projects use different client share rates
const NON_TTT_SHARE: Record<string, number> = {
  "FB/Marketplace": 100,
  "Online Marketplace": 100,
  "Other Consignment": 50,
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isSystemStaff = sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
  if (!isSystemStaff) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await getItemsForTenant(tenantId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = body.tenantId as string;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  // TTT system users (Staff/Manager/Admin) can create items on any project
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    // Non-system users must be an Owner or Collaborator on the tenant
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role || !["Owner", "Collaborator"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Check if this is a non-TTT project
  const itemTenant = await getTenantById(tenantId).catch(() => null);
  const isNonTTT = itemTenant ? !(itemTenant.isTTT ?? true) : false;

  try {
    // Substitute ProFoundFinds → Other Consignment for non-TTT projects
    const rawRoute = body.primaryRoute as string | undefined;
    const route = isNonTTT && rawRoute === "ProFoundFinds Consignment"
      ? "Other Consignment"
      : rawRoute;

    const autoShare = route
      ? (isNonTTT && NON_TTT_SHARE[route] !== undefined ? NON_TTT_SHARE[route] : ROUTE_CLIENT_SHARE[route])
      : undefined;

    const item = await createItem({
      tenantId,
      itemName: (body.itemName as string) || (body.item_name as string) || "Unknown Item",
      roomId: body.roomId as string | undefined,
      photos: body.photos as never,
      photoUrl: body.photoUrl as string | undefined,
      photoPublicId: body.photoPublicId as string | undefined,
      category: body.category as string,
      condition: body.condition as never,
      conditionNotes: body.conditionNotes as string,
      sizeClass: body.sizeClass as never,
      fragility: body.fragility as never,
      itemType: body.itemType as never,
      valueLow: Number(body.valueLow) || 0,
      valueMid: Number(body.valueMid) || 0,
      valueHigh: Number(body.valueHigh) || 0,
      primaryRoute: route as never,
      routeReasoning: body.routeReasoning as string,
      consignmentCategory: body.consignmentCategory as string,
      listingTitleEbay: body.listingTitleEbay as string,
      listingDescriptionEbay: body.listingDescriptionEbay as string,
      listingFb: body.listingFb as string,
      listingOfferup: body.listingOfferup as string,
      staffTips: body.staffTips as string,
      status: "Pending Review",
      clientSharePercent: body.clientSharePercent != null ? Number(body.clientSharePercent) : autoShare,
    });
    return NextResponse.json({ item });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("createItem failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, tenantId, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // TTTStaff and above can update any item without needing tenant membership
  const sysRole = await getSystemRole(userId).catch(() => null);
  const isSystemStaff = sysRole !== null && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
  // isAdmin = can reassign items across projects (manager/admin only)
  const isAdmin = sysRole === "TTTAdmin" || sysRole === "TTTManager";

  if (!isSystemStaff) {
    if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
    const role = await getUserRoleForTenant(userId, tenantId as string);
    if (!role || !["Owner", "Collaborator"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Handle project reassignment (TTTManager/TTTAdmin only)
  const reassignTenantId = (updates as Record<string, unknown>).reassignTenantId as string | undefined;
  if (reassignTenantId !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: only TTTManager/TTTAdmin can reassign items" }, { status: 403 });
    }
    (updates as Record<string, unknown>).tenantId = reassignTenantId;
    delete (updates as Record<string, unknown>).reassignTenantId;
  }

  // Vendor approval locks in the route as Other Consignment
  if (updates.vendorDecision === "Approved" && updates.primaryRoute === undefined) {
    (updates as Record<string, unknown>).primaryRoute = "Other Consignment";
  }

  // Check if non-TTT project for route/share overrides
  const patchTenantId = (tenantId ?? (await getItemById(id as string).catch(() => null))?.tenantId) as string | undefined;
  const patchTenant = patchTenantId ? await getTenantById(patchTenantId).catch(() => null) : null;
  const patchIsNonTTT = patchTenant ? !(patchTenant.isTTT ?? true) : false;

  // Substitute ProFoundFinds → Other Consignment for non-TTT projects
  const newRoute = updates.primaryRoute as string | undefined;
  if (patchIsNonTTT && newRoute === "ProFoundFinds Consignment") {
    (updates as Record<string, unknown>).primaryRoute = "Other Consignment";
  }
  const resolvedNewRoute = patchIsNonTTT && newRoute === "ProFoundFinds Consignment"
    ? "Other Consignment"
    : newRoute;

  // Auto-set clientSharePercent when primaryRoute changes (if not explicitly overriding)
  if (resolvedNewRoute !== undefined && updates.clientSharePercent === undefined) {
    const autoShare = patchIsNonTTT && NON_TTT_SHARE[resolvedNewRoute] !== undefined
      ? NON_TTT_SHARE[resolvedNewRoute]
      : ROUTE_CLIENT_SHARE[resolvedNewRoute];
    if (autoShare !== undefined) {
      (updates as Record<string, unknown>).clientSharePercent = autoShare;
    }
  }

  // Fetch existing item if needed for vendor change check, Sold backfill, or Sold reversal
  const newVendorId = updates.assignedVendorId as string | undefined;
  const needsExisting = newVendorId !== undefined || updates.status !== undefined;
  const existing = needsExisting ? await getItemById(id as string).catch(() => null) : null;

  let vendorChanged = false;
  if (newVendorId !== undefined && existing && existing.assignedVendorId !== newVendorId) {
    vendorChanged = true;
    // Reset decision on reassignment
    (updates as Record<string, unknown>).vendorDecision = "Pending";
  }

  const COMPLETED_STATUSES = ["Sold", "Donated", "Discarded"];

  // When marking Sold: set saleDate, set salePrice = valueMid (Price for Label) if not provided
  if (updates.status === "Sold") {
    if (!(updates as Record<string, unknown>).saleDate) {
      (updates as Record<string, unknown>).saleDate = new Date().toISOString();
    }
    if (!(updates as Record<string, unknown>).salePrice) {
      const price = (updates as Record<string, unknown>).valueMid ?? existing?.valueMid;
      if (price) (updates as Record<string, unknown>).salePrice = price;
    }
  }
  // When reverting from Sold → clear sale fields
  if (updates.status && updates.status !== "Sold" && existing?.status === "Sold") {
    if (!(updates as Record<string, unknown>).salePrice) {
      (updates as Record<string, unknown>).salePrice = 0;
    }
    if (!(updates as Record<string, unknown>).saleDate) {
      (updates as Record<string, unknown>).saleDate = "";
    }
  }

  // Auto-set completedDate when status → Sold/Donated/Discarded; clear when reverting
  const newStatus = updates.status as string | undefined;
  const explicitCompletedDate = (updates as Record<string, unknown>).completedDate;
  if (explicitCompletedDate === undefined) {
    if (newStatus && COMPLETED_STATUSES.includes(newStatus)) {
      (updates as Record<string, unknown>).completedDate = new Date().toISOString().split("T")[0];
    } else if (newStatus && !COMPLETED_STATUSES.includes(newStatus)) {
      (updates as Record<string, unknown>).completedDate = null;
    }
  }

  const item = await updateItem(id as string, updates as never);

  // Vendor assignment email — currently suppressed
  // if (vendorChanged && newVendorId) {
  //   const vendor = await getLocalVendorById(newVendorId).catch(() => null);
  //   if (vendor?.email) {
  //     const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com"}/vendor`;
  //     try {
  //       await resend.emails.send({
  //         from: "Top Tier Transitions <noreply@toptiertransitions.com>",
  //         to: vendor.email,
  //         subject: "1 new item waiting for your review",
  //         html: buildVendorAssignmentEmail({ vendorName: vendor.vendorName, itemCount: 1, portalUrl }),
  //       });
  //     } catch (err) {
  //       console.error(`Failed to send vendor notification:`, err);
  //     }
  //   }
  // }

  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await getItemById(id).catch(() => null);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRoleDel = await getSystemRole(userId).catch(() => null);
  const isSystemStaffDel = sysRoleDel && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRoleDel);
  if (!isSystemStaffDel) {
    const role = await getUserRoleForTenant(userId, item.tenantId);
    if (!role || !["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await deleteItem(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
