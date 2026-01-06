export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -------------------------
    // Health check (no auth)
    // -------------------------
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

    // -------------------------
    // Basic Auth
    // -------------------------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // -------------------------
    // Image generation
    // -------------------------
    // -------------------------
// Image generation
// -------------------------
if (url.pathname === "/generate" && request.method === "POST") {
  let prompt = "";

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await request.json();
      prompt = data.inputs;
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      prompt = form.get("inputs");
    } else {
      prompt = await request.text();
    }
  } catch (e) {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!prompt) {
    return new Response("Prompt missing", { status: 400 });
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
    return new Response(await hfResponse.text(), { status: 500 });
  }

  return new Response(await hfResponse.arrayBuffer(), {
    headers: { "Content-Type": "image/png" }
  });
}

    // -------------------------
    // Default response
    // -------------------------
    return new Response(
      "Private Image Worker is running.\n\nAvailable endpoints:\nGET  /health\nPOST /generate\n\nAuthenticate using Basic Auth.",
      { headers: { "Content-Type": "text/plain" } }
    );
  }
};
