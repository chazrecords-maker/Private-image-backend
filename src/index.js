export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- BASIC AUTH ----------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private App"' },
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
          hfTokenPresent: !!env.HF_TOKEN,
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
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: body.inputs }),
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
<body style="background:#111;color:#fff;font-family:sans-serif;padding:20px">
<h2>Private Image Generator</h2>
<textarea id="p" style="width:100%;height:120px"></textarea>
<button onclick="go()">Generate</button>
<div id="r"></div>
<script>
async function go(){
  const res = await fetch('/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({inputs:p.value})
  });
  if(!res.ok){ r.innerText = await res.text(); return }
  const img = document.createElement('img');
  img.src = URL.createObjectURL(await res.blob());
  img.style.maxWidth='100%';
  r.innerHTML='';
  r.appendChild(img);
}
</script>
</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  },
};
