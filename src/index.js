export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------
    // HEALTH CHECK
    // -----------------------
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

    // -----------------------
    // BASIC AUTH
    // -----------------------
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

    // -----------------------
    // SIMPLE PRIVATE UI
    // -----------------------
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Private Image Generator</title>
  <style>
    body { font-family: system-ui; padding: 20px; background:#111; color:#fff; }
    textarea { width:100%; height:140px; font-size:16px; }
    button { margin-top:10px; padding:12px; font-size:16px; }
    img { margin-top:20px; max-width:100%; border-radius:8px; }
  </style>
</head>
<body>
  <h2>Private Image Generator</h2>
  <textarea id="prompt" placeholder="Describe the image..."></textarea>
  <br/>
  <button onclick="generate()">Generate</button>
  <div id="out"></div>

<script>
async function generate() {
  const p = document.getElementById("prompt").value;
  document.getElementById("out").innerHTML = "Generating…";

  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: p
  });

  if (!res.ok) {
    document.getElementById("out").innerText = "Generation failed";
    return;
  }

  const blob = await res.blob();
  const img = document.createElement("img");
  img.src = URL.createObjectURL(blob);
  document.getElementById("out").innerHTML = "";
  document.getElementById("out").appendChild(img);
}
</script>
</body>
</html>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // -----------------------
    // GENERATE IMAGE
    // -----------------------
    if (url.pathname === "/generate" && request.method === "POST") {
      const promptText = await request.text();

      if (!promptText || promptText.trim().length < 3) {
        return new Response("Invalid prompt", { status: 400 });
      }

      const hfRes = await fetch(
        "https://router.huggingface.co/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: promptText
          })
        }
      );

      if (!hfRes.ok) {
        return new Response(
          "HF ERROR",
          { status: 500 }
        );
      }

      const imageBytes = await hfRes.arrayBuffer();

      return new Response(imageBytes, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
