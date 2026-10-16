"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConversationView } from "@/components/messaging/hub/ConversationView";
import { MembersSheet } from "@/components/messaging/hub/Sheets";

interface ProjectMessagesSectionProps {
  tenantId: string;
  projectName: string;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  canAcknowledge: boolean;
}

// The project's Inbox channel, embedded on its Plan page — same conversation
// view as /inbox, in a fixed-height box, with a link to open it full size.
export function ProjectMessagesSection({ tenantId, projectName, currentUserId, currentUserName, currentUserPhoto, canAcknowledge }: ProjectMessagesSectionProps) {
  const router = useRouter();
  const [membersOpen, setMembersOpen] = useState(false);
  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Project Messages</h2>
          <p className="text-xs text-gray-400">This project&apos;s channel in your Inbox — the Team Lead, scheduled crew, and HQ</p>
        </div>
        <Link href={`/inbox?c=p:${tenantId}`} className="text-sm font-semibold text-forest-700 hover:text-forest-800 whitespace-nowrap">
          Open in Inbox &rarr;
        </Link>
      </div>
      <div className="h-[560px] max-h-[75dvh] rounded-2xl border border-gray-200 overflow-hidden">
        <ConversationView
          info={{ kind: "project", tenantId, title: projectName }}
          me={{ id: currentUserId, name: currentUserName, photoUrl: currentUserPhoto }}
          canPost
          canAcknowledge={canAcknowledge}
          mode="embedded"
          onOpenMembers={() => setMembersOpen(true)}
        />
      </div>
      {membersOpen && (
        <MembersSheet
          project={{ tenantId, name: projectName }}
          meId={currentUserId}
          onClose={() => setMembersOpen(false)}
          onMessage={(id) => router.push(`/inbox?c=dm:${id}`)}
        />
      )}
    </div>
  );
}
