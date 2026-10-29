
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminIds = (Deno.env.get("ADMIN_USER_IDS") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Required Supabase server environment variables are missing.");
      return respond({ error: "Server configuration is incomplete" }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "Sign in required" }, 401);
    }

    const token = authorization.slice(7);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await authClient.auth.getUser(token);

    if (userError || !userData.user) {
      return respond({ error: "Invalid or expired session" }, 401);
    }

    if (!adminIds.includes(userData.user.id)) {
      return respond({ error: "Administrator access required" }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const customers = [];
    const pageSize = 1000;
    let page = 1;

    while (true) {
      const { data, error } =
        await adminClient.auth.admin.listUsers({
          page,
          perPage: pageSize,
        });

      if (error) {
        console.error("Customer listing failed:", error.message);
        return respond({ error: "Could not load customers" }, 500);
      }

      for (const user of data.users) {
        customers.push({
          id: user.id,
          name: String(user.user_metadata?.full_name || ""),
          email: user.email || "",
          phone: user.phone || "",
          created_at: user.created_at,
        });
      }

      if (data.users.length < pageSize) break;
      page++;
    }

    return respond({ customers });
  } catch (error) {
    console.error("Admin customer function failed:", error);
    return respond({ error: "Unexpected server error" }, 500);
  }
});
