export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        status: "OK",
        message: "Worker is reachable and running",
        hasUser: !!env.APP_USER,
        hasPass: !!env.APP_PASS,
        hasHF: !!env.HF_TOKEN
      }, null, 2),
      { status: 200 }
    );
  }
};
