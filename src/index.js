export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ------------------------------
       BASIC AUTH (GLOBAL)
    ------------------------------ */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image Generator"'
        }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ------------------------------
       HEALTH CHECK
    ------------------------------ */
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Worker is reachable and running",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* ------------------------------
       UI (ROOT PAGE)
    ------------------------------ */
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Private Image Generator</title>
  <style>
    body { font-family: system-ui; background:#111; color:#fff; padding:16px }
    textarea, select, button { width:100%; margin-top:10px; padding:10px }
    img { max-width:100%; margin-top:16px; border-radius:8px }
    label { display:block; margin-top:12px }
  </style>
</head>
<body>
  <h2>Private Image Generator</h2>

  <textarea id="prompt" placeholder="Describe the image..."></textarea>

  <label>
    Style Preset
    <select id="style">
      <option value="semi-realistic">Semi-Realistic</option>
      <option value="photorealistic">Photorealistic</option>
      <option value="illustration">Illustration</option>
    </select>
  </label>

  <label>
    <input type="checkbox" id="charlock" checked />
    Character Lock (face + body)
  </label>

  <label>
    <input type="checkbox" id="facelock" />
    Face-Only Lock
  </label>

  <label>
    Reference Image (optional)
    <input type="file" id="ref" accept="image/*" />
  </label>

  <button onclick="generate()">Generate</button>

  <img id="result" />

<script>
async function generate() {
  const prompt = document.getElementById("prompt").value;
  const style = document.getElementById("style").value;
  const charlock = document.getElementById("charlock").checked;
  const facelock = document.getElementById("facelock").checked;
  const refFile = document.getElementById("ref").files[0];

  const body = {
    prompt,
    style,
    characterLock: charlock,
    faceLock: facelock
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

    /* ------------------------------
       IMAGE GENERATION
    ------------------------------ */
    if (request.method === "POST" && url.pathname === "/generate") {
      const data = await request.json();

      const styleMap = {
        "semi-realistic": "semi realistic, high detail, cinematic lighting",
        "photorealistic": "photorealistic, ultra detailed, 85mm lens",
        "illustration": "stylized illustration, clean lines, vibrant color"
      };

      let finalPrompt = `${styleMap[data.style] || ""}. ${data.prompt}`;

      if (data.characterLock) {
        finalPrompt += ", consistent character, same face, same proportions";
      }

      if (data.faceLock) {
        finalPrompt += ", identical facial features, same eyes nose mouth";
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: finalPrompt
          })
        }
      );

      if (!hfResponse.ok) {
        return new Response(
          "HF ERROR:\n" + await hfResponse.text(),
          { status: 500 }
        );
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
