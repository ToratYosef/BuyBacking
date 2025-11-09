export const metadata = {
  title: 'Admin | Settings',
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Platform settings</h2>
        <p className="text-sm text-slate-500">Configure notification webhooks, payout defaults, and access control.</p>
      </header>
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin users</h3>
        <p className="mt-2 text-sm text-slate-600">
          Manage the <code className="mx-1 rounded bg-slate-100 px-1">ADMIN_ALLOWED_EMAILS</code> environment variable or set
          custom claims using Firebase Admin SDK.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Email templates</h3>
        <p className="mt-2 text-sm text-slate-600">Store SendGrid template IDs in Firestore under <code className="mx-1 rounded bg-slate-100 px-1">settings/company</code>.</p>
      </section>
    </div>
  );
}
