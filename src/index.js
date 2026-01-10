export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- AUTH ----------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image Generator"' }
      });
    }

    const decoded = atob(auth.split(" ")[1]).split(":");
    if (decoded[0] !== env.APP_USER || decoded[1] !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ---------- HEALTH ----------
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "OK",
        hasUser: !!env.APP_USER,
        hasPass: !!env.APP_PASS,
        hasHF: !!env.HF_TOKEN
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ---------- UI ----------
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body{background:#0b0b0b;color:#fff;font-family:system-ui;padding:16px}
textarea{width:100%;height:260px;font-size:16px;padding:14px;border-radius:8px}
button{padding:10px;border-radius:8px;border:none;background:#222;color:#fff}
button.active{background:#3b82f6}
.group{display:flex;gap:8px;margin-top:8px}
.group button{flex:1}
img.main{max-width:100%;margin-top:16px;border-radius:10px}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe subject, pose, outfit, lighting, mood..."></textarea>

<div class="group">
<button class="active" onclick="setStyle('semi',this)">Semi</button>
<button onclick="setStyle('photo',this)">Photo</button>
<button onclick="setStyle('anime',this)">Anime</button>
<button onclick="setStyle('art',this)">Art</button>
</div>

<label><input type="checkbox" id="charlock" checked> Character Lock</label>
<label><input type="checkbox" id="facelock"> Face Lock</label>

<input type="file" id="refimg" accept="image/*">
<input type="number" id="seed" placeholder="Seed (optional)">
<br><br>
<button onclick="generate()">Generate</button>

<img id="img" class="main">

<script>
let style="semi";
function setStyle(v,b){
  style=v;
  document.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
}

async function generate(){
  const ref=document.getElementById("refimg").files[0];
  if(document.getElementById("charlock").checked && !ref){
    alert("Reference required when Character Lock is ON");
    return;
  }
  const f=new FormData();
  f.append("prompt",prompt.value);
  f.append("style",style);
  f.append("characterLock",charlock.checked);
  f.append("faceLock",facelock.checked);
  if(ref) f.append("reference",ref);
  if(seed.value) f.append("seed",seed.value);

  const r=await fetch("/generate",{method:"POST",body:f});
  if(!r.ok){alert(await r.text());return;}
  img.src=URL.createObjectURL(await r.blob());
}
</script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
    }

    // ---------- GENERATE ----------
    if (request.method === "POST" && url.pathname === "/generate") {
      const d = await request.formData();

      const styles = {
        semi: "semi realistic, cinematic lighting, high detail",
        photo: "photorealistic, ultra detailed",
        anime: "anime style, animated, clean line art",
        art: "digital illustration, painterly"
      };

      let prompt = styles[d.get("style")] + ", " + d.get("prompt");

      if (d.get("characterLock") === "true") {
        prompt += ", identical face and body, allow pose variation";
      }
      if (d.get("faceLock") === "true") {
        prompt += ", same facial features";
      }

      const payload = { inputs: prompt };
      if (d.get("seed")) payload.parameters = { seed: Number(d.get("seed")) };

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.HF_TOKEN,
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
