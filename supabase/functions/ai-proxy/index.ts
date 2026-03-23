<<<<<<< HEAD
// supabase/functions/ai-proxy/index.ts
// Deploy: supabase functions deploy ai-proxy --no-verify-jwt
// Secret: supabase secrets set HF_TOKEN=hf_...

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { messages } = await req.json();

    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      return new Response(
        JSON.stringify({ error: { message: "HF_TOKEN secret not set." } }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // :fastest tells HF to auto-pick the best available provider
    const hfRes = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          model:       "meta-llama/Llama-3.1-8B-Instruct:fastest",
          messages,
          max_tokens:  512,
          temperature: 0.7,
          stream:      false,
        }),
      }
    );

    const text = await hfRes.text();

    let hfData;
    try {
      hfData = JSON.parse(text);
    } catch {
      hfData = { error: { message: `HF returned: ${text.slice(0, 300)}` } };
    }

    return new Response(JSON.stringify(hfData), {
      status:  hfRes.status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { message: `Edge function error: ${msg}` } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
=======
// supabase/functions/ai-proxy/index.ts
// Deploy: supabase functions deploy ai-proxy --no-verify-jwt
// Secret: supabase secrets set HF_TOKEN=hf_...

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { messages } = await req.json();

    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      return new Response(
        JSON.stringify({ error: { message: "HF_TOKEN secret not set." } }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // :fastest tells HF to auto-pick the best available provider
    const hfRes = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          model:       "meta-llama/Llama-3.1-8B-Instruct:fastest",
          messages,
          max_tokens:  512,
          temperature: 0.7,
          stream:      false,
        }),
      }
    );

    const text = await hfRes.text();

    let hfData;
    try {
      hfData = JSON.parse(text);
    } catch {
      hfData = { error: { message: `HF returned: ${text.slice(0, 300)}` } };
    }

    return new Response(JSON.stringify(hfData), {
      status:  hfRes.status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { message: `Edge function error: ${msg}` } }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
>>>>>>> 6ee47be7b89172b06b2976bcb40d5e51527e8568
});