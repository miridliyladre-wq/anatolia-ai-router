# Anatolia AI Router - Hazır Paket

Bu sürümde tüm API key alanları hazırdır. Gerçek keyleri sohbete yazma.

## 1) Keyleri yenile

Sohbete yazdığın eski keyleri panellerden iptal et ve yeni key oluştur.

## 2) .env dosyasını doldur

`.env` dosyasında şunları değiştir:

```env
DEEPSEEK_API_KEY=YENI_DEEPSEEK_KEY_BURAYA
OPENAI_API_KEY=YENI_OPENAI_KEY_BURAYA
GEMINI_API_KEY=YENI_GEMINI_KEY_BURAYA
ANTHROPIC_API_KEY=YENI_ANTHROPIC_KEY_BURAYA
GROQ_API_KEY=YENI_GROQ_KEY_BURAYA
MISTRAL_API_KEY=YENI_MISTRAL_KEY_BURAYA
ANATOLIA_APP_SECRET=ANATOLIA_GIZLI_SIFRE_BURAYA
```

## 3) Çalıştır

```bash
npm install
npm run dev
```

## 4) Test et

Başka terminalde:

```bash
node test-local.js
```

## 5) index.html bağlantısı

`webview-client.js` içindeki `anatoliaAskAI(prompt, mode)` fonksiyonunu index.html tarafına ekle.

Örnek:

```js
const cevap = await anatoliaAskAI("Bu nesne nedir?", "vision");
console.log(cevap);
```

## Not

API keyler asla index.html içine konmaz. Sadece `.env` içinde backend tarafında durur.
