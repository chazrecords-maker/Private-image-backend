export default {
  async fetch(request, env) {
    const USER = env.APP_USER;
    const PASS = env.APP_PASS;
    const HF_TOKEN = env.HF_TOKEN;

    return new Response(
      "Bindings loaded successfully",
      { status: 200 }
    );
  }
};
