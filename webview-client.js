// index.html içine ekleyebileceğin hazır kullanım.
// API key burada YOK. Sadece kendi backend adresine gider.

const ANATOLIA_AI_BACKEND = "http://localhost:3000"; // sunucuya atınca değiştirilecek
const ANATOLIA_APP_SECRET = "ANATOLIA_GIZLI_SIFRE_BURAYA"; // .env içindekiyle aynı olacak

async function anatoliaAskAI(prompt, mode = "default") {
  try {
    const res = await fetch(`${ANATOLIA_AI_BACKEND}/api/ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-anatolia-secret": ANATOLIA_APP_SECRET
      },
      body: JSON.stringify({
        prompt,
        mode,
        temperature: 0.4
      })
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("AI router hata:", data);
      throw new Error(data.error || "AI cevap vermedi");
    }

    console.log("Kullanılan AI:", data.provider, data.model);
    return data.answer;

  } catch (err) {
    console.error("Anatolia AI hata:", err);
    return "Şu an AI cevabı alınamadı. Lütfen internet bağlantını kontrol edip tekrar dene.";
  }
}
