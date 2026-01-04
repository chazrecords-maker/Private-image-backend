addEventListener("fetch", event => {
  event.respondWith(
    new Response("Worker entry point OK", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })
  );
});
