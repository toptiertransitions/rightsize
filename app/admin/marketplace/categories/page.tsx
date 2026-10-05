import { auth } from "@clerk/nextjs/server";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllCategories } from "@/lib/marketplace/data";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function MarketplaceCategoriesPage() {
  const categories = await getAllCategories();
  const { userId } = await auth();
  const role = (userId ? await getSystemRole(userId) : null) as MarketplaceRole | null;
  const canEdit = hasCapability(role ?? "public", "editCategories");

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <CategoriesClient categories={categories} canEdit={canEdit} />
      </main>
    </div>
  );
}
