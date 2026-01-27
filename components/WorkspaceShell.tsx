'use client';

import AppSidebar from '@/components/AppSidebar';
import { useLayout } from '@/contexts/LayoutContext';

type WorkspaceShellProps = {
  children: React.ReactNode;
};

export default function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isSidebarOpen, closeSidebar } = useLayout();

  return (
    <div className="bg-slate-50 dark:bg-[#0B1120]">
      <div className="relative h-[calc(100vh-var(--topbar-height))] min-h-0 overflow-hidden">
        <AppSidebar />
        <main className="h-full overflow-y-auto overflow-x-hidden lg:ml-64">{children}</main>
      </div>

      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={closeSidebar}
          className="fixed left-0 right-0 top-[var(--topbar-height)] z-30 h-[calc(100vh-var(--topbar-height))] bg-slate-900/30 backdrop-blur-sm lg:hidden"
        />
      )}
    </div>
  );
}
