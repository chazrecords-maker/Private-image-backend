export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ===============================
       BASIC AUTH (UI + API)
    =============================== */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    let user, pass;
    try {
      const decoded = atob(auth.split(" ")[1]);
      [user, pass] = decoded.split(":");
    } catch {
      return new Response("Invalid Authorization header", { status: 401 });
    }

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ===============================
       HEALTH
    =============================== */
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

    /* ===============================
       UI (HOME PAGE)
    =============================== */
    if (url.pathname === "/") {
      return new Response(
        `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Private Image Generator</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: #111;
      color: #eee;
      max-width: 700px;
      margin: auto;
      padding: 20px;
    }
    textarea {
      width: 100%;
      height: 120px;
      background: #222;
      color: #fff;
      border: 1px solid #444;
      padding: 10px;
    }
    button {
      margin-top: 10px;
      padding: 10px 16px;
      background: #4f46e5;
      color: white;
      border: none;
      cursor: pointer;
    }
    img {
      margin-top: 20px;
      max-width: 100%;
      border: 1px solid #333;
    }
  </style>
</head>
<body>
  <h2>Private Image Generator</h2>

  <textarea id="prompt" placeholder="Describe the image..."></textarea>
  <br />
  <button onclick="generate()">Generate</button>

  <div id="status"></div>
  <img id="result" />

<script>
async function generate() {
  const prompt = document.getElementById("prompt").value;
  document.getElementById("status").innerText = "Generating...";
  document.getElementById("result").src = "";

  const res = await fetch("/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: prompt })
  });

  if (!res.ok) {
    document.getElementById("status").innerText = "Error generating image";
    return;
  }

  const blob = await res.blob();
  document.getElementById("result").src = URL.createObjectURL(blob);
  document.getElementById("status").innerText = "";
}
</script>
</body>
</html>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /* ===============================
       GENERATE IMAGE
    =============================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      const body = await request.json();

      if (!body.inputs) {
        return new Response(
          JSON.stringify({ error: "Missing inputs" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: body.inputs })
        }
      );

      if (!hfResponse.ok) {
        return new Response(
          JSON.stringify({ error: await hfResponse.text() }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
