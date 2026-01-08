export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // BASIC AUTH (ALL ROUTES)
    // =========================
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    let user, pass;
    try {
      const decoded = atob(auth.slice(6));
      [user, pass] = decoded.split(":");
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // =========================
    // HEALTH CHECK
    // =========================
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // =========================
    // IMAGE GENERATION
    // =========================
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (!body.inputs) {
        return new Response("Missing inputs field", { status: 400 });
      }

      // ---- Hugging Face image inference ----
      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
            "Accept": "image/png"
          },
          body: JSON.stringify({
            inputs: body.inputs
          })
        }
      );

      if (!hf.ok) {
        return new Response(await hf.text(), { status: 500 });
      }

      // 🔑 THIS IS THE CRITICAL PART
      // Return RAW IMAGE BYTES — NOT JSON
      const imageBytes = await hf.arrayBuffer();

      return new Response(imageBytes, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store"
        }
      });
    }

    // =========================
    // FALLBACK
    // =========================
    return new Response(
      "Private Image Worker is running.\nGET /health\nPOST /generate",
      { status: 200 }
    );
  }
};
