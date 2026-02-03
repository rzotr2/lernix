'use client';

import AppSidebar from '@/components/AppSidebar';
import { useLayout } from '@/contexts/LayoutContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';

type WorkspaceShellProps = {
  children: React.ReactNode;
};

export default function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isSidebarOpen, closeSidebar } = useLayout();
  const { user } = useAuth();
  const pathname = usePathname();
  const isPublicPage = /^\/[^/]+\/pages\/[^/]+$/.test(pathname);
  const showSidebar = !!user || !isPublicPage;

  return (
    <div className="bg-[color:var(--background)]">
      <div className={`relative h-[calc(100vh-var(--topbar-height))] min-h-0 overflow-hidden ${showSidebar ? 'lg:pl-72' : ''}`}>
        {showSidebar && <AppSidebar />}
        <main className="h-full overflow-y-auto overflow-x-hidden">{children}</main>
      </div>

      {showSidebar && isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={closeSidebar}
          className="fixed left-0 right-0 top-[var(--topbar-height)] z-30 h-[calc(100vh-var(--topbar-height))] bg-black/20 backdrop-blur-sm lg:hidden"
        />
      )}
    </div>
  );
}
