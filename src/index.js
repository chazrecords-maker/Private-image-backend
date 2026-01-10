export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------------- BASIC AUTH ---------------- */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const decoded = atob(auth.split(" ")[1] || "");
    const parts = decoded.split(":");
    if (parts.length !== 2) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (parts[0] !== env.APP_USER || parts[1] !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ---------------- HEALTH ---------------- */
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

    /* ---------------- UI ---------------- */
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Private Image Generator</title>
<style>
body { font-family: system-ui; padding: 16px; background:#111; color:#eee; }
textarea { width:100%; height:140px; font-size:16px; }
select, button { width:100%; margin-top:8px; padding:10px; font-size:16px; }
label { display:block; margin-top:10px; }
img { max-width:100%; margin-top:16px; border-radius:8px; }
</style>
</head>
<body>
<h2>Private Image Generator</h2>

<label>Prompt</label>
<textarea id="prompt"></textarea>

<label>Style</label>
<select id="style">
  <option value="semi">Semi-Realistic</option>
  <option value="anime">Anime / Animated</option>
  <option value="photo">Photorealistic</option>
</select>

<label>
  <input type="checkbox" id="charLock" /> Character Lock (same face/body)
</label>

<button onclick="generate()">Generate</button>

<img id="result"/>

<script>
async function generate() {
  const body = {
    prompt: document.getElementById("prompt").value,
    style: document.getElementById("style").value,
    charLock: document.getElementById("charLock").checked ? "on" : "off"
  };

  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
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
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /* ---------------- GENERATE ---------------- */
    if (url.pathname === "/generate" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (!data.prompt) {
        return new Response("Missing inputs field", { status: 400 });
      }

      const styleMap = {
        semi: "semi-realistic, high quality, detailed lighting",
        anime: "anime style, clean lineart, studio ghibli quality",
        photo: "photorealistic, ultra-detailed, professional photography"
      };

      let prompt =
        (styleMap[data.style] || styleMap.semi) +
        ", " +
        data.prompt;

      if (data.charLock === "on") {
        prompt += ", same character, identical face, identical body";
      }

      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.HF_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      if (!hfRes.ok) {
        return new Response(
          "HF ERROR:\n" + await hfRes.text(),
          { status: 500 }
        );
      }

      return new Response(await hfRes.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
