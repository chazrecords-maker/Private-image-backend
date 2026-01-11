export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------------- BASIC AUTH ---------------- */
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

    /* ---------------- HEALTH ---------------- */
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

    /* ---------------- GENERATE ---------------- */
    if (url.pathname === "/generate" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body?.prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      const parameters = {
        width: 1024,
        height: 1024,
      };

      if (body.seed !== "") {
        parameters.seed = Number(body.seed);
      }

      if (body.reference) {
        parameters.image = body.reference;
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
            inputs: body.prompt,
            parameters,
          }),
        }
      );

      if (!hf.ok) {
        return new Response(`HF ERROR:\n${await hf.text()}`, { status: 500 });
      }

      return new Response(await hf.arrayBuffer(), {
        headers: { "Content-Type": "image/png" },
      });
    }

    /* ---------------- UI ---------------- */
    return new Response(`
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Private Image Generator</title>
<style>
body { background:#111;color:#fff;font-family:sans-serif;padding:20px }
textarea,input,select,button { width:100%;margin-top:10px;padding:10px;font-size:16px }
button { background:#333;color:#fff;border:none;border-radius:6px }
button.active { background:#4caf50 }
img { max-width:100%;margin-top:20px;border-radius:8px }
.small { font-size:13px;opacity:.8 }
</style>
</head>

<body>
<h2>Private Image Generator</h2>

<label>Character Profile</label>
<select id="profile"></select>
<button onclick="saveProfile()">Save Profile</button>
<button onclick="deleteProfile()">Delete Profile</button>

<label class="small">Reference Image (optional)</label>
<input type="file" id="ref" accept="image/*">

<label>Seed (optional – same number = same face)</label>
<input id="seed" placeholder="e.g. 777">

<label>
<input type="checkbox" id="lock"> Lock face & body (pose may change)
</label>

<label>Style</label>
<select id="style">
<option value="">None</option>
<option value="semi">Semi-Realistic</option>
<option value="cinematic">Cinematic</option>
<option value="photo">Photorealistic</option>
<option value="anime">Anime</option>
</select>

<textarea id="prompt" placeholder="Describe the image..."></textarea>
<button onclick="generate()">Generate</button>

<div id="result"></div>

<script>
const styles = {
  semi: "semi-realistic, consistent facial features, proportional anatomy",
  cinematic: "cinematic lighting, dramatic shadows, film still",
  photo: "photorealistic, sharp focus, DSLR",
  anime: "anime style, clean lineart, consistent character design"
};

let profiles = JSON.parse(localStorage.getItem("profiles") || "{}");

function refreshProfiles(){
  profile.innerHTML = "<option value=''>New Character</option>";
  Object.keys(profiles).forEach(k=>{
    const o=document.createElement("option");
    o.value=k;o.textContent=k;
    profile.appendChild(o);
  });
}
refreshProfiles();

profile.onchange=()=>{
  const p=profiles[profile.value];
  if(!p)return;
  seed.value=p.seed||"";
  lock.checked=p.lock||false;
};

function saveProfile(){
  const name=prompt("Character name?");
  if(!name)return;
  profiles[name]={
    seed:seed.value,
    lock:lock.checked
  };
  localStorage.setItem("profiles",JSON.stringify(profiles));
  refreshProfiles();
  profile.value=name;
}

function deleteProfile(){
  if(!profile.value)return;
  delete profiles[profile.value];
  localStorage.setItem("profiles",JSON.stringify(profiles));
  refreshProfiles();
}

async function generate(){
  let p=prompt.value.trim();
  if(!p)return;

  if(style.value) p = styles[style.value]+", "+p;
  if(lock.checked) p = "same character, same face, same body structure, "+p;

  let refData=null;
  if(ref.files[0]){
    const b=await ref.files[0].arrayBuffer();
    refData = btoa(String.fromCharCode(...new Uint8Array(b)));
  }

  result.innerHTML="Generating...";
  const r = await fetch("/generate",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      prompt:p,
      seed:seed.value,
      reference:refData
    })
  });

  if(!r.ok){
    result.innerText=await r.text();
    return;
  }

  const img=document.createElement("img");
  img.src=URL.createObjectURL(await r.blob());
  result.innerHTML="";
  result.appendChild(img);
}
</script>
</body>
</html>
`, { headers: { "Content-Type": "text/html" } });
  },
};
