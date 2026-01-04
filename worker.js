export default {
  async fetch(request, env, ctx) {
    const url = new URL(req.url);

    const USER = "JukeBox$@1414";
    const PASS = "CkXkEriii$@845181";
    const HF_TOKEN = HF_TOKEN;

    if (url.pathname === "/login" && req.method === "POST") {
      const { username, password } = await req.json();
      if (username === USER && password === PASS)
        return new Response(JSON.stringify({ ok: true }));
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/generate" && req.method === "POST") {
      const body = await req.json();

      const r = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: body.prompt })
        }
      );

      return new Response(await r.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
