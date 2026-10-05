import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { PipelineClient } from "./PipelineClient";

export const dynamic = "force-dynamic";

export default async function MarketplacePipelinePage() {
  const [categories, partners, listings] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const cards = partners
    .filter((p) => p.lifecycleStatus !== "Archived")
    .map((p) => ({
      partner: p,
      categoryLabels: listings.filter((l) => l.partnerId === p.id).map((l) => categoryById.get(l.categoryId)?.label ?? "—"),
    }));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <PipelineClient cards={cards} categories={categories.map((c) => ({ id: c.id, label: c.label }))} />
      </main>
    </div>
  );
}
