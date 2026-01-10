export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ========== BASIC AUTH ========== */
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

    /* ========== HEALTH ========== */
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

    /* ========== UI ========== */
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body {
  background:#0b0b0b;
  color:#fff;
  font-family:system-ui;
  padding:16px;
}
textarea {
  width:100%;
  height:260px;
  padding:14px;
  font-size:16px;
  border-radius:8px;
}
button {
  padding:10px;
  border-radius:8px;
  border:none;
  background:#222;
  color:#fff;
}
button.active { background:#3b82f6; }
.group { display:flex; gap:8px; margin-top:8px; }
.group button { flex:1; }
label { display:block; margin-top:12px; }
img.main {
  max-width:100%;
  margin-top:16px;
  border-radius:10px;
}
#history {
  display:flex;
  gap:8px;
  overflow-x:auto;
  margin-top:14px;
}
#history img {
  height:70px;
  border-radius:6px;
  cursor:pointer;
  opacity:0.85;
}
#history img:hover { opacity:1; }
input[type=file], input[type=number] {
  width:100%;
  margin-top:8px;
}
</style>
</head>
<body>

<h2>Private Image Generator</h2>

<textarea id="prompt" placeholder="Describe pose, outfit, lighting, mood, camera angle..."></textarea>

<label>Style</label>
<div class="group">
  <button class="active" onclick="setStyle(this,'semi')">Semi-Realistic</button>
  <button onclick="setStyle(this,'photo')">Photoreal</button>
  <button onclick="setStyle(this,'anime')">Anime</button>
  <button onclick="setStyle(this,'art')">Illustration</button>
</div>

<label><input type="checkbox" id="charlock" checked> Character Lock</label>
<label><input type="checkbox" id="facelock"> Face-Only Lock</label>

<label>Anchor Strength</label>
<div class="group">
  <button onclick="setAnchor(this,'low')">Low</button>
  <button class="active" onclick="setAnchor(this,'medium')">Medium</button>
  <button onclick="setAnchor(this,'high')">High</button>
</div>

<label>Reference Influence</label>
<div class="group">
  <button onclick="setInfluence(this,'low')">Low</button>
  <button class="active" onclick="setInfluence(this,'medium')">Medium</button>
  <button onclick="setInfluence(this,'high')">High</button>
</div>

<label>Reference Image</label>
<input type="file" id="refimg" accept="image/*">

<label>Seed (optional)</label>
<input type="number" id="seed" placeholder="Same seed = similar results">

<button onclick="generate()">Generate Image</button>

<img id="mainImage" class="main"/>
<div id="history"></div>

<script>
let style="semi", anchor="medium", influence="medium";
const history=[];

function setStyle(btn,v){style=v;btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function setAnchor(btn,v){anchor=v;btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function setInfluence(btn,v){influence=v;btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}

async function generate(){
  const ref=document.getElementById("refimg").files[0];
  if(document.getElementById("charlock").checked && !ref){
    alert("Reference image required when Character Lock is ON.");
    return;
  }

  const form=new FormData();
  form.append("prompt",prompt.value);
  form.append("style",style);
  form.append("characterLock",charlock.checked);
  form.append("faceLock",facelock.checked);
  form.append("anchor",anchor);
  form.append("influence",influence);
  if(ref) form.append("reference",ref);
  if(seed.value) form.append("seed",seed.value);

  const r=await fetch("/generate",{method:"POST",body:form});
  if(!r.ok){alert(await r.text());return;}

  const blob=await r.blob();
  const url=URL.createObjectURL(blob);

  mainImage.src=url;
  history.unshift(url);
  if(history.length>10) history.pop();

  historyDiv.innerHTML="";
  history.forEach(u=>{
    const img=document.createElement("img");
    img.src=u;
    img.onclick=()=>mainImage.src=u;
    historyDiv.appendChild(img);
  });
}
</script>

</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /* ========== GENERATE ========== */
    if (request.method === "POST" && url.pathname === "/generate") {
      const d = await request.formData();

      const styleMap={
        semi:"semi realistic, cinematic lighting, high detail",
        photo:"photorealistic, ultra detailed, studio lighting",
        anime:"anime style, animated, clean line art",
        art:"stylized illustration, painterly"
      };
      const anchorMap={
        low:"similar facial features",
        medium:"consistent facial structure and body proportions",
        high:"identical face and body identity, allow pose variation"
      };
      const influenceMap={
        low:"reference loosely guides identity",
        medium:"reference strongly guides identity",
        high:"reference strictly defines identity"
      };

      let prompt=\`\${styleMap[d.get("style")]}, \${d.get("prompt")}\`;
      if(d.get("characterLock")==="true"){
        prompt+=\`, \${anchorMap[d.get("anchor")]}, \${influenceMap[d.get("influence")]}\`;
      }
      if(d.get("faceLock")==="true"){
        prompt+=", identical face, same eyes, nose, mouth";
      }

      const payload={inputs:prompt};
      if(d.get("seed")) payload.parameters={seed:Number(d.get("seed"))};

      const hf=await fetch(
        "https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5",
        {
          method:"POST",
          headers:{
            "Authorization":\`Bearer \${env.HF_TOKEN}\`,
            "Content-Type":"application/json"
          },
          body:JSON.stringify(payload)
        }
      );

      if(!hf.ok){
        return new Response("HF ERROR:\\n"+await hf.text(),{status:500});
      }

      return new Response(await hf.arrayBuffer(),{
        headers:{ "Content-Type":"image/png" }
      });
    }

    return new Response("Not Found",{status:404});
  }
};
