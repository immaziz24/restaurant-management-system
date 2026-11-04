import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://qrmenu.plateria.in",
  "https://menu.plateria.in",
  "https://plateria.in",
]);
const RESTAURANT_SLUG = "mughal-e-raj";
const TEST_PREFIX = "[SHARED QR TEST — STAFF REVIEW REQUIRED]";

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://qrmenu.plateria.in";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: "Origin not allowed" }, 403, origin);

  try {
    const body = await req.json();
    const restaurantSlug = String(body.restaurant_slug ?? "").trim();
    const customerName = String(body.customer_name ?? "").trim();
    const customerPhone = String(body.customer_phone ?? "").trim();
    const orderType = String(body.order_type ?? "").trim();
    const tableNumber = String(body.table_number ?? "").trim();
    const deliveryAddress = String(body.delivery_address ?? "").trim();
    const customerNotes = String(body.notes ?? "").trim();
    const items = body.items;
    const idempotencyKey = String(body.idempotency_key ?? "").trim();

    if (restaurantSlug !== RESTAURANT_SLUG) return reply({ error: "Unknown restaurant." }, 400, origin);
    if (!customerName || customerName.length > 120) return reply({ error: "Enter a valid customer name." }, 400, origin);
    if (!/^(?:[6-9]\d{9}|91[6-9]\d{9})$/.test(customerPhone.replace(/\D/g, ""))) {
      return reply({ error: "Enter a valid Indian mobile number so staff can confirm the order." }, 400, origin);
    }
    if (!["dine_in", "takeaway", "delivery"].includes(orderType)) return reply({ error: "Invalid order type." }, 400, origin);
    if (orderType === "dine_in" && !/^(?:[1-9]|1\d|20)$/.test(tableNumber)) return reply({ error: "Select a valid table (1–20)." }, 400, origin);
    if (orderType === "delivery" && !deliveryAddress) return reply({ error: "Delivery address is required." }, 400, origin);
    if (deliveryAddress.length > 1000 || customerNotes.length > 700) return reply({ error: "One or more fields are too long." }, 400, origin);
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) return reply({ error: "Cart must contain 1–50 items." }, 400, origin);
    if (!/^[A-Za-z0-9-]{16,200}$/.test(idempotencyKey)) return reply({ error: "Invalid order retry key. Please retry checkout." }, 400, origin);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Order service is not configured." }, 500, origin);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await sha256("shared-qr-order:" + RESTAURANT_SLUG + ":" + clientIp);
    const { data: allowed, error: rateError } = await supabase.rpc("consume_order_rate_limit", {
      p_bucket_key: bucket,
      p_max_requests: 10,
      p_window_seconds: 300,
    });
    if (rateError) {
      console.error("Rate limit failed:", rateError.message);
      return reply({ error: "Order service temporarily unavailable." }, 503, origin);
    }
    if (allowed !== true) return reply({ error: "Too many checkout attempts. Wait a few minutes and try again." }, 429, origin);

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants").select("id,name,is_active").eq("slug", RESTAURANT_SLUG).maybeSingle();
    if (restaurantError || !restaurant?.is_active) return reply({ error: "Restaurant is unavailable." }, 404, origin);

    if (orderType === "dine_in") {
      const { data: table, error: tableError } = await supabase
        .from("restaurant_tables").select("table_number,is_active")
        .eq("restaurant_id", restaurant.id).eq("table_number", tableNumber).eq("is_active", true).maybeSingle();
      if (tableError || !table) return reply({ error: "Selected table is invalid or inactive." }, 400, origin);
    }

    const cleanItems = items.map((item: Record<string, unknown>) => ({
      menu_item_id: String(item.menu_item_id ?? ""),
      quantity: Number(item.quantity),
      special_instructions: String(item.special_instructions ?? "").slice(0, 300),
    }));
    if (cleanItems.some(item => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.menu_item_id) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
      return reply({ error: "A cart item is invalid. Refresh the menu and try again." }, 400, origin);
    }

    // Clearly label every order created through this temporary test endpoint.
    // The existing database RPC validates menu items/prices and creates a pending order.
    const notes = [TEST_PREFIX, customerNotes].filter(Boolean).join("\n");
    const canonicalRequest = JSON.stringify({
      restaurant_slug: restaurantSlug, customer_name: customerName, customer_phone: customerPhone,
      order_type: orderType, table_number: tableNumber, delivery_address: deliveryAddress,
      notes, items: cleanItems,
    });
    const requestHash = await sha256(canonicalRequest);
    const { data, error } = await supabase.rpc("create_customer_order_idempotent", {
      p_restaurant_slug: restaurantSlug,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_order_type: orderType,
      p_table_number: orderType === "dine_in" ? tableNumber : "",
      p_delivery_address: deliveryAddress,
      p_notes: notes,
      p_items: cleanItems,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    });

    if (error) {
      console.error("Shared QR test order creation failed:", error.message);
      const clientError = /required|invalid|not found|unavailable|between 1 and 50|between 1 and 99|cart must contain|already has 3 pending orders|idempotency/i.test(error.message);
      return reply({ error: clientError ? error.message : "Could not create the test order. Please try again." }, clientError ? 400 : 500, origin);
    }

    return reply({
      success: true,
      order_created: true,
      test_order: true,
      message: "A clearly marked shared-QR TEST order was created as pending. Staff confirmation is required before preparation.",
      order: data,
    }, data?.duplicate_request === true ? 200 : 201, origin);
  } catch (error) {
    console.error("Invalid shared QR order request:", error);
    return reply({ error: "Invalid checkout request." }, 400, origin);
  }
});