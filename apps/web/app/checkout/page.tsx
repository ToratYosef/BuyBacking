import CheckoutForm from '../../components/orders/CheckoutForm';

export const metadata = {
  title: 'Checkout | BuyBacking',
};

export default function CheckoutPage() {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-4xl space-y-10 px-6">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">Complete your trade-in</h1>
          <p className="mt-2 text-slate-600">
            Choose your shipping preference, confirm payout method, and submit the order. Guest checkout is supported.
          </p>
        </header>
        <CheckoutForm />
      </div>
    </section>
  );
}
