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

    // -------- AUTH --------
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
        return new Response("Invalid JSON body", { status: 400 });
      }

      if (!body.inputs) {
        return new Response("Missing inputs field", { status: 400 });
      }

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: body.inputs
          })
        }
      );

      if (!hf.ok) {
        return new Response(await hf.text(), { status: 500 });
      }

      const imageBuffer = await hf.arrayBuffer();

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": "inline"
        }
      });
    }

    // -------- FALLBACK --------
    return new Response("Not Found", { status: 404 });
  }
};
