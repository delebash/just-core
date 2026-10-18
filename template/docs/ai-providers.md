# Set up the AI

Open **AI Settings** in the sidebar. The page is the family's shared AI area: providers and
models, routing by feature, usage, and the engine console.

## Quick Setup

The wizard looks at your computer, proposes a model that fits it, and applies the choice. The
first time, it downloads two things: the llama.cpp engine (the program that runs models) and the
model itself. Both show their progress with a working Cancel and Retry. Everything lands in the
app's [data folder](getting-started.md).

**Sharing with the family's other apps.** If another app of the family already downloaded models
on this computer, the wizard offers to use those files instead of downloading them again. Nothing
on disk moves, and you can change your mind later.

**The once-ever offer.** After your first note, if no AI is set up yet, the app asks once whether
to run Quick Setup, connect an online provider, or skip. Whatever you pick, it doesn't ask again;
AI Settings is always there.

## The models

The catalog offers three models from the family's tested list: **Gemma 4 26B-A4B** (the
all-rounder, for 8 GB graphics cards and up), **Gemma 4 12B** (lighter and faster, for 10–12 GB
cards) and **Gemma 4 E4B** (for laptops with integrated graphics). **Add a model** takes any GGUF
model on Hugging Face.

## Online providers

Any OpenAI-compatible service — or OpenAI, Anthropic or Gemini directly — can be added under
**Providers**: its address and key, then set it as the default. Features then run through it
instead of the local engine.
