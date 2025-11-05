import Image from 'next/image';
import Link from 'next/link';

type DeviceCardProps = {
  title: string;
  description: string;
  image: string;
  href: string;
};

export function DeviceCard({ title, description, image, href }: DeviceCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
    >
      <div className="relative h-56 w-full bg-slate-100">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(min-width: 1024px) 300px, (min-width: 768px) 33vw, 100vw"
          className="object-contain object-center p-6 transition group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-500">
          Explore offers
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
