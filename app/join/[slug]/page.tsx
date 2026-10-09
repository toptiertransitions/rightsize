import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getBrandBySlug } from "@/lib/brands/data";
import { fullBrandName } from "@/lib/brands/shared";
import { JoinLanding } from "@/components/brands/JoinLanding";

// Public branded landing for a community's join link / QR code.
// "Get started" goes through ./start, which remembers the community in a
// signed cookie so it's attached when the account is created.

export const revalidate = 60;

async function activeBrand(slug: string) {
  const b = await getBrandBySlug(slug.toLowerCase()).catch(() => null);
  return b && b.status === "Active" ? b : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const brand = await activeBrand((await params).slug);
  return { title: brand ? `${fullBrandName(brand)} · Plan your move` : "Rightsize by Top Tier" };
}

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await activeBrand(slug);

  if (!brand) {
    return (
      <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center px-6 text-center">
        <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={48} height={48} className="w-12 h-12 mb-4" />
        <h1 className="text-xl font-bold text-gray-900">This link isn&apos;t active</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-sm">
          The community link you followed isn&apos;t available right now. You can still create a free account and plan your move with Rightsize.
        </p>
        <Link href="/sign-up" className="mt-6 inline-flex items-center justify-center h-12 px-6 rounded-xl bg-forest-600 text-white font-semibold">
          Create a free account
        </Link>
        <Link href="/sign-in" className="mt-3 text-sm text-gray-500 underline">I already have an account</Link>
      </div>
    );
  }

  return <JoinLanding brand={brand} />;
}
