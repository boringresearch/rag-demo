import numpy as np
from typing import List
import hashlib

from .base import EmbeddingsBase

class FakeEmbeddings(EmbeddingsBase):
    """
    Fake embedding generator for testing. 
    Uses a hash of the text as a seed, generating a deterministic random vector.
    """
    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def encode(self, texts: List[str]) -> np.ndarray:
        vectors = []
        for text in texts:
            seed = int(hashlib.md5(text.encode()).hexdigest(), 16) % (2**32)
            np.random.seed(seed)
            vec = np.random.randn(self.dimension).astype(np.float32)
            # Normalize
            vec /= np.linalg.norm(vec)
            vectors.append(vec)
        return np.array(vectors, dtype=np.float32)
