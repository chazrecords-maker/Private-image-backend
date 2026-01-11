export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------
    // HEALTH
    // -----------------------
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

    // -----------------------
    // BASIC AUTH
    // -----------------------
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Private Image App"' }
      });
    }

    const decoded = atob(auth.split(" ")[1]);
    const [user, pass] = decoded.split(":");

    if (user !== env.APP_USER || pass !== env.APP_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    // -----------------------
    // UI
    // -----------------------
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body{font-family:system-ui;background:#111;color:#fff;padding:20px}
textarea{width:100%;height:140px;font-size:16px}
button{margin-top:10px;padding:12px;font-size:16px}
pre{white-space:pre-wrap;background:#222;padding:10px;border-radius:6px}
img{margin-top:15px;max-width:100%}
</style>
</head>
<body>
<h2>Private Image Generator (Debug)</h2>
<textarea id="prompt" placeholder="Describe the image..."></textarea>
<br>
<button onclick="gen()">Generate</button>
<div id="out"></div>

<script>
async function gen(){
  const p=document.getElementById("prompt").value;
  document.getElementById("out").innerHTML="Generating…";
  const r=await fetch("/generate",{method:"POST",headers:{"Content-Type":"text/plain"},body:p});
  const ct=r.headers.get("content-type")||"";
  if(!r.ok){
    document.getElementById("out").innerHTML="<pre>"+await r.text()+"</pre>";
    return;
  }
  if(ct.includes("image")){
    const b=await r.blob();
    const i=document.createElement("img");
    i.src=URL.createObjectURL(b);
    document.getElementById("out").innerHTML="";
    document.getElementById("out").appendChild(i);
  }else{
    document.getElementById("out").innerHTML="<pre>"+await r.text()+"</pre>";
  }
}
</script>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // -----------------------
    // GENERATE
    // -----------------------
    if (url.pathname === "/generate" && request.method === "POST") {
      const prompt = await request.text();

      const hf = await fetch(
        "https://router.huggingface.co/models/stabilityai/sdxl-turbo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      const contentType = hf.headers.get("content-type") || "";

      if (!hf.ok) {
        const errText = await hf.text();
        return new Response(
          "HF ERROR (" + hf.status + "):\n" + errText,
          { status: 500 }
        );
      }

      if (!contentType.includes("image")) {
        return new Response(
          "HF RETURNED NON-IMAGE:\n" + await hf.text(),
          { status: 500 }
        );
      }

      return new Response(await hf.arrayBuffer(), {
        headers: { "Content-Type": contentType }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
