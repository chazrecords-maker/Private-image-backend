export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ========== BASIC AUTH ========== */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image Generator"' }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ========== HEALTH ========== */
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

    /* ========== UI ========== */
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  background:#0b0b0b;
  color:#fff;
  font-family:system-ui;
  padding:16px;
}
textarea {
  width:100%;
  height:280px;
  padding:14px;
  font-size:16px;
  border-radius:8px;
}
button {
  padding:10px;
  margin-top:10px;
  border-radius:8px;
  border:none;
  background:#222;
  color:#fff;
}
button.active {
  background:#3b82f6;
}
.group {
  display:flex;
  gap:8px;
  margin-top:8px;
}
.group button {
  flex:1;
}
label {
  display:block;
  margin-top:12px;
}
img {
  max-width:100%;
  margin-top:16px;
  border-radius:10px;
}
input[type=file], input[type=number] {
  width:100%;
  margin-top:8px;
}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe pose, outfit, lighting, mood, camera angle..."></textarea>

<label>Style</label>
<div class="group">
  <button id="style-semi" class="active" onclick="setStyle('semi')">Semi-Realistic</button>
  <button id="style-photo" onclick="setStyle('photo')">Photoreal</button>
  <button id="style-anime" onclick="setStyle('anime')">Anime</button>
  <button id="style-art" onclick="setStyle('art')">Illustration</button>
</div>

<label>
  <input type="checkbox" id="charlock" checked>
  Character Lock (keeps same face & body)
</label>

<label>
  <input type="checkbox" id="facelock">
  Face-Only Lock
</label>

<label>Character Anchor Strength</label>
<div class="group">
  <button id="a-low" onclick="setAnchor('low')">Low</button>
  <button id="a-medium" class="active" onclick="setAnchor('medium')">Medium</button>
  <button id="a-high" onclick="setAnchor('high')">High</button>
</div>

<label>Reference Influence</label>
<div class="group">
  <button id="r-low" onclick="setInfluence('low')">Low</button>
  <button id="r-medium" class="active" onclick="setInfluence('medium')">Medium</button>
  <button id="r-high" onclick="setInfluence('high')">High</button>
</div>

<label>Reference Image</label>
<input type="file" id="refimg" accept="image/*">

<label>Seed (optional)</label>
<input type="number" id="seed" placeholder="Same seed = similar results">

<button onclick="generate()">Generate Image</button>

<img id="out"/>

<script>
let style = "semi";
let anchor = "medium";
let influence = "medium";

function setStyle(s) {
  style = s;
  ["semi","photo","anime","art"].forEach(x=>{
    document.getElementById("style-"+x).classList.remove("active");
  });
  document.getElementById("style-"+s).classList.add("active");
}

function setAnchor(a) {
  anchor = a;
  ["low","medium","high"].forEach(x=>{
    document.getElementById("a-"+x).classList.remove("active");
  });
  document.getElementById("a-"+a).classList.add("active");
}

function setInfluence(i) {
  influence = i;
  ["low","medium","high"].forEach(x=>{
    document.getElementById("r-"+x).classList.remove("active");
  });
  document.getElementById("r-"+i).classList.add("active");
}

async function generate() {
  const file = document.getElementById("refimg").files[0];
  const charlock = document.getElementById("charlock").checked;

  if (charlock && !file) {
    alert("Reference image required when Character Lock is ON.");
    return;
  }

  const form = new FormData();
  form.append("prompt", document.getElementById("prompt").value);
  form.append("style", style);
  form.append("characterLock", charlock);
  form.append("faceLock", document.getElementById("facelock").checked);
  form.append("anchor", anchor);
  form.append("influence", influence);

  if (file) form.append("reference", file);
  const seed = document.getElementById("seed").value;
  if (seed) form.append("seed", seed);

  const res = await fetch("/generate", { method:"POST", body: form });

  if (!res.ok) {
    alert("Generation failed:\\n" + await res.text());
    return;
  }

  document.getElementById("out").src =
    URL.createObjectURL(await res.blob());
}
</script>

</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /* ========== GENERATE ========== */
    if (request.method === "POST" && url.pathname === "/generate") {
      const data = await request.formData();

      const promptInput = data.get("prompt");
      const style = data.get("style");
      const characterLock = data.get("characterLock") === "true";
      const faceLock = data.get("faceLock") === "true";
      const anchor = data.get("anchor") || "medium";
      const influence = data.get("influence") || "medium";
      const reference = data.get("reference");
      const seed = data.get("seed");

      if (characterLock && !reference) {
        return new Response("Reference image required", { status: 400 });
      }

      const styleMap = {
        semi: "semi realistic, high detail, cinematic lighting",
        photo: "photorealistic, ultra detailed, studio lighting",
        anime: "anime style, animated, clean line art, expressive shading",
        art: "stylized illustration, painterly, vibrant colors"
      };

      const anchorMap = {
        low: "similar facial features and body type",
        medium: "consistent character identity, same facial structure and body proportions",
        high: "identical face and body identity, same facial features, same body composition, allow pose variation"
      };

      const influenceMap = {
        low: "reference image loosely guides identity",
        medium: "reference image strongly guides identity",
        high: "reference image strictly defines identity"
      };

      let finalPrompt = \`\${styleMap[style]}. \${promptInput}\`;

      if (characterLock) {
        finalPrompt += \`, \${anchorMap[anchor]}, \${influenceMap[influence]}\`;
      }

      if (faceLock) {
        finalPrompt += ", identical face, same eyes, same nose, same mouth";
      }

      const payload = { inputs: finalPrompt };
      if (seed) payload.parameters = { seed: Number(seed) };

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5",
        {
          method: "POST",
          headers: {
            "Authorization": \`Bearer \${env.HF_TOKEN}\`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!hf.ok) {
        return new Response("HF ERROR:\\n" + await hf.text(), { status: 500 });
      }

      return new Response(await hf.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
