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
       HEALTH CHECK
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
       GENERATE IMAGE
    ======================= */
    if (url.pathname === "/generate" && request.method === "POST") {
      const form = await request.formData();

      const promptText = form.get("prompt");
      if (!promptText) {
        return new Response("Missing prompt", { status: 400 });
      }

      const style = form.get("style") || "semi";
      const lockChar = form.get("lock") === "on";
      const refImage = form.get("reference");

      const styleMap = {
        semi: "semi-realistic, highly detailed, cinematic lighting",
        anime: "anime style, clean lines, vibrant colors, detailed illustration"
      };

      let finalPrompt = styleMap[style] + ", " + promptText;
      if (lockChar) {
        finalPrompt += ", same face, same body proportions, consistent character";
      }

      let hfResponse;

      // ----- If reference image provided -----
      if (refImage && refImage instanceof File && refImage.size > 0) {
        const hfForm = new FormData();
        hfForm.append("inputs", finalPrompt);
        hfForm.append("image", refImage);

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
      } 
      // ----- Text-only generation -----
      else {
        hfResponse = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: finalPrompt,
              parameters: {
                width: 1024,
                height: 1024
              }
            })
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
       PRIVATE WEB UI
    ======================= */
    return new Response(`
<!doctype html>
<html>
<head>
<title>Private Image Generator</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="background:#0f0f0f;color:#fff;font-family:sans-serif;padding:20px">
<h2>Private Image Generator</h2>

<textarea id="prompt"
placeholder="Describe your image..."
style="width:100%;height:160px;font-size:16px"></textarea>

<br><br>

<b>Style</b><br>
<label><input type="radio" name="style" value="semi" checked> Semi-Realistic</label>
<label style="margin-left:12px">
<input type="radio" name="style" value="anime"> Anime
</label>

<br><br>

<label>
<input type="checkbox" id="lock"> Character Lock
</label>

<br><br>

<b>Reference Image (optional)</b><br>
<input type="file" id="ref" accept="image/*">

<br><br>

<button onclick="go()" style="padding:10px 18px;font-size:16px">
Generate
</button>

<div id="result" style="margin-top:20px"></div>

<script>
async function go() {
  const result = document.getElementById("result");
  result.innerHTML = "Generating...";

  const fd = new FormData();
  fd.append("prompt", prompt.value);
  fd.append("style", document.querySelector('input[name="style"]:checked').value);
  fd.append("lock", lock.checked ? "on" : "off");

  if (ref.files.length > 0) {
    fd.append("reference", ref.files[0]);
  }

  const res = await fetch("/generate", {
    method: "POST",
    body: fd
  });

  if (!res.ok) {
    result.innerText = await res.text();
    return;
  }

  const img = document.createElement("img");
  img.src = URL.createObjectURL(await res.blob());
  img.style.maxWidth = "100%";

  result.innerHTML = "";
  result.appendChild(img);
}
</script>

</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  }
};
