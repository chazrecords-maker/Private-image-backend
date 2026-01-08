export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ===============================
       HEALTH CHECK
    =============================== */
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    /* ===============================
       BASIC AUTH
    =============================== */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    let user, pass;
    try {
      const decoded = atob(auth.split(" ")[1]);
      [user, pass] = decoded.split(":");
    } catch {
      return new Response("Invalid Authorization header", { status: 401 });
    }

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ===============================
       GENERATE IMAGE
    =============================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!body.inputs || typeof body.inputs !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing 'inputs' field" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Hugging Face request
      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: body.inputs
          })
        }
      );

      // If HF returns an error, return readable JSON (NOT image)
      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        return new Response(
          JSON.stringify({
            error: "Image generation failed",
            details: errorText
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // SUCCESS: return raw image bytes
      const imageBuffer = await hfResponse.arrayBuffer();

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store"
        }
      });
    }

    /* ===============================
       FALLBACK
    =============================== */
    return new Response(
      "Private Image Worker is running.\n\nAvailable endpoints:\nGET  /health\nPOST /generate",
      { headers: { "Content-Type": "text/plain" } }
    );
  }
};
