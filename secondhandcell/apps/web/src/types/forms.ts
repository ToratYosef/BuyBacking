export type ContactFormState =
  | { status: 'idle'; errors?: undefined; message?: undefined }
  | { status: 'success'; errors?: undefined; message?: string }
  | { status: 'error'; errors?: Partial<Record<'name' | 'email' | 'message', string>>; message?: string };

export type ContactFormAction = (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;

export type QuoteFormState =
  | { status: 'idle'; errors?: undefined; id?: undefined; message?: undefined }
  | { status: 'success'; id: string; message?: string; errors?: undefined }
  | { status: 'error'; message?: string; errors?: Partial<Record<string, string>> };

export type QuoteFormAction = (state: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
