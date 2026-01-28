'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

function VerifyEmailContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [countdown, setCountdown] = useState(60);

  // Redirect if user is already verified
  useEffect(() => {
    if (user?.email_confirmed_at) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleResendEmail = async () => {
    // Reset countdown
    setCountdown(60);
    // TODO: Implement resend verification email logic
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
      <div className="glass-surface-strong max-w-md w-full space-y-8 p-6 rounded-xl">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-foreground">
            Check Your Email
          </h2>
          <p className="mt-2 text-sm text-muted">
            We sent a verification link to{' '}
            <span className="font-medium">{email}</span>
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="text-center text-sm text-muted">
            <p>Please check your email and click the verification link to continue.</p>
            <p className="mt-4">
              Didn&apos;t receive the email? You can request a new one{' '}
              {countdown > 0 ? (
                <span>in {countdown} seconds</span>
              ) : (
                <button
                  onClick={handleResendEmail}
                  className="text-blue-600 hover:text-blue-700"
                >
                  now
                </button>
              )}
            </p>
          </div>

          <div className="text-center">
            <button
              onClick={() => router.push('/login')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              ← Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <VerifyEmailContent />
    </Suspense>
  );
} 