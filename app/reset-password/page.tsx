'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

function ResetPasswordContent() {
  const { supabase } = useAuth();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Automatically trigger reset password if email is present
  useEffect(() => {
    if (email && !success && !isLoading) {
      handleResetPassword();
    }
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetPassword = async () => {
    if (!email) return;
    
    setIsLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password#`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[color:var(--background)]">
        <div className="glass-surface-strong max-w-md w-full space-y-8 rounded-2xl p-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">Invalid Request</h2>
            <p className="mt-2 text-muted">
              No email address provided. Please try the reset password link again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[color:var(--background)]">
      <div className="glass-surface-strong max-w-md w-full space-y-8 rounded-2xl p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground">Reset Password</h2>
          <p className="mt-2 text-muted">
            Sending reset link to: <span className="font-medium">{email}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-lg">
            {error}
            <button
              onClick={handleResetPassword}
              className="ml-2 underline hover:text-red-600"
            >
              Try again
            </button>
          </div>
        )}

        {success ? (
          <div className="bg-green-50 text-green-500 p-4 rounded-lg">
            Reset link has been sent to your email address. Please check your inbox.
          </div>
        ) : (
          <div className="text-center text-muted">
            {isLoading ? 'Sending reset link...' : 'Processing your request...'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
} 