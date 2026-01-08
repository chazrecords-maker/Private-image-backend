export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ======================
       BASIC AUTH
    ====================== */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    let decoded;
    try {
      decoded = atob(auth.split(" ")[1]);
    } catch {
      return new Response("Invalid Authorization header", { status: 401 });
    }

    const [user, pass] = decoded.split(":");
    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ======================
       HEALTH CHECK
    ====================== */
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

    /* ======================
       GENERATE (NO IMAGE)
    ====================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      const body = await request.json();

      if (!body.inputs) {
        return new Response(
          JSON.stringify({ error: "Missing inputs field" }),
          { status: 400 }
        );
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: body.inputs,
            parameters: {
              guidance_scale: 7.5,
              num_inference_steps: 35
            }
          })
        }
      );

      if (!hfResponse.ok) {
        return new Response(await hfResponse.text(), { status: 500 });
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    /* ======================
       GENERATE WITH REFERENCE IMAGE
    ====================== */
    if (url.pathname === "/generate-with-reference" && request.method === "POST") {
      const form = await request.formData();
      const prompt = form.get("prompt");
      const image = form.get("image");

      if (!prompt || !image) {
        return new Response(
          JSON.stringify({ error: "Missing prompt or image" }),
          { status: 400 }
        );
      }

      const hfForm = new FormData();
      hfForm.append("inputs", prompt);
      hfForm.append("image", image);

      const hfResponse = await fetch(
        "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`
          },
          body: hfForm
        }
      );

      if (!hfResponse.ok) {
        return new Response(await hfResponse.text(), { status: 500 });
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    /* ======================
       PRIVATE UI
    ====================== */
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Private Image Generator</title>
<style>
body {
  background:#0e0e11;
  color:#fff;
  font-family:sans-serif;
  padding:30px;
}
input, textarea, select, button {
  width:100%;
  margin-top:10px;
  padding:10px;
  background:#1c1c22;
  color:white;
  border:1px solid #333;
}
button {
  cursor:pointer;
  background:#4f46e5;
  border:none;
}
img {
  margin-top:20px;
  max-width:100%;
}
</style>
</head>

<body>
<h2>Private Image Generator</h2>

<label>Prompt</label>
<textarea id="prompt" rows="4"></textarea>

<label>Reference Mode</label>
<select id="mode">
  <option value="none">No Reference</option>
  <option value="image">Image Reference (Identity)</option>
</select>

<div id="imageBox" style="display:none;">
  <label>Reference Image</label>
  <input type="file" id="image" accept="image/*" />
</div>

<button onclick="generate()">Generate</button>

<img id="result" />

<script>
document.getElementById("mode").addEventListener("change", e => {
  document.getElementById("imageBox").style.display =
    e.target.value === "image" ? "block" : "none";
});

async function generate() {
  const prompt = document.getElementById("prompt").value;
  const mode = document.getElementById("mode").value;
  let res;

  if (mode === "image") {
    const img = document.getElementById("image").files[0];
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("image", img);

    res = await fetch("/generate-with-reference", {
      method: "POST",
      body: fd
    });
  } else {
    res = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt })
    });
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
};
