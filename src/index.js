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
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (!body?.prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      const styleMap = {
        semi: "semi-realistic, highly detailed, natural lighting, realistic textures",
        anime: "anime style, clean lineart, vibrant colors, detailed anime illustration",
        cinematic: "cinematic lighting, ultra detailed, dramatic composition, photorealistic",
      };

      let finalPrompt = `${styleMap[body.style] || styleMap.semi}, ${body.prompt}`;

      if (body.lock === true) {
        finalPrompt =
          "same character identity, consistent face, same body proportions, " +
          finalPrompt;
      }

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: finalPrompt,
            parameters: {
              width: 1024,
              height: 1024,
              guidance_scale: 7,
              num_inference_steps: 30,
            },
          }),
        }
      );

      if (!hf.ok) {
        return new Response(
          `HF ERROR:\n${await hf.text()}`,
          { status: 500 }
        );
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
<title>Private Image Generator</title>
</head>
<body style="background:#111;color:#fff;font-family:sans-serif;padding:20px">
<h2>Private Image Generator</h2>

<label>Style</label><br>
<select id="style" style="width:100%;font-size:16px">
  <option value="semi">Semi-Realistic</option>
  <option value="anime">Anime</option>
  <option value="cinematic">Cinematic</option>
</select><br><br>

<label>
<input type="checkbox" id="lock">
 Lock character (same face & body)
</label><br><br>

<textarea id="p" placeholder="Enter prompt..."
style="width:100%;height:180px;font-size:16px"></textarea><br><br>

<button onclick="go()" style="font-size:16px;padding:10px 20px">
Generate
</button>

<div id="r" style="margin-top:20px"></div>

<script>
async function go(){
  r.innerHTML = "Generating...";
  const res = await fetch('/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      prompt:p.value,
      style:style.value,
      lock:lock.checked
    })
  });

  if(!res.ok){
    r.innerText = await res.text();
    return;
  }

  const img = document.createElement('img');
  img.src = URL.createObjectURL(await res.blob());
  img.style.maxWidth = '100%';
  r.innerHTML = '';
  r.appendChild(img);
}
</script>
</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  },
};
