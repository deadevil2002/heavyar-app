import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      <Sidebar />
      <main className="flex-1 md:ms-64 min-w-0 pt-16 md:pt-0 h-[100dvh] overflow-y-auto overflow-x-hidden">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
