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
function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return jsonResponse({ error: "Origin not allowed" }, 403, origin);

  try {
    const body = await req.json();
    const restaurantSlug = String(body.restaurant_slug ?? "mughal-e-raj").trim();
    const customerName = String(body.customer_name ?? "").trim();
    const customerPhone = String(body.customer_phone ?? "").trim();
    const orderType = String(body.order_type ?? "dine_in").trim();
    const tableNumber = String(body.table_number ?? "").trim();
    const sessionToken = String(body.table_session_token ?? "").trim();
    const deliveryAddress = String(body.delivery_address ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const items = body.items;
    const suppliedIdempotencyKey = String(body.idempotency_key ?? "").trim();
    if (suppliedIdempotencyKey && (suppliedIdempotencyKey.length < 16 || suppliedIdempotencyKey.length > 200)) {
      return jsonResponse({ error: "Invalid idempotency key." }, 400, origin);
    }
    // Backward compatible until the customer checkout is updated to reuse a key on retries.
    const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();

    if (!customerName || customerName.length > 120) return jsonResponse({ error: "Please provide a valid customer name." }, 400, origin);
    if (customerPhone.length > 30 || notes.length > 1000 || deliveryAddress.length > 1000) return jsonResponse({ error: "One or more fields are too long." }, 400, origin);
    if (!["dine_in", "takeaway", "delivery"].includes(orderType)) return jsonResponse({ error: "Invalid order type." }, 400, origin);
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) return jsonResponse({ error: "Your cart must contain between 1 and 50 items." }, 400, origin);
    if (orderType === "dine_in" && (!tableNumber || sessionToken.length < 32 || sessionToken.length > 256)) {
      return jsonResponse({ error: "A verified table session is required for dine-in orders. Please scan the table QR code again." }, 401, origin);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("Required Supabase environment variables are missing.");
      return jsonResponse({ error: "Order service is not configured yet." }, 500, origin);
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateBucket = await sha256(`order:${restaurantSlug}:${clientIp}`);
    const { data: rateAllowed, error: rateError } = await supabase.rpc("consume_order_rate_limit", {
      p_bucket_key: rateBucket,
      p_max_requests: 20,
      p_window_seconds: 300,
    });
    if (rateError) {
      console.error("Order rate-limit check failed:", rateError.message);
      return jsonResponse({ error: "Order service is temporarily unavailable. Please try again shortly." }, 503, origin);
    }
    if (rateAllowed !== true) {
      await logSecurityEvent("rate_limited", "warning", tableNumber || null, null, { order_type: orderType, window_seconds: 300, max_requests: 20 });
      return jsonResponse({ error: "Too many order attempts. Please wait a few minutes and try again." }, 429, origin);
    }

    async function logSecurityEvent(eventType: string, severity: string, table: string | null, orderId: string | null, details: Record<string, unknown>) {
      try {
        const { data: restaurant } = await supabase.from("restaurants").select("id").eq("slug", restaurantSlug).maybeSingle();
        await supabase.rpc("log_order_security_event", {
          p_restaurant_id: restaurant?.id ?? null,
          p_event_type: eventType,
          p_severity: severity,
          p_table_number: table,
          p_order_id: orderId,
          p_request_fingerprint: null,
          p_details: details,
        });
      } catch (logError) {
        console.error("Security event logging failed:", logError);
      }
    }

    // GPS is optional: if the customer shares coordinates, compare them to the configured restaurant radius.
    // If permission is denied or coordinates are absent, allow the existing QR/session flow to continue.
    const rawGpsLat = body.customer_latitude;
    const rawGpsLng = body.customer_longitude;
    const hasAnyGps = rawGpsLat !== undefined || rawGpsLng !== undefined;
    if (hasAnyGps) {
      const customerLat = Number(rawGpsLat);
      const customerLng = Number(rawGpsLng);
      if (rawGpsLat === undefined || rawGpsLng === undefined ||
          !Number.isFinite(customerLat) || !Number.isFinite(customerLng) ||
          customerLat < -90 || customerLat > 90 || customerLng < -180 || customerLng > 180) {
        return jsonResponse({ error: "Invalid location coordinates." }, 400, origin);
      }
      const { data: gpsRestaurant, error: gpsConfigError } = await supabase
        .from("restaurants")
        .select("latitude, longitude, gps_radius_meters, gps_verification_enabled")
        .eq("slug", restaurantSlug)
        .maybeSingle();
      if (gpsConfigError) {
        console.error("GPS configuration lookup failed:", gpsConfigError.message);
        return jsonResponse({ error: "Location verification is temporarily unavailable." }, 503, origin);
      }
      if (gpsRestaurant?.gps_verification_enabled === true &&
          gpsRestaurant.latitude !== null && gpsRestaurant.latitude !== undefined &&
          gpsRestaurant.longitude !== null && gpsRestaurant.longitude !== undefined) {
        const rad = (degrees: number) => degrees * Math.PI / 180;
        const dLat = rad(customerLat - gpsRestaurant.latitude);
        const dLng = rad(customerLng - gpsRestaurant.longitude);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(gpsRestaurant.latitude)) * Math.cos(rad(customerLat)) *
          Math.sin(dLng / 2) ** 2;
        const distanceMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (distanceMeters > gpsRestaurant.gps_radius_meters) {
          await logSecurityEvent("other", "warning", tableNumber || null, null, {
            event: "gps_proximity_rejected",
            distance_meters: Math.round(distanceMeters),
            allowed_radius_meters: gpsRestaurant.gps_radius_meters,
            order_type: orderType,
          });
          return jsonResponse({ error: "You appear to be outside the restaurant's location area. If you are at the restaurant, disable location checking or ask staff for help." }, 403, origin);
        }
      }
    }

    let sessionId: string | null = null;
    if (orderType === "dine_in") {
      const sessionHash = await sha256(sessionToken);
      const { data: session, error: sessionError } = await supabase
        .from("table_sessions")
        .select("id, table_id, expires_at, revoked_at")
        .eq("session_token_hash", sessionHash)
        .maybeSingle();

      if (sessionError) {
        console.error("Table session lookup failed:", sessionError.message);
        return jsonResponse({ error: "Could not verify your table session. Please try again." }, 500, origin);
      }
      if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
        await logSecurityEvent("invalid_table_session", "warning", tableNumber, null, {
          reason: !session ? "not_found" : session.revoked_at ? "revoked" : "expired",
          order_type: orderType,
        });
        return jsonResponse({ error: "Your table session has expired or is invalid. Please scan the table QR code again." }, 401, origin);
      }

      const { data: table, error: tableError } = await supabase
        .from("restaurant_tables")
        .select("table_number, is_active, restaurants!inner(slug,is_active)")
        .eq("id", session.table_id)
        .maybeSingle();
      if (tableError) {
        console.error("Table validation failed:", tableError.message);
        return jsonResponse({ error: "Could not verify your table. Please try again." }, 500, origin);
      }
      const restaurant = Array.isArray(table?.restaurants) ? table.restaurants[0] : table?.restaurants;
      if (!table || !table.is_active || !restaurant?.is_active || restaurant.slug !== restaurantSlug ||
          String(table.table_number) !== tableNumber) {
        return jsonResponse({ error: "Your verified session does not match this active table. Please scan the correct table QR code." }, 401, origin);
      }
      sessionId = session.id;
    }

    const cleanItems = items.map((item: Record<string, unknown>) => ({
      menu_item_id: String(item.menu_item_id ?? ""),
      quantity: Number(item.quantity),
      special_instructions: String(item.special_instructions ?? "").slice(0, 300),
    }));

    const canonicalRequest = JSON.stringify({ restaurant_slug: restaurantSlug, customer_name: customerName, customer_phone: customerPhone, order_type: orderType, table_number: tableNumber, delivery_address: deliveryAddress, notes, items: cleanItems });
    const requestHash = await sha256(canonicalRequest);
    const { data, error } = await supabase.rpc("create_customer_order_idempotent", {
      p_restaurant_slug: restaurantSlug,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_order_type: orderType,
      p_table_number: tableNumber,
      p_delivery_address: deliveryAddress,
      p_notes: notes,
      p_items: cleanItems,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    });

    if (error) {
      console.error("Order creation failed:", error.message);
      if (/already has 3 pending orders/i.test(error.message)) {
        await logSecurityEvent("pending_order_limit", "warning", tableNumber || null, null, { order_type: orderType });
      }
      const clientError = /required|invalid|not found|unavailable|between 1 and 50|between 1 and 99|cart must contain|already has 3 pending orders/i.test(error.message);
      return jsonResponse({ error: clientError ? error.message : "Could not place the order. Please try again." }, clientError ? 400 : 500, origin);
    }

    if (sessionId) {
      const now = new Date();
      const { error: refreshError } = await supabase.from("table_sessions").update({
        last_used_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      }).eq("id", sessionId).is("revoked_at", null);
      if (refreshError) console.error("Order succeeded but session refresh failed:", refreshError.message);
    }

    if (data?.duplicate_request === true) {
      await logSecurityEvent("duplicate_order_attempt", "info", tableNumber || null, String(data.order_id ?? "") || null, {
        order_type: orderType,
        result: "idempotent_replay_returned_original_order",
      });
      return jsonResponse({ success: true, order: data }, 200, origin);
    }
    return jsonResponse({ success: true, order: data }, 201, origin);
  } catch (error) {
    console.error("Invalid order request:", error);
    return jsonResponse({ error: "Invalid request. Please check your order details." }, 400, origin);
  }
});