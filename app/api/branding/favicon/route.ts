import { buildStoreFaviconSvg } from "@/lib/branding/favicon-svg";
import { normalizeStoreTheme } from "@/lib/store-theme";
import { getSessionStoreContextBundle } from "@/lib/store-context";

export async function GET() {
  const { storeContext } = await getSessionStoreContextBundle();
  const shellTheme = normalizeStoreTheme(
    storeContext?.activeStore?.theme ?? null,
  );
  const svg = buildStoreFaviconSvg(shellTheme.primaryColor);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-cache",
    },
  });
}
