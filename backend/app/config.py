"""
Configuration for the Clinical Decision Support Engine.
All paths, model configs, and constants in one place.
"""

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv is optional; env vars can still be set by the shell.
    pass

# ──────────────────────────────────────
# Paths
# ──────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "Models")

# Model file paths
MOBILENET_PATH = os.path.join(MODELS_DIR, "mobilenet_router.pth")
EYE_VIT_PATH = os.path.join(MODELS_DIR, "vit_eye_disease.pth")
DENTAL_VIT_PATH = os.path.join(MODELS_DIR, "vit_dental_disease.pth")
SKIN_VIT_PATH = os.path.join(MODELS_DIR, "vit_skin_disease.pth")

# Upload directory for temporary files
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ──────────────────────────────────────
# MobileNet Router Config
# ──────────────────────────────────────
MOBILENET_IMG_SIZE = 224
MOBILENET_CLASSES = ["dental", "eye", "skin"]

# ──────────────────────────────────────
# ViT Config (shared across all 3 ViTs)
# ──────────────────────────────────────
VIT_IMG_SIZE = 72
VIT_PATCH_SIZE = 6
VIT_EMBED_DIM = 64
VIT_DEPTH = 4
VIT_NUM_HEADS = 4
VIT_MLP_DIM = 128
VIT_DROPOUT = 0.1

# ──────────────────────────────────────
# Domain-specific ViT Configs
# ──────────────────────────────────────
VIT_CONFIGS = {
    "eye": {
        "model_path": EYE_VIT_PATH,
        "num_classes": 4,
        "clean_labels": {
            "cataract": "Cataract",
            "diabetic_retinopathy": "Diabetic Retinopathy",
            "glaucoma": "Glaucoma",
            "normal": "Normal (Healthy Eye)",
        },
    },
    "dental": {
        "model_path": DENTAL_VIT_PATH,
        "num_classes": 7,
        "clean_labels": {
            "Calculus": "Dental Calculus (Tartar)",
            "Caries": "Dental Caries (Tooth Decay)",
            "Gingivitis": "Gingivitis",
            "Hypodontia": "Hypodontia (Missing Teeth)",
            "Mouth Ulcer": "Mouth Ulcer",
            "Tooth Discoloration": "Tooth Discoloration",
            "Ulcers": "Oral Ulcers",
        },
    },
    "skin": {
        "model_path": SKIN_VIT_PATH,
        "num_classes": 10,
        "clean_labels": {
            "Eczema": "Eczema",
            "Melanoma": "Melanoma",
            "Atopic Dermatitis": "Atopic Dermatitis",
            "Basal Cell Carcinoma (BCC)": "Basal Cell Carcinoma",
            "Melanocytic Nevi": "Melanocytic Nevi (Moles)",
            "Benign Keratosis-like Lesions": "Benign Keratosis",
            "Psoriasis": "Psoriasis",
            "Seborrheic Keratoses": "Seborrheic Keratoses",
            "Tinea Ringworm Candidiasis": "Tinea / Ringworm / Candidiasis",
            "Warts Molluscum": "Warts / Molluscum",
        },
    },
}

# ──────────────────────────────────────
# Image Normalization (ImageNet standard)
# ──────────────────────────────────────
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

# ──────────────────────────────────────
# Database (PostgreSQL) — consultation/report history
# ──────────────────────────────────────
# Async SQLAlchemy URL. Local Homebrew Postgres uses trust auth (no password).
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://pravin@localhost:5432/cds_engine",
)
# When false, the app runs fully stateless (no history persisted) even if a URL
# is set — useful for quick local runs without Postgres available.
DB_ENABLED = os.getenv("DB_ENABLED", "true").lower() in ("1", "true", "yes", "on")

# ──────────────────────────────────────
# Redis — cache, rate limiting, (later) Celery broker
# ──────────────────────────────────────
# One Redis instance serves three jobs in this project. When REDIS_ENABLED is
# false or Redis is unreachable, the app degrades gracefully: the cache becomes a
# no-op (every lookup is a miss) and the rate limiter falls back to a per-process
# token bucket, so a single node still enforces limits and nothing 500s.
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() in ("1", "true", "yes", "on")

# Default TTL (seconds) for cache-aside entries unless an endpoint overrides it.
CACHE_DEFAULT_TTL = int(os.getenv("CACHE_DEFAULT_TTL", "30"))

# Bump this to invalidate every cache entry at once (e.g. after a deploy that
# changes a cached payload's shape). It is baked into every cache key.
CACHE_VERSION = os.getenv("CACHE_VERSION", "v1")

# ──────────────────────────────────────
# Authentication (JWT)
# ──────────────────────────────────────
# IMPORTANT: set a strong, unique JWT_SECRET in production (e.g. `openssl rand -hex 32`).
JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24h
# Refresh tokens are long-lived and stored server-side (hashed) so they can be
# rotated and revoked. Kept at 24h access for now so the current frontend works
# unchanged; shorten ACCESS_TOKEN_EXPIRE_MINUTES once the frontend auto-refreshes.
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

# ──────────────────────────────────────
# LLM Reasoning Backend (OpenAI-compatible: LM Studio, Ollama, vLLM, etc.)
# ──────────────────────────────────────
# LM Studio serves an OpenAI-compatible API at http://localhost:1234/v1
# Ollama also exposes one at http://localhost:11434/v1
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1")
# Agentic layer uses gpt-oss-20b (native OpenAI tool-calling). The legacy
# single-shot endpoints still read LLM_MODEL too, so switching this upgrades both.
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
# LM Studio ignores the key but the OpenAI-style API requires one to be present.
LLM_API_KEY = os.getenv("LLM_API_KEY", "lm-studio")

# Embeddings for pgvector RAG — served locally by LM Studio (OpenAI-compatible).
# nomic-embed-text-v1.5 is 768-dim; keep EMBED_DIM in sync with the model.
EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-nomic-embed-text-v1.5")
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))

# Max agent loop turns (LLM ↔ tools) before forcing a final answer — a safety
# bound so a confused model can't loop forever.
AGENT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "6"))

# Backwards-compatible alias (older code referenced OLLAMA_MODEL).
OLLAMA_MODEL = LLM_MODEL

# ──────────────────────────────────────
# Clinical Report System Prompt
# ──────────────────────────────────────
REPORT_SYSTEM_PROMPT = """You are a helpful medical assistant. Explain the condition in clear, general language.

RULES:
- Answer directly and naturally — short paragraphs and simple bullet points. Do NOT use a rigid template or numbered "Diagnosis / Prognosis / Therapy" sections.
- Start by naming the condition and briefly saying what it is.
- Then cover, in plain language: common signs and symptoms, how it's usually treated (including common medicines where relevant), simple self-care, and when the person should see a doctor.
- Be factual and calm. Do NOT overstate severity or jump to worst-case conclusions.
- No conversational filler ("Sure", "Here's"), no dates, no follow-up questions at the end.
- Keep it concise and easy to read."""

# Below this classifier confidence (%), a finding is treated as uncertain: the
# report is framed as a low-confidence possibility rather than a likely finding.
CONFIDENCE_UNCERTAIN_THRESHOLD = float(os.getenv("CONFIDENCE_UNCERTAIN_THRESHOLD", "55"))

IMAGE_PROMPT_TEMPLATE = """A medical image was analyzed and the most likely finding is:

- Condition: {disease}
- Confidence: {confidence:.1f}%
- Area: {domain_full}
{caution}
Explain this condition in general terms: what it is, common symptoms, how it's usually treated, and when to see a doctor."""

# Appended to the image prompt when classifier confidence is below the threshold.
LOW_CONFIDENCE_CAUTION = (
    "\nNOTE: the image classifier's confidence is LOW, so this finding is uncertain. "
    "Make clear up front that this is only a possibility, not a confident finding, and "
    "that an in-person clinical assessment is needed to confirm.\n"
)

TEXT_PROMPT_TEMPLATE = """Someone described the following:

"{symptoms}"

Explain in general terms the most likely condition(s), and what can typically be done about it — common treatments, self-care, and when to see a doctor. Keep it general and avoid alarming conclusions."""

# Used by the patient text-chat endpoint (multi-turn, conversational).
PATIENT_CHAT_SYSTEM_PROMPT = """You are a helpful medical assistant talking directly to a patient.

When a patient first describes symptoms, structure your response with these sections:
**What your symptoms may suggest** - name the most likely conditions and what signs point to them
**Related conditions to be aware of** - other possibilities the patient should know about
**What you can do** - home remedies, over-the-counter options, lifestyle changes
**If symptoms persist or worsen** - specific warning signs that mean the patient should seek care urgently

For follow-up questions in the same conversation, answer naturally without repeating the structure - just continue the discussion.

Rules:
- Use plain, easy-to-understand language with no medical jargon
- Be factual and calm, not alarming or vague
- Keep responses concise and focused
- Do not start with filler phrases like "Sure" or "Great question"
- Do not add a disclaimer paragraph at the end of every message"""


# ──────────────────────────────────────
# Doctor Mode — evidence-grounded, cited answers
# ──────────────────────────────────────
DOCTOR_SYSTEM_PROMPT = """You are an evidence-based clinical research assistant for physicians.

STRICT RULES:
- Answer ONLY using the retrieved evidence provided in the user message. Do NOT rely on prior memory or invent facts.
- Cite every clinical claim inline with [n] matching the numbered sources (e.g., "first-line therapy is X [1][3]").
- If the evidence does not address part of the question, state that explicitly. Do NOT speculate or fabricate.
- Use precise clinical terminology appropriate for a physician.
- Be concise and well structured: short bold headings and bullet points (e.g., First-line options, Dosing where supported, Cautions/contraindications, When to escalate).
- Do NOT give a definitive patient-specific diagnosis; frame the response as an evidence summary to support the clinician's judgment.
- Do NOT add a disclaimer section and do NOT restate the question. Begin directly with the answer.
- Do NOT output a "Sources" list yourself; the application renders citations separately."""


