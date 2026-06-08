"use client";
interface Props {
  vendorName: string;
  vendorType: string;
  city: string;
  state: string;
  itemCount: number;
  rank: number; // 2 = Next, 3+ = Backup
  waitingFor: string; // current vendor's name
}
export function OutreachQueuedCard({ vendorName, vendorType, city, state, itemCount, rank, waitingFor }: Props) {
  const badge = rank === 2 ? "Next" : "Backup";
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-base font-medium text-gray-600">{vendorName}</p>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{badge}</span>
      </div>
      <p className="text-sm text-gray-400">{vendorType} · {city}, {state}</p>
      <p className="text-sm text-gray-400 mt-1">Waiting — will be contacted if {waitingFor} passes or doesn&apos;t respond</p>
      <p className="text-sm text-gray-400 mt-0.5">{itemCount} item{itemCount !== 1 ? 's' : ''} queued · Not yet contacted</p>
    </div>
  );
}
