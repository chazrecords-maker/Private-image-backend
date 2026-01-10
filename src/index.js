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
       HEALTH
    ====================== */
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

    /* =====================
       GENERATE IMAGE
    ====================== */
    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.inputs || typeof body.inputs !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid inputs field" }),
            { status: 400 }
          );
        }

        const hf = await fetch(
          "https://router.huggingface.co/hf-inference/models/stabilityai/sdxl-turbo",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: body.inputs
            })
          }
        );

        if (!hf.ok) {
          const text = await hf.text();
          return new Response(
            JSON.stringify({ hf_status: hf.status, hf_error: text }),
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
       PRIVATE UI
    ====================== */
    return new Response(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Private Image Generator</title>
<style>
body{background:#0f0f0f;color:#fff;font-family:sans-serif;padding:20px}
textarea{width:100%;height:160px;font-size:16px;padding:10px}
button{width:100%;padding:14px;margin-top:10px;font-size:16px;background:#4caf50;border:0;color:#fff}
img{margin-top:20px;max-width:100%;border-radius:10px}
</style>
</head>
<body>
<h2>Private Image Generator</h2>
<textarea id="prompt" placeholder="Describe the image…"></textarea>
<button onclick="go()">Generate</button>
<img id="img">
<script>
async function go(){
  const p=document.getElementById("prompt").value;
  const r=await fetch("/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inputs:p})});
  if(!r.ok){alert("Generation failed");return;}
  document.getElementById("img").src=URL.createObjectURL(await r.blob());
}
</script>
</body>
</html>
`, {
      headers: { "Content-Type": "text/html" }
    });
  }
};
