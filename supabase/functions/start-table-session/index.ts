import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://qrmenu.plateria.in",
  "https://menu.plateria.in",
  "https://plateria.in",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
]);
function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://qrmenu.plateria.in";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}
function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  try {
    const body = await req.json();
    const qrToken = String(body.qr_token ?? "").trim();
    const sharedQrMode = !qrToken;
    const restaurantSlug = String(body.restaurant_slug ?? "mughal-e-raj").trim();
    const selectedTable = String(body.table_number ?? "").trim();

    if (sharedQrMode && (!restaurantSlug || !selectedTable)) {
      return json({ error: "Please select your table to start a secure session." }, 400, origin);
    }
    if (!sharedQrMode && (qrToken.length < 32 || qrToken.length > 256)) {
      return json({ error: "This table QR code is invalid. Please scan the QR code on your table." }, 400, origin);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("Missing required server environment variables.");
      return json({ error: "Table session service is not configured." }, 500, origin);
    }
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateBucket = await sha256(`table-session:${clientIp}`);
    const { data: rateAllowed, error: rateError } = await supabase.rpc("consume_order_rate_limit", {
      p_bucket_key: rateBucket, p_max_requests: 15, p_window_seconds: 300,
    });
    if (rateError) {
      console.error("Table-session rate-limit check failed:", rateError.message);
      return json({ error: "Table service is temporarily unavailable. Please try again shortly." }, 503, origin);
    }
    if (rateAllowed !== true) {
      try {
        await supabase.rpc("log_order_security_event", {
          p_restaurant_id: null, p_event_type: "rate_limited", p_severity: "warning",
          p_table_number: selectedTable || null, p_order_id: null, p_request_fingerprint: null,
          p_details: { endpoint: "start-table-session", window_seconds: 300, max_requests: 15 },
        });
      } catch (e) { console.error("Rate-limit event logging failed:", e); }
      return json({ error: "Too many QR session attempts. Please wait a few minutes and try again." }, 429, origin);
    }

    let table: any = null;
    if (!sharedQrMode) {
      const qrHash = await sha256(qrToken);
      const { data, error } = await supabase.from("restaurant_tables")
        .select("id, table_number, restaurant_id, restaurants!inner(slug,is_active)")
        .eq("qr_token_hash", qrHash).eq("is_active", true).eq("restaurants.is_active", true).maybeSingle();
      if (error) {
        console.error("Table lookup failed:", error.message);
        return json({ error: "Could not verify this table. Please ask staff for help." }, 500, origin);
      }
      table = data;
    } else {
      const { data: restaurant, error: restaurantError } = await supabase.from("restaurants")
        .select("id, slug, is_active")
        .eq("slug", restaurantSlug).maybeSingle();
      if (restaurantError || !restaurant || !restaurant.is_active) {
        return json({ error: "Restaurant is unavailable. Please ask staff for help." }, 404, origin);
      }
      const { data, error } = await supabase.from("restaurant_tables")
        .select("id, table_number, restaurant_id, restaurants!inner(slug,is_active)")
        .eq("restaurant_id", restaurant.id).eq("table_number", selectedTable)
        .eq("is_active", true).eq("restaurants.is_active", true).maybeSingle();
      if (error) {
        console.error("Selected table lookup failed:", error.message);
        return json({ error: "Could not verify the selected table. Please try again." }, 500, origin);
      }
      table = data;
    }

    if (!table) return json({ error: "This table is invalid or inactive. Please ask staff for help." }, 403, origin);
    if (sharedQrMode && String(table.table_number) !== selectedTable) {
      return json({ error: "The selected table could not be verified." }, 403, origin);
    }

    const sessionToken = randomToken(32);
    const sessionHash = await sha256(sessionToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("table_sessions").insert({
      table_id: table.id, session_token_hash: sessionHash, expires_at: expiresAt,
    });
    if (insertError) {
      console.error("Session creation failed:", insertError.message);
      return json({ error: "Could not start a table session. Please try again." }, 500, origin);
    }
    const restaurant = Array.isArray(table.restaurants) ? table.restaurants[0] : table.restaurants;
    return json({
      success: true, restaurant_slug: restaurant?.slug, table_number: String(table.table_number),
      session_token: sessionToken, expires_at: expiresAt, inactivity_timeout_minutes: 30,
      session_mode: sharedQrMode ? "shared_qr_table_selected" : "table_qr",
    }, 200, origin);
  } catch (error) {
    console.error("Invalid table-session request:", error);
    return json({ error: "Invalid request." }, 400, origin);
  }
});