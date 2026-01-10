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
          hasUser: !!env.APP_USER,
          hasPass: !!env.APP_PASS,
          hasHF: !!env.HF_TOKEN
        }, null, 2),
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
          realism: "photorealistic, ultra-detailed, sharp focus",
          anime: "anime style, clean line art, vibrant colors",
          cinematic: "cinematic lighting, dramatic shadows, film still"
        };

        const styleText = styleMap[body.style] || "";
        const finalPrompt = `${styleText}, ${body.prompt}`;

        const hfRes = await fetch(
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

        const contentType = hfRes.headers.get("content-type") || "";

        /* ---------- HF RETURNED JSON ERROR ---------- */
        if (!contentType.includes("image")) {
          const errText = await hfRes.text();
          return new Response(
            JSON.stringify({
              error: "Hugging Face rejected the request",
              status: hfRes.status,
              response: errText
            }, null, 2),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        /* ---------- IMAGE OK ---------- */
        return new Response(await hfRes.arrayBuffer(), {
          headers: { "Content-Type": "image/png" }
        });

      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }, null, 2),
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
textarea{width:100%;height:200px;font-size:16px;padding:12px;border-radius:8px}
select,button{width:100%;padding:14px;margin-top:10px;font-size:16px;border-radius:8px}
button{background:#4caf50;border:0;color:#fff}
img{margin-top:20px;max-width:100%;border-radius:10px}
pre{background:#222;padding:12px;border-radius:8px;white-space:pre-wrap}
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
<pre id="err"></pre>

<script>
async function go(){
  document.getElementById("err").textContent="";
  document.getElementById("img").src="";

  const r=await fetch("/generate",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      prompt:document.getElementById("prompt").value,
      style:document.getElementById("style").value
    })
  });

  if(!r.ok){
    document.getElementById("err").textContent =
      await r.text();
    return;
  }

  document.getElementById("img").src =
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
