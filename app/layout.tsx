import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';
import { LayoutProvider } from '@/contexts/LayoutContext';
import ProtectedRoute from '@/contexts/ProtectedRoute';
import TopBar from '@/components/TopBar';
import { Analytics } from "@vercel/analytics/react"
// import { PostHogProvider } from '@/contexts/PostHogContext';
// import { PostHogErrorBoundary } from '@/components/PostHogErrorBoundary';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem('theme');var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=stored||(prefersDark?'dark':'light');var root=document.documentElement;root.classList.toggle('dark',theme==='dark');}catch(e){}})();`
          }}
        />
        <Analytics mode="auto" />
        {/* <PostHogErrorBoundary>
          <PostHogProvider> */}
          <LayoutProvider>
            <AuthProvider>
              <TopBar />
              <ProtectedRoute>{children}</ProtectedRoute>
            </AuthProvider>
          </LayoutProvider>
          {/* </PostHogProvider>
        </PostHogErrorBoundary> */}
      </body>
    </html>
  );
}
