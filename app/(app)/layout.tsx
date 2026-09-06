import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { requireClinic } from '@/lib/auth/tenant';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { clinic, profile } = await requireClinic();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar clinicName={clinic.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={profile.email} role={profile.role} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
