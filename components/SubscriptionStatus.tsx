import { useSubscription } from '@/hooks/useSubscription';
import { useRouter } from 'next/navigation';

export function SubscriptionStatus() {
  const { subscription, isLoading, error } = useSubscription();
  const router = useRouter();

  if (isLoading) {
    return <div className="animate-pulse text-muted">Checking subscription status...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error checking subscription: {error}</div>;
  }

  if (subscription?.status === 'active' || subscription?.status === 'trialing') {
    return (
      <div className="text-center space-y-4">
        <div className="rounded-lg bg-green-100 p-4 text-green-800">
          You have an active subscription!
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="btn-primary rounded-lg px-6 py-2 text-white"
        >
          View Subscription Details
        </button>
      </div>
    );
  }

  return null;
} 