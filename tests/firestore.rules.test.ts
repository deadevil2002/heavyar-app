import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';

let env: RulesTestEnvironment;
const projectId = 'heavyar-rules-test';
const request = {
  equipmentId: 'equipment-1',
  customerUid: 'customer-1',
  providerUid: 'provider-1',
  status: 'pending',
  requestMode: 'fixed_days',
  numberOfDays: 2,
  startDate: '2026-01-10',
  endDate: '2026-01-12',
  notes: '',
  amount: 200,
  platformFee: 20,
  providerAmount: 180,
  paymentStatus: 'unpaid',
  paymentId: '',
  paidAt: null,
  currency: 'SAR',
  allowChat: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function authed(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/provider-1'), {
      uid: 'provider-1', role: 'provider', isVerified: true, crVerified: false,
      nameAr: 'Provider', nameEn: 'Provider', avatar: '',
    });
    await setDoc(doc(db, 'users/provider-2'), {
      uid: 'provider-2', role: 'provider', isVerified: true, crVerified: false,
      nameAr: 'Provider 2', nameEn: 'Provider 2', avatar: '',
    });
    await setDoc(doc(db, 'users/customer-1'), {
      uid: 'customer-1', role: 'customer', isVerified: false, crVerified: false,
      nameAr: 'Customer', nameEn: 'Customer', avatar: '',
    });
    await setDoc(doc(db, 'equipment/equipment-1'), {
      ownerUid: 'provider-1', ownerPublic: { uid: 'provider-1', nameAr: 'Provider', nameEn: 'Provider', avatar: '' },
      pricePerDay: 100,
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'equipment/equipment-2'), {
      ownerUid: 'provider-2', pricePerDay: 100, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'equipment/hidden-listing'), {
      ownerUid: 'provider-1', pricePerDay: 100, isActive: false, moderationStatus: 'hidden',
      createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'equipmentRequests/request-1'), request);
    await setDoc(doc(db, 'equipmentRequests/closed'), { ...request, status: 'completed' });
    await setDoc(doc(db, 'equipmentRequests/other'), { ...request, customerUid: 'other-customer' });
    await setDoc(doc(db, 'invoices/invoice-1'), {
      requestId: 'request-1', customerId: 'customer-1', providerId: 'provider-1',
    });
    await setDoc(doc(db, 'payments/payment-1'), {
      requestId: 'request-1', customerUid: 'customer-1', providerUid: 'provider-1',
      status: 'processing', amount: 220, currency: 'SAR',
    });
    await setDoc(doc(db, 'paymentQuotes/quote-1'), {
      requestId: 'request-1', amount: 220, currency: 'SAR',
    });
    await setDoc(doc(db, 'paymentEvents/event-1'), {
      requestId: 'request-1', type: 'processing', createdAt: new Date(),
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 18081,
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
  await seed();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

afterAll(async () => env?.cleanup());

describe('Firestore authorization baseline', () => {
  it('denies role escalation and protected profile fields', async () => {
    const db = authed('customer-1');
    await assertFails(setDoc(doc(db, 'users/customer-1'), {
      uid: 'customer-1', role: 'provider', nameAr: 'x',
    }));
    await assertFails(updateDoc(doc(db, 'users/customer-1'), { role: 'provider' }));
    await assertFails(updateDoc(doc(db, 'users/customer-1'), { rating: 5, crVerified: true }));
    await assertFails(setDoc(doc(db, 'users/new-user'), { uid: 'new-user', role: 'customer' }));
    await assertSucceeds(updateDoc(doc(db, 'users/customer-1'), { crNumber: '1234567890' }));
    await assertFails(updateDoc(doc(db, 'users/customer-1'), { isVerified: true }));
  });

  it('allows an approved provider listing and valid participant request snapshots', async () => {
    const provider = authed('provider-1');
    await assertSucceeds(setDoc(doc(provider, 'equipment/new-listing'), {
      ownerUid: 'provider-1', ownerPublic: { uid: 'provider-1', nameAr: 'Provider', nameEn: 'Provider', avatar: '' },
      titleAr: 'معدات', titleEn: 'Equipment', descriptionAr: '', descriptionEn: '',
      category: 'other', region: 'Riyadh', city: 'Riyadh', customCity: '', district: '',
      location: { lat: 24, lng: 46 }, pricePerDay: 100, images: [],
      availability: true, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    }));
    await assertSucceeds(setDoc(doc(authed('customer-1'), 'equipmentRequests/new-request'), {
      ...request, customerPublic: { uid: 'customer-1', nameAr: 'Customer', nameEn: 'Customer', avatar: '' },
      providerPublic: { uid: 'provider-1', nameAr: 'Provider', nameEn: 'Provider', avatar: '' },
    }));
    await assertFails(setDoc(doc(authed('customer-1'), 'equipmentRequests/forged'), {
      ...request, providerPublic: { uid: 'provider-1', nameAr: 'Forged', nameEn: 'Provider', avatar: '' },
    }));
    await assertFails(setDoc(doc(authed('customer-1'), 'equipmentRequests/underpriced'), {
      ...request, amount: 1, platformFee: 0, providerAmount: 1,
    }));
    const { numberOfDays: _days, ...openEndedRequest } = request;
    await assertSucceeds(setDoc(doc(authed('customer-1'), 'equipmentRequests/open-ended'), {
      ...openEndedRequest, requestMode: 'open_ended', amount: 100, platformFee: 0, providerAmount: 0,
    }));
  });

  it('blocks suspended accounts and moderated listings on direct client paths', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/provider-1'), { suspensionStatus: 'temporarily_suspended' });
    });
    const provider = authed('provider-1');
    await assertFails(setDoc(doc(provider, 'equipment/suspended-owner-listing'), {
      ownerUid: 'provider-1', pricePerDay: 100, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    }));
    await assertFails(updateDoc(doc(provider, 'equipment/equipment-1'), { titleEn: 'blocked', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(provider, 'equipment/hidden-listing'), { isActive: true, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(authed('customer-1'), 'equipmentRequests/hidden-request'), {
      ...request, equipmentId: 'hidden-listing',
    }));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/provider-1'), { suspensionStatus: null });
      await updateDoc(doc(context.firestore(), 'equipment/equipment-1'), { moderationStatus: 'suspended', isActive: false });
    });
    await assertFails(setDoc(doc(authed('customer-1'), 'equipmentRequests/suspended-request'), {
      ...request, equipmentId: 'equipment-1',
    }));
  });

  it('blocks suspended deletes and chat/rating writes for suspended participants or moderated listings', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'equipmentRequests/request-1'), { allowChat: true });
      await updateDoc(doc(db, 'users/customer-1'), { suspensionStatus: 'temporarily_suspended' });
      await updateDoc(doc(db, 'users/provider-1'), { suspensionStatus: 'temporarily_suspended' });
    });
    await assertFails(deleteDoc(doc(authed('provider-1'), 'equipment/equipment-1')));
    await assertFails(setDoc(doc(authed('customer-1'), 'equipmentRequests/request-1/messages/suspended'), {
      requestId: 'request-1', senderUid: 'customer-1', text: 'blocked', createdAt: new Date(), read: false,
    }));
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'users/customer-1'), { suspensionStatus: null });
      await updateDoc(doc(db, 'users/provider-1'), { suspensionStatus: null });
      await updateDoc(doc(db, 'equipment/equipment-1'), { moderationStatus: 'hidden', isActive: false });
    });
    await assertFails(setDoc(doc(authed('provider-1'), 'equipmentRequests/request-1/messages/moderated'), {
      requestId: 'request-1', senderUid: 'provider-1', text: 'blocked', createdAt: new Date(), read: false,
    }));
    await assertFails(setDoc(doc(authed('customer-1'), 'ratings/rating-moderated'), {
      requestId: 'closed', fromUid: 'customer-1', toUid: 'provider-1', equipmentId: 'equipment-1',
      stars: 5, comment: 'blocked', createdAt: new Date(),
    }));
  });

  it('denies arbitrary payment, invoice, and final amount writes', async () => {
    const db = authed('provider-1');
    await assertFails(updateDoc(doc(db, 'equipmentRequests/request-1'), { paymentStatus: 'paid' }));
    await assertFails(updateDoc(doc(db, 'equipmentRequests/request-1'), { finalAmount: 1 }));
    await assertFails(setDoc(doc(db, 'invoices/new'), { requestId: 'request-1' }));
    await assertFails(setDoc(doc(db, 'payments/new'), { requestId: 'request-1', amount: 1 }));
    await assertFails(updateDoc(doc(db, 'paymentQuotes/quote-1'), { amount: 1 }));
    await assertFails(setDoc(doc(db, 'providerConfigs/tap'), { publishableKey: 'not-a-secret' }));
    await assertFails(setDoc(doc(db, 'paymentIdempotency/key'), { requestId: 'request-1' }));
    await assertFails(setDoc(doc(db, 'invoiceCounters/2026'), { next: 1 }));
    await assertFails(setDoc(doc(db, 'adminAudit/audit-1'), { action: 'user_suspended' }));
    await assertFails(setDoc(doc(db, 'refunds/refund-1'), { requestId: 'request-1', state: 'refund_requested' }));
    await assertFails(setDoc(doc(db, 'refundReservations/request-1'), { refundId: 'refund:request-1' }));
    await assertFails(setDoc(doc(db, 'complaints/complaint-1'), { requestId: 'request-1', status: 'open' }));
    await assertFails(setDoc(doc(db, 'verificationCases/case-1'), { uid: 'provider-1', status: 'approved' }));
    await assertFails(setDoc(doc(db, 'verificationProfiles/provider-1'), { uid: 'provider-1', identity: { status: 'verified' } }));
    await assertFails(setDoc(doc(db, 'verificationAttempts/attempt-1'), { uid: 'provider-1', correlationId: 'guessable', status: 'verified' }));
    await assertFails(setDoc(doc(db, 'verificationEvents/event-1'), { uid: 'provider-1', type: 'verification_completed' }));
    await assertFails(setDoc(doc(db, 'verificationPolicies/default'), { enabled: false }));
    await assertFails(setDoc(doc(db, 'verificationRateLimits/provider-1'), { count: 0 }));
    await assertFails(setDoc(doc(db, 'heavyarConfig/pricing'), { platformFeeRate: 0.1 }));
  });

  it('prevents a direct provider acceptance from bypassing an enabled identity policy', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'verificationPolicies/default'), {
        enabled: true, requireCustomerIdentityVerification: true,
        verificationRequiredAboveAmountSAR: null, verificationRequiredForHighRiskEquipment: false,
        verificationRequiredForSpecificRequestTypes: [],
      });
    });
    await assertFails(updateDoc(doc(authed('provider-1'), 'equipmentRequests/request-1'), {
      status: 'accepted', allowChat: true, updatedAt: serverTimestamp(),
    }));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'verificationProfiles/customer-1'), {
        uid: 'customer-1', identity: { status: 'verified' },
      });
    });
    await assertSucceeds(updateDoc(doc(authed('provider-1'), 'equipmentRequests/request-1'), {
      status: 'accepted', allowChat: true, updatedAt: serverTimestamp(),
    }));
  });

  it('restricts request, chat, and invoice reads to authorized participants', async () => {
    await assertSucceeds(getDoc(doc(authed('customer-1'), 'equipmentRequests/request-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'equipmentRequests/request-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'invoices/invoice-1')));
    await assertSucceeds(getDoc(doc(authed('customer-1'), 'invoices/invoice-1')));
    await assertSucceeds(getDoc(doc(authed('provider-1'), 'invoices/invoice-1')));
    await assertSucceeds(getDoc(doc(authed('customer-1'), 'payments/payment-1')));
    await assertSucceeds(getDoc(doc(authed('provider-1'), 'paymentQuotes/quote-1')));
    await assertSucceeds(getDoc(doc(authed('customer-1'), 'paymentEvents/event-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'payments/payment-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'paymentQuotes/quote-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'paymentEvents/event-1')));
    await assertFails(getDoc(doc(authed('customer-1'), 'providerConfigs/tap')));
    await assertFails(getDoc(doc(authed('customer-1'), 'verificationAttempts/attempt-1')));
    await assertFails(getDoc(doc(authed('customer-1'), 'verificationProfiles/customer-1')));
    await assertFails(getDoc(doc(authed('outsider'), 'equipmentRequests/request-1/messages/m')));
  });

  it('enforces participant queries rather than broad collection reads', async () => {
    const customer = authed('customer-1');
    const scoped = query(collection(customer, 'equipmentRequests'), where('customerUid', '==', 'customer-1'));
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(collection(customer, 'equipmentRequests')));
  });

  it('allows only provider acceptance and exact lifecycle transitions', async () => {
    const provider = authed('provider-1');
    await assertSucceeds(updateDoc(doc(provider, 'equipmentRequests/request-1'), {
      status: 'accepted', allowChat: true, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(authed('customer-1'), 'equipmentRequests/request-1'), {
      status: 'in_progress', allowChat: true, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(provider, 'equipmentRequests/request-1'), {
      status: 'in_progress', allowChat: true, updatedAt: serverTimestamp(),
    }));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'equipmentRequests/request-1'), {
        status: 'in_progress', allowChat: true, startedAt: new Date(),
      });
    });
    await assertSucceeds(updateDoc(doc(provider, 'equipmentRequests/request-1'), {
      status: 'completion_requested', allowChat: true, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(provider, 'equipmentRequests/request-1'), {
      status: 'completed', allowChat: false, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(authed('customer-1'), 'equipmentRequests/request-1'), {
      status: 'completed', allowChat: false, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(provider, 'equipmentRequests/request-1'), {
      status: 'cancelled', allowChat: false, updatedAt: serverTimestamp(),
    }));
  });
});