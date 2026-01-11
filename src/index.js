export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =======================
       BASIC AUTH
    ======================= */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const [user, pass] = atob(auth.split(" ")[1]).split(":");
    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* =======================
       HEALTH
    ======================= */
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

    /* =======================
       GENERATE
    ======================= */
    if (url.pathname === "/generate" && request.method === "POST") {
      const form = await request.formData();

      const promptText = form.get("prompt");
      if (!promptText) {
        return new Response("Missing prompt", { status: 400 });
      }

      const style = form.get("style") || "semi";
      const charLock = form.get("charLock") === "on";
      const faceLock = form.get("faceLock") === "on";
      const refImage = form.get("reference");
      const seedRaw = form.get("seed");

      const seed = seedRaw && seedRaw !== ""
        ? Number(seedRaw)
        : undefined;

      const styleMap = {
        semi: "semi-realistic, ultra-detailed, cinematic lighting, high quality",
        anime: "anime style, clean lineart, vibrant colors, detailed illustration"
      };

      let finalPrompt = styleMap[style] + ", " + promptText;

      if (charLock) {
        finalPrompt +=
          ", same face, same facial features, same body proportions, consistent character identity";
      } else if (faceLock) {
        finalPrompt +=
          ", same face, same facial structure, same eyes, same nose, same mouth, facial consistency only, body and pose may vary";
      }

      let hfResponse;

      if (refImage && refImage instanceof File && refImage.size > 0) {
        const hfForm = new FormData();
        hfForm.append("inputs", finalPrompt);
        hfForm.append("image", refImage);

        if (seed !== undefined) {
          hfForm.append("seed", seed.toString());
        }

        hfResponse = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-refiner-1.0",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.HF_TOKEN}`
            },
            body: hfForm
          }
        );
      } else {
        const body = {
          inputs: finalPrompt,
          parameters: {
            width: 1024,
            height: 1024
          }
        };

        if (seed !== undefined) {
          body.parameters.seed = seed;
        }

        hfResponse = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        );
      }

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

    /* =======================
       MOBILE-POLISHED UI
    ======================= */
    return new Response(`
<!doctype html>
<html>
<head>
<title>Private Image Generator</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
body {
  margin: 0;
  background: #0b0b0b;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.container {
  max-width: 640px;
  margin: auto;
  padding: 16px;
}
.card {
  background: #151515;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
}
h2 {
  text-align: center;
  margin-bottom: 12px;
}
textarea, input[type="number"] {
  width: 100%;
  font-size: 16px;
  padding: 12px;
  border-radius: 10px;
  border: none;
  background: #0f0f0f;
  color: #fff;
}
label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 16px;
}
input[type="radio"], input[type="checkbox"] {
  transform: scale(1.2);
}
button {
  width: 100%;
  padding: 16px;
  font-size: 18px;
  border-radius: 14px;
  border: none;
  background: #2563eb;
  color: #fff;
}
button:active {
  opacity: 0.85;
}
#result img {
  width: 100%;
  border-radius: 14px;
  margin-top: 12px;
}
.sticky {
  position: sticky;
  bottom: 12px;
}
</style>
</head>

<body>
<div class="container">

<h2>Private Image Generator</h2>

<div class="card">
<textarea id="prompt" placeholder="Describe your image..."></textarea>
</div>

<div class="card">
<b>Style</b>
<label><input type="radio" name="style" value="semi" checked> Semi-Realistic</label>
<label><input type="radio" name="style" value="anime"> Anime</label>
</div>

<div class="card">
<b>Consistency</b>
<label>
<input type="checkbox" id="charLock" onchange="if(this.checked) faceLock.checked=false">
 Character Lock
</label>
<label>
<input type="checkbox" id="faceLock" onchange="if(this.checked) charLock.checked=false">
 Face-Only Lock
</label>
</div>

<div class="card">
<b>Seed (optional)</b>
<input id="seed" type="number" placeholder="Leave empty for random">
</div>

<div class="card">
<b>Reference Image (optional)</b>
<input type="file" id="ref" accept="image/*">
</div>

<div class="sticky">
<button onclick="go()">Generate</button>
</div>

<div id="result"></div>

</div>

<script>
async function go() {
  const result = document.getElementById("result");
  result.innerHTML = "<div class='card'>Generating…</div>";

  const fd = new FormData();
  fd.append("prompt", prompt.value);
  fd.append("style", document.querySelector('input[name="style"]:checked').value);
  fd.append("charLock", charLock.checked ? "on" : "off");
  fd.append("faceLock", faceLock.checked ? "on" : "off");

  if (seed.value !== "") fd.append("seed", seed.value);
  if (ref.files.length > 0) fd.append("reference", ref.files[0]);

  const res = await fetch("/generate", { method: "POST", body: fd });

  if (!res.ok) {
    result.innerHTML = "<div class='card'>" + await res.text() + "</div>";
    return;
  }

  const img = document.createElement("img");
  img.src = URL.createObjectURL(await res.blob());
  result.innerHTML = "";
  result.appendChild(img);
}
</script>

</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  }
};
