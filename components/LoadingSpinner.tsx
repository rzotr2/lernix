/**
 * Loading spinner component for Suspense fallback
 * @file components/LoadingSpinner.tsx
 */

type LoadingSpinnerProps = {
  className?: string;
  fullScreen?: boolean;
};

export default function LoadingSpinner({ className = '', fullScreen = true }: LoadingSpinnerProps) {
  return (
    <div
      className={`loading-spinner ${fullScreen ? 'min-h-screen' : 'min-h-full'} flex items-center justify-center ${className}`}
    >
      <div className="loading-spinner-ring animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
    </div>
  );
} 
