import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://qrmenu.plateria.in",
  "https://menu.plateria.in",
  "https://plateria.in",
]);
function headers(origin: string | null) {
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
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  try {
    const body = await req.json();
    const restaurantSlug = String(body.restaurant_slug ?? "").trim();
    const customerName = String(body.customer_name ?? "").trim();
    const customerPhone = String(body.customer_phone ?? "").trim();
    const orderType = String(body.order_type ?? "").trim();
    const tableNumber = String(body.table_number ?? "").trim();
    const items = body.items;

    if (restaurantSlug !== "mughal-e-raj") return json({ error: "Unknown restaurant." }, 400, origin);
    if (!customerName || customerName.length > 120) return json({ error: "Enter a valid customer name." }, 400, origin);
    if (customerPhone.length > 30) return json({ error: "Mobile number is too long." }, 400, origin);
    if (!["dine_in", "takeaway", "delivery"].includes(orderType)) return json({ error: "Invalid order type." }, 400, origin);
    if (orderType === "dine_in" && !tableNumber) return json({ error: "Select a table." }, 400, origin);
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) return json({ error: "Cart must contain 1–50 items." }, 400, origin);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Test validation service is not configured." }, 500, origin);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await sha256(`shared-qr-test:${clientIp}`);
    const { data: allowed, error: rateError } = await supabase.rpc("consume_order_rate_limit", {
      p_bucket_key: bucket, p_max_requests: 20, p_window_seconds: 300,
    });
    if (rateError) {
      console.error("Rate-limit check failed:", rateError.message);
      return json({ error: "Test service temporarily unavailable." }, 503, origin);
    }
    if (allowed !== true) return json({ error: "Too many test attempts. Wait a few minutes and try again." }, 429, origin);

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants").select("id,name,is_active").eq("slug", restaurantSlug).maybeSingle();
    if (restaurantError || !restaurant?.is_active) return json({ error: "Restaurant is unavailable." }, 404, origin);

    if (orderType === "dine_in") {
      const { data: table, error: tableError } = await supabase
        .from("restaurant_tables").select("table_number,is_active")
        .eq("restaurant_id", restaurant.id).eq("table_number", tableNumber).eq("is_active", true).maybeSingle();
      if (tableError || !table) return json({ error: "Selected table is invalid or inactive." }, 400, origin);
    }

    const ids = [...new Set(items.map((item: any) => String(item.menu_item_id ?? "")))];
    if (ids.some((id: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return json({ error: "A cart item has an invalid menu ID. Refresh the menu and try again." }, 400, origin);
    }
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items").select("id,name,price_paise,is_available")
      .eq("restaurant_id", restaurant.id).in("id", ids);
    if (menuError || !menuItems || menuItems.length !== ids.length) return json({ error: "One or more items are no longer available. Refresh the menu." }, 400, origin);

    const byId = new Map(menuItems.map((item: any) => [item.id, item]));
    let subtotalPaise = 0;
    const validatedItems = [];
    for (const item of items) {
      const id = String(item.menu_item_id);
      const quantity = Number(item.quantity);
      const menuItem: any = byId.get(id);
      if (!menuItem || menuItem.is_available !== true) return json({ error: "An item is unavailable. Refresh the menu." }, 400, origin);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return json({ error: "Invalid item quantity." }, 400, origin);
      subtotalPaise += Number(menuItem.price_paise) * quantity;
      validatedItems.push({ name: menuItem.name, quantity, unit_price_paise: menuItem.price_paise });
    }

    // Intentionally dry-run: this test endpoint never inserts an order.
    return json({
      success: true,
      dry_run: true,
      order_created: false,
      message: "Shared-QR server validation passed. This was a test only; no order was created.",
      restaurant: restaurant.name,
      order_type: orderType,
      table_number: orderType === "dine_in" ? tableNumber : null,
      items: validatedItems,
      subtotal_paise: subtotalPaise,
      next_step: "Production order creation is intentionally disabled in this test endpoint."
    }, 200, origin);
  } catch (error) {
    console.error("Shared-QR validation error:", error);
    return json({ error: "Invalid test request." }, 400, origin);
  }
});