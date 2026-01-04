export default {
  async fetch(request) {
    const url = new URL(request.url);

    /* 🔒 CHANGE THESE */
    const USERNAME = "your_username";
    const PASSWORD = "your_password";
    const HF_TOKEN = "YOUR_HF_TOKEN";

    /* LOGIN */
    if (url.pathname === "/login" && request.method === "POST") {
      const { username, password } = await request.json();

      if (username === USERNAME && password === PASSWORD) {
        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Unauthorized", { status: 401 });
    }

    /* IMAGE GENERATION */
    if (url.pathname === "/generate" && request.method === "POST") {
      const { prompt } = await request.json();

      const aiResponse = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      return new Response(await aiResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
