import { ModulePageGuard } from "@/lib/module-page-guard";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  return <ModulePageGuard eventId={(await params).id} modules={["planning"]}>{children}</ModulePageGuard>;
}
