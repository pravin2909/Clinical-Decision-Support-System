# Clinical Decision Support Engine

A deep-learning project that reads a **medical image**, **typed symptoms**, or
**spoken description** and produces a clear, plain-language clinical report —
what the likely condition is, how it usually progresses, and how it's typically
treated.

At its heart is a **two-stage computer-vision pipeline**: a fast router model
figures out *what kind* of medical image it's looking at, then hands it to a
specialist **Vision Transformer (ViT)** trained for that exact domain. A language
model then turns the finding into an explanation anyone can understand.

> **Decision support, not diagnosis.** Every result carries a confidence score
> and is meant to assist, not replace, a clinician.

---

## The idea

Most medical-image classifiers try to do one thing well (just skin, or just
eyes). This project asks: can a single system accept *any* of three common image
types, route it to the right expert model automatically, and explain the result
in everyday language — across images, text, and speech?

So it's built as a small team of models that each do one job:

```
                      ┌─────────── image ───────────┐
   Image ─▶ Router (MobileNet V2) ─▶ picks domain ─▶ Specialist ViT ─▶ disease + confidence ─┐
                                      (eye/dental/skin)                                        │
                                                                                               ▼
   Text  ───────────────────────────────────────────────────────────────────▶  Language model ─▶ clinical report
   Speech ─▶ speech-to-text ──────────────────────────────────────────────────▶
```

---

## The models (the interesting part)

### 1. The router — MobileNet V2
A lightweight gateway model (~2.9M parameters) that looks at an incoming image
and decides which of three medical domains it belongs to: **eye**, **dental**,
or **skin**. It was fine-tuned with two-phase transfer learning (freeze the
pretrained backbone, train the head, then unfreeze and refine).

- **Validation accuracy: 99.92%** — it almost never sends an image to the wrong
  specialist, which is exactly what a router needs to do.
- Fast and cheap, so the expensive specialist model only runs once, on the right
  image.

### 2. The specialists — three custom Vision Transformers
This is the core of the project. Instead of reusing a big pretrained network,
each domain gets its **own ViT, built and trained from scratch**. Training a
transformer from scratch on a *small* medical dataset normally fails — ViTs are
data-hungry. Two techniques make it work:

- **Shifted Patch Tokenization (SPT)** — rather than chopping the image into
  plain square patches, the image is also shifted in several directions and those
  versions are folded in. Each patch therefore carries more of its surrounding
  context, giving the model richer spatial information to learn from when data is
  scarce.
- **Locality Self-Attention (LSA)** — a sharpened form of attention (with a
  learnable temperature, and a patch not allowed to just attend to itself) that
  pushes the model to focus on the genuinely informative neighbouring patches
  instead of spreading attention thinly.

All three specialists share the same compact design — **72×72 input, patch size
6, embedding dim 64, 4 transformer layers, 4 attention heads** — small enough to
train on modest hardware:

| Specialist | What it classifies | Classes |
|---|---|---|
| 👁️ **Eye ViT** | Retinal / eye conditions | 4 — Normal, Cataract, Diabetic Retinopathy, Glaucoma |
| 🦷 **Dental ViT** | Oral / dental conditions | 7 — Caries, Calculus, Gingivitis, Hypodontia, Tooth Discoloration, Mouth Ulcer, Ulcers |
| 🔬 **Skin ViT** | Skin conditions | 10 — Melanoma, Eczema, Psoriasis, Basal Cell Carcinoma, Melanocytic Nevi, Benign Keratosis, Atopic Dermatitis, Seborrheic Keratoses, Tinea/Ringworm, Warts/Molluscum |

### 3. The explainer — a language model
Once a disease is identified (or a patient just types/speaks their symptoms), a
local language model writes the actual report in plain language. When the
classifier isn't confident, the report is explicitly framed as *uncertain* and
recommends seeing a professional — the confidence score is never hidden.

### Honest results
| Model | Task | Accuracy | Notes |
|---|---|---|---|
| MobileNet V2 router | eye / dental / skin | **99.92%** | Near-perfect routing |
| Dental ViT | 7 oral conditions | Strong | Best of the three specialists |
| Eye ViT | 4 eye conditions | Good | — |
| Skin ViT | 10 skin conditions | **67.55%** | Hardest task — 10 classes, 72×72 input, trained from scratch |

The **skin and eye models are the current focus for improvement** — the honest
limiting factors are the small 72×72 input (fine-grained skin detail is lost),
class imbalance, and training from scratch. Larger inputs, more data, and
class-balancing are the levers.

---

## Datasets
All training data is public (Kaggle). The router was trained on up to ~4,000
images sampled per domain; each specialist on its domain's full set.

| Domain | Source dataset |
|---|---|
| Eye | `gunavenkatdoddi/eye-diseases-classification` |
| Dental | `salmansajid05/oral-diseases` |
| Skin | `ismailpromus/skin-diseases-image-dataset` |

Training and evaluation scripts live in [`ml/`](ml/).

---

## Three ways to ask

- **Image** — upload a photo; the router + specialist classify it, then the
  report is generated.
- **Text** — type your symptoms in plain words.
- **Speech** — say your symptoms; they're transcribed, then explained.

The doctor-facing mode additionally pulls real medical literature (Europe PMC)
and answers with inline citations `[n]`, so clinical claims are traceable to a
source rather than made up.

---

## Try it

**Prerequisites:** Python 3.11, Node 18+, PostgreSQL, and a local
OpenAI-compatible LLM (e.g. LM Studio or Ollama) for the report text. Trained
model weights (`.pth`) go in `backend/Models/`.

```bash
# Backend (API on http://localhost:8000, interactive docs at /docs)
cd backend
python -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL, LLM_BASE_URL, ...
alembic upgrade head          # create the database schema
python main.py

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

---

## Under the hood (brief)

The ML sits behind a small, production-shaped service so it can grow into a real
patient/doctor platform: a **FastAPI** backend with token-based accounts and
roles, a **PostgreSQL** database (schema managed by migrations), token-by-token
**streaming** of reports, a health tracker for patient vitals, and a
**Docker** setup for the supporting services. Tests run automatically on every
change. These details are deliberately kept in the background — the project is
about the models.

```
backend/   FastAPI service + the model pipeline
ml/        model training & evaluation (MobileNet router + 3 ViTs)
frontend/  React web app
docs/      technical write-up & design notes
infra/     local services (Docker)
```

---

## A note on data & safety
This handles sensitive, health-related content. It is a portfolio
project use only synthetic or properly licensed images in demos, never real
patient data, and treat every output as a starting point for professional care,
not a verdict.
