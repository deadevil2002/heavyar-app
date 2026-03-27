export type Language = 'ar' | 'en';

export type RequestStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'pending_payment' | 'paid' | 'failed' | 'refunded';

export type InvoiceStatus = 'paid' | 'pending' | 'refunded';

export type UserRole = 'customer' | 'provider';

export interface User {
  uid: string;
  nameAr: string;
  nameEn: string;
  email: string;
  phone: string;
  avatar: string;
  city: string;
  role: UserRole;
  crNumber: string;
  crVerified: boolean;
  rating: number;
  totalRatings: number;
  equipmentCount: number;
  joinedAt: string;
  isVerified: boolean;
}

export interface CloudinaryImage {
  url: string;
  publicId: string;
}

export type EquipmentImage = string | CloudinaryImage;

export interface Equipment {
  id: string;
  ownerUid: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  city: string;
  district: string;
  location: {
    lat: number;
    lng: number;
  };
  pricePerDay: number;
  images: EquipmentImage[];
  availability: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentRequest {
  id: string;
  equipmentId: string;
  customerUid: string;
  providerUid: string;
  status: RequestStatus;
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
  createdAt: string;
  updatedAt: string;
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
