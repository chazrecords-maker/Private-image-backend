export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -------- HEALTH CHECK --------
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

    // -------- BASIC AUTH --------
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

    // -------- GENERATE IMAGE --------
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

      if (!body.inputs) {
        return new Response(
          JSON.stringify({ error: "Missing 'inputs' field" }),
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
          body: JSON.stringify({
            inputs: body.inputs,
            parameters: {
              guidance_scale: 7.5,
              num_inference_steps: 30
            }
          })
        }
      );

      if (!hfResponse.ok) {
        return new Response(
          await hfResponse.text(),
          { status: 500 }
        );
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    // -------- FALLBACK --------
    return new Response(
      "Private Image Worker is running.\n\nAvailable endpoints:\nGET  /health\nPOST /generate",
      { status: 200 }
    );
  }
};
