"""Optional pretrained deep-learning encoder for JanCare (multilingual).

Uses a pretrained multilingual Transformer sentence-embedding model
(paraphrase-multilingual-MiniLM-L12-v2: 12-layer MiniLM, 50+ languages including
Hindi) to turn a complaint such as "seene me dard" / "सीने में दर्द" / "chest pain"
into a 384-dimensional meaning vector. Similar meanings land close together
even when the words differ, which helps with phrasings never seen in training.

It is OPTIONAL: if `sentence-transformers` is not installed, or the model cannot
be downloaded, JanCare keeps working with its TF-IDF and neural-network models.

  pip install -r requirements-dl.txt     # one-time, ~1 GB incl. PyTorch
  (first use downloads the model, ~470 MB, from huggingface.co)

Set JANCARE_DL=0 to switch it off.
"""
import hashlib
import os
from pathlib import Path
import numpy as np

MODEL_NAME = os.environ.get("JANCARE_DL_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CACHE_DIR = Path(__file__).resolve().parent / "models" / "embedding_cache"
_encoder = None
_status = "not loaded"
_memo = {}  # text -> vector, avoids re-encoding during cross-validation


def _load():
    global _encoder, _status
    if _encoder is not None or _status.startswith("unavailable"):
        return _encoder
    if os.environ.get("JANCARE_DL", "1") == "0":
        _status = "unavailable: disabled with JANCARE_DL=0"
        return None
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        _status = "unavailable: run pip install -r requirements-dl.txt"
        return None
    try:
        _encoder = SentenceTransformer(MODEL_NAME, device="cpu")
        _status = f"loaded {MODEL_NAME}"
    except Exception as e:  # e.g. no internet on first run
        _status = f"unavailable: could not load model ({type(e).__name__})"
        _encoder = None
    return _encoder


def available() -> bool:
    return _load() is not None


def status() -> str:
    _load()
    return _status


def encode(texts, cache_name=None):
    """L2-normalised embeddings, shape (n, dim). Training sets are cached on disk."""
    enc = _load()
    if enc is None:
        raise RuntimeError(_status)
    texts = [str(t) for t in texts]
    path = None
    if cache_name:
        key = hashlib.sha1(("\n".join(texts) + MODEL_NAME).encode("utf-8")).hexdigest()[:12]
        path = CACHE_DIR / f"{cache_name}_{key}.npy"
        if path.exists():
            return np.load(path)
    todo = [t for t in dict.fromkeys(texts) if t not in _memo]
    if todo:
        new = enc.encode(todo, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
        _memo.update(zip(todo, np.asarray(new, dtype=np.float32)))
    vecs = np.stack([_memo[t] for t in texts])
    if path is not None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        np.save(path, vecs)
    return vecs
