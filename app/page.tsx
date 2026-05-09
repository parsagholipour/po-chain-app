import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DistributorDashboardView } from "@/components/dashboard/distributor-dashboard-view";
import { AuthControls } from "@/components/auth-controls";
import { APP_NAME } from "@/lib/app-name";
import { auth } from "@/lib/auth";
import { logoHueRotateFilterStyle, DEFAULT_STORE_THEME } from "@/lib/store-theme";
import Image from "next/image";

function SignInHome() {
  return (
    <div className="grid min-h-[calc(100dvh-10rem)] place-items-center px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-border/80 bg-card p-6 text-center shadow-sm">
        <div
          className="mx-auto mb-5 flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-background"
          style={logoHueRotateFilterStyle(DEFAULT_STORE_THEME.logoHueRotateDeg)}
        >
          <Image
            src="/logo.png"
            alt=""
            width={64}
            height={64}
            className="size-14 object-contain"
            preload
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">Welcome back</p>
        </div>
        <div className="mt-6">
          <AuthControls
            signInVariant="default"
            signInSize="lg"
            signInClassName="h-10 w-full"
          />
        </div>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    return <SignInHome />;
  }

  if (session.user.type === "distributor") {
    return <DistributorDashboardView />;
  }

  return <DashboardView />;
}
