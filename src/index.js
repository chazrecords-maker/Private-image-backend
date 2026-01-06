export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- PUBLIC TEST ENDPOINT (NO AUTH) ---
    if (url.pathname === "/ping") {
      return new Response("PING OK", {
        headers: { "Content-Type": "text/plain" }
      });
    }

    // --- HEALTH CHECK (NO AUTH, READ-ONLY) ---
    if (url.pathname === "/health") {
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

    // --- AUTH STARTS HERE ---
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // --- GENERATE ENDPOINT ---
    if (url.pathname === "/generate" && request.method === "POST") {
      const body = await request.json();
      const prompt = body.inputs;

      // (HF call goes here — we already validated this earlier)

      return new Response("Auth + routing OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  }
};
