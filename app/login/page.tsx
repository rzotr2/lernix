'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { locales, defaultLocale } from '@/i18n/config';

export default function LoginPage() {
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Combine all loading states
  // We show loader if:
  // 1. Auth context is initializing (authLoading)
  // 2. User is already logged in (redirecting...)
  // 3. Form is submitting (isLoading)
  const showLoader = authLoading || !!user || isLoading;

  useEffect(() => {
    if (user) {
      const stored = window.localStorage.getItem('locale');
      const isValid = locales.includes(stored as (typeof locales)[number]);
      const nextLocale = isValid ? stored : defaultLocale;
      router.replace(`/${nextLocale}/dashboard`);
    }
  }, [user, router]);

  const handleSubmit = async (email: string, password: string, isSignUp: boolean) => {
    setError('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await signUpWithEmail(email, password);
        if (error) throw error;

        // Check if the user needs to verify their email
        if (data?.user && !data.user.email_confirmed_at) {
          router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }

        // Success - wait for redirect effect
        // Don't set isLoading(false)
      } else {
        await signInWithEmail(email, password);
        // Success - wait for redirect effect
        // Don't set isLoading(false)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  if (showLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex mt-20 justify-center bg-[color:var(--background)] px-4">
      <div className="w-full max-w-md">
        <LoginForm
          onSubmit={handleSubmit}
          onGoogleSignIn={signInWithGoogle}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </div>
  );
} 
