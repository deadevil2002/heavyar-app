import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig';

export async function registerDeviceToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseDb();
  console.log('[FCM] Registering device token for uid:', uid);
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayUnion(token),
    lastTokenUpdate: new Date().toISOString(),
    platform: Platform.OS,
  });
  console.log('[FCM] Token registered');
}

export async function unregisterDeviceToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseDb();
  console.log('[FCM] Unregistering device token for uid:', uid);
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayRemove(token),
  });
  console.log('[FCM] Token unregistered');
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[FCM] Web push notifications not yet implemented');
    return null;
  }

  try {
    const { default: Constants } = await import('expo-constants');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.log('[FCM] No project ID found for push notifications');
      return null;
    }

    const Notifications = await import('expo-notifications');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[FCM] Notification permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[FCM] Push token obtained:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.log('[FCM] Error requesting notification permission:', error);
    return null;
  }
}

export interface NotificationTrigger {
  type: 'new_request' | 'request_accepted' | 'request_rejected' | 'new_message' | 'payment_received' | 'request_completed';
  targetUid: string;
  data: Record<string, string>;
}

export function buildNotificationPayload(trigger: NotificationTrigger): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  const payloads: Record<NotificationTrigger['type'], { title: string; body: string }> = {
    new_request: {
      title: 'طلب إيجار جديد',
      body: 'لديك طلب إيجار جديد. اضغط للمراجعة.',
    },
    request_accepted: {
      title: 'تم قبول طلبك',
      body: 'تم قبول طلب الإيجار الخاص بك.',
    },
    request_rejected: {
      title: 'تم رفض طلبك',
      body: 'تم رفض طلب الإيجار الخاص بك.',
    },
    new_message: {
      title: 'رسالة جديدة',
      body: 'لديك رسالة جديدة في المحادثة.',
    },
    payment_received: {
      title: 'تم استلام الدفعة',
      body: 'تم استلام الدفعة بنجاح.',
    },
    request_completed: {
      title: 'تم إكمال الطلب',
      body: 'تم إكمال طلب الإيجار. يمكنك الآن تقييم المزود.',
    },
  };

  return {
    ...payloads[trigger.type],
    data: trigger.data,
  };
}
