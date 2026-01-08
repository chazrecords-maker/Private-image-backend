export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ========= HEALTH ========= */
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

    /* ========= AUTH ========= */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const [user, pass] = atob(auth.split(" ")[1]).split(":");
    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ========= GENERATE ========= */
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      const prompt = body.inputs;
      if (!prompt) {
        return new Response("Missing inputs field", { status: 400 });
      }

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
              guidance_scale: 7,
              num_inference_steps: 30
            }
          })
        }
      );

      if (!hfResponse.ok) {
        return new Response(await hfResponse.text(), { status: 500 });
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": "inline; filename=image.png"
        }
      });
    }

    return new Response(
      "Private Image Worker is running.\n\nAvailable endpoints:\nGET  /health\nPOST /generate",
      { headers: { "Content-Type": "text/plain" } }
    );
  }
};
