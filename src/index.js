export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    /* ---------- BASIC AUTH ---------- */
    if (url.pathname !== "/health") {
      const auth = req.headers.get("Authorization") || "";
      const expected =
        "Basic " +
        btoa(`${env.APP_USER}:${env.APP_PASS}`);

      if (auth !== expected) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Private"' }
        });
      }
    }

    /* ---------- HEALTH CHECK ---------- */
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

    /* ---------- UI ---------- */
    if (req.method === "GET") {
      return new Response(
`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  background:#000;
  color:#ccc;
  font-family:system-ui;
  padding:20px;
}
textarea {
  width:100%;
  height:140px;
  font-size:16px;
}
button {
  margin-top:10px;
  font-size:18px;
  padding:10px;
  width:100%;
}
img {
  max-width:100%;
  margin-top:20px;
  border-radius:12px;
}
</style>
</head>
<body>
<h2>Private Image Generator</h2>

<textarea id="prompt">portrait of a woman</textarea>
<button onclick="go()">Generate</button>

<div id="out"></div>

<script>
async function go(){
  document.getElementById("out").innerHTML="Generating...";
  const r = await fetch("/", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ prompt: document.getElementById("prompt").value })
  });

  if (!r.ok) {
    document.getElementById("out").innerText = "Generation failed";
    return;
  }

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  document.getElementById("out").innerHTML = "<img src='"+url+"'>";
}
</script>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /* ---------- IMAGE GENERATION ---------- */
    if (req.method === "POST") {
      const { prompt } = await req.json();

      if (!prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      if (!hf.ok) {
        const t = await hf.text();
        return new Response("HF ERROR: " + t, { status: 500 });
      }

      /* 🔑 THIS IS THE CRITICAL FIX */
      const imageBytes = await hf.arrayBuffer();

      return new Response(imageBytes, {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
