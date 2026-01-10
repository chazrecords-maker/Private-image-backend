export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =====================
       BASIC AUTH
    ====================== */
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

    /* =====================
       HEALTH CHECK
    ====================== */
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "OK",
          env: {
            user: !!env.APP_USER,
            pass: !!env.APP_PASS,
            hf: !!env.HF_TOKEN
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* =====================
       IMAGE GENERATION
    ====================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.prompt) {
          return new Response(
            JSON.stringify({ error: "Missing prompt" }),
            { status: 400 }
          );
        }

        const styleMap = {
          realism: "photorealistic, ultra-detailed",
          anime: "anime style, clean line art, vibrant colors",
          cinematic: "cinematic lighting, dramatic shadows"
        };

        const styleText = styleMap[body.style] || "";
        const finalPrompt = `${styleText}, ${body.prompt}`;

        const hf = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/sdxl-turbo",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: finalPrompt
            })
          }
        );

        if (!hf.ok) {
          const text = await hf.text();
          return new Response(
            JSON.stringify({
              error: "HF generation failed",
              status: hf.status,
              details: text
            }),
            { status: 500 }
          );
        }

        return new Response(await hf.arrayBuffer(), {
          headers: { "Content-Type": "image/png" }
        });

      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500 }
        );
      }
    }

    /* =====================
       UI
    ====================== */
    return new Response(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Private Image Generator</title>
<style>
body{background:#0f0f0f;color:#fff;font-family:sans-serif;padding:20px}
textarea{width:100%;height:180px;font-size:16px;padding:12px;border-radius:8px}
select,button{width:100%;padding:14px;margin-top:10px;font-size:16px;border-radius:8px}
button{background:#4caf50;border:0;color:#fff}
img{margin-top:20px;max-width:100%;border-radius:10px}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe the image…"></textarea>

<select id="style">
  <option value="realism">Realistic</option>
  <option value="anime">Anime / Animated</option>
  <option value="cinematic">Cinematic</option>
</select>

<button onclick="go()">Generate</button>

<img id="img">

<script>
async function go(){
  const prompt=document.getElementById("prompt").value;
  const style=document.getElementById("style").value;

  const r=await fetch("/generate",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ prompt, style })
  });

  if(!r.ok){
    const t=await r.text();
    alert("Generation failed\\n"+t);
    return;
  }

  document.getElementById("img").src=
    URL.createObjectURL(await r.blob());
}
</script>

</body>
</html>
`, {
      headers: { "Content-Type": "text/html" }
    });
  }
};
