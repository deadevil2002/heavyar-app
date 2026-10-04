import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi, type PaginatedResponse } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ComplianceSummary = {
  resources: string[];
  regulatoryCatalogue: { version: string; entries: Array<Record<string, unknown>> };
  driverCredentialFramework: { version: string; enabled: boolean; capabilityGate: string };
  privacyBoundary: { governmentId: boolean; ibanBankAccount: boolean; rawCardCvv: boolean; nafathEnabled: boolean };
  evidence: Array<{ evidenceType: string; issuedAt: string; classification: string }>;
};

const endpoints: Record<string, string> = {
  policyAcceptances: '/policy-acceptances', deletionRequests: '/deletion-requests', privacyRequests: '/privacy-requests',
  complaints: '/complaints', refunds: '/refunds', incidents: '/incidents', moderationCases: '/moderation-cases', adminAudit: '/audit',
};
const transitionActions: Record<string, { action: string; statuses: string[] }> = {
  privacyRequests: { action: 'transition_privacy_request', statuses: ['identity_verification', 'under_review', 'awaiting_user', 'completed', 'rejected', 'cancelled'] },
  complaints: { action: 'transition_complaint', statuses: ['acknowledged', 'under_review', 'awaiting_customer', 'awaiting_provider', 'awaiting_driver', 'resolved', 'closed', 'escalated'] },
  refunds: { action: 'transition_refund_case', statuses: ['under_review', 'approved_pending_execution', 'manual_execution_required', 'executed', 'failed', 'rejected', 'cancelled'] },
  incidents: { action: 'transition_incident', statuses: ['acknowledged', 'under_review', 'awaiting_evidence', 'referred_to_authority', 'resolved', 'closed'] },
};

export default function Compliance() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [resource, setResource] = useState('policyAcceptances');
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ['compliance-summary'], queryFn: () => fetchApi<ComplianceSummary>('/compliance/summary') });
  const records = useQuery({ queryKey: ['compliance-resource', resource], queryFn: () => fetchApi<PaginatedResponse<Record<string, unknown>>>(endpoints[resource] || '/policy-acceptances') });
  const transition = useMutation({ mutationFn: (value: { item: Record<string, unknown>; status: string }) => {
    const config = transitionActions[resource];
    const reason = window.prompt(t('سبب/ملاحظة القرار (مطلوب للقرارات النهائية)', 'Decision reason/note (required for final decisions)')) || '';
    const providerEvidenceReference = value.status === 'executed' ? window.prompt(t('مرجع إثبات مزود الدفع', 'Payment-provider evidence reference')) || '' : undefined;
    const eligibleAmount = ['approved_pending_execution', 'manual_execution_required'].includes(value.status) ? Number(window.prompt(t('المبلغ المؤهل', 'Eligible amount')) || NaN) : undefined;
    return fetchApi('/action', { method: 'POST', body: JSON.stringify({ action: config.action, targetType: resource === 'refunds' ? 'refund' : resource === 'complaints' ? 'complaint' : resource === 'incidents' ? 'incident' : 'privacyRequest', targetId: value.item.id, status: value.status, reason, providerEvidenceReference, eligibleAmount }) });
  }, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['compliance-resource', resource] }) });
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">{t('الامتثال التشغيلي', 'Operational Compliance')}</h1><p className="mt-1 text-muted-foreground">{t('قراءة سجلات الامتثال المصرح بها بدون أسرار أو بيانات دفع حساسة.', 'Authorized compliance records without secrets or sensitive payment data.')}</p></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">{t('حدود الخصوصية', 'Privacy boundary')}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div>Government ID <Badge variant="outline">NO</Badge></div><div>IBAN / bank <Badge variant="outline">NO</Badge></div><div>Raw card / CVV <Badge variant="outline">NO</Badge></div><div>Nafath <Badge variant="outline">OFF</Badge></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">{t('الكتالوج التنظيمي', 'Regulatory catalogue')}</CardTitle></CardHeader><CardContent><div className="font-mono text-sm">{summary.data?.regulatoryCatalogue.version || '—'}</div><p className="mt-2 text-sm text-muted-foreground">{t('الأنشطة غير المعروفة تفشل مغلقة.', 'Unknown activities fail closed.')}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">{t('بيانات اعتماد السائق', 'Driver credentials')}</CardTitle></CardHeader><CardContent><Badge variant="secondary">{summary.data?.driverCredentialFramework.enabled ? 'ENABLED' : 'CURRENT RELEASE: DISABLED'}</Badge><p className="mt-2 text-sm text-muted-foreground">{summary.data?.driverCredentialFramework.capabilityGate || '—'}</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base">{t('دليل التسجيل الوطني', 'National register evidence')}</CardTitle></CardHeader><CardContent>{summary.data?.evidence.map(item => <div key={item.evidenceType} className="text-sm"><div className="font-medium">{item.evidenceType}</div><div className="text-muted-foreground">{item.issuedAt} · {item.classification}</div></div>) || <span>—</span>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">{t('السجلات', 'Records')}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{Object.keys(endpoints).map(key => <Button key={key} size="sm" variant={resource === key ? 'default' : 'outline'} onClick={() => setResource(key)}>{key}</Button>)}</div>
      {records.isLoading ? <p>{t('جاري التحميل…', 'Loading…')}</p> : records.error ? <p role="alert" className="text-destructive">{t('تعذر تحميل السجلات.', 'Could not load records.')}</p> : <div className="space-y-2">{(records.data?.items || []).length === 0 ? <p className="text-muted-foreground">{t('لا توجد سجلات.', 'No records.')}</p> : (records.data?.items || []).map((item, index) => <details key={String(item.id || index)} className="rounded-md border p-3"><summary className="cursor-pointer font-mono text-sm">{String(item.id || `${resource}-${index + 1}`)}</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(item, null, 2)}</pre>{transitionActions[resource] && <div className="mt-3 flex flex-wrap gap-2">{transitionActions[resource].statuses.map(status => <Button key={status} size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ item, status })}>{status}</Button>)}</div>}</details>)}</div>}
    </CardContent></Card>
  </div>;
}
