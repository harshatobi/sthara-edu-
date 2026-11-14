"""Sentence vectors for Sthara's knowledge base, with a free open model (no AI tokens).

paraphrase-multilingual-MiniLM-L12-v2 (int8 ONNX, 384 dimensions): English and the Indian languages map to the
same space, so "worksheet on cell structure" finds a Hindi question about cells. Runs on onnxruntime + tokenizers
only (no PyTorch), so it fits a Vercel Python function. Shared by api/kb_embed.py (live) and scripts/kb (nightly).

The model files come from KB_MODEL_DIR when it holds them (local runs), else they are downloaded once per warm
instance into /tmp from the model's public home (KB_MODEL_URL_BASE overrides it). Their SHA-256s are pinned, so a
changed or tampered file is refused.
"""
from __future__ import annotations

import hashlib
import os
import urllib.request

import numpy as np

DIM = 384
MAX_TOKENS = 128
HOME = "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main"
# file name -> (path under the model's home, SHA-256)
FILES = {
    "model_quantized.onnx": ("onnx/model_quantized.onnx", "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc"),
    "tokenizer.json": ("tokenizer.json", "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441"),
}
_session = None
_tokenizer = None


def _sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _model_dir() -> str:
    local = os.environ.get("KB_MODEL_DIR")
    if local and all(os.path.exists(os.path.join(local, f)) for f in FILES):
        return local
    target = "/tmp/kb-model"
    os.makedirs(target, exist_ok=True)
    base = (os.environ.get("KB_MODEL_URL_BASE") or HOME).rstrip("/")
    for name, (sub, digest) in FILES.items():
        path = os.path.join(target, name)
        if os.path.exists(path) and _sha(path) == digest:
            continue
        req = urllib.request.Request(f"{base}/{sub}", headers={"User-Agent": "sthara-kb/1"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path + ".part", "wb") as out:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        os.replace(path + ".part", path)
        if _sha(path) != digest:
            os.remove(path)
            raise RuntimeError(f"KB model file {name} failed its checksum")
    return target


def _load():
    global _session, _tokenizer
    if _session is None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        d = _model_dir()
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        _session = ort.InferenceSession(os.path.join(d, "model_quantized.onnx"), opts, providers=["CPUExecutionProvider"])
        _tokenizer = Tokenizer.from_file(os.path.join(d, "tokenizer.json"))
        _tokenizer.enable_truncation(MAX_TOKENS)
        _tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
    return _session, _tokenizer


def embed(texts: list[str], batch: int = 32) -> np.ndarray:
    """Unit-length 384-d vectors (mean pooling over tokens, as the model was trained). Cosine = dot product."""
    sess, tok = _load()
    names = {i.name for i in sess.get_inputs()}
    out = []
    for i in range(0, len(texts), batch):
        enc = tok.encode_batch([t if t.strip() else " " for t in texts[i:i + batch]])
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in names:
            feed["token_type_ids"] = np.zeros_like(ids)
        hidden = sess.run(None, feed)[0]
        m = mask[..., None].astype(np.float32)
        vec = (hidden * m).sum(1) / np.clip(m.sum(1), 1e-9, None)
        vec /= np.clip(np.linalg.norm(vec, axis=1, keepdims=True), 1e-9, None)
        out.append(vec.astype(np.float32))
    return np.vstack(out) if out else np.zeros((0, DIM), dtype=np.float32)
