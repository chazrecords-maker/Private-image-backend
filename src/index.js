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
       POST /generate
       Option A: prompt-based model selection
       - default = quality (SDXL)
       - [fast] prefix = fast model
    ========================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      if (!body.inputs || typeof body.inputs !== "string") {
        return new Response("Missing 'inputs' field", { status: 400 });
      }

      let prompt = body.inputs.trim();
      let model =
        "stabilityai/stable-diffusion-xl-base-1.0"; // quality default

      // Fast mode
      if (prompt.toLowerCase().startsWith("[fast]")) {
        prompt = prompt.replace(/^\[fast\]/i, "").trim();
        model = "stabilityai/sd-turbo";
      }

      const hfResponse = await fetch(
        `https://router.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
            "Accept": "image/png"
          },
          body: JSON.stringify({
            inputs: prompt
          })
        }
      );

      if (!hfResponse.ok) {
        const errText = await hfResponse.text();
        return new Response(
          JSON.stringify({ error: errText }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const imageBuffer = await hfResponse.arrayBuffer();

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store"
        }
      });
    }

    /* =========================
       FALLBACK
    ========================== */
    return new Response("Not Found", { status: 404 });
  }
};
