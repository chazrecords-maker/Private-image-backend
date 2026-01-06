export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       HEALTH CHECK
    ========================== */
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

    /* =========================
       BASIC AUTH
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

    let user, pass;
    try {
      const decoded = atob(authHeader.split(" ")[1]);
      [user, pass] = decoded.split(":");
    } catch {
      return new Response("Authorization decoding failed", { status: 401 });
    }

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* =========================
       GENERATE IMAGE
    ========================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400 }
        );
      }

      const prompt = body.inputs;
      if (!prompt) {
        return new Response(
          JSON.stringify({ error: "Missing inputs field" }),
          { status: 400 }
        );
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
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
        return new Response(
          JSON.stringify({ error: await hfResponse.text() }),
          { status: 500 }
        );
      }

      const imageBuffer = await hfResponse.arrayBuffer();
      const base64Image = btoa(
        String.fromCharCode(...new Uint8Array(imageBuffer))
      );

      return new Response(
        JSON.stringify({ image: base64Image }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    /* =========================
       FALLBACK
    ========================== */
    return new Response(
      "Private Image Worker is running.\n\nAvailable endpoints:\nGET  /health\nPOST /generate\n\nAuthenticate using Basic Auth.",
      { status: 200 }
    );
  }
};
