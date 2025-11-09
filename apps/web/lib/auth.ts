'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { getFirebaseAuth } from './firebaseClient';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, loading };
}

export async function emailPasswordSignIn(email: string, password: string) {
  const auth = getFirebaseAuth();
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function getCurrentUser(): Promise<{ email: string } | null> {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;
  if (current?.email) {
    return { email: current.email };
  }
  return null;
}
