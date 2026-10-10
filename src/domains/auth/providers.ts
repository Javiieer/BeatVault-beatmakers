export type AuthProvider = 'email-password' | 'google' | 'whatsapp'
export interface ExternalAuthProvider { readonly kind: AuthProvider; begin(): Promise<never> }
