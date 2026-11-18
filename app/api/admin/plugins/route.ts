import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission, type AdminSessionInfo } from "@/lib/auth";
import {
  PluginError,
  getPlugin,
  listPlugins,
  setPluginEnabled,
  setPluginSecrets,
  updatePluginConfig,
  type PluginPublicView,
} from "@/lib/plugins";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vista que sale por la API. Aunque `listPlugins` ya es pública, se vuelve
 * a filtrar campo a campo: un secreto nunca puede colarse en la respuesta
 * por un cambio futuro en la librería.
 */
function publicPlugin(plugin: PluginPublicView) {
  return {
    key: plugin.key,
    kind: plugin.kind,
    label: plugin.label,
    enabled: plugin.enabled,
    config: plugin.config,
    hasSecrets: plugin.hasSecrets,
    lastRotatedAt: plugin.lastRotatedAt,
    manifest: plugin.manifest,
  };
}

async function assertSettingsWrite(): Promise<
  { session: AdminSessionInfo } | { denied: NextResponse }
> {
  try {
    return { session: await requirePermission("settings:write") };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        denied: NextResponse.json(
          { error: "Sin permiso para esta acción." },
          { status: 403 },
        ),
      };
    }
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

function pluginErrorResponse(error: unknown): NextResponse {
  if (error instanceof PluginError) {
    const status =
      error.code === "not-found" || error.code === "unknown-plugin"
        ? 404
        : error.code === "secret-unreadable"
          ? 500
          : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
}

export async function GET() {
  const checked = await assertSettingsWrite();
  if ("denied" in checked) return checked.denied;
  const plugins = await listPlugins();
  return NextResponse.json(
    { plugins: plugins.map(publicPlugin) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const checked = await assertSettingsWrite();
  if ("denied" in checked) return checked.denied;
  const session = checked.session;
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Falta el plugin." }, { status: 400 });
  }

  try {
    if (action === "toggle") {
      const enabled = body?.enabled === true;
      await setPluginEnabled(key, enabled, session.email);
      const plugin = await getPlugin(key);
      return NextResponse.json({ plugin: plugin ? publicPlugin(plugin) : null });
    }

    if (action === "save-config") {
      const config = await updatePluginConfig(key, body?.config ?? {}, session.email);
      const plugin = await getPlugin(key);
      return NextResponse.json({
        plugin: plugin ? publicPlugin(plugin) : null,
        config,
      });
    }

    if (action === "save-secrets") {
      const secrets =
        body?.secrets && typeof body.secrets === "object" && !Array.isArray(body.secrets)
          ? (body.secrets as Record<string, unknown>)
          : {};
      await setPluginSecrets(key, secrets, session.email);
      const plugin = await getPlugin(key);
      return NextResponse.json({ plugin: plugin ? publicPlugin(plugin) : null });
    }

    if (action === "test-connection") {
      return testConnection(key);
    }
  } catch (error) {
    return pluginErrorResponse(error);
  }

  return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
}

/**
 * Prueba de conexión de solo lectura de un plugin de panel. Solo llama a
 * una operación de lectura (listPackages en Plesk/DirectAdmin, el test
 * existente de WHM) y devuelve {ok, detail} sin crear ni borrar nada y
 * sin devolver secretos. Los adaptadores se importan de forma perezosa:
 * la ruta no depende en carga de los módulos de cada panel.
 *
 * Un plugin sin prueba de conexión responde 501 honesto. Un panel sin
 * credenciales responde 503 (el código `unconfigured` del adaptador).
 */
async function testConnection(key: string): Promise<NextResponse> {
  try {
    if (key === "plesk") {
      const { pleskPanel } = await import("@/lib/plesk");
      const packages = await pleskPanel.listPackages();
      return NextResponse.json({
        ok: true,
        detail: `Plesk responde: ${packages.length} plan(es) de servicio.`,
      });
    }

    if (key === "directadmin") {
      const { directAdminPanel } = await import("@/lib/directadmin");
      const packages = await directAdminPanel.listPackages();
      return NextResponse.json({
        ok: true,
        detail: `DirectAdmin responde: ${packages.length} paquete(s) de usuario.`,
      });
    }

    if (key === "whm") {
      const { whmRead } = await import("@/lib/whm");
      const result = (await whmRead("test")) as {
        accounts?: unknown;
        packages?: unknown;
      };
      const accounts = typeof result.accounts === "number" ? result.accounts : "?";
      const packages = typeof result.packages === "number" ? result.packages : "?";
      return NextResponse.json({
        ok: true,
        detail: `WHM responde: ${accounts} cuenta(s), ${packages} paquete(s).`,
      });
    }
  } catch (error) {
    // Sin `instanceof`: el error puede venir de otro reino (o de un
    // adaptador cargado de forma perezosa). Se lee por forma, no por clase.
    const message =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string" &&
      (error as { message: string }).message
        ? (error as { message: string }).message
        : "No se pudo completar la prueba de conexión.";
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof (error as { httpStatus: unknown }).httpStatus === "number"
    ) {
      const status = (error as { httpStatus: number }).httpStatus;
      return NextResponse.json({ error: message }, { status });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: unknown }).code === "pending"
    ) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
    ) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "No se pudo completar la prueba de conexión." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "Este plugin no tiene prueba de conexión." },
    { status: 501 },
  );
}
