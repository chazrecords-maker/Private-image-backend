export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------------
    // BASIC AUTH CHECK
    // -----------------------------
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const base64 = authHeader.replace("Basic ", "");
    const decoded = atob(base64);
    const [user, pass] = decoded.split(":");

    if (user !== env.BASIC_USER || pass !== env.BASIC_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // -----------------------------
    // HEALTH CHECK
    // -----------------------------
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // -----------------------------
    // IMAGE GENERATION
    // -----------------------------
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const prompt = body.inputs;
      if (!prompt) {
        return new Response("Missing inputs field", { status: 400 });
      }

      // Call image model (example: Workers AI)
      const aiResponse = await env.AI.run(
        "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        { prompt }
      );

      // aiResponse.image is Uint8Array (PNG bytes)
      return new Response(aiResponse.image, {
        headers: {
          "Content-Type": "image/png",
        },
      });
    }

    // -----------------------------
    // FALLBACK
    // -----------------------------
    return new Response("Not Found", { status: 404 });
  },
};
