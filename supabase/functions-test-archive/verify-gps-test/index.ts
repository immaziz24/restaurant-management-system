import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://qrmenu.plateria.in"]);
function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://qrmenu.plateria.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {status, headers: headers(origin)});
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", {headers: headers(origin)});
  if (req.method !== "POST") return json({error:"Method not allowed"},405,origin);
  if (origin && !allowedOrigins.has(origin)) return json({error:"Origin not allowed"},403,origin);
  try {
    const body = await req.json();
    const token = String(body.table_session_token ?? "").trim();
    const lat = Number(body.customer_latitude);
    const lng = Number(body.customer_longitude);
    if (!token || token.length < 32 || token.length > 256) return json({error:"A valid test table session is required."},401,origin);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json({error:"Valid GPS coordinates are required. Location permission may be blocked."},400,origin);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({error:"GPS test service is not configured."},500,origin);
    const supabase = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const tokenHash = await sha256(token);
    const {data: session,error: sessionError} = await supabase
      .from("table_sessions").select("id,expires_at,revoked_at,table_id")
      .eq("session_token_hash",tokenHash).maybeSingle();
    if (sessionError) {
      console.error("GPS test session lookup failed:",sessionError.message);
      return json({error:"Could not verify the test table session."},503,origin);
    }
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return json({error:"Test table session is invalid or expired. Reload the test link."},401,origin);
    }
    const {data: tableInfo,error: tableError} = await supabase
      .from("restaurant_tables").select("table_number,restaurant_id,restaurants!inner(slug)")
      .eq("id",session.table_id).maybeSingle();
    if (tableError || !tableInfo) return json({error:"Could not verify test table."},503,origin);
    const restaurantRel = Array.isArray(tableInfo.restaurants) ? tableInfo.restaurants[0] : tableInfo.restaurants;
    if (restaurantRel?.slug !== "mughal-e-raj" || tableInfo.table_number !== "GPS-TEST") {
      return json({error:"This endpoint accepts only the dedicated GPS-TEST table."},403,origin);
    }
    const {data: restaurant,error: configError} = await supabase.from("restaurants")
      .select("latitude,longitude,gps_radius_meters,gps_verification_enabled")
      .eq("id",tableInfo.restaurant_id).maybeSingle();
    if (configError || !restaurant) return json({error:"Could not load GPS configuration."},503,origin);
    if (!restaurant.gps_verification_enabled || restaurant.latitude == null || restaurant.longitude == null) {
      return json({error:"GPS verification is not configured."},503,origin);
    }
    const rad=(d:number)=>d*Math.PI/180;
    const dLat=rad(lat-restaurant.latitude),dLng=rad(lng-restaurant.longitude);
    const a=Math.sin(dLat/2)**2+Math.cos(rad(restaurant.latitude))*Math.cos(rad(lat))*Math.sin(dLng/2)**2;
    const distance=Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
    const inside=distance<=restaurant.gps_radius_meters;
    return json({success:true,test_only:true,table_number:tableInfo.table_number,inside_radius:inside,distance_meters:distance,allowed_radius_meters:restaurant.gps_radius_meters,order_created:false,message:inside?"GPS TEST PASS: inside radius. No order created.":"GPS TEST RESULT: outside radius. No order created."},200,origin);
  } catch (error) {
    console.error("GPS test request failed:",error);
    return json({error:"Invalid GPS test request."},400,origin);
  }
});