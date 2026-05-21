import { AppChromeClient } from "@/components/app-chrome-client";
import { normalizeStoreTheme } from "@/lib/store-theme";
import { getSessionStoreContextBundle } from "@/lib/store-context";

export async function AppChrome({ children }: { children: React.ReactNode }) {
  const { session, storeContext } = await getSessionStoreContextBundle();
  const activeStore = storeContext?.activeStore ?? null;
  const shellTheme = normalizeStoreTheme(activeStore?.theme ?? null);

  return (
    <AppChromeClient
      authenticated={Boolean(session?.user)}
      stores={storeContext?.stores ?? []}
      activeStoreId={activeStore?.id ?? null}
      activeStoreName={activeStore?.name ?? null}
      activeStoreLogoKey={activeStore?.logoKey ?? null}
      userType={storeContext?.userType ?? null}
      saleChannelName={storeContext?.saleChannelName ?? null}
      saleChannelType={storeContext?.saleChannelType ?? null}
      hasActiveStore={Boolean(activeStore)}
      shellTheme={shellTheme}
    >
      {children}
    </AppChromeClient>
  );
}
