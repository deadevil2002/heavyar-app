import { Mail, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';

const SUPPORT_EMAIL = 'heavyar.official@gmail.com';
const WHATSAPP_URL = 'https://wa.me/966570758881';

export type PublicPageKind = 'privacy' | 'terms' | 'support' | 'account-deletion';

const content: Record<Exclude<PublicPageKind, 'support' | 'account-deletion'>, {
  title: string;
  intro: string;
  sections: Array<{ title: string; items: string[] }>;
}> = {
  privacy: {
    title: 'سياسة الخصوصية – Heavyar',
    intro: 'نحترم خصوصيتك ونلتزم بحماية بياناتك وفق أفضل الممارسات الملائمة للسوق السعودي ولأنظمة المتاجر.',
    sections: [
      { title: '1) البيانات التي نجمعها', items: ['الاسم، رقم الجوال، البريد الإلكتروني', 'بيانات الحساب والموقع التقريبي', 'بيانات الاستخدام داخل التطبيق والسجلات الفنية'] },
      { title: '2) استخدام البيانات', items: ['تشغيل وتحسين الخدمة', 'معالجة الطلبات والمدفوعات وإصدار الفواتير', 'التواصل مع المستخدمين بشأن الطلبات والتحديثات الهامة'] },
      { title: '3) مشاركة البيانات', items: ['لا يتم بيع البيانات لأي طرف ثالث', 'قد نشارك بيانات محدودة مع مزودي الخدمات (الدفع/الاستضافة) بما يلزم لتقديم الخدمة'] },
      { title: '4) الحماية', items: ['نستخدم تقنيات حماية مناسبة للحفاظ على سرية وأمان بيانات المستخدمين.'] },
      { title: '5) الصور والملفات', items: ['نطلب إذن الوصول للصور فقط عند الحاجة إلى رفع صور المعدات أو الصورة الشخصية', 'لا نصل إلى أي ملفات بدون موافقة المستخدم'] },
      { title: '6) الإشعارات', items: ['قد تُرسل إشعارات متعلقة بالطلبات أو التحديثات الهامة ويمكن التحكم بها من الإعدادات.'] },
      { title: '7) حقوق المستخدم', items: ['يحق للمستخدم طلب حذف حسابه وبياناته وفق الإجراءات المتاحة داخل التطبيق.'] },
      { title: '8) التواصل', items: [`لأي استفسار: ${SUPPORT_EMAIL}`] },
    ],
  },
  terms: {
    title: 'الشروط والأحكام – Heavyar',
    intro: 'باستخدامك لتطبيق Heavyar فإنك توافق على الالتزام بهذه الشروط. Heavyar منصة وسيطة تربط بين مقدمي خدمات تأجير المعدات والعملاء، ولا تعتبر طرفًا مباشرًا في أي عقد إيجار يتم بين الطرفين.',
    sections: [
      { title: '1) طبيعة المنصة', items: ['Heavyar تعمل كوسيط تقني لعرض المعدات والخدمات وتسهيل التواصل والدفع داخل التطبيق وفق سياسات المنصة. العلاقة التعاقدية النهائية تتم بين مقدم الخدمة والعميل.'] },
      { title: '2) مسؤولية المستخدم', items: ['يتحمل مقدم الخدمة مسؤولية صحة المعلومات والأسعار ومطابقة المعدات للمواصفات المعلن عنها.', 'يتحمل العميل مسؤولية الاستخدام النظامي والآمن للمعدات والتقيد بتعليمات السلامة.', 'يمنع استخدام المنصة لأي نشاط مخالف لأنظمة المملكة العربية السعودية.'] },
      { title: '3) الدفع والعمولات', items: ['يتم خصم عمولة تشغيل قدرها 10% من قيمة كل عملية تتم عبر المنصة.', 'تشمل العمولة تكاليف التشغيل والصيانة والاستضافة والدعم الفني.', 'يحق للمنصة تعديل نسبة العمولة مستقبلاً مع إشعار المستخدمين قبل سريانها.'] },
      { title: '4) الإلغاء والاسترجاع', items: ['تخضع سياسات الإلغاء للاتفاق بين العميل ومقدم الخدمة ضمن حدود النظام.', 'لا تتحمل المنصة مسؤولية أي نزاع مالي خارج نظام الدفع داخل التطبيق.'] },
      { title: '5) الحسابات', items: ['يحق للمنصة إيقاف أو حذف أي حساب مخالف لشروط الاستخدام دون إشعار مسبق.', 'يمنع إنشاء حسابات وهمية أو استخدام بيانات غير صحيحة.'] },
      { title: '6) المسؤولية القانونية', items: ['المنصة غير مسؤولة عن أي أضرار ناتجة عن استخدام المعدات أو سوء الاستخدام.', 'جميع العمليات تتم على مسؤولية الأطراف المتعاقدة وبما يتفق مع الأنظمة.'] },
      { title: '7) التعديلات', items: ['يحق للمنصة تعديل هذه الشروط في أي وقت، ويعد استمرار الاستخدام موافقة ضمنية على التعديلات.'] },
    ],
  },
};

function PublicShell({ title, children, dir = 'rtl' }: { title: string; children: ReactNode; dir?: 'rtl' | 'ltr' }) {
  return (
    <main dir={dir} className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6 shadow-lg sm:p-10">
        <header className="mb-8 border-b border-border pb-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Heavyar</p>
          <h1 className="text-3xl font-bold leading-tight">{title}</h1>
        </header>
        {children}
      </article>
    </main>
  );
}

function PolicyPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const page = content[kind];
  return (
    <PublicShell title={page.title}>
      <p className="mb-8 text-base leading-8 text-muted-foreground">{page.intro}</p>
      <div className="space-y-7">
        {page.sections.map(section => (
          <section key={section.title} aria-labelledby={section.title}>
            <h2 id={section.title} className="mb-2 text-lg font-semibold">{section.title}</h2>
            <ul className="list-disc space-y-2 ps-6 text-base leading-8 text-muted-foreground">
              {section.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </PublicShell>
  );
}

export function SupportPage() {
  return (
    <PublicShell title="Heavyar Support" dir="ltr">
      <p className="mb-8 text-base leading-8 text-muted-foreground">Contact Heavyar using the official support channels below.</p>
      <div className="space-y-4">
        <a className="flex items-center gap-3 rounded-md border border-border p-4 hover:bg-muted" href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail aria-hidden="true" className="text-primary" />
          <span>{SUPPORT_EMAIL}</span>
        </a>
        <a className="flex items-center gap-3 rounded-md border border-border p-4 hover:bg-muted" href={WHATSAPP_URL} rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" className="text-primary" />
          <span>WhatsApp: +966 57 075 8881</span>
        </a>
      </div>
    </PublicShell>
  );
}

export function AccountDeletionPage() {
  return (
    <PublicShell title="Heavyar Account Deletion" dir="ltr">
      <p className="mb-6 text-base leading-8 text-muted-foreground">
        Heavyar users can initiate account deletion from the Profile screen in the Heavyar mobile app.
      </p>
      <p className="mb-6 text-base leading-8 text-muted-foreground">
        If you cannot access the app, contact Heavyar support using the official email below and include the email address or phone number associated with your account so we can verify the request.
      </p>
      <a className="inline-flex rounded-md border border-primary px-4 py-3 font-medium text-primary hover:bg-primary/10" href={`mailto:${SUPPORT_EMAIL}?subject=Heavyar%20account%20deletion`}>
        Contact Heavyar support
      </a>
    </PublicShell>
  );
}

export default function PublicPage({ kind }: { kind: PublicPageKind }) {
  if (kind === 'support') return <SupportPage />;
  if (kind === 'account-deletion') return <AccountDeletionPage />;
  return <PolicyPage kind={kind} />;
}