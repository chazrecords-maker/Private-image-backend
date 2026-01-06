export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       BASIC AUTH (ALL ROUTES)
    ========================== */
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image Worker"'
        }
      });
    }

    let decoded;
    try {
      decoded = atob(authHeader.split(" ")[1]);
    } catch {
      return new Response("Invalid Authorization header", { status: 401 });
    }

    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* =========================
       GET /health
    ========================== */
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* =========================
       POST /generate (FAKE IMAGE TEST)
    ========================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      // Minimal PNG header — proves binary flow works
      return new Response(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    /* =========================
       FALLBACK
    ========================== */
    return new Response("Not Found", { status: 404 });
  }
};
