export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------- BASIC AUTH ---------- */
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

    /* ---------- HEALTH ---------- */
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
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  background:#111;
  color:#fff;
  font-family:system-ui;
  padding:16px;
}
textarea {
  width:100%;
  height:240px;
  padding:12px;
  font-size:16px;
}
select, button, input[type=file], input[type=number] {
  width:100%;
  padding:10px;
  margin-top:10px;
}
.group {
  display:flex;
  gap:8px;
  margin-top:8px;
}
.group button {
  flex:1;
}
.active {
  background:#3b82f6;
}
label {
  display:block;
  margin-top:12px;
}
small {
  color:#aaa;
}
img {
  max-width:100%;
  margin-top:16px;
  border-radius:8px;
}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe pose, outfit, scene, lighting, mood..."></textarea>

<select id="style">
  <option value="semi">Semi-Realistic</option>
  <option value="photo">Photorealistic</option>
  <option value="anime">Anime / Animated</option>
  <option value="art">Illustration</option>
</select>

<label>
  <input type="checkbox" id="charlock" checked>
  Character Lock (requires reference image)
</label>

<label>
  <input type="checkbox" id="facelock">
  Face-Only Lock
</label>

<label>Character Anchor Strength</label>
<div class="group">
  <button onclick="setAnchor('low')" id="a-low">Low</button>
  <button onclick="setAnchor('medium')" id="a-medium" class="active">Medium</button>
  <button onclick="setAnchor('high')" id="a-high">High</button>
</div>

<label>Reference Influence</label>
<div class="group">
  <button onclick="setInfluence('low')" id="r-low">Low</button>
  <button onclick="setInfluence('medium')" id="r-medium" class="active">Medium</button>
  <button onclick="setInfluence('high')" id="r-high">High</button>
</div>

<label>
  Reference Image
  <input type="file" id="refimg" accept="image/*">
</label>

<label>
  Seed (optional)
  <input type="number" id="seed" placeholder="Leave empty for random">
</label>

<button onclick="generate()">Generate</button>

<img id="out"/>

<script>
let anchor = "medium";
let influence = "medium";

function setAnchor(level) {
  anchor = level;
  ["low","medium","high"].forEach(l=>{
    document.getElementById("a-"+l).classList.remove("active");
  });
  document.getElementById("a-"+level).classList.add("active");
}

function setInfluence(level) {
  influence = level;
  ["low","medium","high"].forEach(l=>{
    document.getElementById("r-"+l).classList.remove("active");
  });
  document.getElementById("r-"+level).classList.add("active");
}

async function generate() {
  const charlock = document.getElementById("charlock").checked;
  const file = document.getElementById("refimg").files[0];

  if (charlock && !file) {
    alert("Reference image required when Character Lock is ON.");
    return;
  }

  const form = new FormData();
  form.append("prompt", document.getElementById("prompt").value);
  form.append("style", document.getElementById("style").value);
  form.append("characterLock", charlock);
  form.append("faceLock", document.getElementById("facelock").checked);
  form.append("anchor", anchor);
  form.append("influence", influence);

  const seed = document.getElementById("seed").value;
  if (seed) form.append("seed", seed);

  if (file) form.append("reference", file);

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

    /* ---------- GENERATE ---------- */
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
        photo: "photorealistic, ultra detailed, 85mm lens",
        anime: "anime style, animated, clean line art, vibrant colors",
        art: "stylized illustration, clean lines, vibrant colors"
      };

      const anchorMap = {
        low: "similar facial features and body type",
        medium: "consistent character identity, same facial structure and body proportions",
        high: "identical face and body identity, same facial features, same body composition, allow pose variation"
      };

      const influenceMap = {
        low: "reference image is a loose guide",
        medium: "reference image strongly guides identity",
        high: "reference image strictly defines identity"
      };

      let prompt = `${styleMap[style] || ""}. ${promptInput}`;

      if (characterLock) {
        prompt += `, ${anchorMap[anchor]}, ${influenceMap[influence]}`;
      }

      if (faceLock) {
        prompt += ", identical face, same eyes, same nose, same mouth";
      }

      const payload = { inputs: prompt };
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
        return new Response(
          "HF ERROR:\\n" + await hf.text(),
          { status: 500 }
        );
      }

      return new Response(await hf.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
