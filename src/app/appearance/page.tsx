import AppearanceEditor from "@/components/AppearanceEditor";
import PortalPublicSettings from "@/components/PortalPublicSettings";
import PublicTextsEditor from "@/components/PublicTextsEditor";

export default function AppearancePage() {
  return (
    <>
      <AppearanceEditor />
      <PortalPublicSettings />
      <PublicTextsEditor />
    </>
  );
}
