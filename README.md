# telepatia-ai-techtest-backend

Backend de prueba técnica de Telepatia basado en Firebase Functions. Las funciones usan modelos de OpenAI y Gemini para transcribir audio, extraer información y proponer diagnósticos orientativos.

## Requisitos
- Node.js 22
- [Firebase CLI](https://firebase.google.com/docs/cli) instalado globalmente
- Claves de API para OpenAI y Gemini

## Variables de entorno
En la carpeta `functions` crea un archivo `.env` con las variables necesarias:

```
OPENAI_API_KEY=<tu_api_key_de_openai>
OPENAI_MODEL=gpt-4o-mini        # opcional
GEMINI_API_KEY=<tu_api_key_de_gemini>
GEMINI_MODEL=gemini-1.5-flash   # opcional
PROVIDER=gemini                 # o openai
```

Obtén una API key de OpenAI en <https://platform.openai.com/account/api-keys> y una de Gemini en <https://ai.google.dev/gemini-api/docs/api-key>.

## Instalación
Instala las dependencias dentro de `functions`:

```
cd functions
npm install
```

## Ejecución local
Desde la raíz del repositorio ejecuta el script:

```
./run-local.sh
```

El script limpia compilaciones previas, carga las variables de entorno, compila TypeScript y levanta los emuladores de Firebase sólo para las funciones.

## Pruebas
Para correr la suite de tests:

```
cd functions
npm test
```
