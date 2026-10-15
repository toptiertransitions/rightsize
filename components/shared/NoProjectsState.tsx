import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

interface NoProjectsStateProps {
  // Page title, e.g. "Item Catalog"
  title: string;
  // What lives on this page once there's a project, e.g. "items" or "sales"
  noun: string;
  // TTT staff are assigned to projects by a team lead; everyone else creates their own
  isStaff: boolean;
}

// Shown on project-scoped pages (Catalog, Sales) for a user who isn't on any
// project yet, instead of silently bouncing them back to Home.
export function NoProjectsState({ title, noun, isStaff }: NoProjectsStateProps) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>
      <Card className="max-w-lg">
        <CardContent className="text-center py-12">
          <div className="w-16 h-16 bg-forest-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          {isStaff ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re not on any projects yet</h2>
              <p className="text-gray-500 leading-relaxed">
                Once a team lead adds you to a project, its {noun} will show up here.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No project yet</h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Create a project to start tracking your {noun}.
              </p>
              <Link href="/onboarding">
                <Button size="lg" className="w-full">Create Your First Project</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
