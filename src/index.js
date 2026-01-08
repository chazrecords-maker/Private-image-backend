export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       HEALTH CHECK
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
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    /* =========================
       BASIC AUTH
    ========================== */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image Worker"'
        }
      });
    }

    let decoded;
    try {
      decoded = atob(auth.split(" ")[1]);
    } catch {
      return new Response("Invalid Authorization header", { status: 401 });
    }

    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* =========================
       IMAGE GENERATION
    ========================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      if (!body.inputs || typeof body.inputs !== "string") {
        return new Response("Missing inputs field", { status: 400 });
      }

      // Prompt wrapper for higher quality & consistency
      const prompt = `
Ultra-detailed, high quality image.
${body.inputs}

Style: realistic, sharp focus, cinematic lighting, professional photography,
natural skin texture, balanced composition.
`;

      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              negative_prompt:
                "blurry, low quality, distorted, extra limbs, bad anatomy, text, watermark",
              guidance_scale: 7,
              num_inference_steps: 30
            }
          })
        }
      );

      if (!hfResponse.ok) {
        return new Response(await hfResponse.text(), { status: 500 });
      }

      const imageBuffer = await hfResponse.arrayBuffer();

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": "inline"
        }
      });
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
