import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DistributorDashboardView } from "@/components/dashboard/distributor-dashboard-view";
import { auth } from "@/lib/auth";
import { keycloakSignInPath } from "@/lib/auth-sign-in";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect(keycloakSignInPath("/"));
  }

  if (session.user.type === "distributor") {
    return <DistributorDashboardView />;
  }

  return <DashboardView />;
}
