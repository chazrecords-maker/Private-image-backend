export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ================= AUTH ================= */
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private App"' }
      });
    }

    let user, pass;
    try {
      [user, pass] = atob(auth.split(" ")[1]).split(":");
    } catch {
      return new Response("Invalid auth", { status: 401 });
    }

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ================= HEALTH ================= */
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "OK",
        hasHF: !!env.HF_TOKEN
      }), { headers: { "Content-Type": "application/json" } });
    }

    /* ================= UI ================= */
    if (url.pathname === "/") {
      return new Response(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Private Image Generator</title>
<style>
body { background:#0f0f0f; color:#eee; font-family:sans-serif; max-width:720px; margin:auto; padding:20px }
textarea { width:100%; height:120px; background:#1a1a1a; color:#fff; border:1px solid #444; padding:10px }
button { margin-top:10px; padding:10px 16px; background:#6366f1; color:#fff; border:none }
img { margin-top:20px; max-width:100% }
</style>
</head>
<body>
<h2>Private Image Generator</h2>
<textarea id="prompt" placeholder="Describe the image"></textarea>
<br>
<button onclick="go()">Generate</button>
<div id="status"></div>
<img id="img">
<script>
async function go(){
  const p=document.getElementById("prompt").value;
  document.getElementById("status").innerText="Generating...";
  const r=await fetch("/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inputs:p})});
  if(!r.ok){document.getElementById("status").innerText=await r.text();return;}
  const b=await r.blob();
  document.getElementById("img").src=URL.createObjectURL(b);
  document.getElementById("status").innerText="";
}
</script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
    }

    /* ================= GENERATE ================= */
    if (url.pathname === "/generate" && request.method === "POST") {
      const body = await request.json();
      if (!body.inputs) {
        return new Response("Missing inputs", { status: 400 });
      }

      const hf = await fetch(
        "https://router.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.HF_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: body.inputs
          })
        }
      );

      if (!hf.ok) {
        return new Response(
          "HF ERROR:\n" + await hf.text(),
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
