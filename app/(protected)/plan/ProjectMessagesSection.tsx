"use client";

import { ProjectChannelThread } from "@/components/messaging/ProjectChannelThread";

interface ProjectMessagesSectionProps {
  tenantId: string;
  currentUserName: string;
  currentUserPhoto?: string;
}

export function ProjectMessagesSection({ tenantId, currentUserName, currentUserPhoto }: ProjectMessagesSectionProps) {
  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-forest-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Project Messages</h2>
          <p className="text-xs text-gray-400">Full team channel, plus private lines to HQ and your Team Lead</p>
        </div>
      </div>
      <ProjectChannelThread tenantId={tenantId} currentUserName={currentUserName} currentUserPhoto={currentUserPhoto} />
    </div>
  );
}
