export default {
  async fetch(request, env) {
    const VALID_USER = env.APP_USER;
    const VALID_PASS = env.APP_PASS;
    const HF_TOKEN = env.HF_TOKEN;

    /* ---------- AUTH ---------- */
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const decoded = atob(authHeader.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== VALID_USER || pass !== VALID_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ---------- PROMPT ---------- */
    const prompt =
      "Semi-realistic digital illustration, cinematic lighting, high detail, natural proportions, studio quality";

    /* ---------- HF REQUEST ---------- */
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      }
    );

    if (!hfResponse.ok) {
      const err = await hfResponse.text();
      return new Response(
        JSON.stringify({ error: err }),
        { status: 500 }
      );
    }

    const imageBuffer = await hfResponse.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store"
      }
    });
  }
};
