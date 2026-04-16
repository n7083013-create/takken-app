interface PayjpElement {
  mount(selector: string): void;
  on(event: string, handler: (e: any) => void): void;
  unmount(): void;
}

interface PayjpElements {
  create(type: 'cardNumber' | 'cardExpiry' | 'cardCvc' | 'card', options?: object): PayjpElement;
  createToken(): Promise<{ error?: { message: string }; id?: string }>;
}

interface PayjpInstance {
  elements(): PayjpElements;
  createToken(element: PayjpElement): Promise<{ error?: { message: string }; token?: { id: string } }>;
}

interface Window {
  Payjp?: (key: string) => PayjpInstance;
}
