export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------------- HEALTH CHECK ---------------- */
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

    /* ---------------- BASIC AUTH ---------------- */
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
      return new Response("Unauthorized", { status: 401 });
    }

    const [user, pass] = decoded.split(":");
    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ---------------- UI (ROOT) ---------------- */
    if (url.pathname === "/") {
      return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  font-family: system-ui, -apple-system;
  background:#0f1115;
  color:#fff;
  margin:0;
  padding:16px;
}
textarea {
  width:100%;
  height:140px;
  font-size:16px;
  padding:10px;
}
select, button {
  width:100%;
  margin-top:10px;
  padding:12px;
  font-size:16px;
}
img {
  width:100%;
  margin-top:16px;
  border-radius:12px;
}
</style>
</head>
<body>
<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe the image..."></textarea>

<select id="style">
  <option value="semi">Semi-Realistic</option>
  <option value="anime">Anime / Animated</option>
</select>

<label>
  <input type="checkbox" id="lock" checked>
  Character Lock (face/body)
</label>

<button onclick="generate()">Generate</button>

<img id="out"/>

<script>
async function generate() {
  const prompt = document.getElementById("prompt").value;
  const style = document.getElementById("style").value;
  const lock = document.getElementById("lock").checked;

  const res = await fetch("/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt, style, lock })
  });

  if (!res.ok) {
    alert("Generation failed");
    return;
  }

  const blob = await res.blob();
  document.getElementById("out").src = URL.createObjectURL(blob);
}
</script>
</body>
</html>
      `, { headers: { "Content-Type": "text/html" } });
    }

    /* ---------------- GENERATE ---------------- */
    if (url.pathname === "/generate" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const styleMap = {
        semi: "high quality semi-realistic portrait, detailed skin, natural lighting",
        anime: "anime style illustration, clean lines, vibrant colors"
      };

      let finalPrompt =
        styleMap[data.style || "semi"] +
        ", " +
        (data.prompt || "");

      if (data.lock) {
        finalPrompt +=
          ", same face, same body proportions, consistent character identity";
      }

      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.HF_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: finalPrompt
          })
        }
      );

      if (!hfResponse.ok) {
        const err = await hfResponse.text();
        return new Response("HF ERROR:\n" + err, { status: 500 });
      }

      return new Response(await hfResponse.arrayBuffer(), {
        headers: { "Content-Type": "image/png" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
