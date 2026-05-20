// Yerel test dosyası
// Önce: npm install
// Sonra: npm run dev
// Başka terminalde: node test-local.js

const BACKEND = "http://localhost:3000";
const SECRET = "ANATOLIA_GIZLI_SIFRE_BURAYA";

async function test() {
  const res = await fetch(`${BACKEND}/api/ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-anatolia-secret": SECRET
    },
    body: JSON.stringify({
      prompt: "Merhaba, Anatolia AI çalışıyor mu? Kısa cevap ver.",
      mode: "default"
    })
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
