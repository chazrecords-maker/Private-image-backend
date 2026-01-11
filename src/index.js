export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- BASIC AUTH ----------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' },
      });
    }

    const [user, pass] = atob(auth.split(" ")[1]).split(":");
    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ---------- HEALTH ----------
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ---------- GENERATE ----------
    if (url.pathname === "/generate" && request.method === "POST") {
      const form = await request.formData();
      const prompt = form.get("prompt");
      const seed = form.get("seed");
      const refImage = form.get("reference");

      if (!prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      let hfPayload;
      let hfHeaders = {
        Authorization: `Bearer ${env.HF_TOKEN}`,
      };

      // ---------- IMAGE TO IMAGE ----------
      if (refImage && refImage.size > 0) {
        const arrayBuffer = await refImage.arrayBuffer();
        hfPayload = new Uint8Array(arrayBuffer);

        hfHeaders["Content-Type"] = refImage.type;
        hfHeaders["X-Use-Cache"] = "false";
        hfHeaders["X-Wait-For-Model"] = "true";

        const hfUrl =
          "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0?prompt=" +
          encodeURIComponent(prompt) +
          "&strength=0.35" +
          (seed ? "&seed=" + seed : "");

        const hf = await fetch(hfUrl, {
          method: "POST",
          headers: hfHeaders,
          body: hfPayload,
        });

        if (!hf.ok) {
          return new Response(`HF ERROR:\n${await hf.text()}`, { status: 500 });
        }

        return new Response(await hf.arrayBuffer(), {
          headers: { "Content-Type": "image/png" },
        });
      }

      // ---------- TEXT TO IMAGE ----------
      const payload = {
        inputs: prompt,
        parameters: {
          width: 1024,
          height: 1024,
        },
      };

      if (seed) payload.parameters.seed = Number(seed);

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!hf.ok) {
        return new Response(`HF ERROR:\n${await hf.text()}`, { status: 500 });
      }

      return new Response(await hf.arrayBuffer(), {
        headers: { "Content-Type": "image/png" },
      });
    }

    // ---------- UI ----------
    return new Response(`
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body { background:#111; color:#fff; font-family:sans-serif; padding:20px; }
button { padding:10px; margin:6px; border-radius:6px; background:#333; color:#fff; border:none; }
button.active { background:#4caf50; }
textarea, input { width:100%; padding:10px; margin-top:10px; font-size:16px; }
#result img { max-width:100%; margin-top:20px; border-radius:8px; }
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<b>Style</b><br>
<button onclick="setStyle('semi')">Semi-Realistic</button>
<button onclick="setStyle('photo')">Photorealistic</button>
<button onclick="setStyle('cinematic')">Cinematic</button>
<button onclick="setStyle('anime')">Anime</button>

<textarea id="prompt" placeholder="Describe the image..."></textarea>

<label>
<input type="checkbox" id="lock">
 Lock face & body
</label>

<input id="seed" placeholder="Seed (optional, e.g. 777)" />

<label style="margin-top:10px;display:block">
Reference Image (optional):
<input type="file" id="ref" accept="image/*">
</label>

<button style="width:100%;margin-top:14px;font-size:18px" onclick="go()">Generate</button>

<div id="result"></div>

<script>
let styleText = "";
const styles = {
  semi: "semi-realistic, consistent face, proportional anatomy",
  photo: "photorealistic, DSLR, same character identity",
  cinematic: "cinematic lighting, film still, same face",
  anime: "anime style, consistent character design"
};

function setStyle(k){
  styleText = styles[k];
  document.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  event.target.classList.add("active");
}

async function go(){
  let p = prompt.value.trim();
  if(!p) return alert("Enter a prompt");

  if(styleText) p = styleText + ", " + p;
  if(lock.checked) p = "same character, same face, same body, " + p;

  const fd = new FormData();
  fd.append("prompt", p);
  fd.append("seed", seed.value);
  if(ref.files[0]) fd.append("reference", ref.files[0]);

  result.innerHTML = "Generating…";

  const r = await fetch("/generate", { method:"POST", body:fd });
  if(!r.ok){
    result.innerText = await r.text();
    return;
  }

  const img = document.createElement("img");
  img.src = URL.createObjectURL(await r.blob());
  result.innerHTML = "";
  result.appendChild(img);
}
</script>

</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  },
};
