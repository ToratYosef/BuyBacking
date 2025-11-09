'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../../lib/auth';

export function UserMenu() {
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    getCurrentUser().then((currentUser) => {
      if (isMounted) {
        setUser(currentUser);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!user) {
    return (
      <Link href="/account" className="rounded-md border border-brand px-4 py-2 text-sm font-semibold text-brand">
        Sign in
      </Link>
    );
  }

  return (
    <Link href="/account" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
      {user.email}
    </Link>
  );
}
