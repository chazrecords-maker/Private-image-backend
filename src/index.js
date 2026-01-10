export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    /* -------------------- BASIC AUTH -------------------- */
    const auth = req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private"' }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* -------------------- HEALTH -------------------- */
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "OK",
        hasUser: !!env.APP_USER,
        hasPass: !!env.APP_PASS,
        hasHF: !!env.HF_TOKEN
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    /* -------------------- UI -------------------- */
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Private Image Generator</title>
<style>
body {
  background:#000;
  color:#fff;
  font-family:-apple-system,BlinkMacSystemFont;
  padding:16px;
}
textarea {
  width:100%;
  height:140px;
  font-size:16px;
}
button {
  margin-top:12px;
  padding:12px;
  width:100%;
  font-size:18px;
}
img {
  margin-top:16px;
  max-width:100%;
}
#error {
  color:#ff6666;
  white-space:pre-wrap;
}
</style>
</head>
<body>
<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe the image..."></textarea>
<button onclick="go()">Generate</button>

<div id="error"></div>
<img id="out"/>

<script>
async function go() {
  document.getElementById("error").textContent = "";
  document.getElementById("out").src = "";

  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: document.getElementById("prompt").value
    })
  });

  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    document.getElementById("error").textContent =
      await res.text();
    return;
  }

  if (!ct.includes("image")) {
    document.getElementById("error").textContent =
      await res.text();
    return;
  }

  const blob = await res.blob();
  document.getElementById("out").src =
    URL.createObjectURL(blob);
}
</script>
</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
    }

    /* -------------------- GENERATE -------------------- */
    if (req.method === "POST" && url.pathname === "/generate") {
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

      const ct = hf.headers.get("content-type") || "";

      /* ---- SHOW REAL HF ERROR ---- */
      if (!hf.ok) {
        const text = await hf.text();
        return new Response(
          `HF STATUS ${hf.status}\n${text}`,
          { status: 500 }
        );
      }

      if (!ct.includes("image")) {
        const text = await hf.text();
        return new Response(
          `HF NON-IMAGE RESPONSE:\n${text}`,
          { status: 500 }
        );
      }

      const bytes = await hf.arrayBuffer();
      return new Response(bytes, {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
