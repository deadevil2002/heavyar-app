import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isCampaignDeliveryActive,
  type CampaignProgress,
  type CampaignRecipient,
  useCampaignProgress,
  useCampaignRecipients,
} from './early-access';
import { fetchApi } from './api';

const appState = vi.hoisted(() => ({ language: 'en' as 'ar' | 'en' }));

vi.hoisted(() => {
  // React Query only installs browser polling timers in a browser-like runtime.
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
});

vi.mock('./api', () => ({
  fetchApi: vi.fn(),
  useAdminSession: () => ({ data: { role: 'admin' } }),
}));
vi.mock('@/lib/app-state', () => ({
  useAppState: () => ({ language: appState.language, direction: appState.language === 'ar' ? 'rtl' : 'ltr' }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { uid: 'admin', email: 'admin@example.test' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/error-messages', () => ({ userErrorMessage: () => 'Request failed' }));

vi.mock('@/components/ui/button', async () => {
  const React = await import('react');
  return { Button: ({ children, ...props }: any) => React.createElement('button', props, children) };
});
vi.mock('@/components/ui/input', async () => {
  const React = await import('react');
  return { Input: (props: any) => React.createElement('input', props) };
});
vi.mock('@/components/ui/label', async () => {
  const React = await import('react');
  return { Label: ({ children, ...props }: any) => React.createElement('label', props, children) };
});
vi.mock('@/components/ui/textarea', async () => {
  const React = await import('react');
  return { Textarea: (props: any) => React.createElement('textarea', props) };
});
vi.mock('@/components/ui/card', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('section', null, children);
  return { Card: Part, CardContent: Part, CardHeader: Part, CardTitle: Part };
});
vi.mock('@/components/ui/dialog', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { Dialog: Part, DialogContent: Part, DialogDescription: Part, DialogFooter: Part, DialogHeader: Part, DialogTitle: Part };
});
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { Select: Part, SelectContent: Part, SelectItem: Part, SelectTrigger: Part, SelectValue: Part };
});
vi.mock('@/components/ui/badge', async () => {
  const React = await import('react');
  return { Badge: ({ children }: any) => React.createElement('span', null, children) };
});
vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { Tabs: Part, TabsContent: Part, TabsList: Part, TabsTrigger: Part };
});
vi.mock('@/components/ui/alert-dialog', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { AlertDialog: Part, AlertDialogAction: Part, AlertDialogCancel: Part, AlertDialogContent: Part, AlertDialogDescription: Part, AlertDialogFooter: Part, AlertDialogHeader: Part, AlertDialogTitle: Part };
});
vi.mock('@/components/ui/checkbox', async () => {
  const React = await import('react');
  return { Checkbox: (props: any) => React.createElement('input', { type: 'checkbox', ...props }) };
});
vi.mock('@/components/ui/table', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { Table: Part, TableBody: Part, TableCell: Part, TableHead: Part, TableHeader: Part, TableRow: Part };
});
vi.mock('@/components/ui/alert', async () => {
  const React = await import('react');
  const Part = ({ children }: any) => React.createElement('div', null, children);
  return { Alert: Part, AlertDescription: Part };
});

import { CampaignEditor } from '../pages/early-access/campaign-editor';

const progressFixture = (
  status: CampaignProgress['status'],
  deliveryStatus: CampaignRecipient['deliveryStatus'],
): CampaignProgress => ({
  campaignId: 'fixture-campaign',
  status,
  audience: 1,
  finalRecipientCount: 1,
  finalRecipientIds: ['fixture-recipient'],
  originalAudience: 1,
  currentEligible: deliveryStatus === 'failed' ? 1 : 0,
  alreadySent: deliveryStatus === 'accepted' || deliveryStatus === 'delivered' ? 1 : 0,
  selectedNotSent: 0,
  selectedQueued: deliveryStatus === 'queued' ? 1 : 0,
  selectedAccepted: deliveryStatus === 'accepted' ? 1 : 0,
  selectedDelivered: deliveryStatus === 'delivered' ? 1 : 0,
  selectedFailed: deliveryStatus === 'failed' ? 1 : 0,
  selectedBounced: 0,
  selectedComplained: 0,
  selectedSuppressed: 0,
  selectedSkipped: 0,
  retryableFailed: deliveryStatus === 'failed' ? 1 : 0,
  notSent: 0,
  queued: deliveryStatus === 'queued' ? 1 : 0,
  accepted: deliveryStatus === 'accepted' ? 1 : 0,
  delivered: deliveryStatus === 'delivered' ? 1 : 0,
  failed: deliveryStatus === 'failed' ? 1 : 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  skipped: 0,
  remaining: deliveryStatus === 'failed' || deliveryStatus === 'delivered' ? 0 : 1,
  completedAt: deliveryStatus === 'delivered' ? '2025-01-01T00:02:00.000Z' : null,
});

function CampaignDeliveryFixture() {
  const progress = useCampaignProgress('fixture-campaign');
  const recipients = useCampaignRecipients(
    'fixture-campaign',
    { limit: 50 },
    isCampaignDeliveryActive(progress.data),
  );

  return (
    <section aria-label="campaign delivery fixture">
      <output data-testid="progress-status">{progress.data?.status ?? 'loading'}</output>
      <output data-testid="recipient-status">
        {recipients.data?.items[0]?.deliveryStatus ?? 'loading'}
      </output>
    </section>
  );
}

async function flushQueries() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe('targeted open campaign live refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders queued → accepted → delivered automatically and stops at terminal', async () => {
    const statuses = ['queued', 'accepted', 'delivered'] as const;
    let progressCalls = 0;
    let recipientCalls = 0;

    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url.endsWith('/progress')) {
        const deliveryStatus = statuses[Math.min(progressCalls++, statuses.length - 1)];
        return progressFixture(deliveryStatus === 'delivered' ? 'sent' : 'queued', deliveryStatus);
      }
      if (url.includes('/recipients?')) {
        const deliveryStatus = statuses[Math.min(recipientCalls++, statuses.length - 1)];
        return {
          items: [{
            id: 'fixture-recipient',
            email: 'fixture@example.test',
            source: 'owner_qa',
            deliveryStatus,
            retryEligible: false,
            deliveredAt: deliveryStatus === 'delivered' ? '2025-01-01T00:02:00.000Z' : null,
          }],
        };
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
      },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <CampaignDeliveryFixture />
        </QueryClientProvider>,
      );
    });
    await flushQueries();

    const text = (testId: string) =>
      renderer.root.findByProps({ 'data-testid': testId }).children.join('');
    expect(text('recipient-status')).toBe('queued');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await flushQueries();
    expect({
      progress: text('progress-status'),
      recipient: text('recipient-status'),
      progressCalls,
      recipientCalls,
    }).toEqual({
      progress: 'queued',
      recipient: 'accepted',
      progressCalls: 2,
      recipientCalls: 2,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await flushQueries();
    expect(text('progress-status')).toBe('sent');
    expect(text('recipient-status')).toBe('delivered');

    const callsAtTerminal = {
      progress: progressCalls,
      recipients: recipientCalls,
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushQueries();
    expect({ progress: progressCalls, recipients: recipientCalls }).toEqual(callsAtTerminal);
    expect(vi.mocked(fetchApi).mock.calls.every(([, options]) =>
      options === undefined || options.method === undefined || options.method === 'GET'
    )).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
    queryClient.clear();
  });

  it('mounts CampaignEditor through queued → retryable failed → queued → accepted → delivered, then stops', async () => {
    const statuses = ['queued', 'failed', 'queued', 'accepted', 'delivered'] as const;
    let progressCalls = 0;
    let recipientCalls = 0;

    vi.mocked(fetchApi).mockImplementation(async (url: string) => {
      if (url.endsWith('/progress')) {
        const deliveryStatus = statuses[Math.min(progressCalls++, statuses.length - 1)];
        return {
          ...progressFixture(deliveryStatus === 'delivered' ? 'sent' : 'queued', deliveryStatus),
          // These whole-history counters remain active because of unselected old rows.
          queued: 1,
          accepted: 1,
        };
      }
      if (url.includes('/recipients?')) {
        const deliveryStatus = statuses[Math.min(recipientCalls++, statuses.length - 1)];
        return {
          items: [
            {
              id: 'fixture-recipient',
              email: 'selected@example.test',
              source: 'owner_qa',
              deliveryStatus,
              retryEligible: false,
              deliveredAt: deliveryStatus === 'delivered' ? '2025-01-01T00:02:00.000Z' : null,
            },
            {
              id: 'old-queued',
              email: 'old-queued@example.test',
              source: 'csv_import',
              deliveryStatus: 'queued',
              retryEligible: false,
            },
            {
              id: 'old-accepted',
              email: 'old-accepted@example.test',
              source: 'subscriber',
              deliveryStatus: 'accepted',
              retryEligible: false,
            },
          ],
        };
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const props = {
      campaignId: 'fixture-campaign',
      initialData: {
        id: 'fixture-campaign',
        name: 'Fixture',
        subjectAr: 'موضوع',
        subjectEn: 'Subject',
        bodyAr: 'نص',
        bodyEn: 'Body',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        status: 'queued',
      },
      onBack: vi.fn(),
      permissions: { read: true, manage: false, configure: false, testSend: false, approve: false, send: false },
      selectedIds: new Set<string>(),
    };
    let renderer!: ReactTestRenderer;
    appState.language = 'en';
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <CampaignEditor {...props} />
        </QueryClientProvider>,
      );
    });
    await flushQueries();
    expect(JSON.stringify(renderer.toJSON())).toContain('Campaign audience summary');
    expect(JSON.stringify(renderer.toJSON())).toContain('Queued');

    for (const expectedStatus of ['Failed', 'Queued', 'Accepted by email provider', 'Delivered']) {
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      await flushQueries();
      expect(JSON.stringify(renderer.toJSON())).toContain(expectedStatus);
    }
    const callsAtTerminal = { progressCalls, recipientCalls };

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await flushQueries();
    expect({ progressCalls, recipientCalls }).toEqual(callsAtTerminal);

    appState.language = 'ar';
    await act(async () => {
      renderer.update(
        <QueryClientProvider client={queryClient}>
          <CampaignEditor {...props} />
        </QueryClientProvider>,
      );
    });
    const arabic = JSON.stringify(renderer.toJSON());
    expect(arabic).toContain('ملخص جمهور الحملة');
    expect(arabic).toContain('تم التسليم');
    expect(vi.mocked(fetchApi).mock.calls.every(([, options]) =>
      options === undefined || options.method === undefined || options.method === 'GET'
    )).toBe(true);

    await act(async () => { renderer.unmount(); });
    queryClient.clear();
  });
});