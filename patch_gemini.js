const fs = require('fs');
let code = fs.readFileSync('supabase/functions/whatsapp-flush/index.ts', 'utf8');

// The original code is inside a try block
const oldCode = `    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const rawBody = await res.text();
      if (res.ok) {
        try {
          const j = JSON.parse(rawBody);
          const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const finishReason = j?.candidates?.[0]?.finishReason ?? "unknown";
          if (rawText) {
            try {
              const parsedJSON = JSON.parse(rawText);
              if (parsedJSON.whatsapp_reply) finalReply = parsedJSON.whatsapp_reply;
              else finalReply = \`⚠️ LLM não retornou 'whatsapp_reply'. Raw: \${rawText.substring(0, 250)}\`;
              if (parsedJSON.whatsapp_audio_script) audioScript = parsedJSON.whatsapp_audio_script;
              if (parsedJSON.whatsapp_text_complement) audioComplement = parsedJSON.whatsapp_text_complement;
              if (parsedJSON.detected_intention) detectedIntention = parsedJSON.detected_intention;
            } catch {
              console.log("LLM non-JSON:", rawText.substring(0, 200));
              finalReply = rawText.replace(/\`\`\`json|\`\`\`/g, "").trim() || "⚠️ LLM retornou texto vazio.";
            }
          } else {
            finalReply = \`⚠️ LLM sem texto. finishReason: \${finishReason}. Raw: \${rawBody.substring(0, 250)}\`;
          }
        } catch (e: any) {
          finalReply = \`⚠️ Falha no parse do Gemini. Erro: \${e.message}\`;
          console.error("Gemini parse error:", e.message);
        }
      } else {
        finalReply = \`⚠️ Gemini falhou. HTTP \${res.status}. Raw: \${rawBody.substring(0, 250)}\`;
        console.error("Gemini API error:", rawBody.substring(0, 300));
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        finalReply = \`⚠️ Gemini Timeout após \${GEMINI_TIMEOUT_MS}ms.\`;
        console.error("Gemini AbortError");
      } else {
        finalReply = \`⚠️ Gemini Fetch Error: \${e.message}\`;
        console.error("Gemini fetch error:", e.message);
      }
    }`;

// Replacement code with retries
const newCode = `    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const rawBody = await res.text();
        if (res.ok) {
          try {
            const j = JSON.parse(rawBody);
            const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            const finishReason = j?.candidates?.[0]?.finishReason ?? "unknown";
            if (rawText) {
              try {
                const parsedJSON = JSON.parse(rawText);
                if (parsedJSON.whatsapp_reply) finalReply = parsedJSON.whatsapp_reply;
                else finalReply = \`⚠️ LLM não retornou 'whatsapp_reply'. Raw: \${rawText.substring(0, 250)}\`;
                if (parsedJSON.whatsapp_audio_script) audioScript = parsedJSON.whatsapp_audio_script;
                if (parsedJSON.whatsapp_text_complement) audioComplement = parsedJSON.whatsapp_text_complement;
                if (parsedJSON.detected_intention) detectedIntention = parsedJSON.detected_intention;
              } catch {
                console.log("LLM non-JSON:", rawText.substring(0, 200));
                finalReply = rawText.replace(/\`\`\`json|\`\`\`/g, "").trim() || "⚠️ LLM retornou texto vazio.";
              }
            } else {
              finalReply = \`⚠️ LLM sem texto. finishReason: \${finishReason}. Raw: \${rawBody.substring(0, 250)}\`;
            }
          } catch (e: any) {
            finalReply = \`⚠️ Falha no parse do Gemini. Erro: \${e.message}\`;
            console.error("Gemini parse error:", e.message);
          }
          break; // Success, exit retry loop
        } else {
          // If 503 or 429, retry
          if (res.status === 503 || res.status === 429) {
            console.error(\`Gemini API HTTP \${res.status}. Retrying in \${delay}ms...\`);
            retries--;
            if (retries === 0) {
              finalReply = \`⚠️ Gemini falhou após retentativas. HTTP \${res.status}. Raw: \${rawBody.substring(0, 250)}\`;
              console.error("Gemini API error:", rawBody.substring(0, 300));
            } else {
              await new Promise(r => setTimeout(r, delay));
              delay *= 2; // Exponential backoff
              continue;
            }
          } else {
            finalReply = \`⚠️ Gemini falhou. HTTP \${res.status}. Raw: \${rawBody.substring(0, 250)}\`;
            console.error("Gemini API error:", rawBody.substring(0, 300));
            break;
          }
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === "AbortError" || e.message.includes("fetch")) {
          console.error(\`Gemini \${e.name}. Retrying in \${delay}ms...\`);
          retries--;
          if (retries === 0) {
            finalReply = \`⚠️ Gemini Error após retentativas: \${e.message}\`;
          } else {
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
            continue;
          }
        } else {
          finalReply = \`⚠️ Gemini Fetch Error: \${e.message}\`;
          console.error("Gemini fetch error:", e.message);
          break;
        }
      }
    }`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('supabase/functions/whatsapp-flush/index.ts', code);
console.log('Patch complete.');
