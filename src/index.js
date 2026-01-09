export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ------------------------
    // BASIC AUTH (ALL ROUTES)
    // ------------------------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"',
        },
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ------------------------
    // HEALTH CHECK
    // ------------------------
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ------------------------
    // GENERATE IMAGE (API)
    // ------------------------
    if (url.pathname === "/generate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      const prompt = body.inputs;
      if (!prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
          }),
        }
      );

      if (!hfResponse.ok) {
        return new Response(
          `HF ERROR:\n${await hfResponse.text()}`,
          { status: 500 }
        );
      }

      const imageBuffer = await hfResponse.arrayBuffer();

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    }

    // ------------------------
    // WEB UI (ROOT)
    // ------------------------
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Private Image Generator</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: #111;
      color: #fff;
      padding: 20px;
    }
    textarea {
      width: 100%;
      height: 120px;
      margin-bottom: 10px;
      background: #222;
      color: #fff;
      border: 1px solid #444;
      padding: 10px;
    }
    button {
      padding: 12px;
      width: 100%;
      font-size: 16px;
      background: #4caf50;
      border: none;
      color: black;
      cursor: pointer;
    }
    img {
      margin-top: 20px;
      max-width: 100%;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <h2>Private Image Generator</h2>
  <textarea id="prompt" placeholder="Describe the image..."></textarea>
  <button onclick="generate()">Generate</button>
  <div id="result"></div>

  <script>
    async function generate() {
      const prompt = document.getElementById("prompt").value;
      const res = await fetch("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      });

      if (!res.ok) {
        document.getElementById("result").innerText = await res.text();
        return;
      }

      const blob = await res.blob();
      const img = document.createElement("img");
      img.src = URL.createObjectURL(blob);
      document.getElementById("result").innerHTML = "";
      document.getElementById("result").appendChild(img);
    }
  </script>
</body>
</html>`,
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  },
};
