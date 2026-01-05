export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --------------------
    // Root help page
    // --------------------
    if (url.pathname === "/") {
      return new Response(
        `Private Image Worker is running.

Available endpoints:
GET  /health
POST /generate

Authenticate using Basic Auth.`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    // --------------------
    // Health check
    // --------------------
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------
    // Basic Auth
    // --------------------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // --------------------
    // Image generation
    // --------------------
    if (url.pathname === "/generate" && request.method === "POST") {
      const prompt = await request.text();

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/YOUR_MODEL_NAME",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      if (!hfResponse.ok) {
        return new Response(await hfResponse.text(), { status: 500 });
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
