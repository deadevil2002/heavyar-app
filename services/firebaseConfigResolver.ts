export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type FirebaseConfigSource = Partial<FirebasePublicConfig> | undefined;

const REQUIRED_FIELDS: Array<keyof FirebasePublicConfig> = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

export function resolveFirebaseConfig(
  platform: 'web' | 'ios' | 'android',
  development: boolean,
  environment: FirebaseConfigSource,
  extra: FirebaseConfigSource,
): FirebasePublicConfig {
  const source = platform === 'web' || development
    ? { ...extra, ...environment }
    : { ...extra };

  for (const field of REQUIRED_FIELDS) {
    if (typeof source[field] !== 'string' || source[field].length === 0) {
      throw new Error(`[Firebase Config] Missing public field: ${field}`);
    }
  }
  if (source.projectId !== 'heavyar-app') {
    throw new Error('[Firebase Config] Refusing a non-Heavyar Firebase project');
  }
  return source as FirebasePublicConfig;
}