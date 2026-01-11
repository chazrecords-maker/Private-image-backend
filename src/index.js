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

    // ---------- GENERATE (DO NOT TOUCH PAYLOAD) ----------
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
  font-family:system-ui,sans-serif;
  padding:20px;
}
textarea {
  width:100%;
  height:180px;
  background:#000;
  color:#fff;
  border:1px solid #444;
  padding:10px;
  font-size:16px;
}
button {
  margin:6px 4px;
  padding:10px 14px;
  background:#222;
  color:#fff;
  border:1px solid #555;
  border-radius:6px;
}
button:hover { background:#333; }
#r img { max-width:100%; margin-top:20px; border-radius:8px; }
.small { opacity:.7; font-size:14px; }
</style>
</head>

<body>
<h2>Private Image Generator</h2>

<div class="small">Style presets (text-only, HF safe):</div>
<button onclick="setStyle('Semi-realistic, high detail, natural lighting')">Semi-Realistic</button>
<button onclick="setStyle('Anime style, clean lines, vibrant colors')">Anime</button>
<button onclick="setStyle('Cinematic lighting, dramatic composition')">Cinematic</button>

<br><br>

<div class="small">Character lock (face & body description):</div>
<textarea id="char" placeholder="Describe the character to keep consistent (face, body, features)..."></textarea>

<br><br>

<div class="small">Prompt:</div>
<textarea id="p" placeholder="Describe the scene, pose, outfit, environment..."></textarea>

<br><br>

<button onclick="go()">Generate</button>

<div id="r"></div>

<script>
let styleText = "";

function setStyle(t){
  styleText = t;
}

async function go(){
  r.innerHTML = "Generating…";

  const fullPrompt =
    (styleText ? styleText + ", " : "") +
    (char.value ? "Same character: " + char.value + ". " : "") +
    p.value;

  const res = await fetch('/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ inputs: fullPrompt })
  });

  if(!res.ok){
    r.innerText = await res.text();
    return;
  }

  const img = document.createElement('img');
  img.src = URL.createObjectURL(await res.blob());
  r.innerHTML = '';
  r.appendChild(img);
}
</script>

</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  },
};
