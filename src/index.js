// --- GENERATE ENDPOINT ---
if (url.pathname === "/generate" && request.method === "POST") {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400 }
    );
  }

  const prompt = body.inputs;
  if (!prompt) {
    return new Response(
      JSON.stringify({ error: "Missing inputs field" }),
      { status: 400 }
    );
  }

  const hfResponse = await fetch(
    "https://router.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    }
  );

  if (!hfResponse.ok) {
    return new Response(
      JSON.stringify({ error: await hfResponse.text() }),
      { status: 500 }
    );
  }

  return new Response(await hfResponse.arrayBuffer(), {
    headers: { "Content-Type": "image/png" }
  });
}
