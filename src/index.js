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
      const body = await request.json().catch(() => null);
      if (!body?.inputs) {
        return new Response("Missing prompt", { status: 400 });
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
            inputs: body.inputs,
            parameters: {
              width: 1024,
              height: 1024,
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  background:#111;
  color:#fff;
  font-family:sans-serif;
  padding:20px;
}
button {
  padding:10px 14px;
  margin:6px 4px;
  border:none;
  border-radius:6px;
  background:#333;
  color:#fff;
}
button.active {
  background:#4caf50;
}
textarea {
  width:100%;
  height:160px;
  margin-top:12px;
  padding:10px;
  font-size:16px;
}
#result img {
  max-width:100%;
  margin-top:20px;
  border-radius:8px;
}
</style>
</head>

<body>
<h2>Private Image Generator</h2>

<div>
<b>Style Preset:</b><br>
<button onclick="setStyle('semi')">Semi-Realistic</button>
<button onclick="setStyle('cinematic')">Cinematic</button>
<button onclick="setStyle('photo')">Photorealistic</button>
<button onclick="setStyle('anime')">Anime</button>
<button onclick="setStyle('illustration')">Illustration</button>
</div>

<textarea id="prompt" placeholder="Describe the image..."></textarea>

<button style="margin-top:14px;width:100%;font-size:18px" onclick="go()">Generate</button>

<div id="result"></div>

<script>
let styleText = "";

const styles = {
  semi: "semi-realistic, high detail, natural lighting, realistic proportions",
  cinematic: "cinematic lighting, dramatic shadows, ultra detailed, film still",
  photo: "photorealistic, sharp focus, DSLR, ultra high resolution",
  anime: "anime style, clean lineart, vibrant colors, detailed illustration",
  illustration: "digital illustration, painterly, soft shading, detailed art"
};

function setStyle(key) {
  styleText = styles[key];
  document.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");
}

async function go() {
  const p = document.getElementById("prompt").value.trim();
  if (!p) return alert("Enter a prompt");

  const finalPrompt = styleText ? styleText + ", " + p : p;

  result.innerHTML = "Generating...";

  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: finalPrompt })
  });

  if (!res.ok) {
    result.innerText = await res.text();
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
  },
};
