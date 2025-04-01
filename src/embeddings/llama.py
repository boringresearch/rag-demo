import numpy as np
from typing import List
import requests

from .base import EmbeddingsBase

class LlamaEmbeddings(EmbeddingsBase):
    """
    Example LLaMA embedding class that calls an external API endpoint
    to obtain embeddings for the input texts.
    """
    def __init__(self, api_url: str):
        self.api_url = api_url

    def encode(self, texts: List[str]) -> np.ndarray:
        """
        Call the external API for each text. Returns an (N x D) array of embeddings.
        """
        # In real usage, batch requests for efficiency
        embeddings = []
        for text in texts:
            payload = {"text": text}
            response = requests.post(f"{self.api_url}/embed", json=payload)
            response.raise_for_status()
            data = response.json()
            embeddings.append(data["embedding"])
        return np.array(embeddings, dtype=np.float32)
