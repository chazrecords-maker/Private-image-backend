export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       BASIC AUTH (ALL ROUTES)
    ========================== */
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

    /* =========================
       HEALTH CHECK
    ========================== */
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

    /* =========================
       IMAGE GENERATION
    ========================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.inputs) {
          return new Response(
            JSON.stringify({ error: "Missing inputs field" }),
            { status: 400 }
          );
        }

        const hfResponse = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: body.inputs
            })
          }
        );

        if (!hfResponse.ok) {
          const err = await hfResponse.text();
          return new Response(
            JSON.stringify({ error: err }),
            { status: 500 }
          );
        }

        return new Response(await hfResponse.arrayBuffer(), {
          headers: { "Content-Type": "image/png" }
        });

      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }),
          { status: 500 }
        );
      }
    }

    /* =========================
       PRIVATE WEB UI
    ========================== */
    return new Response(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Private Image Generator</title>
  <style>
    body {
      background: #0f0f0f;
      color: #fff;
      font-family: system-ui;
      padding: 20px;
    }
    textarea {
      width: 100%;
      height: 140px;
      font-size: 16px;
      padding: 10px;
      margin-bottom: 10px;
    }
    button {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      background: #4caf50;
      border: none;
      color: #fff;
      cursor: pointer;
    }
    img {
      margin-top: 20px;
      max-width: 100%;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h2>Private Image Generator</h2>

  <textarea id="prompt" placeholder="Describe the image..."></textarea>
  <button onclick="generate()">Generate</button>

  <img id="result" />

  <script>
    async function generate() {
      const prompt = document.getElementById("prompt").value;
      if (!prompt) return alert("Enter a prompt");

      const res = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: prompt })
      });

      if (!res.ok) {
        alert("Generation failed");
        return;
      }

      const blob = await res.blob();
      document.getElementById("result").src = URL.createObjectURL(blob);
    }
  </script>
</body>
</html>
    `, {
      headers: { "Content-Type": "text/html" }
    });
  }
};
