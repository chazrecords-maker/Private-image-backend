export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------------- BASIC AUTH ---------------- */
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

    /* ---------------- HEALTH ---------------- */
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

    /* ---------------- UI ---------------- */
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
  height:220px;
  padding:12px;
  font-size:16px;
  margin-top:10px;
}
select, button {
  width:100%;
  padding:10px;
  margin-top:10px;
}
img {
  max-width:100%;
  margin-top:16px;
  border-radius:8px;
}
label {
  display:block;
  margin-top:10px;
}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe the image in detail..."></textarea>

<select id="style">
  <option value="semi">Semi-Realistic</option>
  <option value="photo">Photorealistic</option>
  <option value="anime">Anime / Animated</option>
  <option value="art">Illustration</option>
</select>

<label>
  <input type="checkbox" id="charlock" checked>
  Character Lock
</label>

<label>
  <input type="checkbox" id="facelock">
  Face-Only Lock
</label>

<button onclick="generate()">Generate</button>

<img id="out"/>

<script>
async function generate() {
  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: document.getElementById("prompt").value,
      style: document.getElementById("style").value,
      characterLock: document.getElementById("charlock").checked,
      faceLock: document.getElementById("facelock").checked
    })
  });

  if (!res.ok) {
    const t = await res.text();
    alert("Generation failed:\\n" + t);
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

    /* ---------------- GENERATE ---------------- */
    if (request.method === "POST" && url.pathname === "/generate") {
      const body = await request.json();

      const styleMap = {
        semi: "semi realistic, high detail, cinematic lighting",
        photo: "photorealistic, ultra detailed, 85mm lens",
        anime: "anime style, animated, clean line art, vibrant colors, studio ghibli inspired",
        art: "stylized illustration, clean lines, vibrant colors"
      };

      let prompt = `${styleMap[body.style] || ""}. ${body.prompt}`;

      if (body.characterLock) {
        prompt += ", consistent character, same person, same facial structure";
      }

      if (body.faceLock) {
        prompt += ", identical face, same eyes, same nose, same mouth";
      }

      const hf = await fetch(
        "https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5",
        {
          method: "POST",
          headers: {
            "Authorization": \`Bearer \${env.HF_TOKEN}\`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
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
