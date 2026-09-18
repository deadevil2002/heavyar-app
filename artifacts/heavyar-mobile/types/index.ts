export type Language = 'ar' | 'en';

export type RequestStatus = 'pending' | 'accepted' | 'in_progress' | 'completion_requested' | 'completed' | 'rejected' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'pending_payment' | 'paid' | 'failed' | 'refunded';
export type PaymentLifecycleStatus = 'pending' | 'requires_action' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'expired';

export type InvoiceStatus = 'paid' | 'pending' | 'refunded';

export type UserRole = 'customer' | 'provider' | 'driver';
export type GccCountryCode = 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM';

export type RequestMode = 'fixed_days' | 'open_ended';

export interface PublicUserSnapshot {
  uid: string;
  nameAr: string;
  nameEn: string;
  avatar: string;
}

export interface User {
  uid: string;
  nameAr: string;
  nameEn: string;
  email: string;
  phone: string;
  avatar: string;
  avatarPublicId?: string;
  region: string;
  city: string;
  customCity: string;
  role: UserRole;
  crNumber: string;
  crVerified: boolean;
  rating: number;
  totalRatings: number;
  equipmentCount: number;
  joinedAt: string;
  isVerified: boolean;
  countryCode?: GccCountryCode;
  nativeCurrency?: string;
  displayCurrency?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  phoneVerified?: boolean;
}

export interface CloudinaryImage {
  url: string;
  publicId: string;
}

export type EquipmentImage = string | CloudinaryImage;
export interface EquipmentAvailability {
  from: string;
  until?: string;
  blocked?: { from: string; until?: string }[];
  temporarilyUnavailable?: boolean;
}

export interface Equipment {
  id: string;
  /** Immutable Worker-issued operational identifier; Firestore `id` is unchanged. */
  publicEquipmentNumber?: string;
  ownerUid: string;
  ownerPublic?: PublicUserSnapshot;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  customCategory?: string;
  region: string;
  city: string;
  customCity: string;
  district: string;
  location: {
    lat: number;
    lng: number;
  };
  pricePerDay: number;
  images: EquipmentImage[];
  availability: boolean | EquipmentAvailability;
  isActive: boolean;
  visibility?: 'visible' | 'hidden' | 'archived';
  moderationStatus?: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  createdAt: string;
  updatedAt: string;
  countryCode?: GccCountryCode;
  nativeCurrency?: string;
  nativePricePerDay?: number;
  displayCurrency?: string;
  displayPricePerDay?: number;
  displayRate?: number;
  displayRateTimestamp?: string;
}

export interface EquipmentRequest {
  id: string;
  /** Immutable Worker-issued operational identifier; Firestore `id` is unchanged. */
  publicRequestNumber?: string;
  equipmentId: string;
  customerUid: string;
  customerPublic?: PublicUserSnapshot;
  providerUid: string;
  providerPublic?: PublicUserSnapshot;
  status: RequestStatus;
  requestMode?: RequestMode;
  numberOfDays?: number;
  startDate: string;
  endDate: string;
  notes: string;
  amount: number;
  platformFee: number;
  providerAmount: number;
  paymentStatus: PaymentStatus;
  paymentId: string;
  paidAt: string | null;
  currency: string;
  allowChat: boolean;
  pricePerDay?: number;
  startedAt?: string;
  endedAt?: string;
  finalAmount?: number;
  finalPlatformFee?: number;
  finalProviderAmount?: number;
  closedBy?: 'provider' | 'customer';
  createdAt: string;
  updatedAt: string;
  quoteCurrency?: string;
  exchangeRateSnapshot?: number;
  exchangeRateTimestamp?: string;
}

export interface ChatMessage {
  id: string;
  requestId: string;
  senderUid: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface Rating {
  id: string;
  requestId: string;
  fromUid: string;
  toUid: string;
  equipmentId: string;
  stars: number;
  comment: string;
  createdAt: string;
}

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  count: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  requestId: string;
  equipmentId: string;
  providerId: string;
  customerId: string;
  sellerName: string;
  buyerName: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  createdAt: string;
  paidAt: string;
  paymentReference: string;
}

export interface AppSettings {
  language: Language;
  notifications: boolean;
  hasSeenOnboarding: boolean;
}
