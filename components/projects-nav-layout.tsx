"use client";

import ProjectsNavTree, { type ProjectsNavSelection } from "./projects-nav-tree";

/**
 * Two-column layout with a sticky tree sidebar on the left and page content
 * on the right. Used for /projects (projects tab), /projects/[id],
 * /collection/[id], and /folder/[id].
 *
 * The sidebar is hidden on < lg screens so the existing mobile layout is
 * preserved.
 */
export default function ProjectsNavLayout({
  selection,
  children,
}: {
  selection: ProjectsNavSelection;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-h-full items-start">
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-divider bg-background/60 sticky top-0 max-h-screen overflow-y-auto py-3 px-2">
        <ProjectsNavTree selection={selection} />
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
