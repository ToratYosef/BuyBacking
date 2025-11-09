import Link from 'next/link';

export const metadata = {
  title: 'Cart | BuyBacking',
};

export default function CartPage() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-4xl space-y-6 px-6">
        <h1 className="text-3xl font-semibold text-slate-900">Your cart</h1>
        <p className="text-slate-600">Device selections from the quote flow appear here ready for checkout.</p>
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          Cart persistence is wired via Firestore in `orders` and local storage in the client cart store. Add a device from the
          <Link href="/sell" className="text-brand underline"> sell flow </Link>
          to populate this section.
        </div>
        <div className="flex justify-end">
          <Link
            href="/checkout"
            className="inline-flex items-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Proceed to checkout
          </Link>
        </div>
      </div>
    </section>
  );
}
